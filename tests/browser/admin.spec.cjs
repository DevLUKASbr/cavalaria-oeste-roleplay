const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { prepare } = require('./fixtures.cjs');

test('dashboard usa totais reais e distingue exoneração proposta de concluída', async ({ page }) => {
  await prepare(page);
  await page.goto('/dashboard.html');
  await expect(page.getByRole('heading', { name: 'Bem-vindo, Morgan West' })).toBeVisible();
  const values = page.locator('.metric-card > strong');
  await expect(values).toHaveText(['5', '1', '1', '1', '1', '1']);
  await expect(page.getByRole('progressbar', { name: 'New Hanover: 2 oficiais' })).toBeVisible();
  await expect(page.locator('#recentActivity')).toContainText('Arthur Teste');
  await expect(page.locator('#announcementsTitle')).toBeVisible();
  await expect(page.getByText('Rankings aguardam registros e critérios')).toBeVisible();
});

test('navegação preserva links diretos, histórico, sessão e item ativo', async ({ page }) => {
  await prepare(page);
  await page.goto('/dashboard.html');
  await page.getByRole('link', { name: 'Registros', exact: true }).click();
  await expect(page).toHaveURL(/painel.html$/);
  await expect(page.locator('.sidebar-nav a[aria-current="page"]')).toHaveText('Registros');
  await expect(page.locator('#sections')).toContainText('Arthur Teste');
  await page.getByRole('link', { name: 'Treinamentos', exact: true }).click();
  await expect(page).toHaveURL(/treinamentos.html$/);
  await page.goBack();
  await expect(page).toHaveURL(/painel.html$/);
  await expect(page.locator('#sections')).toContainText('Arthur Teste');
  await page.goForward();
  await expect(page).toHaveURL(/treinamentos.html$/);
  await expect(page.locator('.current-user')).toContainText('Morgan West');
});

test('Membro só vê módulos existentes autorizados e não consulta Registros', async ({ page }) => {
  await prepare(page, { cargo: 'Membro' });
  await page.goto('/dashboard.html');
  await expect(page.getByRole('heading', { name: 'Bem-vindo, Morgan West' })).toBeVisible();
  await expect(page.locator('.sidebar-nav a')).toHaveCount(5);
  await expect(page.locator('#dashboardState')).toContainText('restritos');
  const tables = await page.evaluate(() => window.__mock.calls.map(call => call.table));
  expect(tables).not.toContain('cavalaria_oficiais');
  expect(tables).not.toContain('cavalaria_auditoria');
  await page.goto('/contas.html');
  await expect(page).toHaveURL(/treinamentos.html$/);
  await expect(page.locator('#newTopic')).toBeHidden();
});

test('rotas internas sem sessão voltam ao login', async ({ page }) => {
  await prepare(page, { noSession: true });
  for (const route of ['dashboard.html', 'painel.html', 'contas.html', 'treinamentos.html', 'avisos.html']) {
    await page.goto('/' + route);
    await expect(page).toHaveURL(/index.html$/);
    await expect(page.locator('#loginForm')).toBeVisible();
  }
});

test('login autorizado abre o Dashboard e sair encerra a sessão', async ({ page }) => {
  await prepare(page);
  await page.goto('/index.html');
  await expect(page).toHaveURL(/dashboard.html$/);
  await page.getByRole('button', { name: 'Sair da sessão', exact: true }).click();
  await expect(page).toHaveURL(/index.html\?motivo=saiu$/);
  await expect(page.locator('#message')).toHaveText('Sessão encerrada.');
});

test('dashboard distingue carregamento, vazio, falha e recuperação por atualização', async ({ page }) => {
  await prepare(page, { fail: true, delay: 200 });
  await page.goto('/dashboard.html');
  await expect(page.locator('#dashboardState')).toContainText('Carregando');
  await expect(page.locator('#dashboardState')).toContainText('Não foi possível carregar');
  await expect(page.locator('#dashboardMetrics')).toBeHidden();
  await page.evaluate(() => { window.__mock.fail = false; window.__mock.officers = []; window.__mock.audit = []; });
  await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click();
  await expect(page.locator('#dashboardState')).toContainText('ainda não contém oficiais');
  await expect(page.locator('.metric-card > strong')).toHaveText(['0', '0', '0', '0', '0', '0']);
  await expect(page.locator('#recentActivity')).toContainText('Nenhuma alteração');
});

