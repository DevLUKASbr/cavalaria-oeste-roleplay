const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { prepare } = require('./fixtures.cjs');
const helpers = require('../../site/acoes-dados.js');
const today = helpers.dayKey();

test('roster mantém todos os oficiais e atualiza presença sem perder seleção ou foco', async ({ page }) => {
  await page.clock.install();
  const settings = { cargo: 'Membro', onlineIds: ['test-official'] };
  const { calls } = await prepare(page, settings);
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
  const morgan = page.locator('.officer-option').filter({ has: page.getByRole('checkbox', { name: 'Morgan West', exact: true }) });
  const john = page.locator('.officer-option').filter({ has: page.getByRole('checkbox', { name: 'John Carter', exact: true }) });
  await expect(morgan).toContainText('Online no painel');
  await expect(john).toContainText('Offline');
  await page.getByRole('checkbox', { name: 'John Carter', exact: true }).check();
  await page.getByRole('checkbox', { name: 'John Carter', exact: true }).focus();
  settings.onlineIds = ['john-official'];
  await page.clock.fastForward(31000);
  await expect(john).toContainText('Online no painel');
  await expect(morgan).toContainText('Offline');
  await expect(page.getByRole('checkbox', { name: 'John Carter', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'John Carter', exact: true })).toBeFocused();
  await expect(page.locator('#actionCavalry')).toHaveValue('1');
  settings.presenceFail = true;
  await page.clock.fastForward(31000);
  await expect(john).toContainText('Status indisponível');
  await expect(page.getByRole('checkbox', { name: 'John Carter', exact: true })).toBeChecked();
  await expect(page.locator('#saveAction')).toBeEnabled();
  settings.presenceFail = false;
  await page.getByRole('button', { name: 'Atualizar lista', exact: true }).click();
  await expect(john).toContainText('Online no painel');
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  expect(calls.filter(call => call.path === '/api/presenca').every(call => call.authenticated)).toBe(true);
});

test('presença expira localmente e atualizações não deixam rascunho sujo', async ({ page }) => {
  await page.clock.install();
  await prepare(page, { cargo: 'Membro', presenceTTL: 8000 });
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
  const badge = page.locator('[data-presence="test-official"]');
  await expect(badge).toHaveText('Online no painel');
  await page.clock.fastForward(11000);
  await expect(badge).toHaveText('Offline');
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#actionEditor')).not.toBeVisible();
  expect(dialogs).toBe(0);
});

