/*
 * Código compartilhado pelas páginas (login, painel e contas).
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

  // "bahia" → "bahia@<loginDomain>"; e-mail completo passa direto.
  function loginEmail(input) {
    const value = input.trim().toLowerCase();
    if (value.includes('@') || !config.loginDomain) return value;
    return `${value}@${config.loginDomain}`;
  }

  // Nome exibido: definido pelo Alto Comando em app_metadata (o próprio usuário não consegue alterar).
  const displayName = user => user?.app_metadata?.nome || user?.email || '';

  async function fetchMembership(userId) {
    const { data, error } = await db.from('cavalaria_membros').select('role').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data; // null = conta sem acesso liberado
  }

  function goToLogin(reason) {
    location.replace('index.html' + (reason ? '?motivo=' + encodeURIComponent(reason) : ''));
  }

  // Usado pelas páginas internas: sem sessão ou sem acesso, volta para o login.
  async function requireMember({ adminOnly = false } = {}) {
    if (!db) { goToLogin('config'); return null; }
    const { data } = await db.auth.getSession();
    const session = data?.session;
    if (!session) { goToLogin(); return null; }

    let membership;
    try {
      membership = await fetchMembership(session.user.id);
    } catch {
      goToLogin('erro');
      return null;
    }
    if (!membership) {
      await db.auth.signOut();
      goToLogin('nao-autorizado');
      return null;
    }
    if (adminOnly && membership.role !== 'admin') {
      location.replace('painel.html');
      return null;
    }

    db.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') goToLogin('saiu');
    });
    return { session, membership };
  }

  // Chamada à Netlify Function de contas, autenticada com o token da sessão atual.
  async function api(method, body) {
    const { data } = await db.auth.getSession();
    const response = await fetch('/api/contas', {
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
    loginEmail, displayName, fetchMembership, requireMember, api, signOut,
  };
})();
