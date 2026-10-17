(async () => {
  'use strict';
  const { $, esc, api, can, requirePage, setHidden, message, formatDateTime } = window.Cavalaria;
  const access = await requirePage('avisos');
  if (!access) return;
  const editable = can(access, 'avisos.editar');
  const priorities = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' };
  let notices = [], editingId = null, busy = false, loaded = false;
  setHidden('newNotice', !editable);
  setHidden('archiveField', !editable);
  setHidden('private', false);

  function render() {
    const search = $('noticeSearch').value.trim().toLocaleLowerCase('pt-BR');
    const matches = notices.filter(item => `${item.titulo} ${item.conteudo}`.toLocaleLowerCase('pt-BR').includes(search));
    $('noticeState').textContent = `${matches.length} ${matches.length === 1 ? 'aviso' : 'avisos'} ${$('noticeStatus').value === 'arquivados' ? 'no arquivo' : 'publicados'}.`;
    $('noticeList').innerHTML = matches.length ? matches.map(item => `<article class="dashboard-card notice-card" data-id="${esc(item.id)}">
      <div class="notice-heading"><span class="notice-priority ${Object.hasOwn(priorities, item.prioridade) ? item.prioridade : 'normal'}">${esc(priorities[item.prioridade] || 'Normal')}</span>${item.arquivado_em ? '<span class="card-caption">Arquivado</span>' : ''}</div>
      <h2>${esc(item.titulo)}</h2><p class="notice-content">${esc(item.conteudo)}</p>
      <div class="notice-meta">Publicado por ${esc(item.autor?.nome)} · ${esc(item.autor?.cargo)}<br><time datetime="${esc(item.criado_em)}">${esc(formatDateTime(item.criado_em))}</time>${item.atualizado_em ? `<br>Última alteração: ${esc(item.atualizado_por?.nome)} · ${esc(formatDateTime(item.atualizado_em))}` : ''}${item.arquivado_em ? `<br>Arquivado por ${esc(item.arquivado_por?.nome)} · ${esc(formatDateTime(item.arquivado_em))}` : ''}</div>
      ${editable ? `<div class="form-actions">${!item.arquivado_em ? '<button class="btn secondary" type="button" data-action="editar">Editar aviso</button>' : ''}<button class="btn secondary" type="button" data-action="${item.arquivado_em ? 'restaurar' : 'arquivar'}">${item.arquivado_em ? 'Republicar aviso' : 'Arquivar aviso'}</button></div>` : ''}</article>`).join('') : `<div class="dashboard-card empty-state"><h2>${search ? 'Nenhum resultado' : 'Nenhum aviso ' + ($('noticeStatus').value === 'arquivados' ? 'arquivado' : 'publicado')}</h2><p>${search ? 'Tente outro termo de busca.' : 'Os comunicados do Comando aparecerão aqui.'}</p></div>`;
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['refreshNotices', 'newNotice', 'saveNotice', 'cancelNotice', 'noticeStatus', 'noticeTitle', 'noticeContent', 'noticePriority']) $(id).disabled = value;
    $('noticeList').setAttribute('aria-busy', String(value));
    $('noticeList').querySelectorAll('button').forEach(button => { button.disabled = value; });
  }
  function closeEditor() {
    setHidden('noticeEditor', true);
    editingId = null;
    $('noticeForm').reset();
  }
  async function load() {
    loaded = false;
    $('noticeState').textContent = 'Carregando avisos…';
    $('noticeList').innerHTML = '';
    notices = [];
    try {
      const result = await api('avisos' + ($('noticeStatus').value === 'arquivados' ? '?arquivados=1' : ''));
      notices = result.avisos || [];
      loaded = true;
      render();
    } catch (error) {
      $('noticeState').textContent = 'Não foi possível carregar os avisos. Use Atualizar avisos para tentar novamente.';
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
  function openEditor(item) {
    editingId = item?.id || null;
    $('noticeForm').reset();
    $('editorTitle').textContent = editingId ? 'Editar aviso' : 'Novo aviso';
    $('saveNotice').textContent = editingId ? 'Salvar alterações' : 'Publicar aviso';
    $('noticeTitle').value = item?.titulo || '';
    $('noticeContent').value = item?.conteudo || '';
    $('noticePriority').value = item?.prioridade || 'normal';
    setHidden('noticeEditor', false);
    $('noticeTitle').focus();
  }
  $('newNotice').addEventListener('click', () => { if (editable && !busy) openEditor(); });
  $('cancelNotice').addEventListener('click', () => { closeEditor(); $('newNotice').focus(); });
  $('refreshNotices').addEventListener('click', refresh);
  $('noticeSearch').addEventListener('input', () => { if (!busy && loaded) render(); });
  $('noticeStatus').addEventListener('change', () => { closeEditor(); refresh(); });
  $('noticeForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!editable || busy || !$('noticeForm').reportValidity()) return;
    setBusy(true);
    message('');
    try {
      await api('avisos', 'POST', { acao: editingId ? 'editar' : 'criar', id: editingId, titulo: $('noticeTitle').value.trim(), conteudo: $('noticeContent').value.trim(), prioridade: $('noticePriority').value });
      closeEditor();
      $('noticeStatus').value = 'ativos';
      message('Aviso publicado para os membros.', 'success');
      await load();
    } catch (error) { message(error.message, 'error'); }
    finally { setBusy(false); if (!editingId && $('noticeEditor').classList.contains('hide')) $('newNotice').focus(); }
  });
  $('noticeList').addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !editable || busy) return;
    const item = notices.find(notice => notice.id === button.closest('[data-id]').dataset.id);
    if (!item) return;
    const action = button.dataset.action;
    if (action === 'editar') { openEditor(item); return; }
    if (!confirm(action === 'arquivar' ? `Arquivar “${item.titulo}”? Ele deixará de aparecer para os membros.` : `Republicar “${item.titulo}” para todos os membros?`)) return;
    setBusy(true);
    message('');
    try {
      await api('avisos', 'POST', { acao: action, id: item.id });
      closeEditor();
      message(action === 'arquivar' ? 'Aviso arquivado.' : 'Aviso republicado.', 'success');
      await load();
    } catch (error) { message(error.message, 'error'); }
    finally { setBusy(false); }
  });
  await refresh();
})();
