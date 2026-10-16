/* Página de Treinamentos: todos com acesso leem; Xerife, Sub-Xerife e Adm criam, editam e excluem tópicos. */
(async () => {
  'use strict';
  const { $, esc, formatDateTime, setHidden, message, can, requirePage, api } = window.Cavalaria;

  const access = await requirePage('treinamentos');
  if (!access) return;

  const canEdit = can(access, 'treinamentos.editar');
  const MAX_VIDEOS = 10;
  let topics = [];
  let editingId = null; // null = criando um tópico novo

  // ---------------------------------------------------------------------------
  // Vídeos: YouTube vira player embutido; outros links viram botão para abrir.
  // ---------------------------------------------------------------------------

  function youtubeId(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\.|^m\./, '');
      if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
      if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        if (u.pathname === '/watch') return u.searchParams.get('v');
        const match = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
        return match ? match[1] : null;
      }
    } catch { /* link inválido: cai no botão */ }
    return null;
  }

  function renderVideo(url) {
    const id = youtubeId(url);
    if (id && /^[\w-]{6,20}$/.test(id)) {
      return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="Vídeo do treinamento"
        loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    }
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* mostra o link inteiro */ }
    return `<a class="video-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">▶ Assistir vídeo · ${esc(host)}</a>`;
  }

  // ---------------------------------------------------------------------------
  // Lista de tópicos
  // ---------------------------------------------------------------------------

  function renderTopic(t) {
    const edited = t.atualizado_em
      ? ` · editado em ${formatDateTime(t.atualizado_em)} por ${esc(t.atualizado_por?.nome || '')}`
      : '';
    const actions = canEdit
      ? `<div class="topic-actions no-print">
          <button class="btn secondary" data-action="edit">Editar</button>
          <button class="btn danger" data-action="delete">Excluir</button>
        </div>`
      : '';
    return `<article class="topic" data-id="${esc(t.id)}">
      <h3>${esc(t.titulo)}</h3>
      ${t.subtitulo ? `<p class="topic-sub">${esc(t.subtitulo)}</p>` : ''}
      <p class="topic-meta">Publicado por ${esc(t.autor?.nome || '—')} em ${formatDateTime(t.criado_em)}${edited}</p>
      ${t.descricao ? `<div class="topic-body">${esc(t.descricao)}</div>` : ''}
      ${t.videos?.length ? `<div class="videos">${t.videos.map(renderVideo).join('')}</div>` : ''}
      ${actions}
    </article>`;
  }

  function render() {
    const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
    const shown = topics.filter(t =>
      [t.titulo, t.subtitulo, t.descricao].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    $('topics').innerHTML = shown.length
      ? shown.map(renderTopic).join('')
      : `<div class="empty">${topics.length ? 'Nenhum tópico encontrado nesta busca.' : 'Nenhum tópico publicado ainda.'}</div>`;
  }

  async function load() {
    try {
      ({ topicos: topics } = await api('treinamentos'));
      render();
    } catch (e) {
      message('Não foi possível carregar os treinamentos: ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Editor (criar / editar)
  // ---------------------------------------------------------------------------

  function addVideoRow(url = '') {
    if ($('videos').children.length >= MAX_VIDEOS) {
      message(`No máximo ${MAX_VIDEOS} vídeos por tópico.`, 'error');
      return;
    }
    const row = document.createElement('div');
    row.className = 'video-row';
    row.innerHTML = `<input type="url" placeholder="https://www.youtube.com/watch?v=…" aria-label="Link do vídeo">
      <button class="btn secondary" type="button" title="Remover vídeo">Remover</button>`;
    row.querySelector('input').value = url;
    row.querySelector('button').onclick = () => row.remove();
    $('videos').appendChild(row);
  }

  function openEditor(topic = null) {
    editingId = topic?.id || null;
    $('editorTitle').textContent = topic ? 'Editar tópico' : 'Novo tópico';
    $('saveTopic').textContent = topic ? 'Salvar alterações' : 'Publicar tópico';
    $('titulo').value = topic?.titulo || '';
    $('subtitulo').value = topic?.subtitulo || '';
    $('descricao').value = topic?.descricao || '';
    $('videos').innerHTML = '';
    (topic?.videos || []).forEach(addVideoRow);
    setHidden('editor', false);
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('titulo').focus();
  }

  function closeEditor() {
    editingId = null;
    $('topicForm').reset();
    $('videos').innerHTML = '';
    setHidden('editor', true);
  }

  $('topicForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = $('saveTopic');
    const payload = {
      titulo: $('titulo').value,
      subtitulo: $('subtitulo').value,
      descricao: $('descricao').value,
      videos: [...$('videos').querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean),
    };
    button.disabled = true;
    try {
      if (editingId) await api('treinamentos', 'POST', { acao: 'editar', id: editingId, ...payload });
      else await api('treinamentos', 'POST', { acao: 'criar', ...payload });
      message(editingId ? 'Tópico atualizado.' : 'Tópico publicado.', 'success');
      closeEditor();
      await load();
    } catch (err) {
      message('Não foi possível salvar o tópico: ' + err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('topics').addEventListener('click', async e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const topic = topics.find(t => t.id === button.closest('[data-id]').dataset.id);
    if (!topic) return;

    if (button.dataset.action === 'edit') {
      openEditor(topic);
      return;
    }
    if (!confirm(`Excluir o tópico "${topic.titulo}"? Essa ação não pode ser desfeita.`)) return;
    button.disabled = true;
    try {
      await api('treinamentos', 'POST', { acao: 'excluir', id: topic.id });
      message('Tópico excluído.', 'success');
      if (editingId === topic.id) closeEditor();
      await load();
    } catch (err) {
      message('Não foi possível excluir: ' + err.message, 'error');
      button.disabled = false;
    }
  });

  $('newTopic').onclick = () => openEditor();
  $('addVideo').onclick = () => addVideoRow();
  $('cancelTopic').onclick = closeEditor;
  $('search').addEventListener('input', render);

  setHidden('newTopic', !canEdit);
  setHidden('private', false);
  await load();
})();
