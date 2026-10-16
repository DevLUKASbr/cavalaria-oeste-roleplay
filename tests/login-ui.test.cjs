const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

function setup() {
  const password = { type: 'password', value: 'personal-secret' };
  const attributes = {};
  const handlers = {};
  const toggle = {
    hidden: true,
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (event, handler) => { handlers[event] = handler; },
  };
  const elements = {
    password, togglePassword: toggle,
    loginForm: { addEventListener: (event, handler) => { handlers[event] = handler; } },
  };
  vm.runInNewContext(readFileSync(resolve(__dirname, '../site/login-ui.js'), 'utf8'), {
    document: { getElementById: id => elements[id] },
    window: { addEventListener: (event, handler) => { handlers[event] = handler; } },
  });
  return { password, attributes, handlers, toggle };
}

test('controle de visibilidade só aparece quando o script está disponível', () => {
  assert.equal(setup().toggle.hidden, false);
});

test('mostrar e ocultar senha atualiza o tipo e o nome acessível sem alterar o valor', () => {
  const { password, attributes, handlers } = setup();
  handlers.click();
  assert.equal(password.type, 'text');
  assert.equal(password.value, 'personal-secret');
  assert.equal(attributes['aria-pressed'], 'true');
  assert.equal(attributes['aria-label'], 'Ocultar senha');
  handlers.click();
  assert.equal(password.type, 'password');
  assert.equal(password.value, 'personal-secret');
  assert.equal(attributes['aria-pressed'], 'false');
  assert.equal(attributes['aria-label'], 'Mostrar senha');
});

for (const event of ['submit', 'pagehide']) {
  test(`senha volta a ficar oculta no evento ${event}`, () => {
    const { password, attributes, handlers } = setup();
    handlers.click();
    handlers[event]();
    assert.equal(password.type, 'password');
    assert.equal(password.value, 'personal-secret');
    assert.equal(attributes['aria-pressed'], 'false');
  });
}
