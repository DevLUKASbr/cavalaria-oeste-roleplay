const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const modules = Promise.all([
  import('../cloudflare/proxy.mjs'),
  import('../supabase/functions/_shared/router.mjs'),
]);
const serverEnv = { SUPABASE_URL: 'https://supabase.example.test', SUPABASE_SECRET_KEY: 'fixture-server-only' };
const proxyEnv = { SUPABASE_FUNCTION_URL: 'https://edge.example.test/functions/v1/cavalaria-api' };
const routes = ['avisos', 'contas', 'treinamentos', 'recrutamentos', 'investigacoes', 'acoes'];
const req = (path, { body, token = 'valid-session', method = body ? 'POST' : 'GET' } = {}) => new Request('https://site.example.test' + path, {
  method,
  headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json', cookie: 'private-cookie=fixture' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

async function setup(t, { cargo = 'Xerife', records = [] } = {}) {
  const [{ proxyApi }, { edgeApi }] = await modules;
  const previousFetch = global.fetch;
  const previousNetlify = global.Netlify;
  t.after(() => { global.fetch = previousFetch; global.Netlify = previousNetlify; });
  global.Netlify = { env: { get: () => 'poisoned-global-value' } };
  const store = new Map(records.map(record => [record.id, record]));
  const calls = [];
  global.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const headers = new Headers(init.headers);
    calls.push({ url: parsed.href, path: parsed.pathname, init, headers });
    if (parsed.hostname === 'edge.example.test') {
      return edgeApi(new Request(url, init), serverEnv);
    }
    assert.equal(headers.get('apikey'), serverEnv.SUPABASE_SECRET_KEY);
    if (parsed.pathname === '/auth/v1/user') {
      if (headers.get('authorization') !== 'Bearer valid-session') return Response.json({}, { status: 401 });
      return Response.json({ id: 'fixture-user', email: 'user@example.test', app_metadata: { nome: 'Comando Teste', cargo } });
    }
    if (parsed.pathname === '/rest/v1/cavalaria_membros') return Response.json([]);
    if (parsed.pathname === '/auth/v1/admin/users') return Response.json({ users: [] });
    if (parsed.pathname === '/storage/v1/object/list/cavalaria') {
      const { prefix } = JSON.parse(init.body);
      return Response.json(prefix === 'avisos' ? [...store.keys()].map(id => ({ name: id + '.json' })) : []);
    }
    if (parsed.pathname.startsWith('/storage/v1/object/cavalaria/avisos/')) {
      const id = parsed.pathname.split('/').pop().replace(/\.json$/, '');
      if (init.method === 'POST') { store.set(id, JSON.parse(init.body)); return Response.json({ ok: true }); }
      return store.has(id) ? Response.json(store.get(id)) : Response.json({}, { status: 404 });
    }
    throw new Error('Chamada inesperada: ' + parsed.pathname);
  };
  return { calls, store, edgeApi, proxyApi, request: (path, options) => proxyApi({ request: req(path, options), env: proxyEnv }) };
}

for (const route of routes) {
  test(`Cloudflare + Supabase: ${route} preserva leitura autenticada e bloqueia sessão inválida`, async t => {
    const { request, calls } = await setup(t);
    const response = await request('/api/' + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    const forwarded = calls.find(call => call.url.startsWith(proxyEnv.SUPABASE_FUNCTION_URL));
    assert.equal(forwarded.headers.get('authorization'), 'Bearer valid-session');
    assert.equal(forwarded.headers.has('cookie'), false);
    assert.equal(forwarded.headers.has('apikey'), false);
    assert.equal((await request('/api/' + route, { token: 'expired-session' })).status, 401);
    const count = calls.length;
    assert.equal((await request('/api/' + route, { token: '' })).status, 401);
    assert.equal(calls.length, count);
  });
}

test('a API Edge mantém a restrição de Membro em todos os módulos', async t => {
  const { request } = await setup(t, { cargo: 'Membro' });
  assert.equal((await request('/api/avisos')).status, 200);
  assert.equal((await request('/api/treinamentos')).status, 200);
  assert.equal((await request('/api/acoes')).status, 200);
  assert.equal((await request('/api/acoes?arquivados=1')).status, 403);
  for (const route of ['contas', 'investigacoes', 'recrutamentos']) assert.equal((await request('/api/' + route)).status, 403);
  assert.equal((await request('/api/avisos?arquivados=1')).status, 403);
  assert.equal((await request('/api/avisos', { body: { acao: 'criar', titulo: 'Tentativa' } })).status, 403);
});

test('avisos publicados pela nova rota persistem e a autoria vem do servidor', async t => {
  const { request, calls, store } = await setup(t);
  const response = await request('/api/avisos', { body: { acao: 'criar', titulo: 'Nova hospedagem', conteudo: 'Comunicado de teste da migração.', prioridade: 'importante', autor: { nome: 'Forjado' } } });
  assert.equal(response.status, 201);
  const { aviso } = await response.json();
  assert.equal(aviso.autor.nome, 'Comando Teste');
  assert.deepEqual(store.get(aviso.id), aviso);
  assert.equal((await (await request('/api/avisos')).json()).avisos[0].id, aviso.id);
  assert.equal((await request('/api/avisos', { body: { acao: 'arquivar', id: aviso.id } })).status, 200);
  assert.equal((await (await request('/api/avisos')).json()).avisos.length, 0);
  assert.equal((await (await request('/api/avisos?arquivados=1')).json()).avisos[0].id, aviso.id);
  assert.ok(calls.some(call => call.url.endsWith('/avisos?arquivados=1')));
});

test('listas maiores não multiplicam chamadas externas na Cloudflare', async t => {
  const records = Array.from({ length: 75 }, (_, i) => ({ id: 'notice-' + i, titulo: 'Aviso ' + i, prioridade: 'normal', criado_em: '2026-10-20', arquivado_em: null }));
  const { request, calls } = await setup(t, { records });
  const response = await request('/api/avisos');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).avisos.length, 75);
  assert.equal(calls.filter(call => call.url.startsWith(proxyEnv.SUPABASE_FUNCTION_URL)).length, 1);
});

