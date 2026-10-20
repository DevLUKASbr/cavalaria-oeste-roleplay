(async () => {
  'use strict';
  const { $, esc, api, can, requirePage, setHidden, message, formatDateTime, displayName } = window.Cavalaria;
  const access = await requirePage('avisos');
  if (!access) return;
  const editable = can(access, 'avisos.editar');
  const priorities = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' };
  const priorityHelp = { normal: 'Para novidades e informações de rotina.', importante: 'Para orientações que precisam de destaque.', urgente: 'Para situações que exigem atenção imediata.' };
  const dialog = $('noticeEditor');
  let notices = [], editingId = null, busy = false, loaded = false, priorityFilter = 'todas', initialDraft = '';
  setHidden('newNotice', !editable);
  setHidden('archiveField', !editable);
  setHidden('private', false);

  const priorityOf = item => Object.hasOwn(priorities, item.prioridade) ? item.prioridade : 'normal';
  const draft = () => JSON.stringify(['noticeTitle', 'noticeContent', 'noticePriority'].map(id => $(id).value));
  const initials = name => String(name || 'Comando').trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('pt-BR');
  function editorError(text = '') {
    $('editorMessage').textContent = text;
    setHidden('editorMessage', !text);
  }
  function updatePreview() {
    const priority = $('noticePriority').value;
    $('previewPriority').textContent = priorities[priority];
    $('previewPriority').className = 'notice-priority ' + priority;
    $('previewTitle').textContent = $('noticeTitle').value.trim() || 'O título do seu aviso';
    $('previewContent').textContent = $('noticeContent').value.trim() || 'Seu comunicado aparecerá aqui enquanto você escreve.';
    $('previewAuthor').textContent = `${displayName(access.user)} · ${access.cargo}`;
    $('titleCount').textContent = `${$('noticeTitle').value.length} / 120`;
    $('contentCount').textContent = `${$('noticeContent').value.length} / 5000`;
    $('priorityHelp').textContent = priorityHelp[priority];
  }
  function updateCounts() {
    const ids = { todas: 'countAll', urgente: 'countUrgent', importante: 'countImportant', normal: 'countNormal' };
    for (const [priority, id] of Object.entries(ids)) $(id).textContent = loaded ? String(priority === 'todas' ? notices.length : notices.filter(item => priorityOf(item) === priority).length) : '—';
  }
  function render() {
    const search = $('noticeSearch').value.trim().toLocaleLowerCase('pt-BR');
    const archived = $('noticeStatus').value === 'arquivados';
    const matches = notices.filter(item => (priorityFilter === 'todas' || priorityOf(item) === priorityFilter) && `${item.titulo} ${item.conteudo}`.toLocaleLowerCase('pt-BR').includes(search));
    updateCounts();
    $('noticeState').textContent = `${matches.length} ${matches.length === 1 ? 'aviso' : 'avisos'} ${archived ? 'no arquivo' : 'publicados'}${search || priorityFilter !== 'todas' ? ` · ${notices.length} no total` : ''}.`;
    $('noticeList').innerHTML = matches.length ? matches.map(item => `<article class="notice-card" data-id="${esc(item.id)}" data-priority="${priorityOf(item)}">
      <div class="notice-card-header"><span class="notice-avatar" aria-hidden="true">${esc(initials(item.autor?.nome))}</span><div class="notice-byline"><strong>${esc(item.autor?.nome || 'Comando')}</strong> <span class="notice-role">· ${esc(item.autor?.cargo)}</span><small><time datetime="${esc(item.criado_em)}">${esc(formatDateTime(item.criado_em))}</time></small></div><div class="notice-heading"><span class="notice-priority ${priorityOf(item)}">${priorities[priorityOf(item)]}</span>${item.arquivado_em ? '<span class="card-caption">Arquivado</span>' : ''}</div></div>
      <h2>${esc(item.titulo)}</h2><p class="notice-content">${esc(item.conteudo)}</p>
      <div class="notice-meta">Publicado por ${esc(item.autor?.nome || 'Comando')} · ${esc(item.autor?.cargo)}${item.atualizado_em ? `<br>Última alteração: ${esc(item.atualizado_por?.nome)} · ${esc(formatDateTime(item.atualizado_em))}` : ''}${item.arquivado_em ? `<br>Arquivado por ${esc(item.arquivado_por?.nome)} · ${esc(formatDateTime(item.arquivado_em))}` : ''}</div>
      <div class="notice-card-footer"><span class="notice-official-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m8 12 3 3 5-6"/></svg>Comunicado oficial</span>${editable ? `<div class="form-actions">${!item.arquivado_em ? '<button class="btn secondary" type="button" data-action="editar">Editar aviso</button>' : ''}<button class="btn secondary" type="button" data-action="${item.arquivado_em ? 'restaurar' : 'arquivar'}">${item.arquivado_em ? 'Republicar aviso' : 'Arquivar aviso'}</button></div>` : ''}</div></article>`).join('') : `<div class="notice-card empty-state notice-empty"><span class="empty-icon" aria-hidden="true">${search || priorityFilter !== 'todas' ? '⌕' : '✦'}</span><h2>${search || priorityFilter !== 'todas' ? 'Nenhum resultado' : 'Nenhum aviso ' + (archived ? 'arquivado' : 'publicado')}</h2><p>${search || priorityFilter !== 'todas' ? 'Experimente outro termo ou selecione outra prioridade.' : editable && !archived ? 'Comece uma conversa com a Cavalaria. Crie o primeiro comunicado do Comando.' : 'Os comunicados do Comando aparecerão aqui.'}</p>${search || priorityFilter !== 'todas' ? '<button type="button" class="btn secondary" data-action="limpar">Limpar filtros</button>' : ''}</div>`;
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['refreshNotices', 'newNotice', 'saveNotice', 'cancelNotice', 'closeNotice', 'noticeStatus', 'noticeTitle', 'noticeContent', 'noticePriority']) $(id).disabled = value;
    $('noticeList').setAttribute('aria-busy', String(value));
    $('noticeList').querySelectorAll('button').forEach(button => { button.disabled = value; });
    $('priorityFilters').querySelectorAll('button').forEach(button => { button.disabled = value; });
  }
  function closeEditor(force = false) {
    if (!force && (busy || (draft() !== initialDraft && !confirm('Descartar as alterações deste aviso? O texto ainda não foi publicado.')))) return;
    dialog.close();
    editingId = null;
    $('noticeForm').reset();
    editorError();
    $('newNotice').focus();
  }
  async function load() {
    loaded = false;
    $('noticeState').textContent = 'Carregando avisos…';
    $('noticeState').classList.remove('is-error');
    $('noticeList').innerHTML = '';
    notices = [];
    updateCounts();
    try {
      const result = await api('avisos' + ($('noticeStatus').value === 'arquivados' ? '?arquivados=1' : ''));
      notices = result.avisos || [];
      loaded = true;
      render();
    } catch (error) {
      $('noticeState').textContent = 'Não foi possível carregar os avisos. Use Atualizar avisos para tentar novamente.';
      $('noticeState').classList.add('is-error');
      message(error.message, 'error');
    }
  }
  async function refresh() {
    if (busy) return;
    message('');
    setBusy(true);
    await load();
    setBusy(false);
  }
  function selectPriority(value) {
    priorityFilter = value;
    $('priorityFilters').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.priority === value)));
  }
  function openEditor(item) {
    editingId = item?.id || null;
    $('noticeForm').reset();
    editorError();
    $('editorTitle').textContent = editingId ? 'Editar aviso' : 'Criar aviso';
    $('saveNotice').textContent = editingId ? 'Salvar alterações' : 'Publicar aviso';
    $('noticeTitle').value = item?.titulo || '';
    $('noticeContent').value = item?.conteudo || '';
    $('noticePriority').value = item?.prioridade || 'normal';
    initialDraft = draft();
    updatePreview();
    dialog.showModal();
    $('noticeTitle').focus();
  }
  $('newNotice').addEventListener('click', () => { if (editable && !busy) openEditor(); });
  $('cancelNotice').addEventListener('click', () => closeEditor());
  $('closeNotice').addEventListener('click', () => closeEditor());
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  $('noticeForm').addEventListener('input', updatePreview);
  $('noticePriority').addEventListener('change', updatePreview);
  $('refreshNotices').addEventListener('click', refresh);
  $('noticeSearch').addEventListener('input', () => { if (!busy && loaded) render(); });
  $('noticeStatus').addEventListener('change', refresh);
  $('priorityFilters').addEventListener('click', event => {
    const button = event.target.closest('button[data-priority]');
    if (!button || busy) return;
    selectPriority(button.dataset.priority);
    if (loaded) render();
  });
  $('noticeForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!editable || busy || !$('noticeForm').reportValidity()) return;
    if ($('noticeTitle').value.trim().length < 3 || $('noticeContent').value.trim().length < 3) {
      editorError('Preencha o título e o comunicado com pelo menos 3 caracteres, sem contar espaços nas pontas.');
      return;
    }
    const wasEditing = Boolean(editingId);
    setBusy(true);
    editorError();
    message('');
    try {
      await api('avisos', 'POST', { acao: editingId ? 'editar' : 'criar', id: editingId, titulo: $('noticeTitle').value.trim(), conteudo: $('noticeContent').value.trim(), prioridade: $('noticePriority').value });
      closeEditor(true);
      $('noticeStatus').value = 'ativos';
      $('noticeSearch').value = '';
      selectPriority('todas');
      message(wasEditing ? 'Aviso atualizado para os membros.' : 'Aviso publicado para os membros.', 'success');
      await load();
    } catch (error) { editorError(error.message); }
    finally { setBusy(false); if (!dialog.open) $('newNotice').focus(); }
  });
  $('noticeList').addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy) return;
    const action = button.dataset.action;
    if (action === 'limpar') { $('noticeSearch').value = ''; selectPriority('todas'); render(); $('noticeSearch').focus(); return; }
    if (!editable) return;
    const item = notices.find(notice => notice.id === button.closest('[data-id]').dataset.id);
    if (!item) return;
    if (action === 'editar') { openEditor(item); return; }
    if (!confirm(action === 'arquivar' ? `Arquivar “${item.titulo}”? Ele deixará de aparecer para os membros.` : `Republicar “${item.titulo}” para todos os membros?`)) return;
    setBusy(true);
    message('');
    try {
      await api('avisos', 'POST', { acao: action, id: item.id });
      message(action === 'arquivar' ? 'Aviso arquivado.' : 'Aviso republicado.', 'success');
      await load();
    } catch (error) { message(error.message, 'error'); }
    finally { setBusy(false); }
  });
  await refresh();
})();
