const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, statSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const book = require('../site/armamentos-dados.js');

test('relação reproduz as seis linhas do regulamento, sem presumir herança', () => {
  const row = rank => book.filter({ rank }).map(item => item.name).sort();
  assert.deepEqual(row('recruta'), ['LeMat', 'Volcanic', 'Evans'].sort());
  assert.deepEqual(row('oficial-junior'), ['Schofield', 'LeMat', 'Volcanic', 'Evans', 'Springfield'].sort());
  assert.deepEqual(row('oficial'), ['Schofield', 'LeMat', 'Navy', 'M1899', 'Pistola Semiautomática', 'Mauser', 'Evans', 'Henry', 'Cano Duplo', 'Springfield', 'Ferrolho'].sort());
  assert.deepEqual(row('oficial-senior'), ['Schofield', 'LeMat', 'Navy', 'M1899', 'Pistola Semiautomática', 'Mauser', 'Evans', 'Winchester', 'Cano Duplo', 'Escopeta Semiautomática', 'Espingarda Repetidora', 'Springfield', 'Ferrolho'].sort());
  for (const rank of ['sub-xerife', 'xerife']) assert.deepEqual(row(rank), ['Schofield', 'LeMat', 'Navy', 'M1899', 'Pistola Semiautomática', 'Evans', 'Winchester', 'Cano Duplo', 'Escopeta Semiautomática', 'Espingarda Repetidora', 'Springfield', 'Ferrolho'].sort());
  assert.equal(book.allowed('xerife', 'mauser'), false);
  assert.equal(book.allowed('oficial-senior', 'henry'), false);
  assert.equal(book.allowed('oficial', 'volcanic'), false);
  assert.equal(book.allowed('sem-patente', 'lemat'), false);
});

test('busca combina patente, categoria e termos com aliases, sem depender de acentos ou ordem', () => {
  assert.deepEqual(book.filter({ rank: 'oficial', search: 'RIFLE ferrolho' }).map(item => item.id), ['bolt-action']);
  assert.deepEqual(book.filter({ rank: 'oficial', search: 'Litchfield' }).map(item => item.id), ['henry']);
  assert.deepEqual(book.filter({ rank: 'oficial-senior', search: 'lancaster' }).map(item => item.id), ['winchester']);
  assert.equal(book.filter({ rank: 'recruta', category: 'rifle' }).length, 0);
  assert.equal(book.filter({ rank: 'xerife', category: 'pistola', search: 'mauser' }).length, 0);
  assert.equal(book.filter({ rank: 'xerife', category: 'pistola', search: 'mauser', onlyAllowed: false }).length, 1);
  assert.equal(book.filter({ search: '<img onerror=alert(1)>', onlyAllowed: false }).length, 0);
  assert.equal(book.filter({ onlyAllowed: false }).length, 15);
});

test('as quinze armas possuem fotos locais distintas válidas e créditos de origem', () => {
  const hashes = new Set(); let total = 0;
  assert.equal(book.weapons.length, 15);
  assert.equal(new Set(book.weapons.map(item => item.id)).size, 15);
  for (const weapon of book.weapons) {
    const file = resolve(__dirname, '../site', weapon.image), bytes = readFileSync(file);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', weapon.name);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', weapon.name);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    total += statSync(file).size;
    assert.ok(weapon.traits.length >= 3 && weapon.description.length > 60);
    assert.ok(book.categories.some(item => item.id === weapon.category));
    assert.match(weapon.sourceUrl, /^https:\/\/reddead\.fandom\.com\/wiki\/[^/]+$/);
    assert.equal(weapon.imageCredit, 'Red Dead Wiki / Fandom');
  }
  assert.equal(hashes.size, 15);
  assert.ok(total < 5 * 1024 * 1024);
});
