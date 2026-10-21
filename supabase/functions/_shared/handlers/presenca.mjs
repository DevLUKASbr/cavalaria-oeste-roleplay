// Presença recente no painel, independente do último login ou da conexão no jogo.
import { HttpError, json, respond, supabase, authenticate } from '../lib/acesso.mjs';
import { storage, ID_RE } from '../lib/armazenamento.mjs';

const TTL = 120000;
export default (req, runtimeEnv) => respond(async () => {
  if (!['GET', 'POST'].includes(req.method)) throw new HttpError(405, 'Método não permitido.');
  const sb = supabase(runtimeEnv);
  const caller = await authenticate(req, sb);
  if (!caller.can('acoes')) throw new HttpError(403, 'Sem permissão para consultar presença.');
  if (req.method === 'POST') {
    // Uma chave por conta: várias abas/dispositivos renovam a mesma presença.
    // Não apagar ao fechar uma aba: outra pode continuar conectada. A saída expira pelo TTL.
    if (!ID_RE.test(caller.user.id)) throw new HttpError(400, 'Identificador de conta inválido.');
    await storage(sb, 'presenca').put({ id: caller.user.id });
    return json(200, { confirmado: true });
  }
  const online = [];
  const now = Date.now();
  for (let offset = 0; ; offset += 1000) {
    // updated_at é do Storage, nunca do relógio ou corpo enviado pelo navegador.
    // https://supabase.com/docs/reference/javascript/file-buckets-list
    const response = await sb.call('/storage/v1/object/list/cavalaria', {
      method: 'POST', body: { prefix: 'presenca', limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }, raw: true,
    });
    if (!response.ok) {
      if (offset === 0 && /bucket not found/i.test(await response.clone().text())) break;
      throw new HttpError(502, 'Não foi possível consultar a presença no painel.');
    }
    const files = await response.json().catch(() => null);
    if (!Array.isArray(files)) throw new HttpError(502, 'Resposta de presença inválida.');
    for (const file of files) {
      if (!file.name?.endsWith('.json') || !ID_RE.test(file.name.slice(0, -5))) continue;
      const updated = Date.parse(file.updated_at);
      if (!Number.isFinite(updated) || updated > now + 5000) throw new HttpError(502, 'Não foi possível conferir a presença no painel.');
      if (updated + TTL > now) online.push({ id: file.name.slice(0, -5), expira_em: new Date(updated + TTL).toISOString() });
    }
    if (files.length < 1000) break;
  }
  return json(200, { online, servidor_em: new Date(now).toISOString() });
});
