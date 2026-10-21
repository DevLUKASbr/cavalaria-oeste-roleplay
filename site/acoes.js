(async () => {
  'use strict';
  const { $, esc, api, can, requirePage, setHidden, message, displayName } = window.Cavalaria;
  const data = window.CavalariaAcoes;
  const access = await requirePage('acoes');
  if (!access) return;
  const manager = can(access, 'acoes.gerenciar');
  const editor = $('actionEditor'), manageDialog = $('manageDialog');
  const form = $('actionForm');
  const pageSize = 10;
  let records = [], matched = [], loaded = false, busy = false, page = 1, editingId = null, initialDraft = '', lastRank = '', management = null;
  const today = data.dayKey();
  $('dateFrom').value = today.slice(0, 8) + '01';
  $('dateTo').value = today;
  setHidden('archiveField', !manager);
  setHidden('private', false);
  const filters = () => ({ search: $('actionSearch').value, from: $('dateFrom').value, to: $('dateTo').value, result: $('resultFilter').value });
  const participants = () => $('actionParticipants').value.split(/\r?\n/).map(name => name.normalize('NFKC').trim().replace(/\s+/g, ' ')).filter(Boolean);
  const draft = () => JSON.stringify([...form.querySelectorAll('input,textarea')].map(input => input.type === 'radio' ? input.checked : input.value));
  function editorError(text = '') { $('editorMessage').textContent = text; setHidden('editorMessage', !text); }
  function updateDraft() {
    const names = participants(), count = Number($('actionCavalry').value);
    const duplicate = new Set(names.map(data.normalize)).size !== names.length;
    $('participantCount').textContent = `${names.length} de ${count || '—'} oficiais informados`;
    $('participantCount').classList.toggle('is-error', names.length > 0 && (duplicate || names.length !== count));
    $('actionParticipants').setCustomValidity(duplicate ? 'Remova os nomes repetidos.' : names.length !== count ? 'Informe um oficial por linha, na mesma quantidade da Cavalaria.' : '');
    $('confrontationPreview').textContent = `Confronto ${count || '—'} × ${$('actionOpponents').value || '—'}`;
  }
  function setBusy(value) {
    busy = value;
    for (const container of [$('private'), editor, manageDialog]) container.querySelectorAll('button,input,select,textarea').forEach(node => { node.disabled = value; });
    $('actionList').setAttribute('aria-busy', String(value));
    if (!value) {
      $('newAction').disabled = !loaded;
      $('exportActions').disabled = !loaded || !matched.length;
      $('previousPage').disabled = !loaded || page <= 1;
      $('nextPage').disabled = !loaded || page * pageSize >= matched.length;
    }
  }
  function render() {
    const f = filters();
    const invalidRange = f.from && f.to && f.from > f.to;
    matched = invalidRange ? [] : data.filter(records, f);
    const stats = data.stats(matched);
    $('metricTotal').textContent = stats.total;
    $('metricWins').textContent = stats.wins;
    $('metricLosses').textContent = stats.losses;
    $('metricRate').textContent = stats.rate === null ? '—' : stats.rate + '%';
    $('metricPeople').textContent = `${stats.officers} ${stats.officers === 1 ? 'oficial participante' : 'oficiais participantes'}`;
    const pages = Math.max(1, Math.ceil(matched.length / pageSize));
    page = Math.min(page, pages);
    $('actionState').textContent = invalidRange ? 'A data inicial deve ser anterior ou igual à data final.' : `${matched.length} ${matched.length === 1 ? 'ação encontrada' : 'ações encontradas'}${$('archiveFilter').value ? ' no arquivo' : ''}.`;
    $('actionState').classList.toggle('is-error', Boolean(invalidRange));
    $('actionList').innerHTML = matched.length ? matched.slice((page - 1) * pageSize, page * pageSize).map(item => {
      const own = item.autor?.id === access.user.id;
      const result = item.resultado === 'vitoria' ? 'vitoria' : 'derrota';
      const list = item.participantes || [];
      return `<article class="action-card" data-id="${esc(item.id)}"><div class="action-card-top"><div><div class="action-meta"><time datetime="${esc(item.ocorrido_em)}">${esc(data.formatWhen(item.ocorrido_em))}</time><span>·</span><span>Registro #${esc(item.id.slice(-6).toUpperCase())}</span>${item.arquivado_em ? '<span>· Arquivada</span>' : ''}</div><h3>${esc(item.titulo)}</h3></div><div class="action-result"><span class="result-badge ${result}">${result === 'vitoria' ? '↗ Vitória' : '↘ Derrota'}</span><span class="confrontation"><strong>${esc(item.cavalaria)} × ${esc(item.oponentes)}</strong><small>CAVALARIA × OPONENTES</small></span></div></div>
        <p class="action-participants-preview">${esc(list.slice(0, 4).join(' · '))}${list.length > 4 ? ` · +${list.length - 4} oficiais` : ''}</p>
        <details><summary>Participantes e relato</summary><div class="action-detail-body"><ul class="participant-tags" aria-label="Oficiais participantes">${list.map(name => `<li>${esc(name)}</li>`).join('')}</ul><p class="action-report">${esc(item.relato || 'Nenhum relato adicional informado.')}</p><dl><dt>Registrado em</dt><dd>${esc(data.formatWhen(item.criado_em))}</dd>${item.atualizado_em ? `<dt>Última alteração</dt><dd>${esc(data.formatWhen(item.atualizado_em))} · ${esc(item.atualizado_por?.nome)} · ${esc(item.atualizado_por?.patente)}</dd>` : ''}${item.arquivado_em ? `<dt>Arquivada em</dt><dd>${esc(data.formatWhen(item.arquivado_em))} · ${esc(item.arquivado_por?.nome)}</dd>` : ''}</dl></div></details>
        <footer class="action-card-footer"><span class="action-author">Registrado por <strong>${esc(item.autor?.nome)}</strong> · ${esc(item.autor?.patente)}</span><div class="action-buttons">${!item.arquivado_em && (manager || own) ? '<button type="button" data-action="editar">Editar registro</button>' : ''}${manager ? `<button type="button" data-action="${item.arquivado_em ? 'restaurar' : 'arquivar'}">${item.arquivado_em ? 'Restaurar' : 'Arquivar'}</button>` : ''}</div></footer></article>`;
    }).join('') : `<div class="action-empty"><span aria-hidden="true">✦</span><h3>${invalidRange ? 'Revise o período' : records.length ? 'Nenhuma ação com estes filtros' : $('archiveFilter').value ? 'Nenhuma ação arquivada' : 'O livro está pronto para o primeiro registro'}</h3><p>${invalidRange ? 'Ajuste as datas para consultar o livro.' : records.length ? 'Altere o período, o resultado ou o termo da busca.' : $('archiveFilter').value ? 'Os registros arquivados pela liderança aparecerão aqui.' : 'Registre a ação, os participantes e o resultado do confronto.'}</p></div>`;
    $('pageState').textContent = matched.length ? `Página ${page} de ${pages}` : 'Nenhuma página';
    $('exportActions').disabled = busy || !matched.length;
    $('previousPage').disabled = busy || page <= 1;
    $('nextPage').disabled = busy || page >= pages;
  }
  async function load() {
    if (busy) return;
    loaded = false; records = []; matched = [];
    message(''); setBusy(true);
    $('actionState').textContent = 'Carregando ações…';
    $('actionState').classList.remove('is-error');
    $('actionList').innerHTML = '';
    for (const id of ['metricTotal', 'metricWins', 'metricLosses', 'metricRate']) $(id).textContent = '—';
    $('metricPeople').textContent = 'Aguardando os registros'; $('pageState').textContent = '';
    try {
      const response = await api('acoes' + ($('archiveFilter').value ? '?arquivados=1' : ''));
      if (!Array.isArray(response.acoes)) throw new Error('Resposta do livro de ações inválida.');
      records = response.acoes;
      loaded = true; page = 1; render();
    } catch (error) {
      message(error.message, 'error');
      $('actionState').textContent = 'Não foi possível carregar o livro. Use Atualizar para tentar novamente.';
      $('actionState').classList.add('is-error');
    } finally { setBusy(false); }
  }
  function clearFilters() {
    for (const id of ['actionSearch', 'dateFrom', 'dateTo', 'resultFilter']) $(id).value = '';
    page = 1;
    if (loaded) render();
  }
  function closeEditor(force = false) {
    if (!force && (busy || (draft() !== initialDraft && !confirm('Descartar este registro? As alterações ainda não foram salvas.')))) return;
    editor.close(); editingId = null; form.reset(); editorError(); $('newAction').focus();
  }
  function openEditor(item) {
    if (busy || !loaded) return;
    editingId = item?.id || null;
    form.reset(); editorError();
    $('editorTitle').textContent = item ? 'Editar registro de ação' : 'Registrar ação';
    $('saveAction').textContent = item ? 'Salvar alterações' : 'Salvar ação';
    $('actionTitle').value = item?.titulo || '';
    const date = item?.ocorrido_em ? new Date(item.ocorrido_em) : new Date();
    $('actionWhen').value = new Date(date.getTime() - 3 * 3600000).toISOString().slice(0, 16);
    $('actionWhen').max = new Date(Date.now() - 3 * 3600000 + 300000).toISOString().slice(0, 16);
    $('actionCavalry').value = item?.cavalaria || 2;
    $('actionOpponents').value = item?.oponentes || 2;
    const choice = [...form.querySelectorAll('[name=actionResult]')].find(input => input.value === item?.resultado);
    if (choice) choice.checked = true;
    $('actionParticipants').value = (item?.participantes || []).join('\n');
    $('actionReport').value = item?.relato || '';
    $('authorRank').value = lastRank || (item?.autor?.id === access.user.id ? item.autor.patente : '') || '';
    $('registrarName').textContent = `Responsável: ${displayName(access.user)}`;
    updateDraft(); initialDraft = draft(); editor.showModal(); $('actionTitle').focus();
  }
  $('newAction').onclick = () => openEditor();
  $('closeAction').onclick = () => closeEditor();
  $('cancelAction').onclick = () => closeEditor();
  editor.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  form.addEventListener('input', updateDraft);
  form.addEventListener('submit', async event => {
    event.preventDefault(); updateDraft();
    if (busy || !form.reportValidity()) return;
    if ($('actionTitle').value.trim().length < 3 || $('authorRank').value.trim().length < 2) { editorError('Preencha a ação e sua patente sem usar apenas espaços.'); return; }
    const when = new Date($('actionWhen').value + ':00-03:00');
    if (!Number.isFinite(when.getTime())) { editorError('Confira a data e a hora da ação.'); return; }
    const id = editingId;
    const body = { acao: id ? 'editar' : 'criar', ...(id ? { id } : {}), titulo: $('actionTitle').value.trim(), ocorrido_em: when.toISOString(), patente: $('authorRank').value.trim(), resultado: form.querySelector('[name=actionResult]:checked')?.value, cavalaria: Number($('actionCavalry').value), oponentes: Number($('actionOpponents').value), participantes: participants(), relato: $('actionReport').value.trim() };
    setBusy(true); editorError();
    try {
      const response = await api('acoes', 'POST', body);
      if (!response.acao?.id) throw new Error('Não foi possível confirmar o registro. Atualize o livro antes de tentar novamente.');
      lastRank = body.patente;
      // Resposta confirmada: inserir o registro retornado sem depender de uma segunda leitura.
      const wasArchive = Boolean($('archiveFilter').value);
      records = wasArchive ? [response.acao] : [response.acao, ...records.filter(item => item.id !== response.acao.id)];
      records.sort((a, b) => String(b.ocorrido_em).localeCompare(String(a.ocorrido_em)) || String(b.criado_em).localeCompare(String(a.criado_em)));
      $('archiveFilter').value = ''; loaded = true; clearFilters();
      closeEditor(true); message(id ? 'Registro atualizado. A autoria original foi preservada.' : 'Ação registrada no Livro da Cavalaria.', 'success');
      // Ao criar a partir do arquivo, buscar também os outros registros ativos.
      if (wasArchive) { setBusy(false); await load(); }
    } catch (error) { editorError(error.message); }
    finally { setBusy(false); if (loaded) render(); }
  });
  $('actionList').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy) return;
    const item = records.find(record => record.id === button.closest('[data-id]').dataset.id);
    if (!item) return;
    if (button.dataset.action === 'editar') { openEditor(item); return; }
    if (!manager) return;
    management = { id: item.id, acao: button.dataset.action };
    const archive = management.acao === 'arquivar';
    $('manageTitle').textContent = archive ? 'Arquivar ação' : 'Restaurar ação';
    $('manageDescription').textContent = item.titulo;
    $('manageHelp').textContent = archive ? 'A ação sairá do livro e dos indicadores ativos. A liderança poderá consultá-la e restaurá-la no arquivo.' : 'A ação voltará ao livro e aos indicadores de todos os oficiais.';
    $('confirmManage').textContent = archive ? 'Arquivar ação' : 'Restaurar ação';
    $('manageRank').value = lastRank;
    setHidden('manageMessage', true); manageDialog.showModal(); $('manageRank').focus();
  });
  $('cancelManage').onclick = () => { if (!busy) manageDialog.close(); };
  manageDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('manageForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !management || !$('manageForm').reportValidity()) return;
    setBusy(true); setHidden('manageMessage', true);
    try {
      const result = await api('acoes', 'POST', { ...management, patente: $('manageRank').value.trim() });
      if (!result.acao?.id) throw new Error('Não foi possível confirmar a alteração. Atualize o livro.');
      lastRank = $('manageRank').value.trim();
      records = records.filter(item => item.id !== management.id); render(); manageDialog.close();
      message(management.acao === 'arquivar' ? 'Ação arquivada. O registro foi preservado.' : 'Ação restaurada no livro.', 'success'); management = null;
    } catch (error) { $('manageMessage').textContent = error.message; setHidden('manageMessage', false); }
    finally { setBusy(false); }
  });
  $('refreshActions').onclick = load;
  $('archiveFilter').onchange = load;
  $('clearFilters').onclick = clearFilters;
  for (const id of ['actionSearch', 'dateFrom', 'dateTo', 'resultFilter']) $(id).addEventListener('input', () => { if (loaded && !busy) { page = 1; render(); } });
  $('previousPage').onclick = () => { if (!busy && page > 1) { page--; render(); } };
  $('nextPage').onclick = () => { if (!busy && page * pageSize < matched.length) { page++; render(); } };
  $('exportActions').onclick = () => {
    if (!loaded || busy || !matched.length) return;
    const url = URL.createObjectURL(new Blob([data.csv(matched)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `cavalaria_acoes_${data.dayKey()}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener('beforeunload', event => { if (busy || (editor.open && draft() !== initialDraft)) { event.preventDefault(); event.returnValue = ''; } });
  await load();
})();
