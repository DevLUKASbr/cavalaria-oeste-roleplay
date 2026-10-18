/*
 * Netlify Function: investigações (rota /api/investigacoes).
 *
 *   GET  → { alvos, grupos, vinculos }                                 (permissão 'investigacoes')
 *   POST { acao: 'salvar-alvo',     alvo: {...} }    pessoa ou lugar; sem id = novo ('investigacoes.editar')
 *   POST { acao: 'excluir-alvo',    id }             apaga também os vínculos da pessoa
 *   POST { acao: 'salvar-grupo',    grupo: {...} }
 *   POST { acao: 'excluir-grupo',   id }             os membros ficam sem grupo
 *   POST { acao: 'salvar-vinculo',  vinculo: {...} } ligação entre duas pessoas
 *   POST { acao: 'excluir-vinculo', id }
 *
 * Registro ("alvo" no armazenamento) = pessoa (tipo 'Indivíduo') ou lugar (tipo 'Ponto de interesse':
 * loja, saloon, esconderijo…). Pessoa ou lugar só é alvo quando investigado = true (com nível de
 * ameaça). Registros antigos, sem o campo investigado, eram todos alvos e continuam sendo.
 * Pessoa pode apontar o grupo (grupo_id) e o lugar onde trabalha (local_id).
 * Coordenadas são as do jogo (x, y); o site converte para o mapa.
 * Sem SQL: arquivos JSON no Supabase Storage, pastas "investigacoes-alvos", "investigacoes-grupos"
 * e "investigacoes-vinculos".
 */
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';
import { storage, ID_RE, newId } from '../lib/armazenamento.mjs';

const TIPOS = ['Indivíduo', 'Ponto de interesse'];
const AMEACAS = ['Baixo', 'Médio', 'Crítico'];
const CATEGORIAS = ['Loja', 'Saloon', 'Banco', 'Fazenda', 'Estábulo', 'Hotel', 'Hospital', 'Reserva Indígena', 'Esconderijo', 'Outro'];
const TIPOS_VINCULO = [
  'Líder/Chefe', 'Sublíder', 'Casal/Romance', 'Família',
  'Sócio/Parceiro', 'Funcionário de', 'Amizade', 'Rival/Inimigo',
];
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
  if (!allowed.includes(value)) throw new HttpError(400, `${label}: valor inválido.`);
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

