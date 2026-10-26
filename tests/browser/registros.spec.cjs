const { test, expect } = require('@playwright/test');
const { prepare } = require('./fixtures.cjs');
const { readFileSync } = require('node:fs');

test('efetivo e arquivo separam execução de proposta, com contadores e exportação da consulta', async ({page}) => {
  await prepare(page); await page.goto('/painel.html');
  await expect(page.locator('tr[data-id]')).toHaveCount(4);
  await expect(page.locator('#officersCount')).toHaveText('4');
  await expect(page.locator('#dismissedCount')).toHaveText('1');
  await expect(page.locator('tr[data-id="b"]')).toContainText('Confirmar exoneração');
  await expect(page.locator('tr[data-id="c"]')).toHaveCount(0);
  await page.locator('#viewDismissed').click();
  await expect(page.locator('tr[data-id]')).toHaveCount(1);
  await expect(page.locator('#filter')).toBeHidden();
  await expect(page.locator('[data-edit]')).toHaveCount(0);
  const pending = page.waitForEvent('download'); await page.locator('#csv').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('cavalaria_oeste_exoneracoes.csv');
  const text = readFileSync(await download.path(),'utf8');
  expect(text).toContain('Charles Teste'); expect(text).toContain('Exonerado'); expect(text).not.toContain('Arthur Teste');
  await page.locator('#search').fill('ninguém');
  await expect(page.locator('.registry-empty')).toBeVisible();
});

test('nome e transferência são salvos juntos, preservam ID e histórico e mudam a tabela', async ({page}) => {
  await prepare(page); await page.goto('/painel.html');
  await page.getByRole('button',{name:'Editar oficial Arthur Teste',exact:true}).click();
  await expect(page.getByLabel('Nome do oficial no RP')).toBeFocused();
  await page.getByLabel('Nome do oficial no RP').fill('Arthur Novo');
  await page.getByLabel('Contingente atual').selectOption('West Elizabeth');
  await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.section').filter({has:page.getByRole('heading',{name:'✦ West Elizabeth',exact:true})}).locator('tr[data-id="a"]')).toContainText('Arthur Novo');
  await expect(page.getByRole('button',{name:'Editar oficial Arthur Novo',exact:true})).toBeFocused();
  const saved = await page.evaluate(()=>window.__mock.officers.find(o=>o.id==='a'));
  expect(saved).toMatchObject({id:'a',ordem:1,nome:'Arthur Novo',origem:'West Elizabeth',destino:'A definir',status:'Ativo'});
  await page.locator('#historyToggle').click();
  await expect(page.locator('#history')).toContainText('Arthur Teste');
  await expect(page.locator('#history')).toContainText('Arthur Novo');
  await expect(page.locator('#history')).toContainText('New Hanover');
  await page.reload(); await expect(page.locator('#viewOfficers')).toHaveAttribute('aria-pressed','true');
});

test('falhas e conflitos preservam o rascunho; cancelar não grava', async ({page}) => {
  await prepare(page); await page.goto('/painel.html');
  await page.getByRole('button',{name:'Editar oficial Arthur Teste',exact:true}).click();
  await page.getByLabel('Nome do oficial no RP').fill('Novo Nome');
  await page.evaluate(()=>{window.__mock.saveFail=true;});
  await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await expect(page.locator('#officerEditorError')).toContainText('não foi salva');
  await expect(page.getByLabel('Nome do oficial no RP')).toHaveValue('Novo Nome');
  await page.evaluate(()=>{window.__mock.saveFail=false; window.__mock.officers[0].nome='Alterado por outro editor';});
  await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await expect(page.locator('#officerEditorError')).toContainText('registro mudou');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  expect(await page.evaluate(()=>window.__mock.officers[0].nome)).toBe('Alterado por outro editor');
});

test('editor responsivo e Escape preservam os dados em desktop e celular', async ({page}) => {
  await prepare(page); await page.goto('/painel.html');
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Editar oficial Arthur Teste',exact:true}).click();
    await expect(page.getByRole('button',{name:'Salvar alterações',exact:true})).toBeInViewport();
    expect(await page.locator('#officerEditor').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
    await page.screenshot({path:`test-results/registros-editor-${width}.png`});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Editar oficial Arthur Teste',exact:true})).toBeFocused();
  }
  expect(await page.evaluate(()=>window.__mock.calls.filter(c=>c.patch).length)).toBe(0);
});

