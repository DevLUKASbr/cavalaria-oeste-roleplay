const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const handlerPromise = import('../supabase/functions/_shared/handlers/presenca.mjs');
const env = { SUPABASE_URL: 'https://fixture.example.test', SUPABASE_SECRET_KEY: 'fixture-only' };

async function setup(t, options = {}) {
  const { default: handler } = await handlerPromise;
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const writes = [], lists = [];
  const files = options.files || [];
  global.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return new Headers(init.headers).get('authorization') === 'Bearer valid' ? Response.json({ id: 'fixture-user', app_metadata: { cargo: options.cargo || 'Membro' } }) : Response.json({}, { status: 401 });
    if (path === '/rest/v1/cavalaria_membros') return Response.json([]);
    if (path === '/storage/v1/object/list/cavalaria') {
      const body = JSON.parse(init.body); lists.push(body);
      if (options.failList) return Response.json({ error: 'Storage indisponível' }, { status: 503 });
      if (options.malformed) return Response.json({ invalid: true });
      if (options.missing) return Response.json({ message: 'Bucket not found' }, { status: 404 });
      return Response.json(files.slice(body.offset, body.offset + body.limit));
    }
    if (path.startsWith('/storage/v1/object/cavalaria/presenca/')) {
      writes.push({ path, body: JSON.parse(init.body) });
      return Response.json({}, { status: options.failWrite ? 503 : 200 });
    }
    throw new Error('Chamada não esperada: ' + path);
  };
  return { writes, lists, request: (body, { method = body === undefined ? 'GET' : 'POST', token = 'valid' } = {}) => handler(new Request('https://site.example.test/api/presenca', {
    method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env) };
}

test('heartbeat usa somente a identidade autenticada; múltiplas abas renovam uma chave', async t => {
  const { request, writes } = await setup(t);
  assert.equal((await request({ id: 'outra-conta', visto_em: '2099-01-01', online: false })).status, 200);
  assert.equal((await request({})).status, 200);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(writes[0], { path: '/storage/v1/object/cavalaria/presenca/fixture-user.json', body: { id: 'fixture-user' } });
});

test('presença expira pelo horário do Storage; consulta não retorna e-mail ou último login', async t => {
  const now = Date.now();
  const { request } = await setup(t, { files: [
    { name: 'online-user.json', updated_at: new Date(now - 45000).toISOString(), email: 'private@example.test' },
    { name: 'offline-user.json', updated_at: new Date(now - 120001).toISOString() },
    { name: 'subfolder', updated_at: null },
    { name: '../invalid.json', updated_at: null },
  ] });
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.deepEqual(data.online, [{ id: 'online-user', expira_em: new Date(now + 75000).toISOString() }]);
  assert.deepEqual(Object.keys(data).sort(), ['online', 'servidor_em']);
  assert.ok(Number.isFinite(Date.parse(data.servidor_em)));
});

test('lista de presença pagina acima de mil contas sem ler os objetos individuais', async t => {
  const now = new Date().toISOString();
  const { request, lists, writes } = await setup(t, { files: Array.from({ length: 1002 }, (_, i) => ({ name: `fixture-${String(i).padStart(4, '0')}.json`, updated_at: now })) });
  assert.equal((await (await request()).json()).online.length, 1002);
  assert.deepEqual(lists.map(item => item.offset), [0, 1000]);
  assert.ok(lists.every(item => item.prefix === 'presenca'));
  assert.equal(writes.length, 0);
});

test('sessão ausente, expirada, cargo revogado e método indevido não gravam presença', async t => {
  const { request, writes, lists } = await setup(t, { cargo: 'Sem acesso' });
  assert.equal((await request({}, { token: '' })).status, 401);
  assert.equal((await request({}, { token: 'expired' })).status, 401);
  assert.equal((await request({})).status, 403);
  assert.equal((await request(undefined, { method: 'DELETE' })).status, 405);
  assert.equal(writes.length + lists.length, 0);
});

for (const options of [{ failList: true }, { malformed: true }, { files: [{ name: 'fixture-user.json', updated_at: null }] }]) {
  test('falha ou horário inválido nunca é apresentado como lista de offline: ' + JSON.stringify(options), async t => {
    const { request } = await setup(t, options);
    assert.equal((await request()).status, 502);
  });
}
test('falha de heartbeat não retorna sucesso', async t => {
  const { request } = await setup(t, { failWrite: true });
  assert.equal((await request({})).status, 502);
});
test('bucket ainda inexistente representa nenhuma presença confirmada', async t => {
  const { request } = await setup(t, { missing: true });
  assert.deepEqual((await (await request()).json()).online, []);
});

function client() {
  const events = {}, timers = new Map(), calls = [];
  let now = 100000, nextTimer = 0;
  const document = { visibilityState: 'visible', addEventListener: (name, fn) => { events[name] = fn; } };
  const navigator = { onLine: true };
  const window = { addEventListener: (name, fn) => { events[name] = fn; } };
  const context = vm.createContext({ window, document, navigator, AbortController, Date: { now: () => now },
    setInterval: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearInterval: id => timers.delete(id), setTimeout: () => 0, clearTimeout() {},
  });
  vm.runInContext(readFileSync(resolve(__dirname, '../site/presenca.js'), 'utf8'), context);
  return { api: window.CavalariaPresence, document, navigator, events, timers, calls,
    advance: ms => { now += ms; }, call: async (...args) => { calls.push(args); },
  };
}
test('cliente só começa após acesso autorizado, renova sem token guardado e para no logout', async () => {
  const c = client();
  assert.equal(c.calls.length, 0);
  c.api.start({ permissions: [] }, c.call);
  assert.equal(c.timers.size, 0);
  c.api.start({ permissions: ['acoes'] }, c.call);
  await c.api.touch();
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0][0], 'presenca');
  assert.equal(c.calls[0][1], 'POST');
  c.advance(45000); await c.api.touch();
  assert.equal(c.calls.length, 2);
  c.api.stop(); c.advance(45000); await c.api.touch();
  assert.equal(c.calls.length, 2);
  assert.equal(c.timers.size, 0);
});
test('abas ocultas e rede offline não renovam; voltar ao painel retoma; bfcache não duplica timer', async () => {
  const c = client(); c.document.visibilityState = 'hidden';
  c.api.start({ permissions: ['acoes'] }, c.call);
  await c.api.touch(); assert.equal(c.calls.length, 0);
  c.document.visibilityState = 'visible'; await c.events.visibilitychange();
  assert.equal(c.calls.length, 1);
  c.advance(45000); c.navigator.onLine = false; await c.api.touch();
  assert.equal(c.calls.length, 1);
  c.navigator.onLine = true; c.events.online(); await c.api.touch();
  assert.equal(c.calls.length, 2);
  c.events.pagehide(); assert.equal(c.timers.size, 0);
  c.advance(45000); c.events.pageshow({ persisted: true }); await c.api.touch();
  assert.equal(c.calls.length, 3); assert.equal(c.timers.size, 1);
});
