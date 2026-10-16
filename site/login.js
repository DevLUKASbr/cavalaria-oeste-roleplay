/* Tela de login: autentica no Supabase e leva cada cargo para a primeira página que ele pode ver. */
(async () => {
  'use strict';
  const { $, setHidden, message, isConfigured, db, loginEmail, loadAccess, firstPageOf } = window.Cavalaria;

  const REASONS = {
    'nao-autorizado': ['Esta conta não está autorizada. Solicite liberação ao Alto Comando.', 'error'],
    'saiu': ['Sessão encerrada.', 'success'],
    'erro': ['Não foi possível verificar seu acesso. Tente entrar novamente.', 'error'],
  };

  if (!isConfigured) {
    message('Posto de comando indisponível: preencha o endereço e a chave pública do Supabase em config.js.', 'error');
    return;
  }

  // Página inicial da conta logada, ou null se ela não tem acesso a nada.
  async function homePage() {
    try {
      const access = await loadAccess();
      // Só muda o destino visual; a conta ainda precisa ter uma página autorizada.
      return access && firstPageOf(access) ? { href: 'dashboard.html' } : null;
    } catch {
      return null;
    }
  }

  // Já logado e com acesso? Vai direto.
  const { data } = await db.auth.getSession();
  if (data?.session) {
    const home = await homePage();
    if (home) {
      location.replace(home.href);
      return;
    }
    await db.auth.signOut();
  }

  const reason = REASONS[new URLSearchParams(location.search).get('motivo')];
  if (reason) message(...reason);
  setHidden('loginForm', false);
  $('loginUser').focus();

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    message('Conferindo credenciais…');

    const { error } = await db.auth.signInWithPassword({
      email: loginEmail($('loginUser').value),
      password: $('password').value,
    });
    $('password').value = '';
    if (error) {
      message('Usuário ou senha incorretos, ou acesso indisponível.', 'error');
      button.disabled = false;
      return;
    }

    const home = await homePage();
    if (!home) {
      await db.auth.signOut();
      message(...REASONS['nao-autorizado']);
      button.disabled = false;
      return;
    }
    location.replace(home.href);
  });
})();
