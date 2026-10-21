# Manual de Armamentos — 21/10/2026

Módulo de consulta com 15 armas, cinco categorias e seis patentes, fiel à tabela enviada pelo proprietário. As diferenças de Henry, Volcanic e Mauser são mantidas exatamente, conforme confirmação expressa; não há herança automática. Fotos reais dos modelos do jogo, características descritivas, fichas com permissões por patente, busca por nome/alias, filtros e relação completa.

Identidade visual verde, dourado e papel, insígnias e fotografias de compêndio. Menu e atalhos integrados para todos os cargos autorizados. Escolha de patente é apenas consulta: não altera cargos, contas ou registros. Sem novo endpoint, SQL ou regra RLS. Fontes e operação em [docs/ARMAMENTOS.md](docs/ARMAMENTOS.md) e [créditos das imagens](docs/ARMAMENTOS-IMAGENS.md).

Validação: 90 testes de servidor/cliente e 57 testes Chromium aprovados; builds Edge e Cloudflare compilados. Revisão em 320, 390, 768 e 1440 px, imagens locais conferidas, fichas com Escape/retorno de foco e matriz de permissões testada contra a tabela.

---

# Presença dos oficiais no painel — 21/10/2026

Seleção de participantes mantém todos os oficiais e exibe Online no painel, Offline ou Status indisponível. Atividade confirmada em uma página interna visível renova a presença a cada 45 segundos. A presença expira dois minutos após a última confirmação, sem usar último login nem medir a conexão no jogo. Consulta automática enquanto o formulário estiver aberto preserva seleção, foco e rascunho; falhas não bloqueiam o registro da ação.

Nova rota autenticada `GET/POST /api/presenca`, com um objeto por conta no Storage privado existente e horário determinado pelo servidor. Abas/dispositivos renovam a mesma chave; fechar uma aba não desconecta as demais. Consulta pagina metadados, sem baixar todos os objetos. Nenhum SQL, conta, credencial ou regra RLS alterada. As chamadas consomem as cotas existentes dos provedores.

Validação: **87 testes de servidor/cliente** e **51 testes Chromium**, com builds Edge e Cloudflare. Guia de operação e limites em [docs/ACOES.md](docs/ACOES.md). Publicar a API antes de integrar o frontend, seguindo o fluxo existente.

---

# Seleção de oficiais em Ações — 21/10/2026

Campos de participantes substituídos por caixas de seleção com busca pelo Nome no RP cadastrado em Contas e permissões. A lista inclui todas as contas autorizadas mesmo desconectadas ou sem login anterior, e a quantidade da Cavalaria acompanha a seleção automaticamente. Busca e falhas de recarga preservam o rascunho e os oficiais marcados.

Diretório mínimo em `GET /api/acoes?oficiais=1`, disponível a todos os oficiais com acesso ao módulo, sem expor e-mails ou liberar a administração de Contas. Backend valida os IDs, resolve os nomes no servidor e rejeita duplicados/contas indisponíveis. Snapshots e participantes anteriores sem conta atual são preservados na edição. Relatórios usam IDs quando disponíveis para evitar duplicar contas após mudança de nick.

Validação: **75 testes de servidor** e **48 testes Chromium** aprovados; bundle Edge compilado; seletores desktop e celular revisados. Testes usam dados simulados. Sem migração SQL ou mudança de contas/RLS. Sem medição de presença do painel ou do jogo: a lista é completa e independente de sessão ativa.

---

# Livro de Ações — 21/10/2026

Módulo implementado na branch `feature/acoes-cavalaria`, a partir da `main` em `56a992b`. Todos os oficiais autorizados podem registrar e consultar ações, conforme escolha do proprietário. Cada autor corrige os próprios registros; liderança pode revisar, arquivar e restaurar qualquer ação.

- Registro com ação, data/hora, vitória ou derrota, quantidades de Cavalaria e oponentes, nomes dos participantes, patente declarada do responsável e relato opcional. A quantidade da Cavalaria deve conferir com os nomes, sem duplicatas.
- Nome do responsável, cargo de acesso e data de criação conferidos no servidor. Edição preserva autoria original e identifica a última alteração. A patente declarada não concede acesso.
- Livro com busca, filtros inclusivos de período/resultado, paginação visual, indicadores e CSV completo dos resultados filtrados, com proteção contra fórmulas. Ações arquivadas ficam separadas, acessíveis à liderança.
- Ações do mês no Início, sem consultar o efetivo para Membros. Menu e orientação de Contas atualizados.
- API em `supabase/functions/_shared/handlers/acoes.mjs`, rota no Edge router e proxy Cloudflare, adaptador Netlify e pasta privada `acoes/` no bucket existente. Leitura paginada além de mil registros com paralelismo de oito; falhas não viram relatórios parciais ou zero enganoso. Nenhuma tabela, conta ou política RLS nova.
- Origem manual e referência externa reservadas para integração futura. Discord, bot e importação do livro do jogo ainda não estão conectados.

