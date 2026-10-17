const { test, expect } = require('@playwright/test');
const { prepare } = require('./fixtures.cjs');
const notice = { id: 'fixture-notice', titulo: 'Revista do efetivo', conteudo: 'Apresentação no quartel.\nUniforme completo.', prioridade: 'urgente', criado_em: '2026-10-17T12:00:00Z', autor: { nome: 'Comando', cargo: 'Xerife' }, arquivado_em: null };

for (const cargo of ['Xerife', 'Sub-Xerife', 'Adm']) {
  test(`${cargo} publica, edita, arquiva e republica um aviso`, async ({ page }) => {
    const { calls } = await prepare(page, { cargo });
    await page.goto('/avisos.html');
    await expect(page.locator('#noticeList')).toContainText('Nenhum aviso publicado');
    await page.getByRole('button', { name: 'Novo aviso', exact: true }).click();
    await page.getByLabel('Título *', { exact: true }).fill('Ordem de serviço');
    await page.getByRole('combobox', { name: 'Prioridade', exact: true }).selectOption('urgente');
    await page.getByLabel('Comunicado *', { exact: true }).fill('Apresentação no quartel às 20h.');
    await page.getByRole('button', { name: 'Publicar aviso', exact: true }).click();
    await expect(page.locator('#noticeList')).toContainText('Ordem de serviço');
    await expect(page.locator('.notice-priority')).toHaveText('Urgente');
    await expect(page.locator('.notice-meta')).toContainText('Morgan West');
    await page.getByRole('button', { name: 'Editar aviso', exact: true }).click();
    await page.getByLabel('Título *', { exact: true }).fill('Ordem revisada');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.locator('#noticeList')).toContainText('Ordem revisada');
    await page.locator('#noticeSearch').fill('inexistente');
    await expect(page.locator('#noticeList')).toContainText('Nenhum resultado');
    await page.locator('#noticeSearch').fill('');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Arquivar aviso', exact: true }).click();
    await expect(page.locator('#noticeList')).toContainText('Nenhum aviso publicado');
    await page.locator('#noticeStatus').selectOption('arquivados');
    await expect(page.locator('#noticeList')).toContainText('Ordem revisada');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Republicar aviso', exact: true }).click();
    await expect(page.locator('#noticeList')).toContainText('Nenhum aviso arquivado');
    await page.locator('#noticeStatus').selectOption('ativos');
    await expect(page.locator('#noticeList')).toContainText('Ordem revisada');
    expect(calls.filter(call => call.payload).map(call => call.payload.acao)).toEqual(['criar', 'editar', 'arquivar', 'restaurar']);
    expect(calls.every(call => call.authenticated)).toBe(true);
    await page.goto('/dashboard.html');
    await expect(page.locator('#dashboardNotices')).toContainText('Ordem revisada');
    await page.getByRole('button', { name: 'Avisos oficiais', exact: true }).click();
    await expect(page.locator('#notificationNotices')).toContainText('Ordem revisada');
  });
}
for (const settings of [{ cargo: 'Membro' }, { cargo: '', role: 'xerife' }]) {
  test(`${settings.cargo || 'Acesso limitado'} lê sem controles de gestão, sem executar HTML`, async ({ page }) => {
    const { calls } = await prepare(page, { ...settings, notices: [{ ...notice, titulo: '<img src=x onerror="window.__xss=true">', conteudo: '<script>window.__xss=true</script>\nLeia com atenção.' }] });
    await page.goto('/avisos.html');
    await expect(page.locator('#noticeList')).toContainText('<img src=x');
    await expect(page.locator('#noticeList')).toContainText('<script>');
    await expect(page.locator('#noticeList img, #noticeList script')).toHaveCount(0);
    await expect(page.locator('#newNotice')).toBeHidden();
    await expect(page.locator('#archiveField')).toBeHidden();
    await expect(page.locator('#noticeList button')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(calls.some(call => call.payload)).toBe(false);
  });
}
test('falha de leitura permite tentar novamente e não apresenta vazio falso', async ({ page }) => {
  await prepare(page, { noticesFail: true });
  await page.goto('/avisos.html');
  await expect(page.locator('#noticeState')).toContainText('Não foi possível carregar');
  await expect(page.locator('#noticeList .empty-state')).toHaveCount(0);
  await page.locator('#noticeSearch').fill('quartel');
  await expect(page.locator('#noticeState')).toContainText('Não foi possível carregar');
  await page.route('**/api/avisos', route => route.fulfill({ json: { avisos: [notice] } }));
  await page.getByRole('button', { name: 'Atualizar avisos', exact: true }).click();
  await expect(page.locator('#noticeList')).toContainText('Revista do efetivo');
  await expect(page.locator('#message')).toBeHidden();
});
test('falha de publicação mantém o texto para nova tentativa', async ({ page }) => {
  await prepare(page, { noticeSaveFail: true });
  await page.goto('/avisos.html');
  await page.locator('#newNotice').click();
  await page.locator('#noticeTitle').fill('Aviso de teste');
  await page.locator('#noticeContent').fill('Mensagem que deve permanecer.');
  await page.locator('#saveNotice').click();
  await expect(page.locator('#message')).toContainText('Falha fictícia');
  await expect(page.locator('#noticeContent')).toHaveValue('Mensagem que deve permanecer.');
  await expect(page.locator('#saveNotice')).toBeEnabled();
});
test('avisos desktop e mobile mantêm conteúdo longo legível, sem erros de runtime', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { notices: [notice, { ...notice, id: 'long-notice', titulo: 'Orientações para o serviço', prioridade: 'normal', conteudo: 'PalavraLonga'.repeat(120) }] });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/avisos.html');
    await expect(page.locator('.notice-card')).toHaveCount(2);
    await page.locator('#newNotice').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#cancelNotice').click();
    await page.screenshot({ path: testInfo.outputPath(`avisos-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
