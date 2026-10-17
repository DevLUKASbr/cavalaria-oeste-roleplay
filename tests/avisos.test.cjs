const { test } = require('node:test');
const assert = require('node:assert/strict');

// Handler e armazenamento reais, com HTTP Supabase simulado. Sem credenciais/rede reais.
async function setup(t, options = {}) {
  const { default: handler } = await import('../netlify/functions/avisos.mjs');
  const previousFetch = global.fetch;
  const previousEnv = global.Netlify;
  global.Netlify = { env: { get: name => ({ SUPABASE_URL: 'https://supabase.example.test', SUPABASE_SECRET_KEY: 'fixture-server-key' })[name] } };
  t.after(() => { global.fetch = previousFetch; global.Netlify = previousEnv; });
  const calls = [], records = new Map((options.records || []).map(item => [item.id, item]));
  global.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const method = init.method || 'GET';
    calls.push({ path, method });
    if (path === '/auth/v1/user') return Response.json(options.invalidToken ? {} : { id: 'fixture-user', email: 'official@example.test', app_metadata: { cargo: options.cargo ?? 'Xerife', nome: 'Autor Confiável' }, user_metadata: { cargo: 'Adm' } }, { status: options.invalidToken ? 401 : 200 });
    if (path === '/rest/v1/cavalaria_membros') return Response.json(options.legacy ? [{ role: 'xerife' }] : []);
    if (path.startsWith('/storage/')) {
      if (options.storageFail) return Response.json({ message: 'Falha de armazenamento fictícia' }, { status: 500 });
      if (path === '/storage/v1/object/list/cavalaria') return Response.json([...records.keys()].map(id => ({ name: id + '.json' })));
      const id = path.split('/').pop().replace(/\.json$/, '');
      if (method === 'POST') { records.set(id, JSON.parse(init.body)); return Response.json({ ok: true }); }
      return records.has(id) ? Response.json(records.get(id)) : Response.json({}, { status: 404 });
    }
    throw new Error(`Chamada inesperada: ${method} ${path}`);
  };
  const request = (body, query = '', method = body === undefined ? 'GET' : 'POST', token = true) => handler(new Request('https://site.example.test/api/avisos' + query, {
    method, headers: { ...(token ? { authorization: 'Bearer fixture-session' } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return { request, calls, records };
}
const fields = { titulo: 'Ordem de serviço', conteudo: 'Apresentar-se no quartel às 20h.', prioridade: 'normal' };
const notice = (id, props = {}) => ({ ...fields, id, autor: { nome: 'Comando' }, criado_em: '2026-10-17T12:00:00Z', arquivado_em: null, ...props });

for (const cargo of ['Xerife', 'Sub-Xerife', 'Adm']) {
  test(`${cargo} publica; autoria e datas vêm do servidor`, async t => {
    const { request, records } = await setup(t, { cargo });
    const response = await request({ acao: 'criar', ...fields, autor: { nome: 'Forjado' }, criado_em: '1900-01-01', arquivado_em: '1900-01-01' });
    assert.equal(response.status, 201);
    const { aviso } = await response.json();
    assert.equal(aviso.autor.nome, 'Autor Confiável');
    assert.equal(aviso.autor.cargo, cargo);
    assert.equal(aviso.arquivado_em, null);
    assert.notEqual(aviso.criado_em, '1900-01-01');
    assert.deepEqual(records.get(aviso.id), aviso);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
}
for (const options of [{ cargo: 'Membro' }, { cargo: '', legacy: true }]) {
  test(`${options.legacy ? 'Acesso limitado' : options.cargo} lê publicados e não escreve nem consulta arquivo`, async t => {
    const { request, calls } = await setup(t, { ...options, records: [notice('active-123'), notice('archive-123', { arquivado_em: '2026-10-17T13:00:00Z' })] });
    assert.deepEqual((await (await request()).json()).avisos.map(item => item.id), ['active-123']);
    const count = calls.length;
    assert.equal((await request(undefined, '?arquivados=1')).status, 403);
    for (const acao of ['criar', 'editar', 'arquivar', 'restaurar']) assert.equal((await request({ acao, id: 'active-123', ...fields })).status, 403);
    assert.equal(calls.slice(count).some(call => call.path.startsWith('/storage/')), false);
  });
}
test('sem sessão, token inválido ou cargo desconhecido não acessam armazenamento', async t => {
  const { request, calls } = await setup(t, { cargo: 'Desconhecido' });
  assert.equal((await request(undefined, '', 'GET', false)).status, 401);
  assert.equal((await request()).status, 403);
  assert.equal(calls.some(call => call.path.startsWith('/storage/')), false);
});
test('token expirado é rejeitado', async t => {
  const { request, calls } = await setup(t, { invalidToken: true });
  assert.equal((await request()).status, 401);
  assert.equal(calls.length, 1);
});
test('ordenação por prioridade e data, com arquivo separado', async t => {
  const { request } = await setup(t, { records: [notice('normal-123'), notice('urgent-old', { prioridade: 'urgente', criado_em: '2026-10-16T12:00:00Z' }), notice('urgent-new', { prioridade: 'urgente' }), notice('archive-123', { arquivado_em: '2026-10-17T13:00:00Z' })] });
  assert.deepEqual((await (await request()).json()).avisos.map(item => item.id), ['urgent-new', 'urgent-old', 'normal-123']);
  assert.deepEqual((await (await request(undefined, '?arquivados=1')).json()).avisos.map(item => item.id), ['archive-123']);
});
test('editar, arquivar e restaurar preservam identidade e autoria original', async t => {
  const original = notice('notice-123');
  const { request, records } = await setup(t, { records: [original] });
  assert.equal((await request({ acao: 'editar', id: original.id, ...fields, titulo: 'Ordem revisada', autor: { nome: 'Forjado' } })).status, 200);
  assert.deepEqual(records.get(original.id).autor, original.autor);
  assert.equal(records.get(original.id).criado_em, original.criado_em);
  assert.equal(records.get(original.id).atualizado_por.nome, 'Autor Confiável');
  assert.equal((await request({ acao: 'arquivar', id: original.id })).status, 200);
  assert.equal((await (await request()).json()).avisos.length, 0);
  assert.equal(records.get(original.id).arquivado_por.nome, 'Autor Confiável');
  assert.equal((await request({ acao: 'editar', id: original.id, ...fields })).status, 409);
  assert.equal((await request({ acao: 'restaurar', id: original.id })).status, 200);
  assert.equal((await (await request()).json()).avisos[0].titulo, 'Ordem revisada');
});
test('campos, ações, IDs e registros ausentes são validados sem gravar', async t => {
  const { request, calls } = await setup(t);
  for (const body of [null, {}, { acao: 'criar', ...fields, titulo: '  ' }, { acao: 'criar', ...fields, titulo: 'x'.repeat(121) }, { acao: 'criar', ...fields, conteudo: {} }, { acao: 'criar', ...fields, conteudo: 'x'.repeat(5001) }, { acao: 'criar', ...fields, prioridade: 'falsa' }, { acao: 'editar', id: '../contas' }]) {
    assert.equal((await request(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await request({ acao: 'editar', id: 'missing-123', ...fields })).status, 404);
  assert.equal(calls.some(call => call.method === 'POST' && call.path.includes('/object/cavalaria/')), false);
  assert.equal((await request(undefined, '', 'DELETE')).status, 405);
});
test('falha de persistência nunca retorna sucesso', async t => {
  const { request } = await setup(t, { storageFail: true });
  assert.equal((await request()).status, 502);
  assert.equal((await request({ acao: 'criar', ...fields })).status, 502);
});
