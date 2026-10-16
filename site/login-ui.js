/* Interações visuais do login. Não acessa contas, sessões ou o Supabase. */
(() => {
  'use strict';
  const password = document.getElementById('password');
  const toggle = document.getElementById('togglePassword');
  if (!password || !toggle) return;

  function setVisible(visible) {
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  }

  toggle.hidden = false;
  toggle.addEventListener('click', () => setVisible(password.type === 'password'));
  document.getElementById('loginForm').addEventListener('submit', () => setVisible(false));
  window.addEventListener('pagehide', () => setVisible(false));
})();
