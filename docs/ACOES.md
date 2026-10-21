# Livro de Ações

## Fluxo e permissões

Todos os cargos autorizados podem consultar o livro e registrar confrontos. Campos obrigatórios: ação (3–160 caracteres), momento da ocorrência, resultado `vitoria` ou `derrota`, quantidades inteiras de Cavalaria e oponentes (1–200), um nome de participante por linha e patente do responsável (2–80 caracteres). O relato aceita até 5.000 caracteres e é opcional. A data precisa ser válida, a partir de 2020, sem ultrapassar o momento atual em mais de cinco minutos de tolerância de relógio. A quantidade da Cavalaria precisa corresponder ao número de nomes, sem duplicatas após normalização Unicode, espaços e caixa.

A autoria é derivada de Supabase Auth e do cargo conferido no servidor. Nenhum `autor`, cargo, data de criação ou origem enviados pelo cliente substitui esses valores. A patente é uma declaração manual do oficial, independente de seu cargo de acesso; ela não concede permissões. Os participantes são nomes no RP informados pelo responsável, sem expor a Membros os dados administrativos do efetivo ou de Contas.

O autor pode corrigir o próprio registro ativo. Adm, Xerife e Sub-Xerife têm `acoes.gerenciar` para revisar qualquer ação, arquivar e restaurar. Acesso limitado legado também registra e consulta ações, conforme autorização do proprietário para todos os oficiais. Identidade e data de criação são preservadas na edição; a última alteração guarda responsável, patente e data. Não há histórico completo de versões nem exclusão definitiva. Edições simultâneas do mesmo registro prevalecem pela última gravação.

## API e persistência

`GET /api/acoes` lista ações ativas, da ocorrência mais recente para a mais antiga. `?arquivados=1` exige liderança. `POST /api/acoes` aceita `acao: criar|editar|arquivar|restaurar`. Editar, arquivar e restaurar exigem `id`; as quatro operações exigem `patente` de quem as executa. Criar e editar também exigem os campos do confronto. Respostas retornam `{ acao }`; a leitura retorna `{ acoes }`. Erros usam `{ erro }`, sem retornar sucesso em falha de persistência.

Os registros ficam em `cavalaria/acoes/<id>.json`, no Storage privado existente. Autoria, `criado_em`, `atualizado_em`, `atualizado_por`, `arquivado_em` e `arquivado_por` são preenchidos no servidor. Origem inicial é `manual` e `referencia_externa` é nula, sempre definidas pelo servidor.

Somente o livro de Ações ativa paginação completa do armazenamento, com lotes de 1.000 nomes e leitura de oito arquivos por vez. Falhas de leitura ou registros ilegíveis interrompem a resposta para evitar um relatório parcial apresentado como completo. Os demais módulos preservam o comportamento anterior. A listagem completa ainda cresce em custo e tempo com o volume; cotas e tempo de execução do Supabase continuam aplicáveis.

## Relatórios

Filtros de período são inclusivos e usam a data da ocorrência em `America/Bahia`. Busca considera título, relato, nomes dos participantes e responsável/patente. Resultado pode ser vitória, derrota ou todos. A paginação de dez cartões é apenas visual: indicadores e CSV incluem todos os resultados filtrados. Taxa de vitória = vitórias / ações filtradas; livro vazio mostra taxa indisponível. Oficiais distintos são contados por nome normalizado, portanto homônimos não são diferenciados por identidade de conta.

O Início consulta o mesmo livro ativo para o mês atual, sem solicitar dados do efetivo a Membros. O CSV inclui identificador, momento da ocorrência, confronto, resultado, participantes, relato e autoria/última alteração. Usa UTF-8 com BOM, separador `;`, escape de aspas e proteção contra fórmulas de planilhas. Arquivados só aparecem em consulta e relatório separados da liderança.

## Publicação

1. Executar `npm test`, `npm run test:e2e`, `npm run build:edge` e `npm run build:cloudflare`.
2. Publicar `dist/cavalaria-api/index.ts` no editor da função existente `cavalaria-api`, ou executar o workflow caso `SUPABASE_ACCESS_TOKEN` esteja configurado no GitHub.
3. Publicar a branch na Cloudflare e integrar o PR à `main` após as verificações. A whitelist de `cloudflare/proxy.mjs` precisa conter `acoes`, além da rota do Edge router.
4. Conferir `/acoes` autenticado, livro/contagens e formulário; acessos sem sessão e token inválido devem retornar 401. Para validar gravações em produção, usar registros e contas de teste expressamente autorizados.

Nenhum SQL ou migração de dados é executado. Testes automatizados usam HTTP e dados simulados, sem criar ações reais.

## Integração futura com o jogo ou Discord

Ainda não há webhook, bot, captura de mensagens ou conexão ao West. Os campos de origem e referência externa reservam a identificação de uma importação futura. A implementação futura dependerá de uma fonte autorizada: webhook do servidor do jogo ou bot com acesso às mensagens permitidas. Um webhook de envio ao Discord, sozinho, não lê o livro nem mensagens existentes.

A entrada futura deverá autenticar a origem, validar e normalizar o confronto/participantes/patente, impedir duplicação pelo identificador externo e preservar a distinção entre oficial do jogo e conta do painel. As credenciais devem ficar no servidor. Nenhuma URL secreta deve ser gravada no frontend.