test('erros isolados na auditoria não escondem os indicadores disponíveis', async ({ page }) => {
  await prepare(page, { auditFail: true });
  await page.goto('/dashboard.html');
  await expect(page.locator('.metric-card > strong').first()).toHaveText('5');
  await expect(page.locator('#recentActivity')).toContainText('Não foi possível consultar a auditoria');
});

test('Registros preserva busca, filtro, edição, destino e observações', async ({ page }) => {
  await prepare(page);
  await page.goto('/painel.html');
  await expect(page.locator('tr[data-id]')).toHaveCount(5);
  await page.locator('#search').fill('Arthur');
  await expect(page.locator('tr[data-id]')).toHaveCount(1);
  await page.locator('#search').fill('');
  await page.locator('#filter').selectOption('Exonerado');
  await expect(page.locator('tr[data-id]')).toHaveCount(1);
  await expect(page.locator('tr[data-id="c"]')).toContainText('EXONERADO');
  await page.locator('#filter').selectOption('all');
  await page.locator('tr[data-id="a"] [data-field="status"]').selectOption('Inativo');
  await expect(page.locator('#message')).toContainText('Alteração registrada');
  await page.locator('tr[data-id="a"] [data-field="destino"]').selectOption('West Elizabeth');
  await page.locator('tr[data-id="a"] [data-field="observacao"]').fill('Avaliação de teste');
  await page.locator('tr[data-id="a"] [data-field="observacao"]').press('Tab');
  await expect.poll(() => page.evaluate(() => window.__mock.officers[0].observacao)).toBe('Avaliação de teste');
  expect(await page.evaluate(() => window.__mock.officers[0].destino)).toBe('West Elizabeth');
});

