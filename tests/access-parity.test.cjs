const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

test('permissões efetivas do frontend continuam idênticas à matriz oficial das Functions', async () => {
  const { PERMISSOES } = await import('../netlify/lib/acesso.mjs');
  for (const [cargo, permissions] of Object.entries(PERMISSOES)) {
    const user = { id: 'fixture-user', app_metadata: { cargo } };
    const db = {
      auth: { getUser: async () => ({ data: { user } }) },
      from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; },
    };
    const context = vm.createContext({
      window: { CAVALARIA_CONFIG: { supabaseUrl: 'https://example.test', supabaseAnonKey: 'fixture-key' }, supabase: { createClient: () => db } },
    });
    vm.runInContext(readFileSync(resolve(__dirname, '../site/comum.js'), 'utf8'), context);
    const access = await context.window.Cavalaria.loadAccess();
    assert.deepEqual(Array.from(access.permissions), permissions, cargo);
    assert.equal(access.permissions.includes('inicio'), false, 'Início não concede permissão de backend');
  }
});
