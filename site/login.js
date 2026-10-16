/* Tela de login: autentica no Supabase e só deixa passar contas liberadas pelo Alto Comando. */
(async () => {
  'use strict';
  const { $, setHidden, message, isConfigured, db, loginEmail, fetchMembership } = window.Cavalaria;

  const REASONS = {
    'nao-autorizado': ['Esta conta não está autorizada. Solicite liberação ao Alto Comando.', 'error'],
    'saiu': ['Sessão encerrada.', 'success'],
    'erro': ['Não foi possível verificar seu acesso. Tente entrar novamente.', 'error'],
  };

  if (!isConfigured) {
    message('Posto de comando indisponível: preencha o endereço e a chave pública do Supabase em config.js.', 'error');
    return;
  }

  // Já logado e liberado? Vai direto para o painel.
  const { data } = await db.auth.getSession();
  if (data?.session) {
    try {
      if (await fetchMembership(data.session.user.id)) {
        location.replace('painel.html');
        return;
      }
    } catch { /* segue para o formulário */ }
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

    const { data: auth, error } = await db.auth.signInWithPassword({
      email: loginEmail($('loginUser').value),
      password: $('password').value,
    });
    $('password').value = '';
    if (error) {
      message('Usuário ou senha incorretos, ou acesso indisponível.', 'error');
      button.disabled = false;
      return;
    }

    let membership = null;
    try {
      membership = await fetchMembership(auth.user.id);
    } catch { /* tratado abaixo como sem acesso */ }
    if (!membership) {
      await db.auth.signOut();
      message(...REASONS['nao-autorizado']);
      button.disabled = false;
      return;
    }
    location.replace('painel.html');
  });
})();
