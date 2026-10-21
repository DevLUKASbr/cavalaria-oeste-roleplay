const { test } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../site/acoes-dados.js');
const env = { SUPABASE_URL: 'https://supabase.example.test', SUPABASE_SECRET_KEY: 'fixture-server-only' };
const fields = { titulo: 'Defesa de Valentine', resultado: 'vitoria', cavalaria: 2, oponentes: 3, participantes: ['Morgan West', 'John Carter'], participantes_ids: ['fixture-user', 'john-official'], ocorrido_em: '2026-10-20T19:00:00.000Z', relato: 'Confronto encerrado na estação.', patente: 'Sargento' };
const action = (id, extra = {}) => ({ id, ...fields, autor: { id: 'fixture-user', nome: 'Morgan West', cargo: 'Membro', patente: 'Soldado' }, criado_em: '2026-10-20T19:30:00Z', atualizado_em: null, arquivado_em: null, origem: 'manual', referencia_externa: null, ...extra });

async function setup(t, options = {}) {
  const { default: handler } = await import('../supabase/functions/_shared/handlers/acoes.mjs');
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  const records = new Map((options.records || []).map(item => [item.id, structuredClone(item)])), calls = [];
  let active = 0, maxActive = 0;
  global.fetch = async (url, init = {}) => {
    const parsed = new URL(url), path = parsed.pathname, method = init.method || 'GET';
    const payload = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method, payload });
    if (path === '/auth/v1/user') return Response.json({ id: options.userId || 'fixture-user', email: 'user@example.test', app_metadata: { nome: 'Nome da sessão', cargo: options.cargo ?? 'Membro' }, user_metadata: { cargo: 'Adm' } }, { status: options.invalidToken ? 401 : 200 });
    if (path === '/rest/v1/cavalaria_membros') return Response.json(options.members || (options.legacy ? [{ user_id: 'fixture-user', role: 'xerife' }] : []));
    if (path === '/auth/v1/admin/users') {
      const users = options.users || [{ id: 'fixture-user', app_metadata: { nome: 'Morgan West', cargo: 'Membro' } }, { id: 'john-official', app_metadata: { nome: 'John Carter', cargo: 'Membro' }, last_sign_in_at: null }];
      const page = Number(parsed.searchParams.get('page'));
      return Response.json({ users: users.slice((page - 1) * 200, page * 200) });
    }
    if (path === '/storage/v1/object/list/cavalaria') {
      if (options.listFail) return Response.json({ message: 'Storage indisponível' }, { status: 500 });
      assert.equal(payload.prefix, 'acoes');
      return Response.json([...records.keys()].sort().slice(payload.offset, payload.offset + payload.limit).map(id => ({ name: id + '.json' })));
    }
    if (path.startsWith('/storage/v1/object/cavalaria/acoes/')) {
      const id = path.split('/').pop().replace(/\.json$/, '');
      if (options.readFail && method === 'GET') return Response.json({ message: 'Falha de leitura' }, { status: 503 });
      if (options.saveFail && method === 'POST') return Response.json({ message: 'Falha de gravação' }, { status: 503 });
      if (method === 'POST') { records.set(id, JSON.parse(init.body)); return Response.json({ ok: true }); }
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return records.has(id) ? Response.json(records.get(id)) : Response.json({}, { status: 404 });
    }
    throw new Error('Chamada inesperada: ' + path);
  };
  const request = (body, { query = '', token = true, method = body === undefined ? 'GET' : 'POST' } = {}) => handler(new Request('https://example.test/api/acoes' + query, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer fixture-session' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { request, records, calls, maxActive: () => maxActive };
}

for (const cargo of ['Membro', 'Xerife', 'Sub-Xerife', 'Adm']) test(`${cargo} registra e consulta; identidade e origem não podem ser forjadas`, async t => {
  const { request, records } = await setup(t, { cargo });
  const r = await request({ ...fields, acao: 'criar', autor: { id: 'falso', nome: 'Forjado', patente: 'General' }, criado_em: '1900-01-01', arquivado_em: '1900', origem: 'discord', referencia_externa: 'forjada' });
  assert.equal(r.status, 201);
  const { acao } = await r.json();
  assert.deepEqual(acao.autor, { id: 'fixture-user', nome: 'Nome da sessão', cargo, patente: 'Sargento' });
  assert.equal(acao.origem, 'manual'); assert.equal(acao.referencia_externa, null); assert.equal(acao.arquivado_em, null);
  assert.notEqual(acao.criado_em, '1900-01-01');
  assert.deepEqual(records.get(acao.id), acao);
  assert.equal((await (await request()).json()).acoes[0].id, acao.id);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('conta legada autorizada também registra ações', async t => {
  const { request } = await setup(t, { cargo: '', legacy: true });
  assert.equal((await request({ ...fields, acao: 'criar' })).status, 201);
});
test('sessão ausente, inválida e cargo desconhecido não alcançam o livro', async t => {
  const { request, calls } = await setup(t, { cargo: 'Intruso' });
  assert.equal((await request(undefined, { token: false })).status, 401);
  assert.equal((await request()).status, 403);
  assert.equal(calls.some(call => call.path.startsWith('/storage/')), false);
});
test('token expirado e métodos indevidos são recusados', async t => {
  const { request, calls } = await setup(t, { invalidToken: true });
  assert.equal((await request()).status, 401);
  assert.equal((await request(undefined, { method: 'DELETE' })).status, 405);
  assert.equal(calls.some(call => call.path.startsWith('/storage/')), false);
});
test('membro corrige só os próprios registros e autoria original é preservada', async t => {
  const original = action('action-own'), other = action('action-other', { autor: { id: 'outro', nome: 'Outro oficial', patente: 'Tenente' } });
  const { request, records } = await setup(t, { records: [original, other] });
  assert.equal((await request({ ...fields, acao: 'editar', id: other.id })).status, 403);
  assert.equal((await request({ ...fields, acao: 'editar', id: original.id, resultado: 'derrota', patente: 'Cabo', autor: { nome: 'Forjado' } })).status, 200);
  const saved = records.get(original.id);
  assert.deepEqual(saved.autor, original.autor); assert.equal(saved.criado_em, original.criado_em); assert.equal(saved.resultado, 'derrota');
  assert.equal(saved.atualizado_por.nome, 'Nome da sessão'); assert.equal(saved.atualizado_por.patente, 'Cabo'); assert.ok(saved.atualizado_em);
  for (const acao of ['arquivar', 'restaurar']) assert.equal((await request({ acao, id: original.id, patente: 'Soldado' })).status, 403);
  assert.equal((await request(undefined, { query: '?arquivados=1' })).status, 403);
});
test('liderança revisa outros registros, arquiva e restaura sem apagar', async t => {
  const original = action('action-other', { autor: { id: 'outro', nome: 'Outro oficial', patente: 'Soldado' } });
  const { request, records } = await setup(t, { cargo: 'Adm', records: [original] });
  assert.equal((await request({ ...fields, acao: 'editar', id: original.id })).status, 200);
  assert.equal((await request({ acao: 'arquivar', id: original.id, patente: 'Tenente' })).status, 200);
  assert.equal((await (await request()).json()).acoes.length, 0);
  assert.equal((await (await request(undefined, { query: '?arquivados=1' })).json()).acoes.length, 1);
  assert.equal((await request({ ...fields, acao: 'editar', id: original.id })).status, 409);
  assert.equal((await request({ acao: 'restaurar', id: original.id, patente: 'Tenente' })).status, 200);
  assert.deepEqual(records.get(original.id).autor, original.autor); assert.equal(records.get(original.id).arquivado_em, null);
});
test('campos, calendário, duplicados e quantidades inválidos não geram gravação', async t => {
  const { request, calls } = await setup(t);
  const bad = [ { titulo: '  ' }, { titulo: 'x'.repeat(161) }, { patente: ' ' }, { patente: {} }, { resultado: 'empate' }, { cavalaria: '2' }, { cavalaria: 0 }, { cavalaria: 1.5 }, { oponentes: 201 }, { participantes_ids: ['fixture-user'] }, { participantes_ids: ['fixture-user', 'fixture-user'] }, { participantes_ids: ['fixture-user', 'inexistente'] }, { participantes_ids: ['fixture-user', {}] }, { participantes_ids: null }, { ocorrido_em: '2026-02-30T10:00:00Z' }, { ocorrido_em: '2026-10-20' }, { ocorrido_em: '2099-01-01T00:00:00Z' }, { ocorrido_em: '2019-01-01T00:00:00Z' }, { relato: 'x'.repeat(5001) } ];
  for (const patch of bad) assert.equal((await request({ ...fields, ...patch, acao: 'criar' })).status, 400, JSON.stringify(patch));
  for (const body of [null, [], {}, { acao: 'editar', id: '../avisos' }]) assert.equal((await request(body)).status, 400);
  assert.equal((await request({ ...fields, acao: 'editar', id: 'missing-action' })).status, 404);
  assert.equal(calls.some(call => call.method === 'POST' && call.path.includes('/object/cavalaria/')), false);
});
test('falhas de gravação e leitura não são apresentadas como sucesso ou livro vazio', async t => {
  const { request } = await setup(t, { records: [action('action-fail')], saveFail: true, readFail: true });
  assert.equal((await request()).status, 502);
  assert.equal((await request({ ...fields, acao: 'criar' })).status, 502);
});
test('registro ilegível impede relatório parcial enganoso', async t => {
  const { request } = await setup(t, { records: [action('action-broken', { participantes: null })] });
  assert.equal((await request()).status, 502);
});
test('o livro lê além de mil registros com paralelismo limitado e ordenação por ocorrência', async t => {
  const entries = Array.from({ length: 1001 }, (_, i) => action('action-' + String(i).padStart(5, '0'), { ocorrido_em: i === 1000 ? '2026-10-21T01:00:00Z' : fields.ocorrido_em }));
  const { request, calls, maxActive } = await setup(t, { records: entries });
  const result = await (await request()).json();
  assert.equal(result.acoes.length, 1001); assert.equal(result.acoes[0].id, entries[1000].id);
  assert.deepEqual(calls.filter(c => c.path.includes('/object/list/')).map(c => c.payload.offset), [0, 1000]);
  assert.ok(maxActive() <= 8);
});
test('relatórios respeitam Brasília, período inclusivo, resultado e nomes de participantes', () => {
  const records = [action('first-action', { ocorrido_em: '2026-10-01T02:00:00Z' }), action('second-action', { ocorrido_em: '2026-10-01T03:00:00Z' }), action('third-action', { resultado: 'derrota' })];
  assert.equal(helpers.dayKey(records[0].ocorrido_em), '2026-09-30');
  const filtered = helpers.filter(records, { from: '2026-10-01', to: '2026-10-20', search: ' JOHN  CARTER ', result: 'vitoria' });
  assert.deepEqual(filtered.map(r => r.id), ['second-action']);
  assert.deepEqual(helpers.stats(records), { total: 3, wins: 2, losses: 1, rate: 67, officers: 2 });
  assert.equal(helpers.stats([]).rate, null);
});
test('CSV contém todos os registros filtrados e neutraliza fórmulas, aspas e quebras de linha', () => {
  const csv = helpers.csv([action('csv-action', { titulo: ' =HYPERLINK("teste")', relato: 'linha 1\nlinha 2', participantes: ['@Formula', 'John Carter'] })]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\' =HYPERLINK(""teste"")"'));
  assert.ok(csv.includes('"\'@Formula | John Carter"'));
  assert.ok(csv.includes('"linha 1\nlinha 2"'));
  assert.ok(csv.includes('"Soldado"'));
});

test('diretório inclui oficiais desconectados e sem login, sem expor e-mails ou metadados', async t => {
  const { request } = await setup(t, { users: [
    { id: 'active-user', email: 'private@example.test', app_metadata: { nome: 'João Oeste', cargo: 'Membro', segredo: 'não expor' }, last_sign_in_at: new Date().toISOString() },
    { id: 'offline-user', email: 'offline@example.test', app_metadata: { nome: 'Maria Oeste', cargo: 'Membro' }, last_sign_in_at: null },
    { id: 'legacy-user', app_metadata: { nome: 'Oficial legado' } },
    { id: 'revoked-user', app_metadata: { nome: 'Sem acesso', cargo: null } },
    { id: 'banned-user', app_metadata: { nome: 'Bloqueado', cargo: 'Membro' }, banned_until: '2099-01-01T00:00:00Z' },
  ], members: [{ user_id: 'legacy-user', role: 'xerife' }] });
  const r = await request(undefined, { query: '?oficiais=1' });
  assert.equal(r.status, 200);
  const { oficiais } = await r.json();
  assert.deepEqual(oficiais.map(person => person.nome), ['João Oeste', 'Maria Oeste', 'Oficial legado']);
  for (const person of oficiais) assert.deepEqual(Object.keys(person).sort(), ['cargo', 'id', 'nome']);
});
test('a lista de oficiais não é truncada na primeira página do Auth', async t => {
  const users = Array.from({ length: 201 }, (_, i) => ({ id: 'officer-' + i, app_metadata: { nome: 'Oficial ' + i, cargo: 'Membro' } }));
  const { request, calls } = await setup(t, { users });
  assert.equal((await (await request(undefined, { query: '?oficiais=1' })).json()).oficiais.length, 201);
  assert.equal(calls.filter(call => call.path === '/auth/v1/admin/users').length, 2);
});
test('IDs selecionados definem os nomes; nomes enviados pelo cliente não alteram a identidade', async t => {
  const { request } = await setup(t);
  const r = await request({ ...fields, acao: 'criar', participantes: ['Forjado', 'Intruso'] });
  assert.equal(r.status, 201);
  const { acao } = await r.json();
  assert.deepEqual(acao.participantes, ['Morgan West', 'John Carter']);
  assert.deepEqual(acao.participantes_ids, ['fixture-user', 'john-official']);
});
test('correção preserva participantes históricos com conta removida e nomes antigos sem ID', async t => {
  const original = action('legacy-action', { participantes: ['Nome antigo', 'Oficial sem conta'], participantes_ids: ['removed-account', null] });
  const { request, records } = await setup(t, { records: [original] });
  const r = await request({ ...fields, acao: 'editar', id: original.id, participantes_ids: ['removed-account', 'anterior:1'], participantes: ['Forjado', 'Forjado'] });
  assert.equal(r.status, 200);
  assert.deepEqual(records.get(original.id).participantes, original.participantes);
  assert.deepEqual(records.get(original.id).participantes_ids, original.participantes_ids);
  assert.equal((await request({ ...fields, acao: 'criar', participantes_ids: ['removed-account', 'anterior:1'] })).status, 400);
});
test('clientes antigos só resolvem nomes cadastrados sem ambiguidade', async t => {
  const { request } = await setup(t);
  const old = { ...fields, acao: 'criar' }; delete old.participantes_ids;
  assert.equal((await request(old)).status, 201);
  assert.equal((await request({ ...old, participantes: ['Morgan West', 'Sem cadastro'] })).status, 400);
});
test('contagem identifica a mesma conta após troca de nick e distingue homônimos por ID', () => {
  const records = [action('names-old', { participantes: ['Nome antigo', 'João'], participantes_ids: ['same-account', 'joao-one'] }), action('names-new', { participantes: ['Nome novo', 'João'], participantes_ids: ['same-account', 'joao-two'] }), action('names-legacy', { participantes: ['Nome antigo', 'João'], participantes_ids: null })];
  // A conta renomeada conta uma vez; dois homônimos identificados são distintos.
  // O João legado permanece sem associação por ser ambíguo.
  assert.equal(helpers.stats(records).officers, 4);
});