test('exoneração, reversão justificada, auditoria, CSV e impressão permanecem funcionais', async ({ page }) => {
  await prepare(page);
  await page.goto('/painel.html');
  await expect(page.locator('tr[data-id]')).toHaveCount(5);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('tr[data-id="b"] [data-execute]').click();
  await expect(page.locator('tr[data-id="b"]')).toHaveClass('executed');
  const acceptReversal = dialog => dialog.type() === 'prompt' ? dialog.accept('Justificativa de teste válida') : dialog.accept();
  page.on('dialog', acceptReversal);
  await page.locator('tr[data-id="c"] [data-revert]').click();
  await expect(page.locator('tr[data-id="c"] [data-field="status"]')).toHaveValue('Ativo');
  page.off('dialog', acceptReversal);
  const calls = await page.evaluate(() => window.__mock.calls.filter(call => call.rpc));
  expect(calls[1].payload.p_justificativa).toBe('Justificativa de teste válida');
  await page.locator('#historyToggle').click();
  await expect(page.locator('#history')).toContainText('Arthur Teste');
  const download = page.waitForEvent('download');
  await page.locator('#csv').click();
  const csvDownload = await download;
  expect(csvDownload.suggestedFilename()).toBe('cavalaria_oeste_registro.csv');
  const csv = readFileSync(await csvDownload.path(), 'utf8');
  for (const name of ['Arthur Teste', 'Bonnie Teste', 'Charles Teste', 'Diana Teste', 'Elias Teste']) expect(csv).toContain(name);
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.locator('#print').click();
  expect(await page.evaluate(() => window.__printed)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#shell')).toBeHidden();
  await expect(page.locator('.masthead')).toBeVisible();
  await expect(page.locator('.footer')).toBeVisible();
});

test('nível limitado não recebe reversão administrativa', async ({ page }) => {
  await prepare(page, { cargo: '', role: 'xerife' });
  await page.goto('/painel.html');
  await expect(page.locator('tr[data-id="c"]')).toContainText('EXONERADO');
  await expect(page.locator('[data-revert]')).toHaveCount(0);
});

test('primeiro acesso e troca de senha mantêm os controles existentes', async ({ page }) => {
  await prepare(page, { firstAccess: true });
  await page.goto('/dashboard.html');
  await expect(page.locator('#passwordForm')).toBeVisible();
  await expect(page.locator('#passwordCancel')).toBeHidden();
  await page.locator('#newPassword').fill('fixture-password-123');
  await page.locator('#confirmPassword').fill('fixture-password-123');
  await page.getByRole('button', { name: 'Salvar nova senha', exact: true }).click();
  await expect(page.locator('#passwordForm')).toBeHidden();
  await expect(page.locator('#message')).toContainText('Senha alterada com sucesso');
});

test('sidebar recolhível persiste preferência sem perder a navegação', async ({ page }) => {
  await prepare(page);
  await page.goto('/dashboard.html');
  await page.getByRole('button', { name: 'Recolher menu', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('link', { name: 'Registros', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: 'Expandir menu', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/sidebar-collapsed/);
});

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
  test(`responsividade e navegação acessível em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.goto('/dashboard.html');
    await expect(page.locator('.metric-card')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width <= 980) {
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Navegação da Cavalaria' })).toBeVisible();
      expect(await page.locator('#mainContent').evaluate(node => node.inert)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.activeElement.closest('#adminSidebar') !== null)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    }
    await page.getByRole('link', { name: 'Registros', exact: true }).click();
    await expect(page.locator('tr[data-id]')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.tablewrap').first().evaluate(node => node.scrollWidth >= node.clientWidth)).toBe(true);
    for (const route of ['contas.html', 'treinamentos.html', 'recrutamento.html', 'avisos.html']) {
      await page.goto('/' + route);
      await expect(page.locator('#private')).toBeVisible();
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        outside: [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth && node.getClientRects().length).map(node => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right })).slice(0, 12),
      }));
      expect(geometry.scrollWidth, route + ': ' + JSON.stringify(geometry.outside)).toBeLessThanOrEqual(geometry.width);
    }
  });
}

test('Ações abre o livro e sino consulta avisos reais', async ({ page }) => {
  await prepare(page);
  await page.goto('/acoes.html');
  await expect(page.getByRole('heading', { name: 'Registro de ações', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar ação', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar-future a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Avisos oficiais', exact: true }).click();
  await expect(page.locator('#notificationsPanel')).toContainText('Nenhum aviso publicado');
  await expect(page.locator('#notificationsPanel a')).toHaveAttribute('href', 'avisos.html');
});

test('Contas preserva criação individual, edição e redefinição via Function autenticada', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.goto('/contas.html');
  await expect(page.locator('#accounts [data-field="nome"]')).toHaveValue('Morgan West');
  await page.locator('#newName').fill('Oficial de Teste');
  await page.locator('#newLogin').fill('oficial-teste');
  await page.locator('#newCargo').selectOption('Membro');
  await page.locator('#generate').click();
  await expect(page.locator('#tempPassword')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.locator('#credential')).toContainText('Conta de Oficial de Teste criada.');
  expect(calls.find(call => call.payload?.acao === 'criar').payload.email).toBe('oficial-teste@cavalaria.oeste');
  await page.locator('#accounts [data-field="nome"]').fill('Morgan Alterado');
  await page.locator('#accounts [data-action="save"]').click();
  await expect(page.locator('#message')).toContainText('alterações salvas');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#accounts [data-action="reset"]').click();
  await expect(page.locator('#credential')).toContainText('Nova senha de Morgan West');
  expect(calls.some(call => call.payload?.acao === 'editar')).toBe(true);
  expect(calls.some(call => call.payload?.acao === 'senha')).toBe(true);
  expect(calls.every(call => call.authenticated)).toBe(true);
});

test('Treinamentos preserva leitura, criação, edição, vídeos e exclusão autorizada', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.goto('/treinamentos.html');
  await page.locator('#newTopic').click();
  await page.locator('#titulo').fill('Instrução de teste');
  await page.locator('#descricao').fill('Material fictício para validar o formulário existente.');
  await page.locator('#addVideo').click();
  await page.getByRole('textbox', { name: 'Link do vídeo', exact: true }).fill('https://www.youtube.com/watch?v=fixture1234');
  await page.locator('#saveTopic').click();
  await expect(page.locator('#topics')).toContainText('Instrução de teste');
  await expect(page.locator('#topics iframe')).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  await page.locator('#topics [data-action="edit"]').click();
  await page.locator('#titulo').fill('Instrução revisada');
  await page.locator('#saveTopic').click();
  await expect(page.locator('#topics')).toContainText('Instrução revisada');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#topics [data-action="delete"]').click();
  await expect(page.locator('#topics')).toContainText('Nenhum tópico publicado');
  expect(calls.filter(call => call.payload?.acao).map(call => call.payload.acao)).toEqual(['criar', 'editar', 'excluir']);
  expect(calls.every(call => call.authenticated)).toBe(true);
});

test('rotas administrativas sem erros de runtime e capturas para revisão visual', async ({ page }, testInfo) => {
  await prepare(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  for (const route of ['dashboard.html', 'painel.html', 'contas.html', 'treinamentos.html', 'recrutamento.html', 'investigacoes.html', 'acoes.html', 'avisos.html']) {
    await page.goto('/' + route);
    await expect(page.locator('.sidebar-nav a[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('#private')).toBeVisible();
    if (route === 'dashboard.html') {
      await expect(page.locator('.metric-card')).toHaveCount(6);
      await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
    }
    if (route === 'painel.html') await page.screenshot({ path: testInfo.outputPath('registros-desktop.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard.html');
  await expect(page.locator('.metric-card')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await expect(page.locator('#adminSidebar')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: testInfo.outputPath('sidebar-mobile.png') });
  expect(errors).toEqual([]);
});

test('Recrutamento da main preserva roteiro, fichas, candidatos e ações autenticadas', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.goto('/recrutamento.html');
  await expect(page.locator('#tab-roteiro')).toContainText('1. Início do recrutamento');
  await page.getByRole('tab', { name: 'Fichas de recrutamento', exact: true }).click();
  await expect(page.locator('#records')).toContainText('Nenhuma ficha');
  await page.locator('#newRecord').click();
  await expect(page.locator('#recResponsavel')).toHaveValue('Morgan West');
  await page.locator('#candidates [data-f="nome"]').fill('Candidato fictício');
  await page.locator('#saveRecord').click();
  await expect(page.locator('#records')).toContainText('Candidato fictício');
  await page.locator('#records [data-action="edit"]').click();
  await page.locator('#recAuxiliares').fill('Auxiliar de teste');
  await page.locator('#saveRecord').click();
  await expect(page.locator('#records')).toContainText('Auxiliar de teste');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#records [data-action="delete"]').click();
  await expect(page.locator('#records')).toContainText('Nenhuma ficha');
  expect(calls.filter(call => call.payload?.acao).map(call => call.payload.acao)).toEqual(['criar', 'editar', 'excluir']);
  expect(calls.every(call => call.authenticated)).toBe(true);
});

test('Investigações cadastra grupo e alvo com coordenadas, mostra no mapa e na lista', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.goto('/investigacoes.html');
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#targets')).toContainText('Nenhum alvo cadastrado');
  await page.getByRole('tab', { name: 'Grupos', exact: true }).click();
  await page.locator('#newGroup').click();
  await page.locator('#gNome').fill('Bando de Teste');
  await page.locator('#gX').fill('2632');
  await page.locator('#gY').fill('-1312');
  await page.locator('#saveGroup').click();
  await expect(page.locator('#groups')).toContainText('Bando de Teste');
  await page.getByRole('tab', { name: 'Mapa e alvos', exact: true }).click();
  await expect(page.locator('#map .group-marker')).toHaveCount(1);
  await page.locator('#newTarget').click();
  await page.locator('#tNome').fill('Alvo Fictício');
  await page.locator('#tAmeaca').selectOption('Crítico');
  await page.locator('#tGrupo').selectOption({ label: 'Bando de Teste' });
  await page.locator('#tX').fill('2650');
  await page.locator('#tY').fill('-1290');
  await page.locator('#saveTarget').click();
  await expect(page.locator('#targets')).toContainText('Alvo Fictício');
  await expect(page.locator('#targets')).toContainText('Bando de Teste');
  await expect(page.locator('#map path.leaflet-interactive')).toHaveCount(1);
  await page.locator('#threatFilter').selectOption('Baixo');
  await expect(page.locator('#targets')).toContainText('Nenhum alvo neste filtro');
  await page.locator('#threatFilter').selectOption('');
  await page.getByRole('tab', { name: 'Grupos', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#groups [data-action="delete"]').click();
  await expect(page.locator('#groups')).toContainText('Nenhum grupo cadastrado');
  await page.getByRole('tab', { name: 'Mapa e alvos', exact: true }).click();
  await expect(page.locator('#targets')).toContainText('Alvo Fictício');
  await expect(page.locator('#targets')).not.toContainText('Bando de Teste');
  expect(calls.filter(call => call.payload?.acao).map(call => call.payload.acao)).toEqual(['salvar-grupo', 'salvar-alvo', 'excluir-grupo']);
  expect(calls.every(call => call.authenticated)).toBe(true);
});

test('Membro não abre Investigações', async ({ page }) => {
  await prepare(page, { cargo: 'Membro' });
  await page.goto('/investigacoes.html');
  await expect(page).toHaveURL(/treinamentos.html$/);
  await expect(page.locator('.sidebar-nav')).not.toContainText('Investigações');
});

test('Pessoas: cadastro fora de investigação, investigar e encerrar', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.goto('/investigacoes.html');
  await page.getByRole('tab', { name: 'Pessoas', exact: true }).click();
  await expect(page.locator('#people')).toContainText('Nenhuma pessoa cadastrada');
  await page.locator('#newPerson').click();
  await expect(page.locator('#tInvestigado')).not.toBeChecked();
  await expect(page.locator('#tAmeacaField')).toBeHidden();
  await page.locator('#tNome').fill('Padeira Fictícia');
  await page.locator('#tOcupacao').fill('Padeira');
  await page.locator('#tLocal').fill('Padaria de Strawberry');
  await page.locator('#saveTarget').click();
  await expect(page.locator('#people')).toContainText('Padeira Fictícia');
  await expect(page.locator('#people')).toContainText('Padaria de Strawberry');
  await expect(page.locator('#targets')).toContainText('Nenhum alvo cadastrado');
  await page.locator('#people [data-action="investigate"]').click();
  await expect(page.locator('#tInvestigado')).toBeChecked();
  await page.locator('#tAmeaca').selectOption('Médio');
  await page.locator('#saveTarget').click();
  await expect(page.locator('#people')).toContainText('Sob investigação');
  await expect(page.locator('#targets')).toContainText('Padeira Fictícia');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#people [data-action="close-case"]').click();
  await expect(page.locator('#people [data-action="investigate"]')).toHaveCount(1);
  await expect(page.locator('#targets')).toContainText('Nenhum alvo cadastrado');
  const saved = calls.filter(call => call.payload?.acao).map(call => [call.payload.acao, call.payload.alvo?.investigado]);
  expect(saved).toEqual([['salvar-alvo', false], ['salvar-alvo', true], ['salvar-alvo', false]]);
});

test('Lugares, local de trabalho, vínculos e grafo de Pessoas', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.goto('/investigacoes.html');
  await page.getByRole('tab', { name: 'Lugares', exact: true }).click();
  await expect(page.locator('#places')).toContainText('Nenhum lugar cadastrado');
  await page.locator('#newPlace').click();
  await expect(page.locator('#tCategoria')).toBeVisible();
  await expect(page.locator('#tOcupacao')).toBeHidden();
  await page.locator('#tNome').fill('Armazém Fictício');
  await page.locator('#tCategoria').selectOption('Loja');
  await page.locator('#tX').fill('-1793');
  await page.locator('#tY').fill('-386');
  await page.locator('#saveTarget').click();
  await expect(page.locator('#places')).toContainText('Armazém Fictício');
  await expect(page.locator('#targets')).toContainText('Nenhum alvo cadastrado');

  await page.getByRole('tab', { name: 'Pessoas', exact: true }).click();
  await expect(page.locator('#graph canvas')).toHaveCount(1);
  for (const [name, workplace] of [['Chefe Fictício', ''], ['Capanga Fictício', 'Armazém Fictício']]) {
    await page.locator('#newPerson').click();
    await page.locator('#tNome').fill(name);
    if (workplace) await page.locator('#tLocalId').selectOption({ label: workplace });
    await page.locator('#saveTarget').click();
    await expect(page.locator('#people')).toContainText(name);
  }
  await expect(page.locator('#people')).toContainText('Armazém Fictício');

  await page.locator('#newLink').click();
  await page.locator('#lDe').selectOption({ label: 'Chefe Fictício' });
  await page.locator('#lTipo').selectOption('Líder/Chefe');
  await page.locator('#lPara').selectOption({ label: 'Capanga Fictício' });
  await page.locator('#saveLink').click();
  await expect(page.locator('#links')).toContainText('Líder/Chefe');
  await expect(page.locator('#graphSummary')).toContainText('2 pessoas · 1 vínculo');

  await page.getByRole('tab', { name: 'Lugares', exact: true }).click();
  await expect(page.locator('#places')).toContainText('Capanga Fictício');

  await page.getByRole('tab', { name: 'Pessoas', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#people tr', { hasText: 'Chefe Fictício' }).locator('[data-action="delete"]').click();
  await expect(page.locator('#links')).toContainText('Nenhum vínculo cadastrado');
  expect(calls.filter(call => call.payload?.acao).map(call => call.payload.acao))
    .toEqual(['salvar-alvo', 'salvar-alvo', 'salvar-alvo', 'salvar-vinculo', 'excluir-alvo']);
  expect(calls.every(call => call.authenticated)).toBe(true);
});
