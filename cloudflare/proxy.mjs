// Cloudflare encaminha somente a sessão do usuário. Não recebe a chave administrativa.
const ENDPOINTS = new Set(['avisos', 'contas', 'treinamentos', 'recrutamentos', 'investigacoes', 'acoes', 'presenca']);
const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};
const errorResponse = (status, erro) => new Response(JSON.stringify({ erro }), { status, headers: SECURITY_HEADERS });

export async function proxyApi({ request, env }) {
  const incoming = new URL(request.url);
  const match = /^\/api\/([a-z]+)\/?$/.exec(incoming.pathname);
  if (!match || !ENDPOINTS.has(match[1])) return errorResponse(404, 'Rota não encontrada.');
  if (!['GET', 'POST'].includes(request.method)) return errorResponse(405, 'Método não permitido.');
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return errorResponse(401, 'Sessão inválida ou expirada. Entre novamente.');
  let base;
  try {
    base = new URL(env?.SUPABASE_FUNCTION_URL);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/functions/v1/cavalaria-api')) throw new Error();
  } catch { return errorResponse(503, 'A conexão com a API ainda não foi configurada na hospedagem.'); }
  const target = new URL(base.href + '/' + match[1]);
  target.search = incoming.search;
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && new TextEncoder().encode(body).length > 1024 * 1024) return errorResponse(413, 'Conteúdo muito grande.');
  try {
    const response = await fetch(target.href, {
      method: request.method,
      headers: { authorization, 'content-type': 'application/json' },
      body,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) return errorResponse(502, 'A API retornou um redirecionamento inesperado.');
    if (!response.headers.get('content-type')?.includes('application/json')) return errorResponse(502, 'Não foi possível acessar a API.');
    const data = await response.json();
    if (!response.ok && typeof data?.erro !== 'string') {
      return errorResponse(response.status === 401 ? 401 : 502, response.status === 401 ? 'Sessão inválida ou expirada. Entre novamente.' : 'A API do sistema está indisponível. Confira a publicação no Supabase.');
    }
    return new Response(JSON.stringify(data), { status: response.status, headers: SECURITY_HEADERS });
  } catch { return errorResponse(502, 'Não foi possível acessar a API. Tente novamente.'); }
}
