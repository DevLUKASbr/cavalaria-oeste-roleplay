// Comunicados privados da Cavalaria. As permissões são verificadas no servidor.
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';
import { storage, ID_RE, newId } from '../lib/armazenamento.mjs';

function fields(body) {
  const clean = (value, label, min, max) => {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
      throw new HttpError(400, `${label} deve ter entre ${min} e ${max} caracteres.`);
    }
    return value.trim();
  };
  if (!['normal', 'importante', 'urgente'].includes(body.prioridade)) throw new HttpError(400, 'Prioridade inválida.');
  return {
    titulo: clean(body.titulo, 'O título', 3, 120),
    conteudo: clean(body.conteudo, 'O comunicado', 3, 5000),
    prioridade: body.prioridade,
  };
}

export default (req, runtimeEnv) => respond(async () => {
  if (!['GET', 'POST'].includes(req.method)) throw new HttpError(405, 'Método não permitido.');
  const sb = supabase(runtimeEnv);
  const caller = await authenticate(req, sb);
  if (!caller.can('avisos')) throw new HttpError(403, 'Sem permissão para ler avisos.');
  const store = storage(sb, 'avisos');

  if (req.method === 'GET') {
    const archived = new URL(req.url).searchParams.get('arquivados') === '1';
    if (archived && !caller.can('avisos.editar')) throw new HttpError(403, 'Sem permissão para consultar o arquivo de avisos.');
    const avisos = (await store.list()).filter(item => item && Boolean(item.arquivado_em) === archived);
    const weight = { urgente: 2, importante: 1, normal: 0 };
    avisos.sort((a, b) => (weight[b.prioridade] || 0) - (weight[a.prioridade] || 0) || String(b.criado_em).localeCompare(String(a.criado_em)));
    return json(200, { avisos });
  }

  if (!caller.can('avisos.editar')) throw new HttpError(403, 'Somente Xerife, Sub-Xerife e Adm podem publicar ou alterar avisos.');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Dados do aviso inválidos.');
  const now = new Date().toISOString();
  const author = { id: caller.user.id, nome: caller.nome, cargo: caller.cargo };
  if (body.acao === 'criar') {
    const aviso = { id: newId(), ...fields(body), autor: author, criado_em: now, atualizado_em: null, atualizado_por: null, arquivado_em: null, arquivado_por: null };
    await store.put(aviso);
    return json(201, { aviso });
  }
  if (!['editar', 'arquivar', 'restaurar'].includes(body.acao)) throw new HttpError(400, 'Ação desconhecida.');
  if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, 'Identificador de aviso inválido.');
  const current = await store.get(body.id);
  if (!current) throw new HttpError(404, 'Aviso não encontrado.');
  if (body.acao === 'editar' && current.arquivado_em) throw new HttpError(409, 'Restaure o aviso antes de editar.');
  const aviso = { ...current, id: body.id, atualizado_em: now, atualizado_por: author };
  if (body.acao === 'editar') Object.assign(aviso, fields(body));
  if (body.acao === 'arquivar') Object.assign(aviso, { arquivado_em: now, arquivado_por: author });
  if (body.acao === 'restaurar') Object.assign(aviso, { arquivado_em: null, arquivado_por: null });
  await store.put(aviso);
  return json(200, { aviso });
});

export const config = { path: '/api/avisos' };
