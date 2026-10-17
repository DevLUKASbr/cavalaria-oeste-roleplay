/*
 * Netlify Function: investigações (rota /api/investigacoes).
 *
 *   GET  → { alvos, grupos }                                   (permissão 'investigacoes')
 *   POST { acao: 'salvar-alvo',   alvo: {...} }   sem id = novo ('investigacoes.editar')
 *   POST { acao: 'excluir-alvo',  id }                          ('investigacoes.editar')
 *   POST { acao: 'salvar-grupo',  grupo: {...} }  sem id = novo ('investigacoes.editar')
 *   POST { acao: 'excluir-grupo', id }  (os alvos do grupo ficam sem grupo)
 *
 * Alvo = pessoa ou ponto de interesse; grupo = bando/organização com território.
 * Coordenadas são as do jogo (x, y); o site converte para o mapa.
 * Sem SQL: arquivos JSON no Supabase Storage, pastas "investigacoes-alvos" e "investigacoes-grupos".
 */
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';
import { storage, ID_RE, newId } from '../lib/armazenamento.mjs';

const TIPOS = ['Indivíduo', 'Ponto de interesse'];
const AMEACAS = ['Baixo', 'Médio', 'Crítico'];
const COORD_LIMIT = 10000; // o mapa vai de aprox. -7200 a 4200 (x) e -5200 a 4100 (y)

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function str(value, max, label, { required = false } = {}) {
  const clean = String(value ?? '').trim();
  if (required && clean.length < 2) throw new HttpError(400, `Informe ${label}.`);
  if (clean.length > max) throw new HttpError(400, `${label[0].toUpperCase() + label.slice(1)}: no máximo ${max} caracteres.`);
  return clean;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new HttpError(400, `${label} inválido.`);
  return value;
}

function cleanUrl(value) {
  const clean = String(value ?? '').trim();
  if (!clean) return '';
  let parsed;
  try { parsed = new URL(clean); } catch { throw new HttpError(400, 'Link da foto inválido.'); }
  if (parsed.protocol !== 'https:' || clean.length > 800) throw new HttpError(400, 'A foto precisa ser um link https.');
  return parsed.href;
}

// Coordenadas do jogo; ausentes = alvo sem posição no mapa.
function cleanCoords(coords) {
  if (coords === null || coords === undefined || coords === '') return null;
  const x = Number(coords.x), y = Number(coords.y);
  if (coords.x === '' || coords.y === '' || !Number.isFinite(x) || !Number.isFinite(y)
      || Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) {
    throw new HttpError(400, 'Coordenadas inválidas: use os números x e y do jogo.');
  }
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

function cleanOptionalId(id) {
  if (id === null || id === undefined || id === '') return null;
  if (!ID_RE.test(String(id))) throw new HttpError(400, 'Grupo inválido.');
  return String(id);
}

function cleanId(id, label) {
  const value = String(id ?? '');
  if (!ID_RE.test(value)) throw new HttpError(400, `${label} não informado.`);
  return value;
}

const cleanTarget = a => ({
  nome: str(a?.nome, 80, 'o nome', { required: true }),
  tipo: oneOf(a?.tipo, TIPOS, 'Tipo'),
  foto: cleanUrl(a?.foto),
  grupo_id: cleanOptionalId(a?.grupo_id),
  cidade: str(a?.cidade, 60, 'cidade'),
  local: str(a?.local, 120, 'local'),
  ameaca: oneOf(a?.ameaca, AMEACAS, 'Nível de ameaça'),
  coords: cleanCoords(a?.coords),
  descricao: str(a?.descricao, 3000, 'descrição'),
});

const cleanGroup = g => ({
  nome: str(g?.nome, 80, 'o nome do grupo', { required: true }),
  cidade: str(g?.cidade, 60, 'cidade'),
  descricao: str(g?.descricao, 2000, 'descrição'),
  coords: cleanCoords(g?.coords),
});

// Cria (sem id) ou atualiza (com id) um registro, preservando autoria e datas.
async function save(store, input, clean, author, label) {
  const now = new Date().toISOString();
  const fields = clean(input);
  if (!input?.id) {
    const record = { id: newId(), ...fields, autor: author, criado_em: now, atualizado_em: null, atualizado_por: null };
    await store.put(record);
    return record;
  }
  const id = cleanId(input.id, label);
  const current = await store.get(id);
  if (!current) throw new HttpError(404, `${label} não encontrado (talvez tenha sido excluído).`);
  const record = { ...current, ...fields, id, atualizado_em: now, atualizado_por: author };
  await store.put(record);
  return record;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default req => respond(async () => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

  const sb = supabase();
  const caller = await authenticate(req, sb);
  if (!caller.can('investigacoes')) throw new HttpError(403, 'Sem permissão para ver as investigações.');
  const targets = storage(sb, 'investigacoes-alvos');
  const groups = storage(sb, 'investigacoes-grupos');

  if (req.method === 'GET') {
    const [alvos, grupos] = await Promise.all([targets.list(), groups.list()]);
    const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
    return json(200, { alvos: alvos.filter(Boolean).sort(byName), grupos: grupos.filter(Boolean).sort(byName) });
  }

  if (!caller.can('investigacoes.editar')) throw new HttpError(403, 'Sua conta não pode alterar investigações.');
  const body = await req.json().catch(() => ({}));
  const author = { id: caller.user.id, nome: caller.nome };

  switch (body.acao) {
    case 'salvar-alvo':
      return json(200, { alvo: await save(targets, body.alvo, cleanTarget, author, 'Alvo') });
    case 'excluir-alvo':
      await targets.remove(cleanId(body.id, 'Alvo'));
      return json(200, { ok: true });
    case 'salvar-grupo':
      return json(200, { grupo: await save(groups, body.grupo, cleanGroup, author, 'Grupo') });
    case 'excluir-grupo': {
      const id = cleanId(body.id, 'Grupo');
      await groups.remove(id);
      // Quem era do grupo fica sem grupo, para não apontar para algo que não existe mais.
      const members = (await targets.list()).filter(a => a?.grupo_id === id);
      await Promise.all(members.map(a => targets.put({ ...a, grupo_id: null })));
      return json(200, { ok: true, alvos_atualizados: members.length });
    }
    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
});

export const config = { path: '/api/investigacoes' };
