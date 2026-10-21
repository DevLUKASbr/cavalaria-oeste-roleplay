const { test, expect } = require('@playwright/test');
const { prepare } = require('./fixtures.cjs');

test('manual acessível a Membro mantém todas as permissões exatas por patente', async ({ page }) => {
  const { calls } = await prepare(page, { cargo: 'Membro' });
  await page.goto('/armamentos.html');
  await expect(page.locator('.sidebar-nav a[aria-current="page"]')).toHaveText('Manual de armamentos');
  await expect(page.locator('#selectedRankName')).toHaveText('Recruta');
  await expect(page.locator('#holsterRule')).toHaveText('Sem uso dual');
  await expect(page.locator('.weapon-card h3')).toHaveText(['LeMat', 'Volcanic', 'Evans']);
  for (const [name, count] of [['Oficial Júnior', 5], ['Oficial', 11], ['Oficial Sênior', 13], ['Sub-Xerife', 12], ['Xerife', 12]]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.weapon-card')).toHaveCount(count);
    await expect(page.locator('#selectedRankName')).toHaveText(name);
    await expect(page.locator('#rankChoices button[aria-pressed=true]')).toHaveCount(1);
  }
  await expect(page.locator('.current-user')).toContainText('Membro');
  expect(calls.filter(call => call.path !== '/api/presenca')).toHaveLength(0);
  const tables = await page.evaluate(() => window.__mock.calls.map(call => call.table));
  expect(tables).not.toContain('cavalaria_oficiais');
});

test('filtros e ficha distinguem armas não permitidas e preservam foco ao fechar', async ({ page }) => {
  await prepare(page);
  await page.goto('/armamentos.html');
  await page.getByRole('button', { name: 'Oficial Sênior', exact: true }).click();
  await page.getByLabel('Buscar armamento', { exact: true }).fill('mauser');
  await expect(page.locator('.weapon-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Sub-Xerife', exact: true }).click();
  await expect(page.locator('.armory-empty')).toContainText('Nenhum armamento');
  await page.getByLabel('Mostrar apenas permitidos', { exact: true }).uncheck();
  await expect(page.locator('.weapon-card .weapon-permission')).toHaveText('Não permitido');
  await page.getByRole('button', { name: 'Ver ficha de Mauser', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#weaponDialogTitle')).toHaveText('Mauser');
  await expect(page.locator('.weapon-rank-list li').filter({ hasText: 'Sub-Xerife' })).toContainText('Não permitido');
  await expect(page.locator('.weapon-rank-list li').filter({ hasText: 'Oficial Sênior' })).toContainText('Permitido');
  await expect(page.getByRole('button', { name: 'Fechar ficha do armamento' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver ficha de Mauser', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.weapon-card')).toHaveCount(12);
  await expect(page.locator('#weaponSearch')).toHaveValue('');
  await page.getByRole('button', { name: /Escopetas 3/ }).click();
  await expect(page.locator('.weapon-card')).toHaveCount(3);
});

test('imagens reais carregam e a tabela completa corresponde às regras', async ({ page }) => {
  await prepare(page);
  await page.goto('/armamentos.html');
  await page.getByLabel('Mostrar apenas permitidos', { exact: true }).uncheck();
  for (const image of await page.locator('.weapon-card img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 500)).toBe(true);
  }
  await page.locator('#openComparison').click();
  await expect(page.locator('#comparison')).toHaveAttribute('open', '');
  await expect(page.locator('#comparisonBody tr')).toHaveCount(6);
  await expect(page.locator('#comparisonBody tr').filter({ has: page.getByRole('rowheader', { name: 'Recruta', exact: true }) })).toContainText('Não pode usar duas armas');
  await page.locator('#weaponSearch').fill('onerror=<script>');
  await expect(page.locator('.armory-empty')).toBeVisible();
  await expect(page.locator('#weaponGrid script')).toHaveCount(0);
});

test('manual exige sessão e continua disponível ao acesso limitado legado', async ({ page }) => {
  await prepare(page, { noSession: true });
  await page.goto('/armamentos.html');
  await expect(page).toHaveURL(/index.html$/);
});
test('acesso limitado legado consulta o manual sem receber Contas', async ({ page }) => {
  await prepare(page, { cargo: '', role: 'leitor' });
  await page.goto('/armamentos.html');
  await expect(page.locator('.weapon-card')).toHaveCount(3);
  await expect(page.locator('.sidebar-nav a[href="contas.html"]')).toHaveCount(0);
});

test('manual e ficha funcionam no desktop e celular sem rolagem horizontal da página', async ({ page }) => {
  await prepare(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/armamentos.html');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('button', { name: 'Recruta', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `test-results/armamentos-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Ver ficha de LeMat', exact: true }).click();
    expect(await page.locator('#weaponDialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await expect(page.getByRole('button', { name: 'Voltar ao arsenal', exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/armamentos-ficha-${width}.png` });
    await page.getByRole('button', { name: 'Voltar ao arsenal', exact: true }).click();
  }
  expect(errors).toEqual([]);
});
