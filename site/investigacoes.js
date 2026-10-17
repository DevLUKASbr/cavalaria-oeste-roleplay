/*
 * Página de Investigações: mapa do Oeste com alvos (pessoas / pontos de interesse) e grupos.
 * Dados via /api/investigacoes. Xerife, Sub-Xerife e Adm leem e editam; Membro não acessa.
 *
 * Mapa: imagens oficiais da Rockstar (mesma fonte do mapa da comunidade jeanropke/RDR2CollectorsMap),
 * em Leaflet com CRS.Simple. Coordenadas do jogo (x, y) ↔ mapa pela mesma fórmula daquele projeto.
 */
(async () => {
  'use strict';
  const { $, esc, setHidden, message, can, requirePage, api } = window.Cavalaria;

  const access = await requirePage('investigacoes');
  if (!access) return;
  const canEdit = can(access, 'investigacoes.editar');

  // ---------------------------------------------------------------------------
  // Mapa
  // ---------------------------------------------------------------------------

  const TILE_URL = 'https://s.rsg.sc/sc/images/games/RDR2/map/game/{z}/{x}/{y}.jpg';
  const MAP_BOUNDS = L.latLngBounds(L.latLng(-144, 0), L.latLng(0, 176));
  const SCALE = 0.01552, LAT0 = -63.6, LNG0 = 111.29;
  const gameToLatLng = ({ x, y }) => L.latLng(SCALE * y + LAT0, SCALE * x + LNG0);
  const latLngToGame = ({ lat, lng }) => ({
    x: Math.round((lng - LNG0) / SCALE),
    y: Math.round((lat - LAT0) / SCALE),
  });

  const THREAT_COLORS = { 'Crítico': '#c0392b', 'Médio': '#e08a1e', 'Baixo': '#2e9e6a' };
  const THREAT_CLASS = { 'Crítico': 'critico', 'Médio': 'medio', 'Baixo': 'baixo' };

  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: 2,
    maxZoom: 7,
    maxBounds: MAP_BOUNDS.pad(0.05),
    attributionControl: false,
  }).setView([-70, 111.75], 3);
  L.tileLayer(TILE_URL, { noWrap: true, bounds: MAP_BOUNDS }).addTo(map);
  const targetLayer = L.layerGroup().addTo(map);
  const groupLayer = L.layerGroup().addTo(map);
  const markers = new Map(); // id → marcador (para "ver no mapa")

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  let targets = [];
  let groups = [];
  let editingTarget = null; // id em edição (null = novo)
  let editingGroup = null;
  let picking = null;       // 't' ou 'g' enquanto escolhe posição no mapa
  let previewMarker = null;

  const groupName = id => groups.find(g => g.id === id)?.nome || '';
  const formatCoords = c => (c ? `(${c.x}, ${c.y})` : '—');
  const photo = (url, cls) => (url
    ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} no-photo',textContent:'👤'}))">`
    : `<span class="${cls} no-photo">${cls === 'popup-photo' ? '' : '👤'}</span>`);

  function filtered() {
    const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
    const threat = $('threatFilter').value;
    const group = $('groupFilter').value;
    return targets.filter(t =>
      (!threat || t.ameaca === threat)
      && (!group || (group === '__none' ? !t.grupo_id : t.grupo_id === group))
      && [t.nome, t.tipo, groupName(t.grupo_id), t.cidade, t.local, t.descricao]
        .join(' ').toLocaleLowerCase('pt-BR').includes(term));
  }

  // ---------------------------------------------------------------------------
  // Renderização: mapa
  // ---------------------------------------------------------------------------

  function targetPopup(t) {
    const actions = canEdit ? `<button class="btn secondary" data-edit-target="${esc(t.id)}">Editar</button>` : '';
    return `<div class="inv-popup">
      ${photo(t.foto, 'popup-photo')}
      <strong>${esc(t.nome)}</strong>
      <span>${esc(t.tipo)}</span>
      ${t.cidade ? `<span>Região: ${esc(t.cidade)}${t.local ? ' · ' + esc(t.local) : ''}</span>` : ''}
      <span class="threat-text ${THREAT_CLASS[t.ameaca]}">Ameaça: ${esc(t.ameaca)}</span>
      ${t.grupo_id ? `<span class="group-text">⌂ Grupo: ${esc(groupName(t.grupo_id))}</span>` : ''}
      <small>Coords: ${formatCoords(t.coords)}</small>
      ${actions}
    </div>`;
  }

  function groupPopup(g) {
    const members = targets.filter(t => t.grupo_id === g.id);
    const actions = canEdit ? `<button class="btn secondary" data-edit-group="${esc(g.id)}">Editar</button>` : '';
    return `<div class="inv-popup">
      <strong>⌂ ${esc(g.nome)}</strong>
      ${g.cidade ? `<span>Região: ${esc(g.cidade)}</span>` : ''}
      <span>${members.length} membro${members.length === 1 ? '' : 's'}${members.length ? ': ' + esc(members.map(m => m.nome).join(', ')) : ''}</span>
      <small>Território: ${formatCoords(g.coords)}</small>
      ${actions}
    </div>`;
  }

  function renderMap() {
    targetLayer.clearLayers();
    groupLayer.clearLayers();
    markers.clear();
    for (const t of filtered()) {
      if (!t.coords) continue;
      const marker = L.circleMarker(gameToLatLng(t.coords), {
        radius: 8, weight: 2, color: '#fff', fillColor: THREAT_COLORS[t.ameaca], fillOpacity: 0.95,
      }).bindPopup(targetPopup(t)).bindTooltip(esc(t.nome), { direction: 'top', offset: [0, -8] });
      marker.addTo(targetLayer);
      markers.set(t.id, marker);
    }
    if ($('showGroups').checked) {
      for (const g of groups) {
        if (!g.coords) continue;
        const marker = L.marker(gameToLatLng(g.coords), {
          icon: L.divIcon({ className: 'group-marker', html: '⌂', iconSize: [30, 30], iconAnchor: [15, 15] }),
        }).bindPopup(groupPopup(g)).bindTooltip(esc(g.nome), { direction: 'top', offset: [0, -14] });
        marker.addTo(groupLayer);
        markers.set(g.id, marker);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Renderização: tabelas
  // ---------------------------------------------------------------------------

  function rowActions(kind, item) {
    const locate = item.coords ? `<button class="btn secondary" data-action="locate" title="Ver no mapa">⌖</button>` : '';
    const edit = canEdit
      ? `<button class="btn secondary" data-action="edit" title="Editar">✎</button>
         <button class="btn danger" data-action="delete" title="Excluir">✕</button>`
      : '';
    return `<div class="row-actions" data-kind="${kind}" data-id="${esc(item.id)}">${locate}${edit}</div>`;
  }

  function renderTables() {
    const shown = filtered();
    $('targetCount').textContent = `${targets.length} alvo${targets.length === 1 ? '' : 's'}`;
    $('targetCounter').textContent = `${shown.length} de ${targets.length}`;
    $('targets').innerHTML = shown.length ? shown.map(t => `<tr>
      <td>${photo(t.foto, 'table-photo')}</td>
      <td class="name"><span class="target-name">${esc(t.nome)}</span><small>${esc(t.tipo)}</small></td>
      <td>${t.grupo_id ? `<span class="group-pill">⌂ ${esc(groupName(t.grupo_id))}</span>` : '—'}</td>
      <td>${esc(t.cidade) || '—'}</td>
      <td>${esc(t.local) || '—'}</td>
      <td><span class="threat ${THREAT_CLASS[t.ameaca]}">${esc(t.ameaca)}</span></td>
      <td class="coords">${formatCoords(t.coords)}</td>
      <td class="desc">${esc(t.descricao)}</td>
      <td>${rowActions('target', t)}</td>
    </tr>`).join('') : `<tr><td colspan="9" class="empty">${targets.length ? 'Nenhum alvo neste filtro.' : 'Nenhum alvo cadastrado ainda.'}</td></tr>`;

    $('groupCounter').textContent = `${groups.length} grupo${groups.length === 1 ? '' : 's'}`;
    $('groups').innerHTML = groups.length ? groups.map(g => {
      const members = targets.filter(t => t.grupo_id === g.id).length;
      return `<tr>
        <td class="name">⌂ ${esc(g.nome)}</td>
        <td>${esc(g.cidade) || '—'}</td>
        <td>${members}</td>
        <td class="coords">${formatCoords(g.coords)}</td>
        <td class="desc">${esc(g.descricao)}</td>
        <td>${rowActions('group', g)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">Nenhum grupo cadastrado ainda.</td></tr>';
  }

  function renderGroupOptions() {
    const current = $('groupFilter').value;
    $('groupFilter').innerHTML = '<option value="">Todos os grupos</option><option value="__none">Sem grupo</option>'
      + groups.map(g => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join('');
    $('groupFilter').value = [...$('groupFilter').options].some(o => o.value === current) ? current : '';
    $('tGrupo').innerHTML = '<option value="">— sem grupo —</option>'
      + groups.map(g => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join('');
  }

  function render() {
    renderMap();
    renderTables();
  }

  async function load() {
    try {
      ({ alvos: targets, grupos: groups } = await api('investigacoes'));
      renderGroupOptions();
      render();
    } catch (e) {
      message('Não foi possível carregar as investigações: ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Marcar posição no mapa
  // ---------------------------------------------------------------------------

  function readCoords(prefix) {
    const x = $(prefix + 'X').value, y = $(prefix + 'Y').value;
    return x === '' && y === '' ? null : { x, y };
  }

  function showPreview(prefix) {
    const c = readCoords(prefix);
    if (previewMarker) previewMarker.remove();
    previewMarker = null;
    if (!c || c.x === '' || c.y === '' || Number.isNaN(Number(c.x)) || Number.isNaN(Number(c.y))) return;
    previewMarker = L.marker(gameToLatLng({ x: Number(c.x), y: Number(c.y) }), {
      icon: L.divIcon({ className: 'preview-marker', html: '⌖', iconSize: [28, 28], iconAnchor: [14, 14] }),
      interactive: false,
    }).addTo(map);
  }

  function startPicking(prefix) {
    picking = prefix;
    setHidden('pickHint', false);
    $('map').classList.add('picking');
    $('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function stopPicking() {
    picking = null;
    setHidden('pickHint', true);
    $('map').classList.remove('picking');
  }

  map.on('click', e => {
    if (!picking) return;
    const { x, y } = latLngToGame(e.latlng);
    $(picking + 'X').value = x;
    $(picking + 'Y').value = y;
    showPreview(picking);
    const editor = picking === 't' ? 'targetEditor' : 'groupEditor';
    stopPicking();
    $(editor).scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  map.on('contextmenu', () => { if (picking) stopPicking(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && picking) stopPicking(); });

  for (const prefix of ['t', 'g']) {
    $(prefix + 'X').addEventListener('input', () => showPreview(prefix));
    $(prefix + 'Y').addEventListener('input', () => showPreview(prefix));
  }
  document.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => startPicking(b.dataset.pick); });
  document.querySelectorAll('[data-clear]').forEach(b => {
    b.onclick = () => {
      $(b.dataset.clear + 'X').value = '';
      $(b.dataset.clear + 'Y').value = '';
      showPreview(b.dataset.clear);
    };
  });

  // ---------------------------------------------------------------------------
  // Editores
  // ---------------------------------------------------------------------------

  function closeEditors() {
    stopPicking();
    if (previewMarker) previewMarker.remove();
    previewMarker = null;
    editingTarget = editingGroup = null;
    $('targetForm').reset();
    $('groupForm').reset();
    setHidden('targetEditor', true);
    setHidden('groupEditor', true);
  }

  function openTarget(t = null) {
    closeEditors();
    map.closePopup();
    editingTarget = t?.id || null;
    $('targetEditorTitle').textContent = t ? `Editar alvo — ${t.nome}` : 'Novo alvo';
    $('tNome').value = t?.nome || '';
    $('tTipo').value = t?.tipo || 'Indivíduo';
    $('tAmeaca').value = t?.ameaca || 'Baixo';
    $('tGrupo').value = t?.grupo_id || '';
    $('tCidade').value = t?.cidade || '';
    $('tLocal').value = t?.local || '';
    $('tFoto').value = t?.foto || '';
    $('tX').value = t?.coords?.x ?? '';
    $('tY').value = t?.coords?.y ?? '';
    $('tDescricao').value = t?.descricao || '';
    setHidden('targetEditor', false);
    showPreview('t');
    $('targetEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('tNome').focus({ preventScroll: true });
  }

  function openGroup(g = null) {
    closeEditors();
    map.closePopup();
    editingGroup = g?.id || null;
    $('groupEditorTitle').textContent = g ? `Editar grupo — ${g.nome}` : 'Novo grupo';
    $('gNome').value = g?.nome || '';
    $('gCidade').value = g?.cidade || '';
    $('gX').value = g?.coords?.x ?? '';
    $('gY').value = g?.coords?.y ?? '';
    $('gDescricao').value = g?.descricao || '';
    setHidden('groupEditor', false);
    showPreview('g');
    $('groupEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('gNome').focus({ preventScroll: true });
  }

  async function submit(button, body, successText) {
    button.disabled = true;
    try {
      await api('investigacoes', 'POST', body);
      message(successText, 'success');
      closeEditors();
      await load();
    } catch (err) {
      message('Não foi possível salvar: ' + err.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  $('targetForm').addEventListener('submit', e => {
    e.preventDefault();
    const alvo = {
      id: editingTarget || undefined,
      nome: $('tNome').value, tipo: $('tTipo').value, ameaca: $('tAmeaca').value,
      grupo_id: $('tGrupo').value || null, cidade: $('tCidade').value, local: $('tLocal').value,
      foto: $('tFoto').value, coords: readCoords('t'), descricao: $('tDescricao').value,
    };
    submit($('saveTarget'), { acao: 'salvar-alvo', alvo }, editingTarget ? 'Alvo atualizado.' : 'Alvo cadastrado.');
  });

  $('groupForm').addEventListener('submit', e => {
    e.preventDefault();
    const grupo = {
      id: editingGroup || undefined,
      nome: $('gNome').value, cidade: $('gCidade').value,
      coords: readCoords('g'), descricao: $('gDescricao').value,
    };
    submit($('saveGroup'), { acao: 'salvar-grupo', grupo }, editingGroup ? 'Grupo atualizado.' : 'Grupo cadastrado.');
  });

  document.querySelectorAll('[data-cancel]').forEach(b => { b.onclick = closeEditors; });

  // ---------------------------------------------------------------------------
  // Ações das tabelas e dos popups
  // ---------------------------------------------------------------------------

  function locate(id) {
    const marker = markers.get(id);
    if (!marker) {
      message('Esse item não está visível no mapa com os filtros atuais.', 'error');
      return;
    }
    map.setView(marker.getLatLng(), 6);
    marker.openPopup();
    $('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function remove(kind, item) {
    const text = kind === 'target'
      ? `Excluir o alvo "${item.nome}"? Essa ação não pode ser desfeita.`
      : `Excluir o grupo "${item.nome}"? Os alvos dele ficam sem grupo. Essa ação não pode ser desfeita.`;
    if (!confirm(text)) return;
    try {
      await api('investigacoes', 'POST', { acao: kind === 'target' ? 'excluir-alvo' : 'excluir-grupo', id: item.id });
      message(kind === 'target' ? 'Alvo excluído.' : 'Grupo excluído.', 'success');
      closeEditors();
      await load();
    } catch (err) {
      message('Não foi possível excluir: ' + err.message, 'error');
    }
  }

  for (const tbody of ['targets', 'groups']) {
    $(tbody).addEventListener('click', e => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      const { kind, id } = button.closest('[data-kind]').dataset;
      const item = (kind === 'target' ? targets : groups).find(x => x.id === id);
      if (!item) return;
      if (button.dataset.action === 'locate') locate(id);
      else if (button.dataset.action === 'edit') (kind === 'target' ? openTarget : openGroup)(item);
      else remove(kind, item);
    });
  }

  $('map').addEventListener('click', e => {
    const t = e.target.closest('[data-edit-target]');
    const g = e.target.closest('[data-edit-group]');
    if (t) openTarget(targets.find(x => x.id === t.dataset.editTarget));
    if (g) openGroup(groups.find(x => x.id === g.dataset.editGroup));
  });

  // ---------------------------------------------------------------------------
  // Filtros e inicialização
  // ---------------------------------------------------------------------------

  $('search').addEventListener('input', render);
  $('threatFilter').addEventListener('change', render);
  $('groupFilter').addEventListener('change', render);
  $('showGroups').addEventListener('change', renderMap);
  $('newTarget').onclick = () => openTarget();
  $('newGroup').onclick = () => openGroup();

  setHidden('newTarget', !canEdit);
  setHidden('newGroup', !canEdit);
  setHidden('private', false);
  map.invalidateSize(); // o mapa nasce dentro de um bloco escondido
  await load();
})();
