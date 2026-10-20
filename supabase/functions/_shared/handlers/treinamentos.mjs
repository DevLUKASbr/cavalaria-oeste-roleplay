/*
 * API: tópicos de treinamento (rota /api/treinamentos).
 *
 *   GET  → lista de tópicos, mais recentes primeiro          (permissão 'treinamentos')
 *   POST { acao: 'criar',   titulo, subtitulo, descricao, videos[] }      ('treinamentos.editar')
 *   POST { acao: 'editar',  id, titulo, subtitulo, descricao, videos[] }  ('treinamentos.editar')
 *   POST { acao: 'excluir', id }                                          ('treinamentos.editar')
 *
 * Sem SQL: cada tópico é um arquivo JSON no Supabase Storage, pasta "treinamentos/"
 * (ver netlify/lib/armazenamento.mjs).
 */
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';
import { storage, ID_RE, newId } from '../lib/armazenamento.mjs';

const FOLDER = 'treinamentos';
const MAX_VIDEOS = 10;

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default (req, runtimeEnv) => respond(async () => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

  const sb = supabase(runtimeEnv);
  const caller = await authenticate(req, sb);
  if (!caller.can('treinamentos')) throw new HttpError(403, 'Sem permissão para ver os treinamentos.');
  const store = storage(sb, FOLDER);

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