test('cada jurisdição oferece cadastro, inclusive vazia; nome, situação e histórico são preservados',async({page})=>{
  await prepare(page); await page.goto('/painel.html');
  for (const jurisdiction of ['New Hanover','West Elizabeth','Lemoyne','Sem jurisdição']) {
    await expect(page.getByRole('button',{name:'Adicionar oficial em '+jurisdiction,exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'Adicionar oficial em Lemoyne',exact:true}).click();
  await expect(page.getByLabel('Contingente atual')).toHaveValue('Lemoyne');
  await expect(page.getByLabel('Nome do oficial no RP')).toBeFocused();
  await page.getByLabel('Nome do oficial no RP').fill('  João   Novo  ');
  await page.getByLabel('Situação inicial').selectOption('Pendente');
  await page.getByLabel('Observação inicial (opcional)').fill('Admitido após treinamento.');
  await page.getByRole('button',{name:'Cadastrar oficial',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#officersCount')).toHaveText('5');
  await expect(page.locator('.section').filter({has:page.getByRole('heading',{name:'✦ Lemoyne',exact:true})}).locator('tr[data-id]')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Editar oficial João Novo',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>window.__mock.officers.find(o=>o.nome==='João Novo'))).toMatchObject({origem:'Lemoyne',status:'Pendente',destino:'A definir',observacao:'Admitido após treinamento.',executed_at:null});
  await page.locator('#historyToggle').click();
  await expect(page.locator('#history')).toContainText('Cadastro inicial');
  await expect(page.locator('#history')).toContainText('João Novo');
  await page.locator('#viewDismissed').click();
  await expect(page.locator('[data-add]')).toHaveCount(0);
  await expect(page.locator('#newOfficer')).toBeHidden();
});

test('cadastro não duplica após perda de resposta e falha preserva o formulário',async({page})=>{
  await prepare(page); await page.goto('/painel.html');
  await page.locator('#newOfficer').click();
  await page.getByLabel('Nome do oficial no RP').fill('Novo Recruta');
  await page.evaluate(()=>{window.__mock.saveFail=true;});
  await page.getByRole('button',{name:'Cadastrar oficial',exact:true}).click();
  await expect(page.locator('#officerEditorError')).toContainText('não foi cadastrado');
  await expect(page.getByLabel('Nome do oficial no RP')).toHaveValue('Novo Recruta');
  await page.evaluate(()=>{window.__mock.saveFail=false;window.__mock.createResponseLost=true;});
  await page.getByRole('button',{name:'Cadastrar oficial',exact:true}).click();
  await expect(page.locator('#officerEditorError')).toContainText('Resposta indisponível');
  await page.getByRole('button',{name:'Cadastrar oficial',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(()=>window.__mock.officers.filter(o=>o.nome==='Novo Recruta').length)).toBe(1);
  const requests=await page.evaluate(()=>window.__mock.calls.filter(c=>c.rpc==='criar_oficial').map(c=>c.payload.p_requisicao));
  expect(new Set(requests).size).toBe(1);
});

test('duplicado no efetivo é recusado e cancelar cadastro vazio não grava',async({page})=>{
  await prepare(page,{empty:true}); await page.goto('/painel.html');
  await expect(page.locator('[data-add]')).toHaveCount(4);
  await page.getByRole('button',{name:'Adicionar oficial em West Elizabeth',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Adicionar oficial em West Elizabeth',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>window.__mock.calls.filter(c=>c.rpc==='criar_oficial').length)).toBe(0);
  await page.locator('#newOfficer').click(); await page.getByLabel('Nome do oficial no RP').fill('Duplicado');
  await page.getByRole('button',{name:'Cadastrar oficial',exact:true}).click();
  await page.locator('#newOfficer').click(); await page.getByLabel('Nome do oficial no RP').fill('duplicado');
  await page.getByLabel('Contingente atual').selectOption('Lemoyne');
  await page.getByRole('button',{name:'Cadastrar oficial',exact:true}).click();
  await expect(page.locator('#officerEditorError')).toContainText('Já existe');
  await page.setViewportSize({width:390,height:900});
  expect(await page.locator('#officerEditor').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/registros-cadastro-390.png'});
});
