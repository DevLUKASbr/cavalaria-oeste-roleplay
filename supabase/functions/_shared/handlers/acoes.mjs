// Livro de ações: autoria da sessão e permissão de alteração conferidas no servidor.
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';
import { storage, ID_RE, newId } from '../lib/armazenamento.mjs';
import { listOfficers, resolveParticipants } from '../lib/oficiais.mjs';

const clean = (value, label, min, max) => {
  if (typeof value !== 'string') throw new HttpError(400, `${label} inválido.`);
  const text = value.normalize('NFKC').trim();
  if (text.length < min || text.length > max) throw new HttpError(400, `${label} deve ter entre ${min} e ${max} caracteres.`);
  return text;
};
async function fields(body, sb, current = null) {
  const titulo = clean(body.titulo, 'A ação', 3, 160);
  if (!['vitoria', 'derrota'].includes(body.resultado)) throw new HttpError(400, 'Selecione vitória ou derrota.');
  for (const key of ['cavalaria', 'oponentes']) {
    if (!Number.isInteger(body[key]) || body[key] < 1 || body[key] > 200) throw new HttpError(400, 'O confronto deve ter de 1 a 200 pessoas de cada lado.');
  }
  if (typeof body.ocorrido_em !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(body.ocorrido_em)) throw new HttpError(400, 'Informe uma data e hora válidas para a ação.');
  const when = new Date(body.ocorrido_em);
  if (!Number.isFinite(when.getTime()) || when.toISOString().slice(0, 19) !== body.ocorrido_em.slice(0, 19) || when < new Date('2020-01-01T00:00:00Z') || when.getTime() > Date.now() + 300000) throw new HttpError(400, 'A data da ação deve estar entre 2020 e o momento atual.');
  const relato = clean(body.relato ?? '', 'O relato', 0, 5000);
  return { titulo, resultado: body.resultado, cavalaria: body.cavalaria, oponentes: body.oponentes, ...await resolveParticipants(sb, body, current), ocorrido_em: when.toISOString(), relato };
}

export default (req, runtimeEnv) => respond(async () => {
  if (!['GET', 'POST'].includes(req.method)) throw new HttpError(405, 'Método não permitido.');
  const sb = supabase(runtimeEnv);
  const caller = await authenticate(req, sb);
  if (!caller.can('acoes')) throw new HttpError(403, 'Sem permissão para acessar Ações.');
  const store = storage(sb, 'acoes', { paginated: true, strict: true });
  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.get('oficiais') === '1') return json(200, { oficiais: await listOfficers(sb) });
    const archived = new URL(req.url).searchParams.get('arquivados') === '1';
    if (archived && !caller.can('acoes.gerenciar')) throw new HttpError(403, 'Somente a liderança pode consultar ações arquivadas.');
    const entries = await store.list();
    if (entries.some(item => !item || typeof item.titulo !== 'string' || !['vitoria', 'derrota'].includes(item.resultado) || !Array.isArray(item.participantes) || item.participantes.length !== item.cavalaria || item.participantes.some(name => typeof name !== 'string') || !Number.isInteger(item.oponentes) || item.oponentes < 1 || !Number.isFinite(Date.parse(item.ocorrido_em)))) throw new HttpError(502, 'O livro contém uma ação ilegível. Solicite revisão à liderança antes de emitir o relatório.');
    const acoes = entries.filter(item => Boolean(item.arquivado_em) === archived);
    acoes.sort((a, b) => String(b.ocorrido_em).localeCompare(String(a.ocorrido_em)) || String(b.criado_em).localeCompare(String(a.criado_em)));
    return json(200, { acoes });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Dados da ação inválidos.');
  const now = new Date().toISOString();
  const author = () => ({ id: caller.user.id, nome: caller.nome, cargo: caller.cargo, patente: clean(body.patente, 'A patente do responsável', 2, 80).replace(/\s+/g, ' ') });
  if (body.acao === 'criar') {
    const acao = { id: newId(), ...await fields(body, sb), autor: author(), criado_em: now, atualizado_em: null, atualizado_por: null, arquivado_em: null, arquivado_por: null, origem: 'manual', referencia_externa: null };
    await store.put(acao);
    return json(201, { acao });
  }
  if (!['editar', 'arquivar', 'restaurar'].includes(body.acao)) throw new HttpError(400, 'Operação desconhecida.');
  if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, 'Identificador de ação inválido.');
  // Recusar operações de gestão antes de consultar o registro.
  if (body.acao !== 'editar' && !caller.can('acoes.gerenciar')) throw new HttpError(403, 'Somente a liderança pode arquivar ou restaurar ações.');
  const current = await store.get(body.id);
  if (!current) throw new HttpError(404, 'Ação não encontrada.');
  if (!caller.can('acoes.gerenciar') && current.autor?.id !== caller.user.id) throw new HttpError(403, 'Você pode corrigir somente as ações que registrou.');
  if (body.acao === 'editar' && current.arquivado_em) throw new HttpError(409, 'Restaure a ação antes de editar.');
  const acao = { ...current, id: body.id, atualizado_em: now, atualizado_por: author() };
  if (body.acao === 'editar') Object.assign(acao, await fields(body, sb, current));
  if (body.acao === 'arquivar') {
    if (current.arquivado_em) throw new HttpError(409, 'Esta ação já está arquivada.');
    Object.assign(acao, { arquivado_em: now, arquivado_por: acao.atualizado_por });
  }
  if (body.acao === 'restaurar') {
    if (!current.arquivado_em) throw new HttpError(409, 'Esta ação já está no livro.');
    Object.assign(acao, { arquivado_em: null, arquivado_por: null });
  }
  await store.put(acao);
  return json(200, { acao });
});