Validação: **69 testes de servidor** e **45 testes Chromium** aprovados; builds Edge e Cloudflare compilados; telas desktop e celular revisadas. Os fluxos de gravação, correção, arquivamento, restauração e relatórios usam dados simulados. A API foi atualizada no Supabase pelo editor com correspondência exata ao bundle validado; as seis rotas responderam 401 sem sessão. Nenhum registro fictício foi criado em produção.

Guia técnico: [docs/ACOES.md](docs/ACOES.md). A publicação das páginas acompanha a `main` pela Cloudflare. O workflow de atualização da API continua dependendo de `SUPABASE_ACCESS_TOKEN`; enquanto não configurado, publicar a função manualmente pelo editor Supabase antes do merge.

---

# Migração Cloudflare Pages + Supabase — 20/10/2026

**Publicado em https://cavalaria-oeste-roleplay.pages.dev/**. O PR #15 foi integrado à `main` em `5e13cff`; o primeiro deploy Cloudflare foi `9b9474cb-22ba-428c-a674-1466ea31a199`. A integração GitHub foi autorizada somente para este repositório, com publicação automática da `main`. A função `cavalaria-api` foi publicada no projeto Supabase existente. Nenhuma alteração em tabelas, contas, políticas RLS ou dados reais foi executada.

- Páginas publicadas a partir de `site/`, com Functions apenas em `/api/*`, cabeçalhos de proteção e mesma origem para as chamadas do navegador.
- Cloudflare encaminha somente a sessão da conta; a chave administrativa fica na API Supabase. As regras de cargo são reutilizadas e verificadas no servidor.
- API compartilhada em `supabase/functions/_shared/`; adaptadores Netlify mantêm compatibilidade com o deploy anterior. Os cinco módulos usam o mesmo banco/bucket e os mesmos formatos de dados.
- Edge Function `cavalaria-api`, pacote único para deploy pelo editor, configuração Pages em `wrangler.toml` e workflow opcional para atualizações da API pelo GitHub.
- Arquitetura evita o limite de 50 subrequisições externas do Workers Free: a Cloudflare faz uma chamada por operação; a leitura dos registros ocorre no Supabase.

Validação: **53 testes de servidor** e **37 testes Chromium** aprovados; builds Edge e Cloudflare compilados; prévia Wrangler real com páginas 200, API sem sessão 401, rota desconhecida 404 e cabeçalhos conferidos. Em produção, login, Avisos, CSS e JavaScript retornaram 200; as cinco rotas da API retornaram 401 sem sessão; token inválido foi encaminhado à API e rejeitado. O proprietário entrou com sua conta real de administrador: Início carregou os dados existentes, Avisos carregou a lista vazia sem erro de servidor e Criar aviso abriu o editor com a autoria correta. As gravações e os demais cargos foram verificados com HTTP/dados simulados; nenhum aviso fictício foi publicado no ambiente real.

Guia: [docs/MIGRACAO_CLOUDFLARE.md](docs/MIGRACAO_CLOUDFLARE.md). A automação da API ainda requer cadastrar `SUPABASE_ACCESS_TOKEN` diretamente nos secrets de Actions do GitHub; até lá, publicar alterações da função pelo editor Supabase. Atualizações das páginas já são automáticas na Cloudflare. Cotas gratuitas dos provedores e limite existente de 1.000 objetos por pasta continuam aplicáveis.

---
# Atualização do mural de Avisos — 20/10/2026

Implementação visual concluída e preparada para envio ao GitHub na branch `feature/avisos-mural-moderno`, criada da `main` atual (`e7c4b09`). O deploy de produção no Netlify permanece pendente; o painel da equipe informou bloqueio por créditos esgotados.

- Mural com identidade verde e dourada, cartões com autoria/data/cargo, destaque por prioridade, busca e filtros com contagens reais da lista carregada.
- Botão **Criar aviso** para Adm, Xerife e Sub-Xerife. Editor em janela modal com prévia ao escrever, contadores de caracteres, validação, confirmação ao descartar e preservação do texto em falha de publicação.
- Edição, arquivamento e republicação mantidos. Publicar limpa os filtros para que o novo post apareça. Membro e Acesso limitado continuam com leitura dos publicados.
- Layout de desktop e celular revisado em capturas, incluindo texto longo, editor sem rolagem horizontal e botões de publicação visíveis no rodapé da janela.
- Backend, persistência, autorização, sino e integração com o Início reaproveitados da implementação existente. Nenhuma migração de banco ou nova variável de ambiente.

