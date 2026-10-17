/*
 * Página de Investigações, em três abas:
 *   • Mapa e alvos — mapa do Oeste com pessoas sob investigação, pontos de interesse e grupos;
 *   • Pessoas — cadastro de todas as pessoas, investigadas ou não;
 *   • Grupos — bandos/organizações e seus territórios.
 * Uma pessoa vira "alvo" ao ser marcada como sob investigação (com nível de ameaça).
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
  const PERSON_COLOR = '#7d8a94'; // pessoa fora de investigação

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

  let records = [];         // pessoas e pontos de interesse
  let groups = [];
  let editingTarget = null; // id em edição (null = novo)
  let editingGroup = null;
  let picking = null;       // 't' ou 'g' enquanto escolhe posição no mapa
  let previewMarker = null;

  const isPerson = r => r.tipo === 'Indivíduo';
  // Registros antigos (sem o campo) eram todos alvos.
  const isTarget = r => !isPerson(r) || r.investigado !== false;
  const people = () => records.filter(isPerson);
  const findRecord = id => records.find(r => r.id === id);
  const groupName = id => groups.find(g => g.id === id)?.nome || '';
  const formatCoords = c => (c ? `(${c.x}, ${c.y})` : '—');
  const photo = (url, cls) => (url
    ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} no-photo',textContent:'👤'}))">`
    : `<span class="${cls} no-photo">${cls === 'popup-photo' ? '' : '👤'}</span>`);
  const lower = text => text.toLocaleLowerCase('pt-BR');
  const typeLabel = r => (isPerson(r) ? (r.ocupacao || 'Pessoa') : 'Ponto de interesse');

  function filteredTargets() {
    const term = lower($('search').value.trim());
    const threat = $('threatFilter').value;
    const group = $('groupFilter').value;
    return records.filter(r => isTarget(r)
      && (!threat || r.ameaca === threat)
      && (!group || (group === '__none' ? !r.grupo_id : r.grupo_id === group))
      && lower([r.nome, r.ocupacao, groupName(r.grupo_id), r.cidade, r.local, r.descricao].join(' ')).includes(term));
  }

  function filteredPeople() {
    const term = lower($('peopleSearch').value.trim());
    const filter = $('peopleFilter').value;
    return people().filter(p =>
      (!filter || (filter === 'sim') === isTarget(p))
      && lower([p.nome, p.ocupacao, p.local, p.cidade, groupName(p.grupo_id), p.descricao].join(' ')).includes(term));
  }

  // ---------------------------------------------------------------------------
  // Mapa: marcadores e cartões
  // ---------------------------------------------------------------------------

  function recordPopup(r) {
    const actions = canEdit ? `<button class="btn secondary" data-edit-target="${esc(r.id)}">Editar</button>` : '';
    const situation = isTarget(r)
      ? `<span class="threat-text ${THREAT_CLASS[r.ameaca]}">Ameaça: ${esc(r.ameaca)}</span>`
      : '<span class="muted-text">Fora de investigação</span>';
    const place = [r.cidade, r.local].filter(Boolean).map(esc).join(' · ');
    return `<div class="inv-popup">
      ${photo(r.foto, 'popup-photo')}
      <strong>${esc(r.nome)}</strong>
      <span>${esc(typeLabel(r))}</span>
      ${place ? `<span>${place}</span>` : ''}
      ${situation}
      ${r.grupo_id ? `<span class="group-text">⌂ Grupo: ${esc(groupName(r.grupo_id))}</span>` : ''}
      <small>Coords: ${formatCoords(r.coords)}</small>
      ${actions}
    </div>`;
  }

  function groupPopup(g) {
    const members = people().filter(p => p.grupo_id === g.id);
    const actions = canEdit ? `<button class="btn secondary" data-edit-group="${esc(g.id)}">Editar</button>` : '';
    return `<div class="inv-popup">
      <strong>⌂ ${esc(g.nome)}</strong>
      ${g.cidade ? `<span>Região: ${esc(g.cidade)}</span>` : ''}
      <span>${members.length} membro${members.length === 1 ? '' : 's'}${members.length ? ': ' + esc(members.map(m => m.nome).join(', ')) : ''}</span>
      <small>Território: ${formatCoords(g.coords)}</small>
      ${actions}
    </div>`;
  }

  function addRecordMarker(r, color) {
    const marker = L.circleMarker(gameToLatLng(r.coords), {
      radius: isTarget(r) ? 8 : 6, weight: 2, color: '#fff', fillColor: color, fillOpacity: 0.95,
    }).bindPopup(recordPopup(r)).bindTooltip(esc(r.nome), { direction: 'top', offset: [0, -8] });
    marker.addTo(targetLayer);
    markers.set(r.id, marker);
  }

  function renderMap() {
    targetLayer.clearLayers();
    groupLayer.clearLayers();
    markers.clear();
    for (const r of filteredTargets()) if (r.coords) addRecordMarker(r, THREAT_COLORS[r.ameaca]);
    if ($('showPeople').checked) {
      for (const p of people()) if (!isTarget(p) && p.coords) addRecordMarker(p, PERSON_COLOR);
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
  // Tabelas
  // ---------------------------------------------------------------------------

  function rowActions(kind, item, extra = '') {
    const locate = item.coords ? '<button class="btn secondary" data-action="locate" title="Ver no mapa">⌖</button>' : '';
    const edit = canEdit
      ? `${extra}<button class="btn secondary" data-action="edit" title="Editar">✎</button>
         <button class="btn danger" data-action="delete" title="Excluir">✕</button>`
      : '';
    return `<div class="row-actions" data-kind="${kind}" data-id="${esc(item.id)}">${locate}${edit}</div>`;
  }

  const groupCell = r => (r.grupo_id ? `<span class="group-pill">⌂ ${esc(groupName(r.grupo_id))}</span>` : '—');
  const nameCell = r => `<td class="name"><span class="target-name">${esc(r.nome)}</span><small>${esc(typeLabel(r))}</small></td>`;
  const threatBadge = r => `<span class="threat ${THREAT_CLASS[r.ameaca]}">${esc(r.ameaca)}</span>`;

  function renderTargets() {
    const all = records.filter(isTarget);
    const shown = filteredTargets();
    $('targetCount').textContent = `${all.length} alvo${all.length === 1 ? '' : 's'}`;
    $('targetCounter').textContent = `${shown.length} de ${all.length}`;
    $('targets').innerHTML = shown.length ? shown.map(r => `<tr>
      <td>${photo(r.foto, 'table-photo')}</td>
      ${nameCell(r)}
      <td>${groupCell(r)}</td>
      <td>${esc(r.cidade) || '—'}</td>
      <td>${esc(r.local) || '—'}</td>
      <td>${threatBadge(r)}</td>
      <td class="coords">${formatCoords(r.coords)}</td>
      <td class="desc">${esc(r.descricao)}</td>
      <td>${rowActions('record', r)}</td>
    </tr>`).join('') : `<tr><td colspan="9" class="empty">${all.length ? 'Nenhum alvo neste filtro.' : 'Nenhum alvo cadastrado ainda.'}</td></tr>`;
  }

  function renderPeople() {
    const all = people();
    const shown = filteredPeople();
    const investigated = all.filter(isTarget).length;
    $('peopleCount').textContent = `${all.length} pessoa${all.length === 1 ? '' : 's'} · ${investigated} sob investigação`;
    $('peopleCounter').textContent = `${shown.length} de ${all.length}`;
    $('people').innerHTML = shown.length ? shown.map(p => {
      const toggle = isTarget(p)
        ? '<button class="btn secondary" data-action="close-case" title="Encerrar investigação">Encerrar</button>'
        : '<button class="btn secondary" data-action="investigate" title="Colocar sob investigação">Investigar</button>';
      return `<tr>
        <td>${photo(p.foto, 'table-photo')}</td>
        ${nameCell(p)}
        <td>${esc(p.local) || '—'}</td>
        <td>${esc(p.cidade) || '—'}</td>
        <td>${groupCell(p)}</td>
        <td>${isTarget(p) ? `<span class="investigated">Sob investigação</span> ${threatBadge(p)}` : '<span class="muted-text">—</span>'}</td>
        <td class="desc">${esc(p.descricao)}</td>
        <td>${rowActions('record', p, toggle)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="empty">${all.length ? 'Nenhuma pessoa neste filtro.' : 'Nenhuma pessoa cadastrada ainda.'}</td></tr>`;
  }

  function renderGroups() {
    $('groupCount').textContent = `${groups.length} grupo${groups.length === 1 ? '' : 's'}`;
    $('groupCounter').textContent = `${groups.length} grupo${groups.length === 1 ? '' : 's'}`;
    $('groups').innerHTML = groups.length ? groups.map(g => {
      const members = people().filter(p => p.grupo_id === g.id).length;
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
    renderTargets();
    renderPeople();
    renderGroups();
  }

  async function load() {
    try {
      ({ alvos: records, grupos: groups } = await api('investigacoes'));
      renderGroupOptions();
      render();
    } catch (e) {
      message('Não foi possível carregar as investigações: ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Abas
  // ---------------------------------------------------------------------------

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(tab => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    for (const panel of ['mapa', 'pessoas', 'grupos']) setHidden('tab-' + panel, panel !== name);
    if (name === 'mapa') map.invalidateSize();
  }
  document.querySelectorAll('.tab').forEach(tab => { tab.onclick = () => showTab(tab.dataset.tab); });

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
    showTab('mapa');
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

  // Mostra os campos certos para pessoa/ponto de interesse e investigada/não.
  function syncTargetForm() {
    const person = $('tTipo').value === 'Indivíduo';
    document.querySelectorAll('[data-person-only]').forEach(el => el.classList.toggle('hide', !person));
    setHidden('tAmeacaField', person && !$('tInvestigado').checked);
    $('tLocalLabel').textContent = person ? 'Local de trabalho' : 'Local';
  }
  $('tTipo').addEventListener('change', syncTargetForm);
  $('tInvestigado').addEventListener('change', syncTargetForm);

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

  // Sem registro = cadastro novo; investigate define se já nasce (ou passa a ser) alvo.
  function openTarget(record = null, { investigate } = {}) {
    closeEditors();
    map.closePopup();
    editingTarget = record?.id || null;
    const person = record ? isPerson(record) : true;
    const investigated = investigate ?? (record ? isTarget(record) : true);
    $('targetEditorTitle').textContent = record
      ? `Editar — ${record.nome}`
      : (investigated ? 'Novo alvo' : 'Nova pessoa');
    $('tNome').value = record?.nome || '';
    $('tTipo').value = person ? 'Indivíduo' : 'Ponto de interesse';
    $('tOcupacao').value = record?.ocupacao || '';
    $('tInvestigado').checked = investigated;
    $('tAmeaca').value = record?.ameaca || 'Baixo';
    $('tGrupo').value = record?.grupo_id || '';
    $('tCidade').value = record?.cidade || '';
    $('tLocal').value = record?.local || '';
    $('tFoto').value = record?.foto || '';
    $('tX').value = record?.coords?.x ?? '';
    $('tY').value = record?.coords?.y ?? '';
    $('tDescricao').value = record?.descricao || '';
    syncTargetForm();
    setHidden('targetEditor', false);
    showPreview('t');
    $('targetEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    (investigate && record ? $('tAmeaca') : $('tNome')).focus({ preventScroll: true });
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

  async function send(body, successText, button = null) {
    if (button) button.disabled = true;
    try {
      await api('investigacoes', 'POST', body);
      message(successText, 'success');
      closeEditors();
      await load();
      return true;
    } catch (err) {
      message('Não foi possível salvar: ' + err.message, 'error');
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  $('targetForm').addEventListener('submit', e => {
    e.preventDefault();
    const alvo = {
      id: editingTarget || undefined,
      nome: $('tNome').value, tipo: $('tTipo').value, ocupacao: $('tOcupacao').value,
      investigado: $('tInvestigado').checked, ameaca: $('tAmeaca').value,
      grupo_id: $('tGrupo').value || null, cidade: $('tCidade').value, local: $('tLocal').value,
      foto: $('tFoto').value, coords: readCoords('t'), descricao: $('tDescricao').value,
    };
    send({ acao: 'salvar-alvo', alvo }, editingTarget ? 'Cadastro atualizado.' : 'Cadastro salvo.', $('saveTarget'));
  });

  $('groupForm').addEventListener('submit', e => {
    e.preventDefault();
    const grupo = {
      id: editingGroup || undefined,
      nome: $('gNome').value, cidade: $('gCidade').value,
      coords: readCoords('g'), descricao: $('gDescricao').value,
    };
    send({ acao: 'salvar-grupo', grupo }, editingGroup ? 'Grupo atualizado.' : 'Grupo cadastrado.', $('saveGroup'));
  });

  document.querySelectorAll('[data-cancel]').forEach(b => { b.onclick = closeEditors; });

  // ---------------------------------------------------------------------------
  // Ações das tabelas e dos cartões do mapa
  // ---------------------------------------------------------------------------

  function locate(id) {
    showTab('mapa');
    let marker = markers.get(id);
    // Pessoa fora de investigação só aparece com o filtro ligado.
    if (!marker && findRecord(id) && !isTarget(findRecord(id))) {
      $('showPeople').checked = true;
      renderMap();
      marker = markers.get(id);
    }
    if (!marker) {
      message('Esse item não está visível no mapa com os filtros atuais.', 'error');
      return;
    }
    map.setView(marker.getLatLng(), 6);
    marker.openPopup();
    $('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function remove(kind, item) {
    const text = kind === 'record'
      ? `Excluir "${item.nome}" do cadastro? Essa ação não pode ser desfeita.`
      : `Excluir o grupo "${item.nome}"? Os membros dele ficam sem grupo. Essa ação não pode ser desfeita.`;
    if (!confirm(text)) return;
    try {
      await api('investigacoes', 'POST', { acao: kind === 'record' ? 'excluir-alvo' : 'excluir-grupo', id: item.id });
      message(kind === 'record' ? 'Cadastro excluído.' : 'Grupo excluído.', 'success');
      closeEditors();
      await load();
    } catch (err) {
      message('Não foi possível excluir: ' + err.message, 'error');
    }
  }

  async function closeCase(person) {
    if (!confirm(`Encerrar a investigação de ${person.nome}? A pessoa continua no cadastro de Pessoas.`)) return;
    const { id, nome, tipo, ocupacao, grupo_id, cidade, local, foto, coords, descricao } = person;
    await send({
      acao: 'salvar-alvo',
      alvo: { id, nome, tipo, ocupacao, grupo_id, cidade, local, foto, coords, descricao, investigado: false },
    }, `Investigação de ${nome} encerrada.`);
  }

  for (const tbody of ['targets', 'people', 'groups']) {
    $(tbody).addEventListener('click', e => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      const { kind, id } = button.closest('[data-kind]').dataset;
      const item = kind === 'record' ? findRecord(id) : groups.find(g => g.id === id);
      if (!item) return;
      switch (button.dataset.action) {
        case 'locate': locate(id); break;
        case 'edit': (kind === 'record' ? openTarget : openGroup)(item); break;
        case 'investigate': openTarget(item, { investigate: true }); break;
        case 'close-case': closeCase(item); break;
        default: remove(kind, item);
      }
    });
  }

  $('map').addEventListener('click', e => {
    const t = e.target.closest('[data-edit-target]');
    const g = e.target.closest('[data-edit-group]');
    if (t) openTarget(findRecord(t.dataset.editTarget));
    if (g) openGroup(groups.find(x => x.id === g.dataset.editGroup));
  });

  // ---------------------------------------------------------------------------
  // Filtros e inicialização
  // ---------------------------------------------------------------------------

  $('search').addEventListener('input', () => { renderMap(); renderTargets(); });
  $('threatFilter').addEventListener('change', () => { renderMap(); renderTargets(); });
  $('groupFilter').addEventListener('change', () => { renderMap(); renderTargets(); });
  $('peopleSearch').addEventListener('input', renderPeople);
  $('peopleFilter').addEventListener('change', renderPeople);
  $('showPeople').addEventListener('change', renderMap);
  $('showGroups').addEventListener('change', renderMap);
  $('newTarget').onclick = () => openTarget(null, { investigate: true });
  $('newPerson').onclick = () => openTarget(null, { investigate: false });
  $('newGroup').onclick = () => openGroup();

  for (const id of ['newTarget', 'newPerson', 'newGroup']) setHidden(id, !canEdit);
  setHidden('private', false);
  map.invalidateSize(); // o mapa nasce dentro de um bloco escondido
  await load();
})();
