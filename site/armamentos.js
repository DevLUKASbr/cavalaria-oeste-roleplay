(async () => {
  'use strict';
  const { $, esc, requirePage, setHidden } = window.Cavalaria;
  const access = await requirePage('armamentos');
  if (!access) return;
  const book = window.CavalariaArmamentos;
  let rankId = 'recruta', category = '', lastDetailButton = null;
  const dialog = $('weaponDialog');
  const badge = rank => {
    const star = '<path d="m50 25 7 18 19 1-15 12 5 19-16-11-16 11 5-19-15-12 19-1Z"/>';
    let mark;
    if (rank.badge === 'sabres') mark = '<path d="m27 30 48 45m-2-45L28 75M22 63l15 15m26-56 15 15M22 37l15-15m26 56 15-15" fill="none" stroke="currentColor" stroke-width="5"/>';
    else if (rank.badge.startsWith('star')) mark = star + (rank.badge === 'star-circle' ? '<circle cx="50" cy="52" r="31" fill="none" stroke="currentColor" stroke-width="3"/>' : '');
    else mark = [0, 1, ...(rank.badge === 'chevrons-3' ? [2] : [])].map((n) => `<path d="m25 ${49 + n * 17} 25-20 25 20v11L50 ${40 + n * 17} 25 ${60 + n * 17}Z"/>`).join('');
    return `<svg viewBox="0 0 100 112" class="rank-insignia" aria-hidden="true"><path class="rank-shield" d="M12 7h76v63c0 16-19 29-38 37C31 99 12 86 12 70Z"/>${mark}</svg>`;
  };
  function render() {
    const rank = book.ranks.find(item => item.id === rankId);
    $('rankChoices').innerHTML = book.ranks.map(item => `<button type="button" data-rank="${item.id}" aria-pressed="${item.id === rankId}">${badge(item)}<span>${esc(item.name)}</span>${item.id === rankId ? '<span class="rank-selected-mark" aria-hidden="true">✓</span>' : ''}</button>`).join('');
    $('selectedRankBadge').innerHTML = badge(rank);
    $('selectedRankName').textContent = rank.name;
    $('allowedCount').textContent = String(rank.weapons.length).padStart(2, '0') + ' / 15';
    $('holsterRule').textContent = rank.holsters;
    $('backRule').textContent = rank.back;
    $('rankNote').textContent = rank.note;
    const onlyAllowed = $('onlyAllowed').checked;
    $('categoryChoices').innerHTML = [{ id: '', name: 'Todos' }, ...book.categories].map(item => {
      const count = book.filter({ rank: rankId, category: item.id, onlyAllowed }).length;
      return `<button type="button" data-category="${item.id}" aria-pressed="${item.id === category}">${esc(item.name)} <span>${count}</span></button>`;
    }).join('');
    const weapons = book.filter({ rank: rankId, category, search: $('weaponSearch').value, onlyAllowed });
    $('arsenalState').textContent = `${weapons.length} ${weapons.length === 1 ? 'armamento' : 'armamentos'} ${onlyAllowed ? (weapons.length === 1 ? 'permitido para' : 'permitidos para') : 'no catálogo · Patente:'} ${rank.name}${category ? ' · ' + book.categories.find(item => item.id === category).name : ''}.`;
    $('clearWeaponFilters').hidden = !category && !$('weaponSearch').value && onlyAllowed;
    $('weaponGrid').innerHTML = weapons.length ? weapons.map(weapon => {
      const permitted = book.allowed(rankId, weapon.id);
      return `<article class="weapon-card ${permitted ? '' : 'weapon-restricted'}"><div class="weapon-image"><span class="weapon-number">Nº ${weapon.number}</span><img src="${weapon.image}" alt="${esc(weapon.name)} no compêndio do jogo" width="960" height="540" loading="lazy"></div><div class="weapon-card-content"><div class="weapon-card-meta"><span>${esc(book.categories.find(item => item.id === weapon.category).singular)}</span><span class="weapon-permission ${permitted ? 'is-permitted' : ''}">${permitted ? '✓ Permitido' : 'Não permitido'}</span></div><h3>${esc(weapon.name)}</h3><p>${esc(weapon.feature)}</p><div class="weapon-card-bottom"><span>${esc(weapon.carry)}</span><button type="button" data-weapon="${weapon.id}" aria-label="Ver ficha de ${esc(weapon.name)}">Ver ficha <span aria-hidden="true">↗</span></button></div></div></article>`;
    }).join('') : '<div class="armory-empty"><span aria-hidden="true">✦</span><h3>Nenhum armamento nesta consulta</h3><p>Altere a busca ou a categoria. Para conhecer as outras armas, desmarque “Mostrar apenas permitidos”.</p><button type="button" data-clear>Limpar filtros</button></div>';
    $('weaponGrid').querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
      image.hidden = true;
      const fallback = document.createElement('p'); fallback.className = 'weapon-image-error'; fallback.textContent = 'Imagem indisponível. Consulte a ficha do armamento.'; image.after(fallback);
    }, { once: true }));
  }
  function openWeapon(id, button) {
    const weapon = book.weapons.find(item => item.id === id);
    if (!weapon) return;
    lastDetailButton = button;
    const rank = book.ranks.find(item => item.id === rankId), permitted = book.allowed(rankId, id);
    $('weaponDetails').innerHTML = `<div class="weapon-detail-photo"><img src="${weapon.image}" width="960" height="540" alt="${esc(weapon.name)} no compêndio do jogo"></div><div class="weapon-detail-copy"><div class="weapon-card-meta"><span>${esc(book.categories.find(item => item.id === weapon.category).singular)} · Nº ${weapon.number}</span><span class="weapon-permission ${permitted ? 'is-permitted' : ''}">${permitted ? '✓ Permitido' : 'Não permitido'} · ${esc(rank.name)}</span></div><h2 id="weaponDialogTitle">${esc(weapon.name)}</h2>${weapon.gameName ? `<p class="weapon-game-name">No jogo: ${esc(weapon.gameName)}</p>` : ''}<p>${esc(weapon.description)}</p><dl class="weapon-specs"><div><dt>Categoria de porte</dt><dd>${esc(weapon.carry)}</dd></div><div><dt>Sistema</dt><dd>${esc(weapon.system)}</dd></div></dl><h3>Características</h3><ul class="weapon-traits">${weapon.traits.map(trait => `<li>${esc(trait)}</li>`).join('')}</ul><h3>Permissão por patente</h3><ul class="weapon-rank-list">${book.ranks.map(item => `<li class="${book.allowed(item.id, id) ? 'is-permitted' : ''}"><span>${esc(item.name)}</span><strong>${book.allowed(item.id, id) ? 'Permitido' : 'Não permitido'}</strong></li>`).join('')}</ul><p class="weapon-detail-rule"><strong>Porte para ${esc(rank.name)}:</strong> ${esc(rank.note)}</p><p class="weapon-source">Referência visual: Rockstar Games / ${esc(weapon.imageCredit)}. <a href="${esc(weapon.sourceUrl)}" target="_blank" rel="noopener noreferrer">Consultar referência da arma ↗</a></p></div>`;
    dialog.showModal(); $('closeWeapon').focus();
  }
  function closeWeapon() { dialog.close(); if (lastDetailButton?.isConnected) lastDetailButton.focus(); }
  function clearFilters() { category = ''; $('weaponSearch').value = ''; $('onlyAllowed').checked = true; render(); }
  $('rankChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-rank]'); if (!button) return;
    rankId = button.dataset.rank; render(); $('rankChoices').querySelector(`[data-rank="${rankId}"]`).focus();
  });
  $('categoryChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-category]'); if (!button) return;
    category = button.dataset.category; render(); $('categoryChoices').querySelector(`[data-category="${category}"]`).focus();
  });
  $('weaponSearch').addEventListener('input', render);
  $('onlyAllowed').addEventListener('change', render);
  $('clearWeaponFilters').onclick = clearFilters;
  $('weaponGrid').addEventListener('click', event => {
    const button = event.target.closest('[data-weapon]'); if (button) openWeapon(button.dataset.weapon, button);
    if (event.target.closest('[data-clear]')) { clearFilters(); $('weaponSearch').focus(); }
  });
  $('closeWeapon').onclick = closeWeapon; $('doneWeapon').onclick = closeWeapon;
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeWeapon(); });
  $('openComparison').addEventListener('click', () => { $('comparison').open = true; });
  $('comparisonBody').innerHTML = book.ranks.map(rank => `<tr><th scope="row">${esc(rank.name)}</th>${book.categories.map(item => `<td>${rank.weapons.map(id => book.weapons.find(weapon => weapon.id === id)).filter(weapon => weapon.category === item.id).map(weapon => esc(weapon.name)).join('<br>') || '<span class="no-weapon">Nenhum</span>'}</td>`).join('')}<td>${esc(rank.note)}</td></tr>`).join('');
  setHidden('private', false); render();
})();