Validação final: **40 testes unitários/servidor aprovados** e **11 testes Chromium de Avisos aprovados**. Os testes usam serviços/dados simulados. Na primeira execução geral, os 26 testes dos demais módulos passaram; três testes de Avisos identificaram nomes acessíveis que incluíam os contadores. Os rótulos foram corrigidos e todos os 11 testes de Avisos passaram novamente após o ajuste final do rodapé. `git diff --check` aprovado.

Publicação: enviar este código pelo fluxo de deploy do projeto existente `glittery-douhua-4fc420`, preservando `site/` como publish directory e `netlify/functions/` como functions directory (já definidos em `netlify.toml`). É necessário publicar também as Functions; um upload apenas da pasta `site/` não inclui a API de avisos. Após o deploy, homologar publicação com liderança e leitura em outra sessão de Membro usando dados de teste autorizados. Nenhum aviso foi inserido no ambiente real nesta tarefa.

Arquivos desta atualização: `site/avisos.html`, `site/avisos.css`, `site/avisos.js`, `tests/browser/avisos.spec.cjs` e este relatório.

---
# STATUS — Avisos da Cavalaria

Data: 17/10/2026 (America/Bahia). Branch: `feature/avisos-cavalaria`, criada da `main` oficial em `ebb3d93`.

Implementação concluída localmente, aguardando revisão do PR e homologação no Deploy Preview. Nenhum merge ou deploy de produção foi executado nesta tarefa.

## Entrega atual

- Aba **Avisos** na sidebar, acessível a todas as contas autorizadas, incluindo Membro e Acesso limitado legado.
- Xerife, Sub-Xerife e Adm podem publicar e editar título, comunicado e prioridade (Normal, Importante ou Urgente), arquivar e republicar. A autorização de cada operação é verificada na Netlify Function.
- Publicados ordenados por prioridade e, em seguida, data de criação; busca por título/conteúdo, atualização manual, confirmação antes de arquivar/republicar, estados de carregamento/vazio/falha e preservação do formulário em erro de publicação.
- Membro e Acesso limitado têm apenas leitura dos publicados, sem acesso aos arquivados. O arquivo fica disponível ao Comando e não há exclusão definitiva.
- Início e sino da topbar mostram até três comunicados publicados, com acesso à lista completa. O sino consulta ao abrir; o Início e a aba têm atualização manual.
- Conteúdo em texto simples escapado, com quebras de linha e palavras longas legíveis em dispositivos móveis. Campos e limites validados também no backend.
- Identidade do autor, cargo, data de criação e responsável/data da última alteração vêm da sessão validada no servidor. Arquivados também identificam quem os arquivou.

## Arquivos desta entrega

| Arquivos | Alteração |
| --- | --- |
| `site/avisos.html`, `site/avisos.js` | nova página, formulário de publicação, leitura, busca e gestão |
| `netlify/functions/avisos.mjs` | API autenticada `/api/avisos`, validação e persistência privada |
| `netlify/lib/acesso.mjs`, `site/comum.js` | adição sincronizada de `avisos` e `avisos.editar`, sem mudar permissões anteriores |
| `site/admin-shell.js`, `site/admin.css` | navegação, sino com dados reais e estilos responsivos |
| `site/dashboard.html`, `site/dashboard.js` | comunicados reais e atalho Avisos no Início |
| `tests/avisos.test.cjs` | autorização real do handler, validação, autoria, arquivo, ordenação e falha de persistência com HTTP simulado |
| `tests/browser/avisos.spec.cjs`, `tests/browser/fixtures.cjs`, `tests/browser/admin.spec.cjs` | fluxos em Chromium, papéis, segurança de texto, erros e regressões |
| `LEIA-ME.md`, `STATUS.md` | instruções, limites, testes e homologação |

## Validação atual