// Coordenadas do jogo; ausentes = sem posição no mapa.
function cleanCoords(coords) {
  if (coords === null || coords === undefined || coords === '') return null;
  const x = Number(coords.x), y = Number(coords.y);
  if (coords.x === '' || coords.y === '' || !Number.isFinite(x) || !Number.isFinite(y)
      || Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) {
    throw new HttpError(400, 'Coordenadas inválidas: use os números x e y do jogo.');
  }
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

function cleanOptionalId(id, label) {
  if (id === null || id === undefined || id === '') return null;
  if (!ID_RE.test(String(id))) throw new HttpError(400, `${label}: valor inválido.`);
  return String(id);
}

function cleanId(id, label) {
  const value = String(id ?? '');
  if (!ID_RE.test(value)) throw new HttpError(400, `${label} não informado.`);
  return value;
}

function cleanRecord(a) {
  const tipo = oneOf(a?.tipo, TIPOS, 'Tipo');
  const isPerson = tipo === 'Indivíduo';
  // Sem o campo = sob investigação (compatível com o site anterior, em que todo cadastro era alvo).
  const investigado = a?.investigado !== false;
  return {
    nome: str(a?.nome, 80, 'o nome', { required: true }),
    tipo,
    categoria: isPerson ? null : oneOf(a?.categoria || 'Outro', CATEGORIAS, 'Categoria'),
    foto: cleanUrl(a?.foto),
    grupo_id: cleanOptionalId(a?.grupo_id, 'Grupo'),
    cidade: str(a?.cidade, 60, 'cidade'),
    ocupacao: isPerson ? str(a?.ocupacao, 80, 'ocupação') : '',
    local_id: isPerson ? cleanOptionalId(a?.local_id, 'Lugar de trabalho') : null,
    local: str(a?.local, 120, 'local'),
    investigado,
    ameaca: investigado ? oneOf(a?.ameaca, AMEACAS, 'Nível de ameaça') : null,
    coords: cleanCoords(a?.coords),
    descricao: str(a?.descricao, 3000, 'descrição'),
  };
}

const cleanGroup = g => ({
  nome: str(g?.nome, 80, 'o nome do grupo', { required: true }),
  cidade: str(g?.cidade, 60, 'cidade'),
  descricao: str(g?.descricao, 2000, 'descrição'),
  coords: cleanCoords(g?.coords),
});

// Vínculo entre duas pessoas que existem. Tipos com direção (Líder/Chefe, Sublíder, Funcionário de)
// leem-se "de → para": quem comanda → quem é comandado; funcionário → patrão.
async function cleanLink(v, records) {
  const de = cleanId(v?.de, 'Pessoa de origem');
  const para = cleanId(v?.para, 'Pessoa de destino');
  if (de === para) throw new HttpError(400, 'Escolha duas pessoas diferentes.');
  const [from, to] = await Promise.all([records.get(de), records.get(para)]);
  if (from?.tipo !== 'Indivíduo' || to?.tipo !== 'Indivíduo') throw new HttpError(400, 'Vínculos só ligam pessoas cadastradas.');
  return {
    de,
    para,
    tipo: oneOf(v?.tipo, TIPOS_VINCULO, 'Tipo de vínculo'),
    obs: str(v?.obs, 300, 'observação'),
  };
}

// Cria (sem id) ou atualiza (com id) um registro, preservando autoria e datas.
async function save(store, input, fields, author, label) {
  const now = new Date().toISOString();
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
  const records = storage(sb, 'investigacoes-alvos');
  const groups = storage(sb, 'investigacoes-grupos');
  const links = storage(sb, 'investigacoes-vinculos');

  if (req.method === 'GET') {
    const [alvos, grupos, vinculos] = await Promise.all([records.list(), groups.list(), links.list()]);
    const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
    return json(200, {
      alvos: alvos.filter(Boolean).sort(byName),
      grupos: grupos.filter(Boolean).sort(byName),
      vinculos: vinculos.filter(Boolean),
    });
  }

  if (!caller.can('investigacoes.editar')) throw new HttpError(403, 'Sua conta não pode alterar investigações.');
  const body = await req.json().catch(() => ({}));
  const author = { id: caller.user.id, nome: caller.nome };

  switch (body.acao) {
    case 'salvar-alvo':
      return json(200, { alvo: await save(records, body.alvo, cleanRecord(body.alvo), author, 'Cadastro') });

    case 'excluir-alvo': {
      const id = cleanId(body.id, 'Cadastro');
      await records.remove(id);
      // Sem referências soltas: vínculos da pessoa somem e quem trabalhava no lugar fica sem lugar.
      const [allLinks, allRecords] = await Promise.all([links.list(), records.list()]);
      await Promise.all([
        ...allLinks.filter(l => l && (l.de === id || l.para === id)).map(l => links.remove(l.id)),
        ...allRecords.filter(r => r?.local_id === id).map(r => records.put({ ...r, local_id: null })),
      ]);
      return json(200, { ok: true });
    }

    case 'salvar-grupo':
      return json(200, { grupo: await save(groups, body.grupo, cleanGroup(body.grupo), author, 'Grupo') });

    case 'excluir-grupo': {
      const id = cleanId(body.id, 'Grupo');
      await groups.remove(id);
      const members = (await records.list()).filter(a => a?.grupo_id === id);
      await Promise.all(members.map(a => records.put({ ...a, grupo_id: null })));
      return json(200, { ok: true });
    }

    case 'salvar-vinculo':
      return json(200, { vinculo: await save(links, body.vinculo, await cleanLink(body.vinculo, records), author, 'Vínculo') });

    case 'excluir-vinculo':
      await links.remove(cleanId(body.id, 'Vínculo'));
      return json(200, { ok: true });

    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
});

export const config = { path: '/api/investigacoes' };
