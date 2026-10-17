/*
 * Código compartilhado pelas páginas: configuração, sessão, permissões por cargo,
 * menu de navegação, barra de sessão e troca de senha.
 * Expõe window.Cavalaria. Depende de window.supabase (CDN) e window.CAVALARIA_CONFIG (config.js).
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

  const formatDateTime = iso => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

  function setHidden(id, hidden) {
    $(id).classList.toggle('hide', hidden);
  }

  function message(text, type = '') {
    const box = $('message');
    box.textContent = text;
    box.className = 'system-msg ' + type;
    if (!text) box.classList.add('hide');
  }

  const config = window.CAVALARIA_CONFIG || {};
  const isConfigured = Boolean(config.supabaseUrl?.startsWith('https://')
    && config.supabaseAnonKey
    && !config.supabaseAnonKey.startsWith('COLE_')
    && window.supabase);

  const db = isConfigured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

  // ---------------------------------------------------------------------------
  // Cargos e permissões
  // MANTER IGUAL ao mapa PERMISSOES de netlify/lib/acesso.mjs (é lá que a regra vale de verdade).
  // ---------------------------------------------------------------------------

  const PAGES = [
    { id: 'registro', href: 'painel.html', title: 'Registro' },
    { id: 'treinamentos', href: 'treinamentos.html', title: 'Treinamentos' },
    { id: 'recrutamento', href: 'recrutamento.html', title: 'Recrutamento' },
    { id: 'investigacoes', href: 'investigacoes.html', title: 'Investigações' },
    { id: 'acoes', href: 'acoes.html', title: 'Ações' },
    { id: 'contas', href: 'contas.html', title: 'Contas' },
    { id: 'avisos', href: 'avisos.html', title: 'Avisos' },
  ];

  const FULL_ACCESS = [...PAGES.map(p => p.id), 'treinamentos.editar', 'recrutamento.editar', 'investigacoes.editar', 'avisos.editar'];
  const PERMISSIONS = {
    'Xerife': FULL_ACCESS,
    'Sub-Xerife': FULL_ACCESS,
    'Adm': FULL_ACCESS,
    'Membro': ['treinamentos', 'avisos'],
    'Acesso limitado': ['registro', 'avisos'], // contas antigas: leitura dos comunicados
  };
  const CARGOS = ['Xerife', 'Sub-Xerife', 'Adm', 'Membro'];

  // Cargo vem de app_metadata (só a chave secreta altera). Contas antigas sem cargo usam o nível do banco.
  function cargoOf(user, membership) {
    if (user?.app_metadata?.cargo) return user.app_metadata.cargo;
    if (membership?.role === 'admin') return 'Adm';
    if (membership?.role) return 'Acesso limitado';
    return null;
  }
  const permissionsOf = cargo => PERMISSIONS[cargo] || [];
  const can = (access, permission) => access.permissions.includes(permission);

  const displayName = user => user?.app_metadata?.nome || user?.email || '';

  function loginEmail(input) {
    const value = input.trim().toLowerCase();
    if (value.includes('@') || !config.loginDomain) return value;
    return `${value}@${config.loginDomain}`;
  }

  async function fetchMembership(userId) {
    const { data, error } = await db.from('cavalaria_membros').select('role').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data; // null = sem nível de acesso ao registro
  }

  // Monta o acesso da conta logada com dados atualizados do servidor (cargo pode ter mudado).
  async function loadAccess() {
    const { data: userData, error } = await db.auth.getUser();
    if (error || !userData?.user) return null;
    const user = userData.user;
    const membership = await fetchMembership(user.id);
    const cargo = cargoOf(user, membership);
    return { user, membership, cargo, permissions: permissionsOf(cargo) };
  }

  const firstPageOf = access => PAGES.find(p => access.permissions.includes(p.id));

  function goToLogin(reason) {
    location.replace('index.html' + (reason ? '?motivo=' + encodeURIComponent(reason) : ''));
  }

  // ---------------------------------------------------------------------------
  // Barra de sessão, menu e troca de senha (montados dentro de <div id="shell">)
  // ---------------------------------------------------------------------------

  function renderShell(access, pageId) {
    const links = PAGES.filter(p => can(access, p.id))
      .map(p => `<a href="${p.href}" class="${p.id === pageId ? 'active' : ''}">${esc(p.title)}</a>`)
      .join('');
    $('shell').innerHTML = `
      <div class="sessionbar no-print">
        <div><strong>${esc(displayName(access.user))}</strong> <span id="connection"></span> <span class="pill">${esc(access.cargo)}</span></div>
        <div class="session-actions">
          <button class="btn secondary" id="passwordToggle">Trocar senha</button>
          <button class="btn secondary" id="logout">Sair da sessão</button>
        </div>
      </div>
      <nav class="mainnav no-print">${links}</nav>
      <form id="passwordForm" class="password-panel hide no-print">
        <strong id="passwordTitle">Trocar minha senha</strong>
        <label class="field"><span>Nova senha</span><input id="newPassword" type="password" autocomplete="new-password" minlength="8" required></label>
        <label class="field"><span>Repita a nova senha</span><input id="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>
        <div class="password-actions">
          <button class="btn" type="submit">Salvar nova senha</button>
          <button class="btn secondary" type="button" id="passwordCancel">Cancelar</button>
        </div>
      </form>`;

    // O shell modular só reorganiza a interface; a verificação de acesso é a mesma.
    window.CavalariaLayout?.mount(access, pageId);

    const openPasswordForm = (firstAccess = false) => {
      $('passwordTitle').textContent = firstAccess ? 'Defina sua senha pessoal' : 'Trocar minha senha';
      setHidden('passwordCancel', firstAccess);
      setHidden('passwordForm', false);
      $('newPassword').focus();
    };
    const closePasswordForm = () => {
      $('passwordForm').reset();
      setHidden('passwordForm', true);
    };

    $('logout').onclick = signOut;
    $('passwordToggle').onclick = () => openPasswordForm();
    $('passwordCancel').onclick = closePasswordForm;
    $('passwordForm').addEventListener('submit', async e => {
      e.preventDefault();
      const password = $('newPassword').value;
      if (password !== $('confirmPassword').value) {
        message('As duas senhas digitadas não conferem.', 'error');
        return;
      }
      const { error } = await db.auth.updateUser({ password, data: { trocar_senha: false } });
      if (error) {
        message('Não foi possível trocar a senha: ' + error.message, 'error');
        return;
      }
      closePasswordForm();
      message('Senha alterada com sucesso.', 'success');
    });

    // Contas criadas na página Contas precisam definir uma senha pessoal no primeiro acesso.
    if (access.user.user_metadata?.trocar_senha) {
      openPasswordForm(true);
      message('Primeiro acesso: defina uma senha pessoal antes de continuar.');
    }
  }

  // Usado por todas as páginas internas: sem sessão volta ao login; sem permissão vai para a
  // primeira página permitida. Devolve o acesso e já monta a barra de sessão e o menu.
  async function requirePage(pageId) {
    if (!db) { goToLogin('config'); return null; }
    const { data } = await db.auth.getSession();
    if (!data?.session) { goToLogin(); return null; }

    let access;
    try {
      access = await loadAccess();
    } catch {
      goToLogin('erro');
      return null;
    }
    if (!access) { goToLogin(); return null; }

    // Início é uma visão dos módulos já autorizados, sem conceder novas permissões.
    const canOpenHome = pageId === 'inicio' && PAGES.some(page => can(access, page.id));
    if (!can(access, pageId) && !canOpenHome) {
      const fallback = firstPageOf(access);
      if (fallback) {
        location.replace(fallback.href);
      } else {
        await db.auth.signOut();
        goToLogin('nao-autorizado');
      }
      return null;
    }

    db.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') goToLogin('saiu');
    });
    access.session = data.session;
    renderShell(access, pageId);
    return access;
  }

  // Chamada às Netlify Functions (/api/...), autenticada com o token da sessão atual.
  async function api(path, method = 'GET', body) {
    const { data } = await db.auth.getSession();
    const response = await fetch('/api/' + path, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + (data?.session?.access_token || ''),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.erro || `Falha na comunicação (${response.status})`);
    return payload;
  }

  async function signOut() {
    await db.auth.signOut();
    goToLogin('saiu');
  }

  window.Cavalaria = {
    $, esc, formatDateTime, setHidden, message,
    config, isConfigured, db,
    PAGES, CARGOS, can, loginEmail, displayName, loadAccess, firstPageOf,
    requirePage, api, signOut,
  };
})();