- `npm test`: **40 testes aprovados**, incluindo 11 novos testes da Function Avisos, além de autenticação, sessões e paridade das permissões frontend/backend.
- `npm run test:e2e`: **34 testes Chromium aprovados**, incluindo 8 novos testes de Avisos e regressões dos módulos existentes.
- Responsividade: 320, 390, 768, 844 e 1440 px; Avisos também validado com formulário aberto e conteúdo longo. Capturas desktop/mobile revisadas localmente, em `test-results/` ignorado pelo Git.
- HTML5 estrito e IDs únicos em Avisos e Dashboard, sintaxe CSS e `node --check` nos 10 scripts alterados/adicionados.
- Login, configuração pública Supabase, SQL/RLS/RPCs, gerenciamento de contas, scripts dos módulos anteriores e Functions anteriores permanecem idênticos à base. A única ampliação de permissões é a do novo módulo de Avisos.
- Revisão do diff sem credenciais secretas ou arquivos temporários incluídos; `git diff --check` aprovado.

## Armazenamento e limites

Reutiliza `netlify/lib/armazenamento.mjs`, com objetos JSON em `avisos/<id>.json` no bucket privado `cavalaria`. Nenhuma variável de ambiente nova, tabela ou política RLS. A primeira gravação pode criar o bucket privado, conforme o comportamento já existente.

Não inclui confirmação de leitura, contador de não lidos, envio externo, atualização em tempo real, agendamento, anexos ou histórico completo de revisões. Os metadados mostram criação e última alteração, não uma trilha imutável de todas as versões. O armazenamento compartilhado lista até 1.000 objetos por pasta; paginação de volumes maiores fica pendente.

## Homologação pendente

1. No Deploy Preview, publicar um comunicado com uma conta de teste do Comando e conferir leitura em outra sessão de Membro.
2. Validar persistência após recarregar, edição, prioridade, arquivamento e republicação no Supabase real. Testes locais usaram exclusivamente dados e serviços simulados.
3. Aprovar o PR manualmente antes de qualquer merge ou publicação em produção. Nenhum aviso foi inserido em contas ou dados reais por esta tarefa.

---

# Histórico — Painel modular, Fase 1 (relatório original)

Data: 16/10/2026 (America/Bahia). Fase: **1 — implementada e validada localmente; aguardando revisão e homologação**.

Branch: `feature/painel-modular-cavalaria`, criada da `main` oficial em `2952d1c` e atualizada para `6d18ab8`, incorporando o Recrutamento recém-integrado no PR #7. Não foi realizado merge ou deploy de produção por esta implementação.

## Resumo

- Sidebar de 264 px, recolhível no desktop e drawer no celular/tablet, com foco contido, Escape, fechamento por botão/fundo e indicação da rota ativa.
- Topbar com título, descrição, breadcrumb, nome/cargo, acesso à troca de senha, saída e painel informativo de avisos. Preferência de recolhimento salva apenas localmente.
- Dashboard como destino pós-login, com boas-vindas, data, totais reais de oficiais/estados, distribuição por jurisdição de origem, auditoria recente e atalhos autorizados.
- Estados de carregamento, sucesso, vazio, falha e erro parcial; atualização manual sem recarregar a página.
- Registros, Contas, Treinamentos e Recrutamento mantêm rotas, IDs, scripts de negócio e operações existentes. Cada rota ocupa a área principal; os módulos não são empilhados em uma única página. Histórico e links diretos usam navegação HTML nativa com sessão Supabase persistida.
- Investigações e Ações continuam informativos. Premiações e Avisos aparecem como próximas etapas, sem links, formulários ou direitos novos. Gráficos operacionais e rankings sem armazenamento/critério exibem estados vazios explicativos.

## Arquivos alterados / adicionados

| Arquivos | Alteração |
| --- | --- |
| `site/admin-shell.js`, `site/admin.css` | shell, design visual, navegação responsiva e componentes compartilhados |
| `site/dashboard.html`, `site/dashboard.js` | Dashboard e consultas somente de leitura aos dados existentes e autorizados |
| `site/painel.html`, `site/contas.html`, `site/treinamentos.html`, `site/recrutamento.html` | integração do shell; scripts de negócio, roteiro e fichas existentes preservados |
| `site/investigacoes.html`, `site/acoes.html` | integração do shell e estados informativos explícitos |
| `site/comum.js` | montagem opcional do novo layout e entrada Início derivada de permissões existentes |
| `site/login.js` | apenas destino visual para `dashboard.html` após as verificações atuais |
| `tests/login.test.cjs`, `tests/access-parity.test.cjs` | regressão de login/rotas e paridade da matriz frontend/Functions |
| `tests/browser/admin.spec.cjs`, `tests/browser/fixtures.cjs` | testes reais em Chromium, com serviços e dados fictícios isolados |
| `package.json`, `package-lock.json`, `playwright.config.cjs`, `scripts/serve.cjs`, `.gitignore` | ferramentas locais de testes/preview, sem dependências de runtime ou build de produção |
| `docs/CAVALARIA_REDESIGN_PAINEL_MODULAR.md`, `docs/FASE1_DIAGNOSTICO.md`, `LEIA-ME.md`, `STATUS.md` | especificação, diagnóstico, migração, instruções e relatório |