test('desktop e celular exibem status por texto, inclusive com serviço indisponível', async ({ page }) => {
  await prepare(page, { cargo: 'Membro' });
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
  await expect(page.locator('[data-presence="test-official"]')).toHaveText('Online no painel');
  await page.locator('#officerList').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/acoes-presenca-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#officerList').scrollIntoViewIfNeeded();
  await expect(page.getByRole('checkbox', { name: 'John Carter', exact: true })).toBeEnabled();
  expect(await page.locator('#actionEditor').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/acoes-presenca-mobile.png' });
});
const sample = (id, extra = {}) => ({ id, titulo: 'Defesa de Valentine', ocorrido_em: today + 'T12:00:00.000Z', resultado: 'vitoria', cavalaria: 2, oponentes: 3, participantes: ['Morgan West', 'John Carter'], relato: 'Retomada da estação.', autor: { id: 'test-official', nome: 'Morgan West', cargo: 'Membro', patente: 'Soldado' }, criado_em: today + 'T14:00:00.000Z', atualizado_em: null, arquivado_em: null, ...extra });
async function fill(page, values = {}) {
  await page.locator('#actionTitle').fill(values.titulo || 'Defesa de Valentine');
  await page.locator('#actionWhen').fill(today + 'T00:00');
  await page.locator('#authorRank').fill('Sargento');
  await page.locator('#actionOpponents').fill('3');
  await page.getByLabel('↗ Vitória', { exact: true }).check();
  for (const nome of values.participantes ?? ['Morgan West', 'John Carter']) await page.getByRole('checkbox', { name: nome, exact: true }).check();
  await page.locator('#actionReport').fill('Retomada da estação.');
}

test('Membro registra confronto com participantes e encontra o registro após recarregar', async ({ page }) => {
  const { calls } = await prepare(page, { cargo: 'Membro' });
  await page.goto('/acoes.html');
  await expect(page.locator('#actionState')).toHaveText('0 ações encontradas.');
  await expect(page.locator('#archiveField')).toBeHidden();
  await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
  await fill(page);
  await expect(page.locator('#participantCount')).toHaveText('2 oficiais selecionados');
  await page.getByRole('button', { name: 'Salvar ação', exact: true }).click();
  await expect(page.locator('#actionEditor')).not.toBeVisible();
  await expect(page.locator('.action-card')).toContainText('Morgan West · Sargento');
  await expect(page.locator('.confrontation strong')).toHaveText('2 × 3');
  await expect(page.locator('#metricTotal')).toHaveText('1');
  await expect(page.locator('#metricRate')).toHaveText('100%');
  await expect(page.getByRole('button', { name: 'Arquivar', exact: true })).toHaveCount(0);
  const post = calls.find(call => call.path === '/api/acoes' && call.payload?.acao === 'criar');
  expect(post.authenticated).toBe(true);
  expect(post.payload.participantes_ids).toEqual(['test-official', 'john-official']);
  expect(post.payload.participantes).toBeUndefined();
  expect(post.payload.ocorrido_em).toBe(today + 'T03:00:00.000Z');
  expect(post.payload.autor).toBeUndefined();
  await page.reload();
  await expect(page.locator('.action-card h3')).toHaveText('Defesa de Valentine');
});

test('seleção obrigatória e quantidade automática; falha preserva oficiais marcados', async ({ page }) => {
  const settings = { cargo: 'Membro', actionSaveFail: true };
  const { calls } = await prepare(page, settings);
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
  await fill(page, { participantes: [] });
  await page.getByRole('button', { name: 'Salvar ação', exact: true }).click();
  expect(calls.filter(call => call.payload?.acao === 'criar')).toHaveLength(0);
  await expect(page.locator('#selectorError')).toContainText('Selecione');
  await page.getByRole('checkbox', { name: 'Morgan West', exact: true }).check();
  await expect(page.locator('#actionCavalry')).toHaveValue('1');
  await expect(page.locator('#actionCavalry')).toHaveAttribute('readonly', '');
  await page.getByRole('checkbox', { name: 'John Carter', exact: true }).check();
  await expect(page.locator('#actionCavalry')).toHaveValue('2');
  await page.getByRole('button', { name: 'Salvar ação', exact: true }).click();
  await expect(page.locator('#editorMessage')).toContainText('Falha fictícia');
  await expect(page.locator('#actionTitle')).toHaveValue('Defesa de Valentine');
  await expect(page.getByRole('checkbox', { name: 'Morgan West', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'John Carter', exact: true })).toBeChecked();
  settings.actionSaveFail = false;
  await page.getByRole('button', { name: 'Salvar ação', exact: true }).click();
  await expect(page.locator('#actionEditor')).not.toBeVisible();
  await expect(page.locator('.action-card')).toHaveCount(1);
});

test('busca pelo nick preserva seleção fora do filtro e permite remover pelos marcadores', async ({ page }) => {
  await prepare(page, { cargo: 'Membro' });
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Morgan West', exact: true }).check();
  await page.locator('#officerSearch').fill('joao');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'João do Oeste', exact: true }).check();
  await expect(page.locator('#participantCount')).toHaveText('2 oficiais selecionados');
  await expect(page.locator('#selectedOfficers')).toContainText('Morgan West');
  await page.locator('#officerSearch').fill('');
  await expect(page.getByRole('checkbox', { name: 'Morgan West', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Remover Morgan West', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Morgan West', exact: true })).not.toBeChecked();
  await expect(page.locator('#actionCavalry')).toHaveValue('1');
});

test('falha na lista de oficiais permite recarregar e não perde o rascunho', async ({ page }) => {
  const settings = { officersFail: true };
  await prepare(page, settings);
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
  await page.locator('#actionTitle').fill('Confronto preservado');
  await expect(page.locator('#officerState')).toContainText('Falha fictícia');
  await expect(page.locator('#saveAction')).toBeDisabled();
  settings.officersFail = false;
  await page.getByRole('button', { name: 'Atualizar lista', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'John Carter', exact: true })).toBeVisible();
  await expect(page.locator('#actionTitle')).toHaveValue('Confronto preservado');
});

test('edição preserva participante antigo sem conta atual e permite desmarcá-lo', async ({ page }) => {
  await prepare(page, { cargo: 'Membro', actions: [sample('legacy-officer-action', { participantes: ['Morgan West', 'Oficial antigo'], participantes_ids: ['test-official', null] })] });
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Editar registro', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Oficial antigo', exact: true })).toBeChecked();
  await expect(page.locator('#officerList')).toContainText('Participante do registro original');
  await page.getByRole('checkbox', { name: 'Oficial antigo', exact: true }).uncheck();
  await expect(page.locator('#actionCavalry')).toHaveValue('1');
  await page.getByRole('checkbox', { name: 'Oficial antigo', exact: true }).check();
  await expect(page.locator('#actionCavalry')).toHaveValue('2');
});

