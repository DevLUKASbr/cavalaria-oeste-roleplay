/* Layout compartilhado. As rotas HTML e a autorização de comum.js continuam ativas. */
(() => {
  'use strict';
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    registro: '<path d="M5 3h14v18H5Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    treinamentos: '<path d="m2 8 10-5 10 5-10 5Z"/><path d="M6 10v7q6 5 12 0v-7m4-2v8"/>',
    recrutamento: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m4-14v6m-3-3h6"/>',
    investigacoes: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6"/>',
    acoes: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    premios: '<circle cx="12" cy="9" r="6"/><path d="m8 14-2 8 6-3 6 3-2-8"/>',
    avisos: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>',
    contas: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 12-5m4 1 4 2v3l-4 3-4-3v-3Z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    close: '<path d="m5 5 14 14M5 19 19 5"/>',
    chevron: '<path d="m14 5-7 7 7 7m6-14-7 7 7 7"/>',
    logout: '<path d="M10 3H4v18h6m4-14 5 5-5 5M8 12h13"/>',
    key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m-1 5 3-3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    refresh: '<path d="M20 8a9 9 0 1 0 1 8M20 3v6h-6"/>',
    chart: '<path d="M3 3v18h18M7 17v-6m5 6V6m5 11V9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.registro}</svg>`;
  const modules = [
    { id: 'inicio', href: 'dashboard.html', title: 'Início', subtitle: 'Visão geral da Cavalaria', icon: 'home' },
    { id: 'registro', href: 'painel.html', title: 'Registros', subtitle: 'Efetivo, jurisdições e movimentações', icon: 'registro' },
    { id: 'treinamentos', href: 'treinamentos.html', title: 'Treinamentos', subtitle: 'Instruções e materiais da Cavalaria', icon: 'treinamentos' },
    { id: 'recrutamento', href: 'recrutamento.html', title: 'Recrutamento', subtitle: 'Roteiro e fichas de candidatos', icon: 'recrutamento' },
    { id: 'investigacoes', href: 'investigacoes.html', title: 'Investigações', subtitle: 'Alvos, grupos e mapa de RP', icon: 'investigacoes' },
    { id: 'acoes', href: 'acoes.html', title: 'Ações', subtitle: 'Livro de ações, confrontos e resultados', icon: 'acoes' },
    { id: 'avisos', href: 'avisos.html', title: 'Avisos', subtitle: 'Comunicados oficiais para a Cavalaria', icon: 'avisos' },
    { id: 'contas', href: 'contas.html', title: 'Contas e permissões', subtitle: 'Gerenciamento dos acessos existentes', icon: 'contas' },
  ];

  function mount(access, pageId) {
    const { $, esc, can, displayName } = window.Cavalaria;
    const current = modules.find(module => module.id === pageId);
    if (!current) return;
    const passwordForm = $('passwordForm').outerHTML;
    const allowed = modules.filter(module => module.id === 'inicio' || can(access, module.id));
    $('shell').innerHTML = `
      <a class="skip-link" href="#mainContent">Ir para o conteúdo</a>
      <div id="sidebarBackdrop" class="sidebar-backdrop" hidden></div>
      <aside id="adminSidebar" class="admin-sidebar" aria-label="Navegação da Cavalaria" tabindex="-1">
        <button id="drawerClose" class="icon-button drawer-close" type="button" aria-label="Fechar menu">${icon('close')}</button>
        <a class="sidebar-brand" href="dashboard.html"><img src="logo-oeste.png" alt="Oeste Roleplay" width="44" height="44"><span><strong>Cavalaria</strong><small>OESTE ROLEPLAY</small></span></a>
        <div class="sidebar-section-label">PAINEL DE GESTÃO</div>
        <nav class="sidebar-nav" aria-label="Módulos">${allowed.map(module => `
          <a href="${module.href}" ${pageId === module.id ? 'aria-current="page"' : ''} title="${esc(module.title)}${module.development ? ' — Em desenvolvimento' : ''}">
            ${icon(module.icon)}<span class="nav-label">${esc(module.title)}${module.development ? '<small>Em desenvolvimento</small>' : ''}</span>
          </a>`).join('')}</nav>
        <div class="sidebar-future"><div class="sidebar-section-label">PRÓXIMAS ETAPAS</div>
          <div title="Premiações — Em desenvolvimento">${icon('premios')}<span>Premiações<small>Em desenvolvimento</small></span></div>
        </div>
        <div class="sidebar-bottom"><div class="sidebar-user"><strong>${esc(displayName(access.user))}</strong><small>${esc(access.cargo)}</small></div><span class="session-indicator">Sessão individual</span>
          <button id="sidebarCollapse" class="sidebar-collapse" type="button" aria-label="Recolher menu" aria-controls="adminSidebar" aria-expanded="true">${icon('chevron')}<span>Recolher menu</span></button>
        </div>
      </aside>
      <header class="admin-topbar">
        <button id="menuToggle" class="icon-button mobile-menu" type="button" aria-label="Abrir menu" aria-controls="adminSidebar" aria-expanded="false">${icon('menu')}</button>
        <div class="topbar-heading"><div class="breadcrumb">Cavalaria <span>/</span> ${esc(current.title)}</div><h1>${esc(current.title)}</h1><p>${esc(current.subtitle)}</p></div>
        <div class="topbar-actions">
          <div class="current-user"><strong>${esc(displayName(access.user))}</strong><span>${esc(access.cargo)}</span></div>
          <button id="notificationsToggle" class="icon-button" type="button" aria-label="Avisos oficiais" aria-controls="notificationsPanel" aria-expanded="false">${icon('avisos')}</button>
          <button id="passwordToggle" class="icon-button" type="button" aria-label="Trocar minha senha" title="Trocar minha senha">${icon('key')}</button>
          <button id="logout" class="icon-button logout-button" type="button" aria-label="Sair da sessão" title="Sair da sessão">${icon('logout')}</button>
        </div>
        <div id="notificationsPanel" class="notifications-panel" hidden><strong>Avisos do Alto Comando</strong><div id="notificationNotices" role="status" aria-live="polite"></div><a href="avisos.html">Ver todos os avisos</a></div>
      </header>
      <div class="session-status"><span class="status-dot" aria-hidden="true"></span><span id="connection">Sessão verificada</span></div>
      <div class="shell-password">${passwordForm}</div>`;

    const sidebar = $('adminSidebar');
    const menu = $('menuToggle');
    const backdrop = $('sidebarBackdrop');
    const media = matchMedia('(max-width: 980px)');
    const collapse = $('sidebarCollapse');
    let drawerOpen = false;
    let collapsed = false;
    try { collapsed = localStorage.getItem('cavalaria.sidebar.collapsed') === 'true'; } catch { /* preferência opcional */ }

    function setCollapsed(value) {
      collapsed = value;
      document.body.classList.toggle('sidebar-collapsed', value);
      collapse.setAttribute('aria-expanded', String(!value));
      collapse.setAttribute('aria-label', value ? 'Expandir menu' : 'Recolher menu');
      collapse.title = value ? 'Expandir menu' : 'Recolher menu';
    }
    function setDrawer(open, restoreFocus = true) {
      drawerOpen = media.matches && open;
      document.body.classList.toggle('drawer-open', drawerOpen);
      menu.setAttribute('aria-expanded', String(drawerOpen));
      menu.setAttribute('aria-label', drawerOpen ? 'Fechar menu' : 'Abrir menu');
      backdrop.hidden = !drawerOpen;
      sidebar.inert = media.matches && !drawerOpen;
      $('mainContent').inert = drawerOpen;
      document.querySelector('.admin-topbar').inert = drawerOpen;
      if (drawerOpen) {
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
        sidebar.querySelector('a').focus();
      } else {
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
        if (media.matches && restoreFocus) menu.focus();
      }
    }
    setCollapsed(collapsed);
    setDrawer(false, false);
    collapse.addEventListener('click', () => {
      setCollapsed(!collapsed);
      try { localStorage.setItem('cavalaria.sidebar.collapsed', String(collapsed)); } catch { /* preferência opcional */ }
    });
    menu.addEventListener('click', () => setDrawer(!drawerOpen));
    $('drawerClose').addEventListener('click', () => setDrawer(false));
    backdrop.addEventListener('click', () => setDrawer(false));
    media.addEventListener('change', () => setDrawer(false, false));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (drawerOpen) setDrawer(false);
        if (!$('notificationsPanel').hidden) {
          $('notificationsPanel').hidden = true;
          $('notificationsToggle').setAttribute('aria-expanded', 'false');
          $('notificationsToggle').focus();
        }
      }
      if (drawerOpen && event.key === 'Tab') {
        const links = [...sidebar.querySelectorAll('a[href], button:not([disabled])')].filter(node => node.getClientRects().length);
        const first = links[0], last = links[links.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    $('notificationsToggle').addEventListener('click', () => {
      const panel = $('notificationsPanel');
      panel.hidden = !panel.hidden;
      $('notificationsToggle').setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) loadAnnouncements($('notificationNotices'));
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('#notificationsPanel, #notificationsToggle')) {
        $('notificationsPanel').hidden = true;
        $('notificationsToggle').setAttribute('aria-expanded', 'false');
      }
    });
    document.title = `${current.title} · Cavalaria | Oeste Roleplay`;
  }

  async function loadAnnouncements(target) {
    const { api, esc, formatDateTime } = window.Cavalaria;
    target.textContent = 'Carregando avisos…';
    try {
      const { avisos } = await api('avisos');
      target.innerHTML = avisos.length ? `<ul class="notice-preview">${avisos.slice(0, 3).map(item => `<li><a href="avisos.html"><strong>${esc(item.titulo)}</strong></a><span>${esc(({ urgente: 'Urgente', importante: 'Importante', normal: 'Normal' })[item.prioridade] || 'Normal')} · ${esc(formatDateTime(item.criado_em))}</span></li>`).join('')}</ul>` : '<p>Nenhum aviso publicado pelo Comando.</p>';
    } catch {
      target.textContent = 'Não foi possível consultar os avisos. Acesse a aba Avisos para tentar novamente.';
    }
  }

  window.CavalariaLayout = { mount, icon, modules, loadAnnouncements };
})();
