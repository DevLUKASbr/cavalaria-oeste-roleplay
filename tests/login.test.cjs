const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const source = name => readFileSync(resolve(__dirname, '../site', name), 'utf8');

// Executa os scripts reais com DOM e Supabase simulados, sem contas ou rede.
// Todas as credenciais abaixo são fixtures fictícias, sem acesso a serviços reais.
async function openLogin(options = {}) {
  const elements = new Map();
  const calls = { credentials: [], redirects: [], signOut: 0, membership: [] };
  const user = {
    ...(options.session?.user || { id: 'official-123' }),
    app_metadata: options.cargo ? { cargo: options.cargo } : {},
    user_metadata: options.userMetadata || {},
  };
  function element(id) {
    if (!elements.has(id)) {
      const node = {
        className: ['loginForm', 'message'].includes(id) ? 'hide' : '',
        value: '', textContent: '', disabled: false,
        focus() { calls.focus = id; },
        reset() {},
        addEventListener(event, handler) { this[event] = handler; },
        querySelector(selector) {
          assert.equal(selector, 'button[type="submit"]');
          return element('submit');
        },
      };
      node.classList = {
        toggle(name, hidden) {
          const classes = new Set(node.className.split(/\s+/).filter(Boolean));
          hidden ? classes.add(name) : classes.delete(name);
          node.className = [...classes].join(' ');
        },
        add(name) { this.toggle(name, true); },
      };
      elements.set(id, node);
    }
    return elements.get(id);
  }
  const db = {
    auth: {
      async getSession() {
        if (options.waitForSession) await options.waitForSession;
        return { data: { session: options.session || null } };
      },
      async getUser() {
        return options.invalidUser
          ? { data: { user: null }, error: new Error('Invalid session') }
          : { data: { user }, error: null };
      },
      async signInWithPassword(credentials) {
        calls.credentials.push(credentials);
        if (options.waitForSignIn) await options.waitForSignIn;
        return options.authError
          ? { error: { message: 'Invalid credentials' } }
          : { data: { user: { id: 'official-123' } }, error: null };
      },
      async signOut() { calls.signOut++; },
      onAuthStateChange(handler) { calls.authStateChange = handler; },
    },
    from(table) {
      assert.equal(table, 'cavalaria_membros');
      return {
        select(column) {
          assert.equal(column, 'role');
          return {
            eq(column, userId) {
              assert.equal(column, 'user_id');
              calls.membership.push(userId);
              return {
                async maybeSingle() {
                  return {
                    data: options.noMembership ? null : { role: options.role || 'admin' },
                    error: options.membershipError ? new Error('Unavailable') : null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const context = vm.createContext({
    window: {
      CAVALARIA_CONFIG: options.unconfigured ? {} : {
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'test-public-key', loginDomain: 'cavalaria.oeste',
      },
      supabase: { createClient: () => db },
    },
    document: { getElementById: element },
    location: { search: options.search || '', replace: url => calls.redirects.push(url) },
    URLSearchParams,
  });
  vm.runInContext(source('comum.js'), context);
  const ready = vm.runInContext(source('login.js'), context);
  const page = {
    calls, element, ready, cavalry: context.window.Cavalaria,
    async submit(user = ' Oficial ', password = 'individual-secret') {
      element('loginUser').value = user;
      element('password').value = password;
      await element('loginForm').submit({
        preventDefault() { calls.prevented = true; }, target: element('loginForm'),
      });
    },
  };
  if (!options.waitForSession) await ready;
  return page;
}

test('sem configuração, o formulário permanece oculto e informa indisponibilidade', async () => {
  const page = await openLogin({ unconfigured: true });
  assert.match(page.element('loginForm').className, /hide/);
  assert.match(page.element('message').textContent, /Posto de comando indisponível/);
  assert.equal(page.calls.credentials.length, 0);
});

test('só exibe o formulário depois de verificar a sessão', async () => {
  let release;
  const waitForSession = new Promise(resolve => { release = resolve; });
  const page = await openLogin({ waitForSession });
  assert.match(page.element('loginForm').className, /hide/);
  release();
  await page.ready;
  assert.doesNotMatch(page.element('loginForm').className, /hide/);
  assert.equal(page.calls.focus, 'loginUser');
});

test('sessão autorizada redireciona diretamente ao dashboard', async () => {
  const page = await openLogin({ session: { user: { id: 'existing-official' } } });
  assert.deepEqual(page.calls.redirects, ['dashboard.html']);
  assert.deepEqual(page.calls.membership, ['existing-official']);
  assert.match(page.element('loginForm').className, /hide/);
});

test('sessão sem autorização é encerrada antes de permitir novo login', async () => {
  const page = await openLogin({ session: { user: { id: 'removed-official' } }, noMembership: true });
  assert.equal(page.calls.signOut, 1);
  assert.doesNotMatch(page.element('loginForm').className, /hide/);
  assert.deepEqual(page.calls.redirects, []);
});

test('login individual normaliza o usuário e verifica a associação antes do redirecionamento', async () => {
  const page = await openLogin();
  await page.submit();
  assert.equal(page.calls.credentials[0].email, 'oficial@cavalaria.oeste');
  assert.equal(page.calls.credentials[0].password, 'individual-secret');
  assert.deepEqual(page.calls.membership, ['official-123']);
  assert.deepEqual(page.calls.redirects, ['dashboard.html']);
  assert.equal(page.element('password').value, '');
  assert.equal(page.calls.prevented, true);
});

test('e-mail completo continua aceito sem acrescentar o domínio de login', async () => {
  const page = await openLogin();
  await page.submit(' Oficial@Example.com ');
  assert.equal(page.calls.credentials[0].email, 'oficial@example.com');
});

test('senha incorreta exibe erro, limpa a senha e permite nova tentativa', async () => {
  const page = await openLogin({ authError: true });
  await page.submit();
  assert.match(page.element('message').textContent, /Usuário ou senha incorretos/);
  assert.match(page.element('message').className, /error/);
  assert.equal(page.element('password').value, '');
  assert.equal(page.element('submit').disabled, false);
  assert.deepEqual(page.calls.redirects, []);
  assert.deepEqual(page.calls.membership, []);
});

for (const failure of ['noMembership', 'membershipError']) {
  test(`login sem acesso (${failure}) encerra a sessão e não abre o painel`, async () => {
    const page = await openLogin({ [failure]: true });
    await page.submit();
    assert.equal(page.calls.signOut, 1);
    assert.match(page.element('message').textContent, /Esta conta não está autorizada/);
    assert.equal(page.element('submit').disabled, false);
    assert.deepEqual(page.calls.redirects, []);
  });
}

test('botão permanece desabilitado enquanto as credenciais são verificadas', async () => {
  let release;
  const waitForSignIn = new Promise(resolve => { release = resolve; });
  const page = await openLogin({ waitForSignIn });
  const submitting = page.submit();
  assert.equal(page.element('submit').disabled, true);
  assert.match(page.element('message').textContent, /Conferindo credenciais/);
  release();
  await submitting;
});

for (const [reason, message] of [
  ['saiu', 'Sessão encerrada.'],
  ['nao-autorizado', 'Esta conta não está autorizada.'],
  ['erro', 'Não foi possível verificar seu acesso.'],
]) {
  test(`mensagem de retorno preservada: ${reason}`, async () => {
    const page = await openLogin({ search: `?motivo=${reason}` });
    assert.ok(page.element('message').textContent.startsWith(message));
  });
}

test('páginas internas continuam protegidas quando não existe sessão', async () => {
  const page = await openLogin();
  assert.equal(await page.cavalry.requirePage('registro'), null);
  assert.deepEqual(page.calls.redirects, ['index.html']);
});

test('restrição administrativa e evento de encerramento de sessão continuam ativos', async () => {
  const page = await openLogin({ session: { user: { id: 'official' } }, role: 'xerife' });
  page.calls.redirects.length = 0;
  assert.equal(await page.cavalry.requirePage('contas'), null);
  assert.deepEqual(page.calls.redirects, ['painel.html']);
  page.calls.redirects.length = 0;
  assert.ok(await page.cavalry.requirePage('registro'));
  page.calls.authStateChange('SIGNED_OUT');
  assert.deepEqual(page.calls.redirects, ['index.html?motivo=saiu']);
});

test('Membro entra no dashboard mesmo sem associação ao registro', async () => {
  const page = await openLogin({ cargo: 'Membro', noMembership: true });
  await page.submit();
  assert.deepEqual(page.calls.redirects, ['dashboard.html']);
  assert.equal(page.calls.signOut, 0);
});

test('sessão existente de Membro abre o dashboard e mantém o formulário oculto', async () => {
  const page = await openLogin({ session: { user: { id: 'member-123' } }, cargo: 'Membro', noMembership: true });
  assert.deepEqual(page.calls.redirects, ['dashboard.html']);
  assert.match(page.element('loginForm').className, /hide/);
});

test('Membro sem permissão para Contas volta para Treinamentos', async () => {
  const page = await openLogin({ session: { user: { id: 'member-123' } }, cargo: 'Membro', noMembership: true });
  page.calls.redirects.length = 0;
  assert.equal(await page.cavalry.requirePage('contas'), null);
  assert.deepEqual(page.calls.redirects, ['treinamentos.html']);
});

for (const cargo of ['Xerife', 'Sub-Xerife', 'Adm']) {
  test(`${cargo} preserva o acesso ao gerenciamento de contas`, async () => {
    const page = await openLogin({ session: { user: { id: 'command-123' } }, cargo });
    page.calls.redirects.length = 0;
    const access = await page.cavalry.requirePage('contas');
    assert.equal(access.cargo, cargo);
    assert.equal(page.cavalry.can(access, 'contas'), true);
    assert.deepEqual(page.calls.redirects, []);
  });
}

test('primeiro acesso continua exigindo a definição da senha pessoal na página interna', async () => {
  const page = await openLogin({ session: { user: { id: 'new-123' } }, cargo: 'Membro', userMetadata: { trocar_senha: true } });
  await page.cavalry.requirePage('treinamentos');
  assert.equal(page.element('passwordTitle').textContent, 'Defina sua senha pessoal');
  assert.match(page.element('passwordCancel').className, /hide/);
  assert.doesNotMatch(page.element('passwordForm').className, /hide/);
  assert.equal(page.calls.focus, 'newPassword');
});

test('falha na verificação do usuário não concede acesso após o login', async () => {
  const page = await openLogin({ invalidUser: true });
  await page.submit();
  assert.equal(page.calls.signOut, 1);
  assert.deepEqual(page.calls.redirects, []);
});

test('HTML mantém os identificadores, a validação nativa e a ordem dos scripts', () => {
  const html = source('index.html');
  for (const id of ['message', 'loginForm', 'loginUser', 'password']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.match(html, /<form\b[^>]*id="loginForm"[^>]*class="[^"]*hide/);
  assert.match(html, /<input\b[^>]*id="loginUser"[^>]*autocomplete="username"[^>]*required/);
  assert.match(html, /<input\b[^>]*id="password"[^>]*type="password"[^>]*autocomplete="current-password"[^>]*required[^>]*minlength="6"/);
  assert.match(html, /<button\b[^>]*type="submit"/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
    'config.js', 'comum.js', 'login.js', 'login-ui.js',
  ]);
});
