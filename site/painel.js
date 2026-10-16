/*
 * Painel do Registro Geral da Cavalaria.
 * Supabase (Postgres com RLS + Realtime) para os registros; Netlify Function /api/contas para os nomes dos oficiais.
 */
(async () => {
  'use strict';
  const { $, esc, formatDateTime, setHidden, message, db, requirePage, api } = window.Cavalaria;

  const access = await requirePage('registro');
  if (!access) return;

  // Lemoyne e "Sem jurisdição" continuam disponíveis: contingentes fechados podem reabrir.
  const JURISDICTIONS = ['New Hanover', 'West Elizabeth', 'Lemoyne', 'Sem jurisdição'];
  const STATUSES = ['Pendente', 'Ativo', 'Inativo', 'Exonerar'];
  const HISTORY_LIMIT = 100;

  const state = {
    session: access.session,
    membership: access.membership, // { role }: 'admin' = acesso total, 'xerife' = só o painel
    names: new Map(),              // e-mail da conta → nome do oficial
    officers: [],
    channel: null,
    refreshTimer: null,
    historyShown: false,
    loading: false,
  };

  // Reverter exoneração exige o nível 'admin' no banco (regra da função reverter_exoneracao).
  const isAdmin = () => state.membership?.role === 'admin';
  const isExecuted = officer => Boolean(officer.executed_at);
  // Situação exibida: exoneração confirmada vira "Exonerado", o resto segue o status salvo.
  const situationOf = officer => (isExecuted(officer) ? 'Exonerado' : officer.status);
  const findOfficer = id => state.officers.find(o => o.id === id);
  const personName = email => state.names.get(email) || email || 'autor registrado';

  // ---------------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------------

  function selectOptions(values, selected) {
    return values
      .map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`)
      .join('');
  }

  function renderStats() {
    const { officers } = state;
    const count = situation => officers.filter(o => situationOf(o) === situation).length;
    const cards = [
      ['TOTAL', officers.length],
      ['ATIVOS', count('Ativo')],
      ['INATIVOS', count('Inativo')],
      ['A EXONERAR', count('Exonerar')],
      ['EXONERADOS', count('Exonerado')],
    ];
    const byJurisdiction = JURISDICTIONS
      .map(j => `${esc(j)}: ${officers.filter(o => o.origem === j).length}`)
      .join(' · ');

    $('stats').innerHTML =
      cards.map(([title, n]) => `<div class="stat"><strong>${n}</strong><span>${title}</span></div>`).join('') +
      `<div class="footnote" style="grid-column:1/-1;text-align:center">${byJurisdiction} · Pendentes de avaliação: ${count('Pendente')}</div>`;
  }

  function renderExecutedRow(officer, number) {
    const revertButton = isAdmin()
      ? '<button class="exec-action revert-action" data-revert="1">Reverter exoneração</button>'
      : '';
    return `<tr class="executed" data-id="${esc(officer.id)}">
      <td>${number}</td>
      <td class="name">${esc(officer.nome)}</td>
      <td><span class="stamp-red">EXONERADO</span></td>
      <td>${esc(officer.destino)}</td>
      <td>${esc(officer.observacao)}</td>
      <td class="action-cell">
        <span class="small">Confirmado em ${formatDateTime(officer.executed_at)}<br>Por: ${esc(personName(officer.executed_by_email))}</span>
        ${revertButton}
      </td>
    </tr>`;
  }

  function renderEditableRow(officer, number) {
    const name = esc(officer.nome);
    const action = officer.status === 'Exonerar'
      ? '<button class="exec-action" data-execute="1">Confirmar exoneração</button>'
      : '<span class="small">Sem ação executada</span>';
    return `<tr data-id="${esc(officer.id)}">
      <td>${number}</td>
      <td class="name">${name}</td>
      <td><select aria-label="Situação de ${name}" class="status" data-field="status">${selectOptions(STATUSES, officer.status)}</select></td>
      <td><select aria-label="Destino de ${name}" class="dest" data-field="destino">${selectOptions(['A definir', ...JURISDICTIONS], officer.destino)}</select></td>
      <td><input aria-label="Observação de ${name}" class="notes" data-field="observacao" maxlength="400" value="${esc(officer.observacao)}" placeholder="Registre a avaliação…"></td>
      <td class="action-cell">${action}</td>
    </tr>`;
  }

  function renderSection(jurisdiction, term, filter) {
    const all = state.officers.filter(o => o.origem === jurisdiction);
    const shown = all.filter(o =>
      o.nome.toLocaleLowerCase('pt-BR').includes(term)
      && (filter === 'all' || situationOf(o) === filter));
    const subtitle = jurisdiction === 'Sem jurisdição'
      ? 'Efetivo sem atribuição territorial'
      : 'Efetivo de jurisdição registrado';
    const rows = shown.length
      ? shown.map(o => {
          const number = all.indexOf(o) + 1;
          return isExecuted(o) ? renderExecutedRow(o, number) : renderEditableRow(o, number);
        }).join('')
      : '<tr><td colspan="6" class="empty">Nenhum oficial encontrado neste filtro.</td></tr>';

    return `<section class="section">
      <div class="sectionhead">
        <div><h2>✦ ${esc(jurisdiction)}</h2><small>${subtitle}</small></div>
        <div class="counter">${shown.length} de ${all.length} oficiais</div>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Nº</th><th>Nome do oficial</th><th>Situação</th><th>Destino proposto</th><th>Observações</th><th>Registro de ação</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
  }

  function render() {
    renderStats();
    const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
    const filter = $('filter').value;
    $('sections').innerHTML = JURISDICTIONS.map(j => renderSection(j, term, filter)).join('');
  }

  function renderHistory(entries) {
    $('history').innerHTML = `<strong>Últimas ${HISTORY_LIMIT} alterações registradas</strong>` +
      entries.map(entry => `<div class="history-entry">
        <b>${esc(entry.oficial_nome)}</b> · ${formatDateTime(entry.alterado_em)} · ${esc(personName(entry.autor_email))}
        <div class="small">Antes: ${esc(JSON.stringify(entry.antes))}<br>Depois: ${esc(JSON.stringify(entry.depois))}</div>
      </div>`).join('');
  }

  // ---------------------------------------------------------------------------
  // Dados e tempo real
  // ---------------------------------------------------------------------------

  // Nomes vêm da Function; se ela estiver fora do ar, o painel segue mostrando e-mails.
  async function fetchNames() {
    try {
      const { contas } = await api('contas');
      state.names = new Map(contas.filter(c => c.nome).map(c => [c.email, c.nome]));
    } catch (e) {
      console.warn('Nomes dos oficiais indisponíveis:', e.message);
    }
  }

  async function fetchOfficers() {
    if (state.loading) return;
    state.loading = true;
    try {
      const { data, error } = await db.from('cavalaria_oficiais').select('*').order('ordem', { ascending: true });
      if (error) throw error;
      state.officers = data || [];
      render();
      $('connection').textContent = 'Sincronizado · ' + new Date().toLocaleTimeString('pt-BR');
      if (state.historyShown) await fetchHistory();
    } catch (e) {
      message('Não foi possível carregar os registros: ' + e.message, 'error');
      $('connection').textContent = 'Erro na conexão';
    } finally {
      state.loading = false;
    }
  }

  async function fetchHistory() {
    const { data, error } = await db.from('cavalaria_auditoria')
      .select('oficial_nome,alterado_em,autor_email,antes,depois')
      .order('alterado_em', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) {
      $('history').textContent = 'Erro ao consultar histórico: ' + error.message;
      return;
    }
    renderHistory(data || []);
  }

  // Agrupa rajadas de eventos e não recarrega enquanto alguém digita uma observação.
  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      if (!document.activeElement?.matches('[data-field="observacao"]')) fetchOfficers();
    }, 350);
  }

  function subscribe() {
    state.channel = db.channel('cavalaria-revisao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cavalaria_oficiais' }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cavalaria_auditoria' }, () => {
        if (state.historyShown) fetchHistory();
      })
      .subscribe(status => {
        $('connection').textContent = status === 'SUBSCRIBED' ? 'Em tempo real · conectado' : 'Atualização: ' + status;
      });
  }

  async function updateOfficer(id, patch) {
    const officer = findOfficer(id);
    if (!officer || isExecuted(officer)) return;
    const { data, error } = await db.from('cavalaria_oficiais')
      .update(patch)
      .eq('id', id)
      .is('executed_at', null)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      message('A alteração não foi salva: ' + (error?.message || 'registro foi atualizado por outra pessoa'), 'error');
    } else {
      message('Alteração registrada no banco de dados.', 'success');
    }
    await fetchOfficers();
  }

  async function confirmExoneration(officer, button) {
    if (officer.status !== 'Exonerar' || isExecuted(officer)) return;
    const ok = confirm(`Você CONFIRMA que ${officer.nome} já foi EXONERADO dentro do jogo?\n\n`
      + 'O registro receberá carimbo EXONERADO, ficará bloqueado e será preservado no histórico.');
    if (!ok) return;

    button.disabled = true;
    const { data, error } = await db.rpc('confirmar_exoneracao', { p_oficial: officer.id });
    if (error || !data) {
      message('Não foi possível confirmar a exoneração: ' + (error?.message || 'registro inválido'), 'error');
      button.disabled = false;
      return;
    }
    message(`${officer.nome}: EXONERAÇÃO EXECUTADA e registrada.`, 'success');
    await fetchOfficers();
  }

  async function revertExoneration(officer, button) {
    if (!isAdmin() || !isExecuted(officer)) return;
    const ok = confirm(`Você confirma a REVERSÃO administrativa da exoneração de ${officer.nome}?\n\n`
      + 'O oficial voltará à situação Ativo e a ação ficará registrada no histórico.');
    if (!ok) return;

    const justification = prompt('Informe a justificativa obrigatória (mínimo de 10 caracteres):', '');
    if (justification === null) return;
    if (justification.trim().length < 10) {
      message('A reversão exige uma justificativa com pelo menos 10 caracteres.', 'error');
      return;
    }

    button.disabled = true;
    const { data, error } = await db.rpc('reverter_exoneracao', {
      p_oficial: officer.id,
      p_justificativa: justification.trim(),
    });
    if (error || !data) {
      message('Não foi possível reverter a exoneração: ' + (error?.message || 'registro inválido'), 'error');
      button.disabled = false;
      return;
    }
    message(`${officer.nome}: exoneração revertida e justificativa registrada.`, 'success');
    await fetchOfficers();
  }

  function exportCsv() {
    const columns = [
      ['origem', o => o.origem],
      ['nome', o => o.nome],
      ['status', o => o.status],
      ['destino', o => o.destino],
      ['observacao', o => o.observacao],
      ['executed_at', o => o.executed_at],
      ['executed_by', o => (o.executed_by_email ? personName(o.executed_by_email) : '')],
      ['executed_by_email', o => o.executed_by_email],
    ];
    const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const lines = [
      columns.map(([title]) => title).join(';'),
      ...state.officers.map(o => columns.map(([, get]) => quote(get(o))).join(';')),
    ];
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cavalaria_oeste_registro.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------

  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  $('csv').onclick = exportCsv;
  $('print').onclick = () => window.print();
  $('historyToggle').onclick = async () => {
    state.historyShown = !state.historyShown;
    setHidden('history', !state.historyShown);
    if (state.historyShown) await fetchHistory();
  };

  // Situação e destino salvam ao trocar; observação salva ao sair do campo.
  $('sections').addEventListener('change', async e => {
    const row = e.target.closest('tr[data-id]');
    const field = e.target.dataset.field;
    if (!row || !field || field === 'observacao') return;
    await updateOfficer(row.dataset.id, { [field]: e.target.value });
  });

  $('sections').addEventListener('focusout', async e => {
    if (e.target.dataset.field !== 'observacao') return;
    const row = e.target.closest('tr[data-id]');
    const officer = row && findOfficer(row.dataset.id);
    if (officer && e.target.value !== officer.observacao) {
      await updateOfficer(row.dataset.id, { observacao: e.target.value });
    }
  });

  $('sections').addEventListener('click', async e => {
    const button = e.target.closest('[data-execute], [data-revert]');
    if (!button) return;
    const officer = findOfficer(button.closest('tr[data-id]').dataset.id);
    if (!officer) return;
    if (button.dataset.execute) await confirmExoneration(officer, button);
    else await revertExoneration(officer, button);
  });

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------

  setHidden('private', false);
  await fetchNames();
  await fetchOfficers();
  subscribe();
})();
