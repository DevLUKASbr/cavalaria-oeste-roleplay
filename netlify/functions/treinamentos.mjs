/*
 * Netlify Function: tópicos de treinamento (rota /api/treinamentos).
 *
 *   GET  → lista de tópicos, mais recentes primeiro          (permissão 'treinamentos')
 *   POST { acao: 'criar',   titulo, subtitulo, descricao, videos[] }      ('treinamentos.editar')
 *   POST { acao: 'editar',  id, titulo, subtitulo, descricao, videos[] }  ('treinamentos.editar')
 *   POST { acao: 'excluir', id }                                          ('treinamentos.editar')
 *
 * Sem SQL: cada tópico é um arquivo JSON no Supabase Storage, bucket privado "cavalaria",
 * pasta "treinamentos/". O bucket é criado automaticamente na primeira gravação.
 */
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';

const BUCKET = 'cavalaria';
const FOLDER = 'treinamentos';
const MAX_VIDEOS = 10;
const ID_RE = /^[a-z0-9-]{6,40}$/;

// ---------------------------------------------------------------------------
// Supabase Storage
// ---------------------------------------------------------------------------

function storage(sb) {
  const objectPath = id => `/storage/v1/object/${BUCKET}/${FOLDER}/${id}.json`;
  const isMissingBucket = async response =>
    !response.ok && /bucket not found/i.test(await response.clone().text());

  async function failure(response) {
    const data = await response.json().catch(() => ({}));
    return new HttpError(502, `Supabase Storage: ${data.message || data.error || response.statusText}`);
  }

  async function createBucket() {
    const response = await sb.call('/storage/v1/bucket', {
      method: 'POST',
      body: { id: BUCKET, name: BUCKET, public: false },
      raw: true,
    });
    if (response.ok) return;
    // 409/400 "already exists" = outra chamada criou ao mesmo tempo; tudo bem.
    const detail = await response.text();
    if (!/already exists|duplicate/i.test(detail)) throw new HttpError(502, `Supabase Storage: ${detail.slice(0, 200)}`);
  }

  return {
    async list() {
      const response = await sb.call(`/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        body: { prefix: FOLDER, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } },
        raw: true,
      });
      if (await isMissingBucket(response)) return []; // nada gravado ainda
      if (!response.ok) throw await failure(response);
      const files = await response.json();
      const ids = files.map(f => f.name).filter(n => n.endsWith('.json')).map(n => n.slice(0, -5)).filter(id => ID_RE.test(id));
      return Promise.all(ids.map(id => this.get(id)));
    },

    async get(id) {
      const response = await sb.call(objectPath(id), { raw: true });
      if (!response.ok) return null;
      return response.json().catch(() => null);
    },

    async put(topic) {
      const save = () => sb.call(objectPath(topic.id), {
        method: 'POST',
        body: JSON.stringify(topic),
        headers: { 'x-upsert': 'true', 'cache-control': 'no-cache' },
        raw: true,
      });
      let response = await save();
      if (await isMissingBucket(response)) {
        await createBucket();
        response = await save();
      }
      if (!response.ok) throw await failure(response);
    },

    async remove(id) {
      const response = await sb.call(`/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        body: { prefixes: [`${FOLDER}/${id}.json`] },
        raw: true,
      });
      if (!response.ok) throw await failure(response);
    },
  };
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function text(value, { field, min = 0, max }) {
  const clean = String(value ?? '').trim();
  if (clean.length < min) throw new HttpError(400, min > 0 ? `Informe ${field}.` : `${field} inválido.`);
  if (clean.length > max) throw new HttpError(400, `${field[0].toUpperCase() + field.slice(1)} pode ter no máximo ${max} caracteres.`);
  return clean;
}

function cleanVideos(videos) {
  const list = (Array.isArray(videos) ? videos : []).map(v => String(v ?? '').trim()).filter(Boolean);
  if (list.length > MAX_VIDEOS) throw new HttpError(400, `No máximo ${MAX_VIDEOS} vídeos por tópico.`);
  return list.map(url => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new HttpError(400, `Link de vídeo inválido: ${url.slice(0, 80)}`);
    }
    if (!['https:', 'http:'].includes(parsed.protocol) || url.length > 500) {
      throw new HttpError(400, `Link de vídeo inválido: ${url.slice(0, 80)}`);
    }
    return parsed.href;
  });
}

function cleanTopicFields(body) {
  return {
    titulo: text(body.titulo, { field: 'o título', min: 3, max: 120 }),
    subtitulo: text(body.subtitulo, { field: 'o subtítulo', max: 160 }),
    descricao: text(body.descricao, { field: 'a descrição', max: 5000 }),
    videos: cleanVideos(body.videos),
  };
}

function cleanId(id) {
  const value = String(id ?? '');
  if (!ID_RE.test(value)) throw new HttpError(400, 'Tópico não informado.');
  return value;
}

const newId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default req => respond(async () => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

  const sb = supabase();
  const caller = await authenticate(req, sb);
  if (!caller.can('treinamentos')) throw new HttpError(403, 'Sem permissão para ver os treinamentos.');
  const store = storage(sb);

  if (req.method === 'GET') {
    const topics = (await store.list()).filter(Boolean);
    topics.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    return json(200, { topicos: topics });
  }

  if (!caller.can('treinamentos.editar')) throw new HttpError(403, 'Sua conta não pode criar ou alterar tópicos.');
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const author = { id: caller.user.id, nome: caller.nome };

  switch (body.acao) {
    case 'criar': {
      const topic = { id: newId(), ...cleanTopicFields(body), autor: author, criado_em: now, atualizado_em: null, atualizado_por: null };
      await store.put(topic);
      return json(201, { topico: topic });
    }
    case 'editar': {
      const id = cleanId(body.id);
      const current = await store.get(id);
      if (!current) throw new HttpError(404, 'Tópico não encontrado (talvez tenha sido excluído).');
      const topic = { ...current, ...cleanTopicFields(body), id, atualizado_em: now, atualizado_por: author };
      await store.put(topic);
      return json(200, { topico: topic });
    }
    case 'excluir': {
      await store.remove(cleanId(body.id));
      return json(200, { ok: true });
    }
    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
});

export const config = { path: '/api/treinamentos' };