test('Edge usa somente seu ambiente e recusa configuração ausente, rotas e métodos desconhecidos', async t => {
  const { edgeApi, calls } = await setup(t);
  assert.equal((await edgeApi(req('/functions/v1/cavalaria-api/avisos'), {})).status, 503);
  assert.equal(calls.length, 0, 'não deve usar o ambiente global do Netlify');
  for (const route of routes) {
    assert.equal((await edgeApi(req('/functions/v1/cavalaria-api/' + route, { token: '' }), serverEnv)).status, 401);
    assert.equal((await edgeApi(req('/functions/v1/cavalaria-api/' + route, { method: 'DELETE' }), serverEnv)).status, 405);
  }
  assert.equal((await edgeApi(req('/functions/v1/cavalaria-api/constructor'), serverEnv)).status, 404);
});

test('proxy recusa rotas e destinos inválidos sem executar chamada externa', async t => {
  const { request, calls, proxyApi } = await setup(t);
  for (const path of ['/api/unknown', '/api/avisos/extra', '/api/constructor', '/api/toString']) assert.equal((await request(path)).status, 404);
  assert.equal((await request('/api/avisos', { method: 'DELETE' })).status, 405);
  for (const env of [{}, { SUPABASE_FUNCTION_URL: 'http://edge.example.test/functions/v1/cavalaria-api' }, { SUPABASE_FUNCTION_URL: 'https://edge.example.test/not-api' }]) {
    assert.equal((await proxyApi({ request: req('/api/avisos'), env })).status, 503);
  }
  assert.equal(calls.length, 0);
});

test('proxy preserva falhas JSON e não segue redirects nem aceita páginas HTML como sucesso', async t => {
  const { proxyApi } = await setup(t);
  const run = () => proxyApi({ request: req('/api/avisos'), env: proxyEnv });
  global.fetch = async () => Response.json({ erro: 'Sem permissão.' }, { status: 403 });
  assert.equal((await run()).status, 403);
  assert.equal((await (await run()).json()).erro, 'Sem permissão.');
  global.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://unexpected.example.test' } });
  assert.equal((await run()).status, 502);
  global.fetch = async () => new Response('<html>erro</html>', { headers: { 'content-type': 'text/html' } });
  assert.equal((await run()).status, 502);
  global.fetch = async () => { throw new Error('fixture transport failure'); };
  assert.equal((await run()).status, 502);
  global.fetch = async () => Response.json({ code: 'NOT_FOUND' }, { status: 404 });
  assert.equal((await run()).status, 502);
});

test('as credenciais injetadas pelo Supabase suportam chaves novas e legadas sem expor valores', async () => {
  const [, { edgeEnvironment }] = await modules;
  const input = { SUPABASE_URL: serverEnv.SUPABASE_URL, SUPABASE_SECRET_KEYS: '{"default":"fixture-modern"}', SUPABASE_SERVICE_ROLE_KEY: 'fixture-legacy' };
  assert.equal(edgeEnvironment(name => input[name]).SUPABASE_SECRET_KEY, 'fixture-modern');
  input.SUPABASE_SECRET_KEYS = 'malformed';
  assert.equal(edgeEnvironment(name => input[name]).SUPABASE_SECRET_KEY, 'fixture-legacy');
  delete input.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(edgeEnvironment(name => input[name]).SUPABASE_SECRET_KEY, undefined);
});

test('a Cloudflare invoca função somente em /api/* e não publica pastas de servidor', () => {
  const routesConfig = JSON.parse(readFileSync(resolve(__dirname, '../site/_routes.json')));
  assert.deepEqual(routesConfig.include, ['/api/*']);
  const config = readFileSync(resolve(__dirname, '../wrangler.toml'), 'utf8');
  assert.match(config, /pages_build_output_dir\s*=\s*"\.\/site"/);
  assert.doesNotMatch(config, /SUPABASE_SECRET_KEY\s*=/);
});