test('oficial vê correção só dos próprios registros; edição mantém o autor original', async ({ page }) => {
  await prepare(page, { cargo: 'Membro', actions: [sample('action-own'), sample('action-other', { titulo: 'Ação de outro oficial', autor: { id: 'other', nome: 'Outro oficial', patente: 'Tenente' } })] });
  await page.goto('/acoes.html');
  await expect(page.getByRole('button', { name: 'Editar registro', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar registro', exact: true }).click();
  await page.locator('#actionTitle').fill('Defesa revisada');
  await page.locator('#authorRank').fill('Cabo');
  await page.getByLabel('↘ Derrota', { exact: true }).check();
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  const card = page.locator('.action-card', { hasText: 'Defesa revisada' });
  await expect(card).toContainText('Morgan West · Soldado');
  await card.locator('summary').click();
  await expect(card).toContainText('Última alteração');
  await expect(card).toContainText('Morgan West · Cabo');
  await expect(card.locator('.result-badge')).toContainText('Derrota');
});

test('liderança arquiva e restaura; indicadores ativos seguem o livro', async ({ page }) => {
  await prepare(page, { actions: [sample('action-archive')] });
  await page.goto('/acoes.html');
  await page.getByRole('button', { name: 'Arquivar', exact: true }).click();
  await page.locator('#manageRank').fill('Tenente');
  await page.getByRole('button', { name: 'Arquivar ação', exact: true }).click();
  await expect(page.locator('#metricTotal')).toHaveText('0');
  await page.locator('#archiveFilter').selectOption('1');
  await expect(page.locator('.action-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar ação', exact: true }).click();
  await expect(page.locator('.action-card')).toHaveCount(0);
  await page.locator('#archiveFilter').selectOption('');
  await expect(page.locator('#metricTotal')).toHaveText('1');
});

test('filtros, paginação e CSV consideram todos os resultados, não só a página visível', async ({ page }) => {
  const records = Array.from({ length: 13 }, (_, i) => sample('report-action-' + i, { titulo: 'Ação ' + i, resultado: i === 12 ? 'derrota' : 'vitoria', participantes: ['Oficial ' + i, 'Morgan West'] }));
  await prepare(page, { actions: records });
  await page.goto('/acoes.html');
  await expect(page.locator('#metricTotal')).toHaveText('13');
  await expect(page.locator('.action-card')).toHaveCount(10);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const csv = readFileSync(await (await downloadPromise).path(), 'utf8');
  expect(csv).toContain('Ação 12');
  expect(csv.split('\r\n')).toHaveLength(14);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.locator('.action-card')).toHaveCount(3);
  await page.locator('#resultFilter').selectOption('derrota');
  await expect(page.locator('#metricTotal')).toHaveText('1');
  await expect(page.locator('#metricRate')).toHaveText('0%');
  await page.locator('#actionSearch').fill('Oficial 12');
  await expect(page.locator('.action-card h3')).toHaveText('Ação 12');
  await page.locator('#dateFrom').fill('2099-01-01');
  await expect(page.locator('#actionState')).toContainText('data inicial');
  await expect(page.locator('#exportActions')).toBeDisabled();
});

test('falha na leitura não vira zero e permite tentar novamente', async ({ page }) => {
  const settings = { actionsFail: true };
  await prepare(page, settings);
  await page.goto('/acoes.html');
  await expect(page.locator('#actionState')).toContainText('Não foi possível');
  await expect(page.locator('#metricTotal')).toHaveText('—');
  await expect(page.locator('#exportActions')).toBeDisabled();
  await expect(page.locator('#newAction')).toBeDisabled();
  settings.actionsFail = false;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.locator('#metricTotal')).toHaveText('0');
  await expect(page.locator('#newAction')).toBeEnabled();
});

test('Início resume ações reais do mês sem consultar efetivo para Membro', async ({ page }) => {
  await prepare(page, { cargo: 'Membro', actions: [sample('dashboard-action'), sample('dashboard-loss', { resultado: 'derrota' }), sample('dashboard-old', { ocorrido_em: '2020-01-01T12:00:00Z' })] });
  await page.goto('/dashboard.html');
  await expect(page.locator('#dashboardActions')).toContainText('2 ações registradas');
  await expect(page.locator('#dashboardActions')).toContainText('50% de vitórias');
  const tables = await page.evaluate(() => window.__mock.calls.map(call => call.table));
  expect(tables).not.toContain('cavalaria_oficiais');
});

test('desktop e celular mantêm formulário acessível e sem rolagem horizontal', async ({ page }) => {
  await prepare(page, { actions: [sample('visual-victory'), sample('visual-loss', { titulo: 'Confronto na estrada de Rhodes', resultado: 'derrota', oponentes: 2 })] });
  for (const viewport of [{ width: 1440, height: 1050 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/acoes.html');
    await expect(page.locator('.action-card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/acoes-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Registrar ação', exact: true }).click();
    await fill(page);
    await expect(page.locator('#saveAction')).toBeInViewport();
    expect(await page.locator('#actionEditor').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/acoes-editor-${viewport.width}.png` });
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.locator('#actionEditor')).not.toBeVisible();
  }
});