## Testes

- `npm test`: **29 testes unitários aprovados**. Incluem login individual, e-mail completo, senha incorreta, sessões, autorização, cargo Membro, redirecionamento, primeiro acesso, ocultação da senha e paridade das permissões efetivas com o backend.
- `npm run test:e2e`: **22 testes em Chromium aprovados**. Cobrem Dashboard real a partir de fixtures, falhas/recuperação/vazio, dados restritos para Membro, navegação e histórico, saída, busca/filtros/edição/destino/observações, confirmação e reversão justificada, bloqueio de reversão por nível, auditoria, conteúdo do CSV, impressão, primeiro acesso, Contas, CRUD de tópicos de Treinamentos e roteiro/CRUD de fichas de Recrutamento.
- Responsividade testada em **320×700, 390×844, 768×1024, 844×390 e 1440×1000**, sem overflow da página fora das tabelas. Drawer testado por teclado e sidebar recolhível com preferência persistida.
- Capturas locais de Dashboard desktop/mobile, Registros e sidebar móvel revisadas; os dados das capturas são exclusivamente fixtures fictícias. Artefatos ficam em `test-results/`, ignorados pelo Git.
- Rotas administrativas sem erros JavaScript de runtime nos testes. Os módulos são executados com seus scripts reais; somente Supabase e endpoints externos são simulados.
- Checagens adicionais aprovadas: `node --check` em 23 arquivos JavaScript, HTML5 estrito em 7 páginas, 226 regras CSS e `git diff --check`. Os 25 arquivos candidatos foram revisados sem tokens reais, chaves privadas, credenciais administrativas, arquivos temporários ou conflitos pendentes detectados.

## Impacto no banco e segurança

**Nenhum impacto de esquema ou migração.** SQL, RLS, RPCs, tabelas, IDs, regras de reversão, Netlify Functions, chave/configuração pública do Supabase e headers do Netlify permanecem inalterados.

O cargo e as permissões continuam vindo do fluxo atual. Nenhuma permissão nova foi concedida pela branch. A permissão `recrutamento.editar` pertence à main recém-incorporada e foi preservada. Usuários sem `registro` não consultam oficiais ou auditoria no Dashboard. `painel.js`, `contas.js`, `treinamentos.js` e `recrutamento.js` permanecem idênticos à base oficial.

## Pendências e homologação antes do merge

1. Abrir o Deploy Preview do PR e conferir Dashboard, Registros, Contas, Treinamentos e Recrutamento com contas reais de Xerife/Adm, Membro e, se disponível, nível legado `xerife`.
2. Confirmar login individual, renovação/encerramento de sessão, primeiro acesso e troca de senha no Supabase real. Nenhuma credencial real foi usada na execução local.
3. Em dois navegadores, validar uma alteração autorizada no Registro, Realtime e auditoria; conferir proposta versus exoneração executada e reversão com justificativa usando registros de teste aprovados.
4. Confirmar que Membro não lê o efetivo, não abre Contas nem edita tópicos; conferir a revogação real de acesso pelo gerenciamento de contas.
5. Conferir impressão/CSV e o layout com o volume real de registros e textos longos; homologar também nos navegadores/dispositivos efetivamente usados pelo Comando.
6. Aprovar a Fase 1 antes de merge. Fases 2–4, novos papéis, CRUD de avisos, sessões/presenças de treinamento, operações, premiações e rankings não foram implementados.

## Reprodução local e preview

```powershell
npm ci
npx playwright install chromium
npm test
npm run test:e2e
npm run preview
# Abrir http://127.0.0.1:4173
```

Os testes automatizados interceptam o Supabase e as Functions com fixtures e bloqueiam tráfego externo. A prévia manual usa `site/config.js` e as configurações reais do ambiente; o servidor estático local não executa Netlify Functions. Para integração real, usar exclusivamente o Deploy Preview autorizado do Netlify, mantendo `site/` como diretório de publicação e sem comando de build. Não colar chaves administrativas no frontend.

Diagnóstico e decisões técnicas: [docs/FASE1_DIAGNOSTICO.md](docs/FASE1_DIAGNOSTICO.md). Especificação principal: [docs/CAVALARIA_REDESIGN_PAINEL_MODULAR.md](docs/CAVALARIA_REDESIGN_PAINEL_MODULAR.md).
