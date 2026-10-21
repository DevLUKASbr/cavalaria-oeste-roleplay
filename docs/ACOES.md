# Livro de Ações

## Fluxo e permissões

Todos os cargos autorizados podem consultar o livro e registrar confrontos. Campos obrigatórios: ação (3–160 caracteres), momento da ocorrência, resultado `vitoria` ou `derrota`, quantidade inteira de oponentes (1–200), seleção de 1–200 oficiais e patente do responsável (2–80 caracteres). O relato aceita até 5.000 caracteres e é opcional. A data precisa ser válida, a partir de 2020, sem ultrapassar o momento atual em mais de cinco minutos de tolerância de relógio. A quantidade da Cavalaria é calculada pela seleção, sem IDs repetidos, e conferida novamente no servidor.

A autoria é derivada de Supabase Auth e do cargo conferido no servidor. Nenhum `autor`, cargo, data de criação ou origem enviados pelo cliente substitui esses valores. A patente é uma declaração manual do oficial, independente de seu cargo de acesso; ela não concede permissões. Os participantes são selecionados entre as contas autorizadas cadastradas em Contas e permissões, pelo campo Nome no RP. O diretório inclui desconectados e contas que nunca fizeram login; não usa o último login como indicador de presença. Contas bloqueadas/sem acesso e contas sem nome no RP válido não são oferecidas para novos registros. E-mails, sessões e metadados privados não são retornados.

A seleção tem busca por nick, marcadores removíveis, contagem automática e recarga em caso de falha. Buscar um nome não desmarca os demais. Registros anteriores continuam legíveis e editáveis: IDs de conta e nomes históricos são preservados. Participantes antigos sem conta atual aparecem como participantes do registro original e podem ser mantidos ou desmarcados, mas não são oferecidos em novos registros.

O autor pode corrigir o próprio registro ativo. Adm, Xerife e Sub-Xerife têm `acoes.gerenciar` para revisar qualquer ação, arquivar e restaurar. Acesso limitado legado também registra e consulta ações, conforme autorização do proprietário para todos os oficiais. Identidade e data de criação são preservadas na edição; a última alteração guarda responsável, patente e data. Não há histórico completo de versões nem exclusão definitiva. Edições simultâneas do mesmo registro prevalecem pela última gravação.

## API e persistência

`GET /api/acoes` lista ações ativas, da ocorrência mais recente para a mais antiga. `?arquivados=1` exige liderança. `GET /api/acoes?oficiais=1` retorna `{ oficiais: [{ id, nome, cargo }] }` para contas com acesso a Ações, sem ampliar acesso a `/api/contas`. O diretório pagina Supabase Auth em lotes de 200 e confere os cargos legados.

`POST /api/acoes` aceita `acao: criar|editar|arquivar|restaurar`. Editar, arquivar e restaurar exigem `id`; as quatro operações exigem `patente` de quem as executa. Criar e editar exigem `participantes_ids` e os campos do confronto. O servidor resolve os nomes das contas e ignora nomes enviados junto dos IDs. Os snapshots `participantes` e `participantes_ids` são alinhados e preservam a história do registro. Para compatibilidade com páginas anteriores, nomes textuais só são aceitos quando resolvem sem ambiguidade uma conta autorizada ou um participante do próprio registro editado. IDs sintéticos `anterior:<índice>` só resolvem nomes antigos existentes naquele registro; a persistência guarda ID nulo quando não há conta associada.

Respostas de gravação retornam `{ acao }`; a leitura retorna `{ acoes }`. Erros usam `{ erro }`, sem retornar sucesso em falha de persistência.

Os registros ficam em `cavalaria/acoes/<id>.json`, no Storage privado existente. Autoria, `criado_em`, `atualizado_em`, `atualizado_por`, `arquivado_em` e `arquivado_por` são preenchidos no servidor. Origem inicial é `manual` e `referencia_externa` é nula, sempre definidas pelo servidor.

Somente o livro de Ações ativa paginação completa do armazenamento, com lotes de 1.000 nomes e leitura de oito arquivos por vez. Falhas de leitura ou registros ilegíveis interrompem a resposta para evitar um relatório parcial apresentado como completo. Os demais módulos preservam o comportamento anterior. A listagem completa ainda cresce em custo e tempo com o volume; cotas e tempo de execução do Supabase continuam aplicáveis.

## Presença no painel

