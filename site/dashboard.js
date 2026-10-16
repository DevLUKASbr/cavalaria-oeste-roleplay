/* Somente leitura de dados existentes; todas as consultas seguem as permissões e RLS atuais. */
(async () => {
  'use strict';
  const { $, esc, can, db, requirePage, displayName, formatDateTime } = window.Cavalaria;
  const access = await requirePage('inicio');
  if (!access) return;
  const { icon } = window.CavalariaLayout;
  let loading = false;
  $('welcomeTitle').textContent = `Bem-vindo, ${displayName(access.user)}`;
  const jurisdiction = access.user.app_metadata?.jurisdicao;
  $('welcomeDescription').textContent = `${access.cargo}${typeof jurisdiction === 'string' && jurisdiction ? ' · ' + jurisdiction : ''}. Seu posto de comando, em um só lugar.`;
  $('welcomeDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  const shortcuts = [
    ['registro', 'painel.html', 'Consultar efetivo', 'Situação, destinos e registros oficiais', 'registro'],
    ['treinamentos', 'treinamentos.html', 'Ver treinamentos', 'Materiais e instruções disponíveis', 'treinamentos'],
    ['contas', 'contas.html', 'Gerenciar contas', 'Contas individuais e acessos existentes', 'contas'],
  ];
  $('quickActions').innerHTML = shortcuts.filter(([permission]) => can(access, permission)).map(([, href, title, description, glyph]) => `<a href="${href}">${icon(glyph)}<span><strong>${title}</strong><small>${description}</small></span>${icon('arrow')}</a>`).join('');

  function empty(text) { return `<div class="empty-state compact"><p>${esc(text)}</p></div>`; }
  function renderMetrics(officers) {
    const count = status => officers.filter(officer => officer.executed_at ? status === 'Exonerado' : officer.status === status).length;
    const metrics = [
      ['Total de oficiais', officers.length, 'Todos os registros preservados', 'registro'],
      ['Ativos', count('Ativo'), 'Situação atual no registro', 'acoes'],
      ['Pendentes de avaliação', count('Pendente'), 'Revisão ainda não concluída', 'clock'],
      ['Inativos', count('Inativo'), 'Situação registrada', 'investigacoes'],
      ['Exonerações propostas', count('Exonerar'), 'Aguardam execução no RP', 'clock'],
      ['Exonerações concluídas', count('Exonerado'), 'Execução confirmada e preservada', 'registro'],
    ];
    $('dashboardMetrics').innerHTML = metrics.map(([title, value, description, glyph]) => `<article class="metric-card"><div>${icon(glyph)}<span>${title}</span></div><strong>${value}</strong><small>${description}</small></article>`).join('');
    $('dashboardMetrics').hidden = false;
    const counts = new Map();
    for (const officer of officers) {
      const origin = officer.origem || 'Sem jurisdição';
      counts.set(origin, (counts.get(origin) || 0) + 1);
    }
    const maximum = Math.max(1, ...counts.values());
    $('jurisdictionChart').innerHTML = officers.length ? `<ul class="jurisdiction-chart" aria-label="Quantidade de oficiais por jurisdição">${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => `<li><div><span>${esc(name)}</span><strong>${value} ${value === 1 ? 'oficial' : 'oficiais'}</strong></div><progress max="${maximum}" value="${value}" aria-label="${esc(name)}: ${value} oficiais"></progress></li>`).join('')}</ul><p class="chart-note">Distribuição de todos os registros, incluindo exonerações concluídas.</p>` : empty('Nenhum oficial cadastrado para compor a distribuição.');
  }
  function renderActivity(entries) {
    $('recentActivity').innerHTML = entries.length ? `<ol class="activity-list">${entries.map(entry => `<li>${icon('registro')}<div><strong>${esc(entry.oficial_nome)}</strong><span>Registro atualizado${entry.autor_email ? ' · ' + esc(entry.autor_email) : ''}</span><time datetime="${esc(entry.alterado_em)}">${esc(formatDateTime(entry.alterado_em))}</time></div></li>`).join('')}</ol>` : empty('Nenhuma alteração de registro disponível no histórico.');
  }
  async function refresh() {
    if (loading) return;
    if (!can(access, 'registro')) {
      $('dashboardState').textContent = 'Os indicadores do efetivo são restritos aos usuários com acesso a Registros. Consulte seus módulos nos atalhos abaixo.';
      $('jurisdictionChart').innerHTML = empty('Seu acesso atual não inclui os dados do Registro Geral.');
      $('recentActivity').innerHTML = empty('A auditoria de Registros não está disponível para seu acesso.');
      $('refreshDashboard').hidden = true;
      return;
    }
    loading = true;
    $('refreshDashboard').disabled = true;
    $('dashboardMetrics').hidden = true;
    $('dashboardState').textContent = 'Carregando indicadores do Registro Geral…';
    $('dashboardState').classList.remove('is-error');
    $('jurisdictionChart').innerHTML = empty('Carregando distribuição…');
    $('recentActivity').innerHTML = empty('Carregando atividades…');
    try {
      const [officers, audit] = await Promise.allSettled([
        db.from('cavalaria_oficiais').select('id,nome,origem,status,executed_at').order('ordem', { ascending: true }),
        db.from('cavalaria_auditoria').select('oficial_nome,alterado_em,autor_email,antes,depois').order('alterado_em', { ascending: false }).limit(6),
      ]);
      if (officers.status === 'rejected' || officers.value.error) throw new Error('Não foi possível consultar o efetivo.');
      const rows = officers.value.data || [];
      renderMetrics(rows);
      $('dashboardState').textContent = rows.length ? 'Indicadores atualizados a partir do Registro Geral.' : 'O Registro Geral ainda não contém oficiais.';
      if (audit.status === 'fulfilled' && !audit.value.error) renderActivity(audit.value.data || []);
      else $('recentActivity').innerHTML = empty('Não foi possível consultar a auditoria. Tente atualizar os dados.');
      $('connection').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    } catch {
      $('dashboardState').textContent = 'Não foi possível carregar os indicadores. Use Atualizar dados para tentar novamente.';
      $('dashboardState').classList.add('is-error');
      $('jurisdictionChart').innerHTML = empty('Distribuição indisponível no momento.');
      $('recentActivity').innerHTML = empty('Atualize os dados para consultar as atividades.');
      $('connection').textContent = 'Falha na atualização';
    } finally {
      loading = false;
      $('refreshDashboard').disabled = false;
    }
  }
  $('refreshDashboard').addEventListener('click', refresh);
  window.Cavalaria.setHidden('private', false);
  await refresh();
})();
