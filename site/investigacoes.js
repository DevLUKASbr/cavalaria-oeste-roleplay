/*
 * Página de Investigações, em quatro abas:
 *   • Mapa e alvos — mapa do Oeste com alvos (pessoas e lugares sob investigação), lugares e grupos;
 *   • Pessoas — grafo de vínculos, lista de vínculos e cadastro de pessoas (investigadas ou não);
 *   • Lugares — lojas, saloons, bancos, esconderijos… (investigados ou não);
 *   • Grupos — bandos/organizações e seus territórios.
 * Pessoa ou lugar vira "alvo" ao ser marcado como sob investigação (com nível de ameaça).
 * Dados via /api/investigacoes. Xerife, Sub-Xerife e Adm leem e editam; Membro não acessa.
 *
 * Mapa: imagens oficiais da Rockstar (mesma fonte do mapa da comunidade jeanropke/RDR2CollectorsMap),
 * em Leaflet com CRS.Simple. Grafo: vis-network. As duas bibliotecas ficam em site/vendor/.
 */
(async () => {
  'use strict';
  const { $, esc, setHidden, message, can, requirePage, api } = window.Cavalaria;

  const access = await requirePage('investigacoes');
  if (!access) return;
  const canEdit = can(access, 'investigacoes.editar');

  // ---------------------------------------------------------------------------
  // Tabelas de referência
  // ---------------------------------------------------------------------------

  const THREAT_COLORS = { 'Crítico': '#c0392b', 'Médio': '#e08a1e', 'Baixo': '#2e9e6a' };
  const THREAT_CLASS = { 'Crítico': 'critico', 'Médio': 'medio', 'Baixo': 'baixo' };
  const PERSON_COLOR = '#7d8a94'; // pessoa fora de investigação

  const CATEGORIES = {
    'Loja': '🏪', 'Saloon': '🍺', 'Banco': '🏦', 'Fazenda': '🌾',
    'Estábulo': '🐎', 'Hotel': '🛏️', 'Hospital': '🏥', 'Reserva Indígena': '🪶',
    'Esconderijo': '⛺', 'Outro': '📍',
  };

  // dir: o vínculo tem sentido ("de" → "para"); leader: peso extra no grafo para quem está em "de".
  const LINK_TYPES = {
    'Líder/Chefe': { group: 'Hierarquia', color: '#e08a1e', dir: true, leader: 12, hint: 'De = quem comanda · Para = quem é comandado.' },
    'Sublíder': { group: 'Hierarquia', color: '#f0b44c', dir: true, leader: 6, hint: 'De = o sublíder · Para = quem ele comanda.' },
    'Casal/Romance': { group: 'Pessoais', color: '#e0507a' },
    'Família': { group: 'Pessoais', color: '#b0609b' },
    'Sócio/Parceiro': { group: 'Negócios', color: '#3c8dbc' },
    'Funcionário de': { group: 'Negócios', color: '#5aa0c8', dir: true, hint: 'De = o funcionário · Para = o patrão.' },
    'Amizade': { group: 'Relações', color: '#2e9e6a' },
    'Rival/Inimigo': { group: 'Relações', color: '#c0392b' },
  };

  // ---------------------------------------------------------------------------
  // Mapa
  // ---------------------------------------------------------------------------

  const TILE_URL = 'https://s.rsg.sc/sc/images/games/RDR2/map/game/{z}/{x}/{y}.jpg';
  const MAP_BOUNDS = L.latLngBounds(L.latLng(-144, 0), L.latLng(0, 176));
  const SCALE = 0.01552, LAT0 = -63.6, LNG0 = 111.29;
  const gameToLatLng = ({ x, y }) => L.latLng(SCALE * Number(y) + LAT0, SCALE * Number(x) + LNG0);
  const latLngToGame = ({ lat, lng }) => ({
    x: Math.round((lng - LNG0) / SCALE),
    y: Math.round((lat - LAT0) / SCALE),
  });

  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: 2,
    maxZoom: 7,
    maxBounds: MAP_BOUNDS.pad(0.05),
    attributionControl: false,
  }).setView([-70, 111.75], 3);
  L.tileLayer(TILE_URL, { noWrap: true, bounds: MAP_BOUNDS }).addTo(map);
  const recordLayer = L.layerGroup().addTo(map);
  const groupLayer = L.layerGroup().addTo(map);
  const markers = new Map(); // id → marcador (para "ver no mapa")

  // ---------------------------------------------------------------------------
  // Estado e utilidades
  // ---------------------------------------------------------------------------

  let records = [];         // pessoas e lugares
  let groups = [];
  let links = [];           // vínculos entre pessoas
  let editingTarget = null; // id em edição (null = novo)
  let editingGroup = null;
  let editingLink = null;
  let picking = null;       // 't' ou 'g' enquanto escolhe posição no mapa
  let previewMarker = null;
  let network = null;       // grafo (criado quando a aba Pessoas abre)

  const isPerson = r => r.tipo === 'Indivíduo';
  const isPlace = r => !isPerson(r);
  // Registros antigos (sem o campo) eram todos alvos.
  const isTarget = r => r.investigado !== false;
  const people = () => records.filter(isPerson);
  const places = () => records.filter(isPlace);
  const findRecord = id => records.find(r => r.id === id);
  const groupName = id => groups.find(g => g.id === id)?.nome || '';
  const placeName = id => findRecord(id)?.nome || '';
  const categoryOf = r => (CATEGORIES[r.categoria] ? r.categoria : 'Outro');
  const icon = r => CATEGORIES[categoryOf(r)];
  const formatCoords = c => (c ? `(${c.x}, ${c.y})` : '—');
  const lower = text => String(text ?? '').toLocaleLowerCase('pt-BR');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const typeLabel = r => (isPerson(r) ? (r.ocupacao || 'Pessoa') : `${icon(r)} ${categoryOf(r)}`);
  const photo = (url, cls) => (url
    ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} no-photo',textContent:'👤'}))">`
    : `<span class="${cls} no-photo">${cls === 'popup-photo' ? '' : '👤'}</span>`);
  const avatar = (r, cls) => (isPlace(r) && !r.foto ? `<span class="${cls} no-photo">${icon(r)}</span>` : photo(r.foto, cls));
  const workLabel = p => [p.local_id ? placeName(p.local_id) : '', p.local].filter(Boolean).join(' · ');

  function filteredTargets() {
    const term = lower($('search').value.trim());
    const threat = $('threatFilter').value;
    const group = $('groupFilter').value;
    return records.filter(r => isTarget(r)
      && (!threat || r.ameaca === threat)
      && (!group || (group === '__none' ? !r.grupo_id : r.grupo_id === group))
      && lower([r.nome, r.ocupacao, r.categoria, groupName(r.grupo_id), r.cidade, r.local, workLabel(r), r.descricao].join(' ')).includes(term));
  }

  function filteredPeople() {
    const term = lower($('peopleSearch').value.trim());
    const filter = $('peopleFilter').value;
    return people().filter(p =>
      (!filter || (filter === 'sim') === isTarget(p))
      && lower([p.nome, p.ocupacao, workLabel(p), p.cidade, groupName(p.grupo_id), p.descricao].join(' ')).includes(term));
  }

  function filteredPlaces() {
    const term = lower($('placeSearch').value.trim());
    const category = $('placeFilter').value;
    return places().filter(p =>
      (!category || categoryOf(p) === category)
      && lower([p.nome, p.categoria, p.cidade, p.local, groupName(p.grupo_id), p.descricao].join(' ')).includes(term));
  }

  // ---------------------------------------------------------------------------
  // Mapa: marcadores e cartões
  // ---------------------------------------------------------------------------

  function recordPopup(r) {
    const actions = canEdit ? `<button class="btn secondary" data-edit-target="${esc(r.id)}">Editar</button>` : '';
    const situation = isTarget(r)
      ? `<span class="threat-text ${THREAT_CLASS[r.ameaca]}">Ameaça: ${esc(r.ameaca)}</span>`
      : '<span class="muted-text">Fora de investigação</span>';
    const place = [r.cidade, isPerson(r) ? workLabel(r) : r.local].filter(Boolean).map(esc).join(' · ');
    const workers = isPlace(r) ? people().filter(p => p.local_id === r.id).map(p => p.nome) : [];
    return `<div class="inv-popup">
      ${isPlace(r) && !r.foto ? `<span class="popup-icon">${icon(r)}</span>` : photo(r.foto, 'popup-photo')}
      <strong>${esc(r.nome)}</strong>
      <span>${esc(typeLabel(r))}</span>
      ${place ? `<span>${place}</span>` : ''}
      ${workers.length ? `<span>Trabalham aqui: ${esc(workers.join(', '))}</span>` : ''}
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
      <span>${plural(members.length, 'membro', 'membros')}${members.length ? ': ' + esc(members.map(m => m.nome).join(', ')) : ''}</span>
      <small>Território: ${formatCoords(g.coords)}</small>
      ${actions}
    </div>`;
  }

  function addMarker(r) {
    const target = isTarget(r);
    let marker;
    if (isPlace(r)) {
      const border = target ? THREAT_CLASS[r.ameaca] : 'neutro';
      marker = L.marker(gameToLatLng(r.coords), {
        icon: L.divIcon({ className: `place-marker ${border}`, html: icon(r), iconSize: [30, 30], iconAnchor: [15, 15] }),
      });
    } else {
      marker = L.circleMarker(gameToLatLng(r.coords), {
        radius: target ? 8 : 6, weight: 2, color: '#fff',
        fillColor: target ? THREAT_COLORS[r.ameaca] : PERSON_COLOR, fillOpacity: 0.95,
      });
    }
    marker.bindPopup(recordPopup(r)).bindTooltip(esc(r.nome), { direction: 'top', offset: [0, -10] }).addTo(recordLayer);
    markers.set(r.id, marker);
  }

  function renderMap() {
    recordLayer.clearLayers();
    groupLayer.clearLayers();
    markers.clear();
    const shown = new Set(filteredTargets().map(r => r.id));
    for (const r of records) {
      if (!r.coords) continue;
      const visible = shown.has(r.id)
        || (!isTarget(r) && isPlace(r) && $('showPlaces').checked)
        || (!isTarget(r) && isPerson(r) && $('showPeople').checked);
      if (visible) addMarker(r);
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

  const caseToggle = r => (!canEdit ? '' : isTarget(r)
    ? '<button class="btn secondary" data-action="close-case" title="Encerrar investigação">Encerrar</button>'
    : '<button class="btn secondary" data-action="investigate" title="Colocar sob investigação">Investigar</button>');
  const groupCell = r => (r.grupo_id ? `<span class="group-pill">⌂ ${esc(groupName(r.grupo_id))}</span>` : '—');
  const nameCell = r => `<td class="name"><span class="target-name">${esc(r.nome)}</span><small>${esc(typeLabel(r))}</small></td>`;
  const threatBadge = r => `<span class="threat ${THREAT_CLASS[r.ameaca]}">${esc(r.ameaca)}</span>`;
  const situationCell = r => (isTarget(r) ? `<span class="investigated">Sob investigação</span> ${threatBadge(r)}` : '<span class="muted-text">—</span>');

  function renderTargets() {
    const all = records.filter(isTarget);
    const shown = filteredTargets();
    $('targetCount').textContent = plural(all.length, 'alvo', 'alvos');
    $('targetCounter').textContent = `${shown.length} de ${all.length}`;
    $('targets').innerHTML = shown.length ? shown.map(r => `<tr>
      <td>${avatar(r, 'table-photo')}</td>
      ${nameCell(r)}
      <td>${groupCell(r)}</td>
      <td>${esc(r.cidade) || '—'}</td>
      <td>${esc(isPerson(r) ? workLabel(r) : r.local) || '—'}</td>
      <td>${threatBadge(r)}</td>
      <td class="coords">${formatCoords(r.coords)}</td>
      <td class="desc">${esc(r.descricao)}</td>
      <td>${rowActions('record', r)}</td>
    </tr>`).join('') : `<tr><td colspan="9" class="empty">${all.length ? 'Nenhum alvo neste filtro.' : 'Nenhum alvo cadastrado ainda.'}</td></tr>`;
  }

  function renderPeople() {
    const all = people();
    const shown = filteredPeople();
    $('peopleCount').textContent = `${plural(all.length, 'pessoa', 'pessoas')} · ${all.filter(isTarget).length} sob investigação`;
    $('peopleCounter').textContent = `${shown.length} de ${all.length}`;
    $('people').innerHTML = shown.length ? shown.map(p => `<tr>
      <td>${photo(p.foto, 'table-photo')}</td>
      ${nameCell(p)}
      <td>${esc(workLabel(p)) || '—'}</td>
      <td>${esc(p.cidade) || '—'}</td>
      <td>${groupCell(p)}</td>
      <td>${situationCell(p)}</td>
      <td class="desc">${esc(p.descricao)}</td>
      <td>${rowActions('record', p, caseToggle(p))}</td>
    </tr>`).join('') : `<tr><td colspan="8" class="empty">${all.length ? 'Nenhuma pessoa neste filtro.' : 'Nenhuma pessoa cadastrada ainda.'}</td></tr>`;
  }

  function renderPlaces() {
    const all = places();
    const shown = filteredPlaces();
    $('placeCount').textContent = plural(all.length, 'lugar', 'lugares');
    $('placeCounter').textContent = `${shown.length} de ${all.length}`;
    $('places').innerHTML = shown.length ? shown.map(p => {
      const workers = people().filter(w => w.local_id === p.id).map(w => w.nome);
      return `<tr>
        <td>${avatar(p, 'table-photo')}</td>
        ${nameCell(p)}
        <td>${esc(p.cidade) || '—'}</td>
        <td>${esc(p.local) || '—'}</td>
        <td class="desc">${esc(workers.join(', ')) || '—'}</td>
        <td>${situationCell(p)}</td>
        <td class="coords">${formatCoords(p.coords)}</td>
        <td>${rowActions('record', p, caseToggle(p))}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="empty">${all.length ? 'Nenhum lugar neste filtro.' : 'Nenhum lugar cadastrado ainda.'}</td></tr>`;
  }

  function renderGroups() {
    $('groupCount').textContent = plural(groups.length, 'grupo', 'grupos');
    $('groupCounter').textContent = plural(groups.length, 'grupo', 'grupos');
    $('groups').innerHTML = groups.length ? groups.map(g => `<tr>
      <td class="name">⌂ ${esc(g.nome)}</td>
      <td>${esc(g.cidade) || '—'}</td>
      <td>${people().filter(p => p.grupo_id === g.id).length}</td>
      <td class="coords">${formatCoords(g.coords)}</td>
      <td class="desc">${esc(g.descricao)}</td>
      <td>${rowActions('group', g)}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">Nenhum grupo cadastrado ainda.</td></tr>';
  }

  function renderLinks() {
    const valid = links.filter(l => findRecord(l.de) && findRecord(l.para));
    $('linkCounter').textContent = plural(valid.length, 'vínculo', 'vínculos');
    $('links').innerHTML = valid.length ? valid.map(l => {
      const type = LINK_TYPES[l.tipo] || {};
      const edit = canEdit
        ? `<button class="btn secondary" data-action="edit" title="Editar">✎</button>
           <button class="btn danger" data-action="delete" title="Excluir">✕</button>`
        : '';
      return `<tr>
        <td class="name">${esc(placeName(l.de))}</td>
        <td><span class="link-pill" style="border-color:${type.color};color:${type.color}">${esc(l.tipo)}${type.dir ? ' →' : ''}</span></td>
        <td class="name">${esc(placeName(l.para))}</td>
        <td class="desc">${esc(l.obs) || '—'}</td>
        <td><div class="row-actions" data-kind="link" data-id="${esc(l.id)}">${edit}</div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="empty">Nenhum vínculo cadastrado ainda.${canEdit ? ' Use "Novo vínculo" para ligar duas pessoas.' : ''}</td></tr>`;
  }

  function renderSelects() {
    const options = (items, empty) => `<option value="">${empty}</option>`
      + items.map(i => `<option value="${esc(i.id)}">${esc(i.nome)}</option>`).join('');
    const keep = (id, html) => {
      const value = $(id).value;
      $(id).innerHTML = html;
      $(id).value = [...$(id).options].some(o => o.value === value) ? value : '';
    };
    keep('groupFilter', '<option value="">Todos os grupos</option><option value="__none">Sem grupo</option>'
      + groups.map(g => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join(''));
    keep('tGrupo', options(groups, '— sem grupo —'));
    keep('tLocalId', options(places(), '— nenhum lugar —'));
    keep('lDe', options(people(), '— escolha —'));
    keep('lPara', options(people(), '— escolha —'));
  }

  // ---------------------------------------------------------------------------
  // Grafo (vis-network)
  // ---------------------------------------------------------------------------

  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#3a4a40"/>'
    + '<circle cx="32" cy="24" r="12" fill="#c9b88f"/><path d="M10 60c4-14 14-20 22-20s18 6 22 20" fill="#c9b88f"/></svg>');

  function graphData() {
    const withGroups = $('graphGroups').checked;
    const withPlaces = $('graphPlaces').checked;
    const validLinks = links.filter(l => isPerson(findRecord(l.de) || {}) && isPerson(findRecord(l.para) || {}));
    const degree = new Map();
    const bonus = new Map();
    for (const l of validLinks) {
      degree.set(l.de, (degree.get(l.de) || 0) + 1);
      degree.set(l.para, (degree.get(l.para) || 0) + 1);
      const leader = LINK_TYPES[l.tipo]?.leader || 0;
      bonus.set(l.de, Math.max(bonus.get(l.de) || 0, leader));
    }

    const nodes = people().map(p => {
      const d = degree.get(p.id) || 0;
      const border = isTarget(p) ? THREAT_COLORS[p.ameaca] : '#9aa6ae';
      return {
        id: 'r:' + p.id,
        label: d ? `${p.nome} [${d}]` : p.nome,
        title: [p.nome, p.ocupacao, groupName(p.grupo_id) && `Grupo: ${groupName(p.grupo_id)}`,
          isTarget(p) ? `Sob investigação · ${p.ameaca}` : 'Fora de investigação'].filter(Boolean).join('\n'),
        shape: p.foto ? 'circularImage' : 'dot',
        image: p.foto || undefined,
        brokenImage: PLACEHOLDER,
        size: 14 + 3 * d + (bonus.get(p.id) || 0),
        borderWidth: 3,
        color: { border, background: '#3a4a40', highlight: { border: '#f6e6c4', background: '#3a4a40' } },
        font: { color: '#f2e6cc', size: 14, strokeWidth: 3, strokeColor: '#101512' },
      };
    });
    const edges = validLinks.map(l => {
      const type = LINK_TYPES[l.tipo] || { color: '#bbb' };
      return {
        id: 'v:' + l.id,
        from: 'r:' + l.de,
        to: 'r:' + l.para,
        label: l.tipo,
        title: l.obs || l.tipo,
        arrows: type.dir ? 'to' : '',
        color: { color: type.color, highlight: type.color },
        width: type.dir ? 2.5 : 1.8,
        font: { color: type.color, size: 10, strokeWidth: 2, strokeColor: '#101512', align: 'middle' },
      };
    });

    if (withGroups) {
      for (const g of groups) {
        nodes.push({ id: 'g:' + g.id, label: `⌂ ${g.nome}`, title: `Grupo: ${g.nome}`, shape: 'box',
          color: { background: '#263b2c', border: '#b78a3c' }, font: { color: '#f6e6c4', size: 14 }, margin: 8 });
      }
      for (const r of records) {
        if (r.grupo_id && groups.some(g => g.id === r.grupo_id) && (isPerson(r) || withPlaces)) {
          edges.push({ from: 'r:' + r.id, to: 'g:' + r.grupo_id, dashes: true, label: 'membro',
            color: { color: '#6f8f7a' }, width: 1, font: { color: '#8fae99', size: 9, strokeWidth: 0 } });
        }
      }
    }
    if (withPlaces) {
      for (const p of places()) {
        nodes.push({ id: 'r:' + p.id, label: `${icon(p)} ${p.nome}`, title: `${categoryOf(p)}: ${p.nome}`, shape: 'box',
          color: { background: '#4a3b26', border: isTarget(p) ? THREAT_COLORS[p.ameaca] : '#b78a3c' },
          font: { color: '#f6e6c4', size: 13 }, margin: 7 });
      }
      for (const p of people()) {
        if (p.local_id && findRecord(p.local_id)) {
          edges.push({ from: 'r:' + p.id, to: 'r:' + p.local_id, dashes: [4, 4], label: 'trabalha em',
            color: { color: '#a8875a' }, width: 1, font: { color: '#c9a876', size: 9, strokeWidth: 0 } });
        }
      }
    }
    return { nodes, edges, linkCount: validLinks.length };
  }

  function renderGraph() {
    const { nodes, edges, linkCount } = graphData();
    $('graphSummary').textContent = `${plural(people().length, 'pessoa', 'pessoas')} · ${plural(linkCount, 'vínculo', 'vínculos')}`
      + ($('graphGroups').checked ? ` · ${plural(groups.length, 'grupo', 'grupos')}` : '')
      + ($('graphPlaces').checked ? ` · ${plural(places().length, 'lugar', 'lugares')}` : '');
    if (!network) return; // o grafo nasce quando a aba Pessoas é aberta
    network.setData({ nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) });
  }

  function ensureGraph() {
    if (network || typeof vis === 'undefined') return;
    network = new vis.Network($('graph'), { nodes: [], edges: [] }, {
      autoResize: true,
      layout: { improvedLayout: true },
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -60, springLength: 130, springConstant: 0.05, avoidOverlap: 0.6 },
        stabilization: { iterations: 250 },
      },
      edges: { smooth: { type: 'dynamic' }, selectionWidth: 2 },
      interaction: { hover: true, navigationButtons: true, keyboard: false, tooltipDelay: 150 },
    });
    network.on('doubleClick', e => {
      const id = e.nodes[0];
      if (!id || !canEdit) return;
      const [kind, key] = id.split(':');
      if (kind === 'g') openGroup(groups.find(g => g.id === key));
      else if (findRecord(key)) openTarget(findRecord(key));
    });
    renderGraph();
  }

  // ---------------------------------------------------------------------------
  // Carregamento
  // ---------------------------------------------------------------------------

  function render() {
    renderSelects();
    renderMap();
    renderTargets();
    renderPeople();
    renderPlaces();
    renderGroups();
    renderLinks();
    renderGraph();
  }

  async function load() {
    try {
      ({ alvos: records, grupos: groups, vinculos: links = [] } = await api('investigacoes'));
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
    for (const panel of ['mapa', 'pessoas', 'lugares', 'grupos']) setHidden('tab-' + panel, panel !== name);
    if (name === 'mapa') map.invalidateSize();
    if (name === 'pessoas') {
      ensureGraph();
      network?.redraw();
      network?.fit();
    }
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
    previewMarker = L.marker(gameToLatLng(c), {
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

  $('tCategoria').innerHTML = Object.entries(CATEGORIES).map(([c, i]) => `<option value="${c}">${i} ${c}</option>`).join('');
  $('placeFilter').innerHTML = '<option value="">Todas as categorias</option>'
    + Object.entries(CATEGORIES).map(([c, i]) => `<option value="${c}">${i} ${c}</option>`).join('');
  $('lTipo').innerHTML = [...new Set(Object.values(LINK_TYPES).map(t => t.group))].map(group =>
    `<optgroup label="${group}">${Object.entries(LINK_TYPES).filter(([, t]) => t.group === group)
      .map(([name, t]) => `<option value="${name}">${name}${t.dir ? ' →' : ''}</option>`).join('')}</optgroup>`).join('');

  // Mostra os campos certos para pessoa/lugar e investigado/não.
  function syncTargetForm() {
    const person = $('tTipo').value === 'Indivíduo';
    document.querySelectorAll('[data-person-only]').forEach(el => el.classList.toggle('hide', !person));
    document.querySelectorAll('[data-place-only]').forEach(el => el.classList.toggle('hide', person));
    setHidden('tAmeacaField', !$('tInvestigado').checked);
    $('tLocalLabel').textContent = person ? 'Local (texto livre)' : 'Endereço / referência';
  }
  $('tTipo').addEventListener('change', syncTargetForm);
  $('tInvestigado').addEventListener('change', syncTargetForm);

  function syncLinkHint() {
    $('lHint').textContent = LINK_TYPES[$('lTipo').value]?.hint || 'Vínculo sem direção: a ordem das pessoas não importa.';
  }
  $('lTipo').addEventListener('change', syncLinkHint);

  function closeEditors() {
    stopPicking();
    if (previewMarker) previewMarker.remove();
    previewMarker = null;
    editingTarget = editingGroup = editingLink = null;
    for (const form of ['targetForm', 'groupForm', 'linkForm']) $(form).reset();
    for (const editor of ['targetEditor', 'groupEditor', 'linkEditor']) setHidden(editor, true);
  }

  // Sem registro = cadastro novo. kind: 'pessoa' ou 'lugar'; investigate: já nasce (ou passa a ser) alvo.
  function openTarget(record = null, { kind, investigate } = {}) {
    closeEditors();
    map.closePopup();
    editingTarget = record?.id || null;
    const person = record ? isPerson(record) : kind !== 'lugar';
    const investigated = investigate ?? (record ? isTarget(record) : true);
    $('targetEditorTitle').textContent = record
      ? `Editar — ${record.nome}`
      : (person ? (investigated ? 'Novo alvo' : 'Nova pessoa') : 'Novo lugar');
    $('tNome').value = record?.nome || '';
    $('tTipo').value = person ? 'Indivíduo' : 'Ponto de interesse';
    $('tOcupacao').value = record?.ocupacao || '';
    $('tCategoria').value = record ? categoryOf(record) : 'Loja';
    $('tInvestigado').checked = investigated;
    $('tAmeaca').value = record?.ameaca || 'Baixo';
    $('tGrupo').value = record?.grupo_id || '';
    $('tLocalId').value = record?.local_id || '';
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

  function openLink(l = null) {
    if (people().length < 2) {
      message('Cadastre pelo menos duas pessoas antes de criar um vínculo.', 'error');
      return;
    }
    closeEditors();
    editingLink = l?.id || null;
    $('linkEditorTitle').textContent = l ? 'Editar vínculo' : 'Novo vínculo';
    $('lDe').value = l?.de || '';
    $('lPara').value = l?.para || '';
    $('lTipo').value = l?.tipo || 'Líder/Chefe';
    $('lObs').value = l?.obs || '';
    syncLinkHint();
    setHidden('linkEditor', false);
    $('linkEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('lDe').focus({ preventScroll: true });
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
      nome: $('tNome').value, tipo: $('tTipo').value, ocupacao: $('tOcupacao').value, categoria: $('tCategoria').value,
      investigado: $('tInvestigado').checked, ameaca: $('tAmeaca').value,
      grupo_id: $('tGrupo').value || null, local_id: $('tLocalId').value || null,
      cidade: $('tCidade').value, local: $('tLocal').value,
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

  $('linkForm').addEventListener('submit', e => {
    e.preventDefault();
    if ($('lDe').value === $('lPara').value) {
      message('Escolha duas pessoas diferentes para o vínculo.', 'error');
      return;
    }
    const vinculo = {
      id: editingLink || undefined,
      de: $('lDe').value, para: $('lPara').value, tipo: $('lTipo').value, obs: $('lObs').value,
    };
    send({ acao: 'salvar-vinculo', vinculo }, editingLink ? 'Vínculo atualizado.' : 'Vínculo criado.', $('saveLink'));
  });

  document.querySelectorAll('[data-cancel]').forEach(b => { b.onclick = closeEditors; });

  // ---------------------------------------------------------------------------
  // Ações das tabelas e dos cartões do mapa
  // ---------------------------------------------------------------------------

  function locate(id) {
    showTab('mapa');
    let marker = markers.get(id);
    // Pessoa ou lugar fora de investigação só aparece com o filtro correspondente ligado.
    const r = findRecord(id);
    if (!marker && r && !isTarget(r)) {
      $(isPerson(r) ? 'showPeople' : 'showPlaces').checked = true;
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
    const texts = {
      record: isPerson(item)
        ? `Excluir "${item.nome}" do cadastro? Os vínculos dessa pessoa também serão apagados. Essa ação não pode ser desfeita.`
        : `Excluir o lugar "${item.nome}"? Quem trabalhava nele fica sem lugar de trabalho. Essa ação não pode ser desfeita.`,
      group: `Excluir o grupo "${item.nome}"? Os membros dele ficam sem grupo. Essa ação não pode ser desfeita.`,
      link: 'Excluir este vínculo? Essa ação não pode ser desfeita.',
    };
    if (!confirm(texts[kind])) return;
    const acao = { record: 'excluir-alvo', group: 'excluir-grupo', link: 'excluir-vinculo' }[kind];
    try {
      await api('investigacoes', 'POST', { acao, id: item.id });
      message({ record: 'Cadastro excluído.', group: 'Grupo excluído.', link: 'Vínculo excluído.' }[kind], 'success');
      closeEditors();
      await load();
    } catch (err) {
      message('Não foi possível excluir: ' + err.message, 'error');
    }
  }

  async function closeCase(record) {
    if (!confirm(`Encerrar a investigação de ${record.nome}? O cadastro continua salvo.`)) return;
    const { id, nome, tipo, ocupacao, categoria, grupo_id, local_id, cidade, local, foto, coords, descricao } = record;
    await send({
      acao: 'salvar-alvo',
      alvo: { id, nome, tipo, ocupacao, categoria, grupo_id, local_id, cidade, local, foto, coords, descricao, investigado: false },
    }, `Investigação de ${nome} encerrada.`);
  }

  for (const tbody of ['targets', 'people', 'places', 'groups', 'links']) {
    $(tbody).addEventListener('click', e => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      const { kind, id } = button.closest('[data-kind]').dataset;
      const item = { record: findRecord(id), group: groups.find(g => g.id === id), link: links.find(l => l.id === id) }[kind];
      if (!item) return;
      switch (button.dataset.action) {
        case 'locate': locate(id); break;
        case 'edit': ({ record: openTarget, group: openGroup, link: openLink })[kind](item); break;
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

  const refreshTargets = () => { renderMap(); renderTargets(); };
  $('search').addEventListener('input', refreshTargets);
  $('threatFilter').addEventListener('change', refreshTargets);
  $('groupFilter').addEventListener('change', refreshTargets);
  $('peopleSearch').addEventListener('input', renderPeople);
  $('peopleFilter').addEventListener('change', renderPeople);
  $('placeSearch').addEventListener('input', renderPlaces);
  $('placeFilter').addEventListener('change', renderPlaces);
  for (const id of ['showPlaces', 'showPeople', 'showGroups']) $(id).addEventListener('change', renderMap);
  for (const id of ['graphGroups', 'graphPlaces']) $(id).addEventListener('change', renderGraph);
  $('graphFit').onclick = () => network?.fit({ animation: true });
  $('newTarget').onclick = () => openTarget(null, { kind: 'pessoa', investigate: true });
  $('newPerson').onclick = () => openTarget(null, { kind: 'pessoa', investigate: false });
  $('newPlace').onclick = () => openTarget(null, { kind: 'lugar', investigate: false });
  $('newGroup').onclick = () => openGroup();
  $('newLink').onclick = () => openLink();

  for (const id of ['newTarget', 'newPerson', 'newPlace', 'newGroup', 'newLink']) setHidden(id, !canEdit);
  setHidden('private', false);
  map.invalidateSize(); // o mapa nasce dentro de um bloco escondido
  await load();
})();
