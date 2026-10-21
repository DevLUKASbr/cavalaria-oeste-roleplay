import avisos from './handlers/avisos.mjs';
import contas from './handlers/contas.mjs';
import treinamentos from './handlers/treinamentos.mjs';
import recrutamentos from './handlers/recrutamentos.mjs';
import investigacoes from './handlers/investigacoes.mjs';
import acoes from './handlers/acoes.mjs';
import { json } from './lib/acesso.mjs';

const handlers = { avisos, contas, treinamentos, recrutamentos, investigacoes, acoes };

// SUPABASE_SECRET_KEYS é injetado pelo Supabase. A chave não sai da Edge Function.
export function edgeEnvironment(read) {
  let secret;
  try { secret = JSON.parse(read('SUPABASE_SECRET_KEYS') || '{}').default; } catch { /* Projetos legados usam service_role. */ }
  return {
    SUPABASE_URL: read('SUPABASE_URL'),
    SUPABASE_SECRET_KEY: typeof secret === 'string' && secret ? secret : read('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function edgeApi(request, runtimeEnv) {
  const { pathname } = new URL(request.url);
  const match = /^\/(?:functions\/v1\/)?cavalaria-api\/([a-z]+)\/?$/.exec(pathname);
  if (!match || !Object.hasOwn(handlers, match[1])) return json(404, { erro: 'Rota não encontrada.' });
  // Cada handler valida a sessão no Supabase Auth e verifica o cargo no servidor.
  // O ambiente explícito evita compartilhar credenciais entre requisições concorrentes.
  return handlers[match[1]](request, runtimeEnv || {});
}