Todos os oficiais continuam disponíveis para seleção, com indicadores textuais Online no painel, Offline ou Status indisponível. Online significa presença confirmada nos últimos dois minutos em uma página interna visível, com sessão autorizada. Não mede a conexão dentro do jogo, nem usa o último login como presença. Abas ocultas não renovam a atividade; voltar ao painel retoma a confirmação.

`POST /api/presenca` renova um único objeto privado `cavalaria/presenca/<user_id>.json` por conta. ID e horário do cliente são ignorados: a conta vem da sessão validada e o horário vem de `updated_at` do Storage. As abas e dispositivos da mesma conta renovam o mesmo objeto. Fechar uma aba ou sair não apaga a presença das demais; a saída expira em dois minutos após a última confirmação. Não há arquivos por aba nem histórico de atividades acumulado.

`GET /api/presenca` exige acesso a Ações e retorna `{ online: [{ id, expira_em }], servidor_em }`, sem e-mails, tokens ou horários de último login. Pagina os metadados em lotes de 1.000 sem baixar cada objeto. Erros e timestamps inválidos geram 502, nunca uma lista falsa de offline. Não altera as permissões de Contas nem as políticas RLS.

`presenca.js` inicia somente após `requirePage` autorizar a conta, usa o token atual a cada chamada e confirma a presença a cada 45 segundos enquanto a página estiver visível e com rede. Para no logout e ao sair da página. A consulta do seletor ocorre a cada 30 segundos apenas com o editor aberto e visível; o status expira localmente e fica indisponível se a leitura falhar ou não for renovada em 45 segundos. Os relógios do navegador e servidor não precisam estar sincronizados. Há timeout de 12 segundos e recuperação automática. Atualizações de status só alteram os textos dos indicadores, preservando seleção, foco e rascunho. A criação/edição de ações independe da consulta de presença.

O mecanismo usa o Storage privado já existente, sem SQL, novas credenciais ou serviço adicional. As chamadas periódicas consomem as cotas normais da API e do Storage; não implica ausência de limites dos provedores.

## Relatórios

Filtros de período são inclusivos e usam a data da ocorrência em `America/Bahia`. Busca considera título, relato, nomes dos participantes e responsável/patente. Resultado pode ser vitória, derrota ou todos. A paginação de dez cartões é apenas visual: indicadores e CSV incluem todos os resultados filtrados. Taxa de vitória = vitórias / ações filtradas; livro vazio mostra taxa indisponível.

O Início consulta o mesmo livro ativo para o mês atual, sem solicitar dados do efetivo a Membros. Contas identificadas são contadas pelo ID mesmo quando mudam de nick; registros legados sem IDs usam o nome normalizado e só são associados a um ID quando a correspondência é única no relatório. O CSV inclui identificador, momento da ocorrência, confronto, resultado, participantes, relato e autoria/última alteração. Usa UTF-8 com BOM, separador `;`, escape de aspas e proteção contra fórmulas de planilhas. Arquivados só aparecem em consulta e relatório separados da liderança.

## Publicação

1. Executar `npm test`, `npm run test:e2e`, `npm run build:edge` e `npm run build:cloudflare`.
2. Publicar `dist/cavalaria-api/index.ts` no editor da função existente `cavalaria-api`, ou executar o workflow caso `SUPABASE_ACCESS_TOKEN` esteja configurado no GitHub.
3. Publicar a branch na Cloudflare e integrar o PR à `main` após as verificações. A whitelist de `cloudflare/proxy.mjs` precisa conter `acoes`, além da rota do Edge router.
4. Conferir `/acoes` autenticado, livro/contagens e formulário; acessos sem sessão e token inválido devem retornar 401. Para validar gravações em produção, usar registros e contas de teste expressamente autorizados.

Nenhum SQL ou migração de dados é executado. Testes automatizados usam HTTP e dados simulados, sem criar ações reais.

## Integração futura com o jogo ou Discord

Ainda não há webhook, bot, captura de mensagens ou conexão ao West. Os campos de origem e referência externa reservam a identificação de uma importação futura. A implementação futura dependerá de uma fonte autorizada: webhook do servidor do jogo ou bot com acesso às mensagens permitidas. Um webhook de envio ao Discord, sozinho, não lê o livro nem mensagens existentes.

A entrada futura deverá autenticar a origem, validar e normalizar o confronto/participantes/patente, impedir duplicação pelo identificador externo e preservar a distinção entre oficial do jogo e conta do painel. As credenciais devem ficar no servidor. Nenhuma URL secreta deve ser gravada no frontend.
