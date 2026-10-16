# Cavalaria Oeste Roleplay — Evolução para Sistema Modular de Gestão

> **Instrução de implementação para Codex no VS Code**
> Projeto: `DevLUKASbr/cavalaria-oeste-roleplay`
> Stack existente: HTML/CSS/JavaScript, Netlify e Supabase.
> Objetivo: transformar o painel interno atual (pergaminho longo dedicado ao registro de oficiais) em uma aplicação administrativa com navegação lateral, dashboard inicial, módulos independentes e autorização por permissões, preservando tudo que já funciona.

## 1. Resultado esperado

Após o login individual, o usuário deve acessar um **painel de gestão da Cavalaria**, com estética de sistema moderno (CRM/dashboard) e identidade faroeste/RDR RP. Não utilizar mais o documento/panfleto comprido como estrutura principal. Conservar detalhes visuais da época — dourado, couro, pergaminho discreto, estrelas de xerife e verde-escuro — sem comprometer legibilidade, densidade de informação ou rapidez de navegação.

**Layout desktop:**
- **Sidebar fixa à esquerda** (aprox. 240–270 px), com logo, identificação da Cavalaria, menu por módulos, item ativo, indicador de notificações e opção para recolher/expandir.
- **Topbar** no conteúdo principal: título e descrição da página, breadcrumb quando necessário, nome e cargo do usuário logado, notificações, botão de sair e indicação de sessão.
- **Área principal à direita**, dinâmica, com widgets, tabelas, formulários, gráficos e cartões organizados. A navegação entre módulos não deve criar uma página gigante empilhada.
- **Mobile/tablet:** menu lateral como drawer acessível por botão; conteúdo responsivo, tabelas com rolagem horizontal e ações utilizáveis por toque.
- A experiência visual deve ser **sistema de gestão profissional ambientado no faroeste**, não uma reprodução de papel envelhecido em cada módulo. Usar texturas apenas como acentos e detalhes.

## 2. Navegação lateral — módulos

| Módulo | Objetivo e primeira entrega |
|---|---|
| **Início / Dashboard** | Indicadores de efetivo, movimentações e atividade, avisos oficiais, gráficos, rankings e atalhos. |
| **Registros** | Migrar integralmente a tela existente de controle de oficiais, com nome, jurisdição de origem/destino, situação, proposta, observações, exoneração, reversão autorizada e auditoria. |
| **Treinamentos** | Gerenciar sessões de instrução: tema, instrutor, data, participantes, presenças, avaliação e histórico. |
| **Recrutamento** | Acompanhar candidatos por etapas: inscrição, avaliação, aprovado/reprovado, ingresso na Cavalaria; histórico e responsáveis. |
| **Investigações** | Casos e dossiês de RP com responsável, status, descrição, evidências/links e histórico, acesso restrito. |
| **Ações** | Registro de operações de RP: data, tipo, local, participantes, responsável, resultado, ocorrências e métricas (inclusive abates/`kills` quando permitido pelas regras do servidor). |
| **Premiações** | Medalhas, reconhecimentos, critérios, concessões aprovadas e histórico. |
| **Avisos** | Comunicados oficiais criados por usuários autorizados; prioridade, destinatários, publicação/expiração e leitura. |
| **Contas e Permissões** | Área administrativa para usuários, cargos, contas, acessos por módulo e auditoria. Integrar com o gerenciamento de contas já existente. |

Reservar estrutura para incluir novos módulos sem refazer a sidebar. Não inventar dados nem apresentar módulos vazios como funcionais. Módulos não implementados devem aparecer como **“Em desenvolvimento”** com descrição útil, ou ocultos conforme a fase e permissões.

## 3. Dashboard inicial — interativo e baseado em dados reais

Propor uma página inicial rica, objetiva e dinâmica:

1. **Cabeçalho de boas-vindas** com nome de RP, patente/cargo, jurisdição (quando disponível) e data atual; arte leve alusiva ao Velho Oeste.
2. **Cards/KPIs:** total de oficiais, ativos, em avaliação/inativos (somente se houver campo ou regra confiável), exonerações pendentes, exonerações concluídas e distribuição por jurisdição.
3. **Gráficos:** efetivo por jurisdição e evolução de ações por período, sem fabricar histórico. Se os dados não existirem, mostrar estado vazio e texto explicativo.
4. **Rankings:** mais ações, maior participação e mais abates (`kills`) *apenas quando houver dados registrados e regras de contagem definidas*. Exibir período e critério, evitar pontuação inferida. Deixar claro que ranking reflete registros de RP, não habilidade real.
5. **Avisos do Alto Comando:** cards com comunicado, prioridade, autor, data e indicador de leitura; no primeiro estágio, estado vazio caso ainda não exista armazenamento.
6. **Atividades recentes:** alterações, transferências, treinamentos, operações e premiações conforme eventos realmente disponíveis e autorizados.
7. **Ações rápidas:** Registrar ação, consultar efetivo, cadastrar treinamento, publicar aviso, conforme a permissão do usuário.

Dashboard deve comportar estados **carregando, sem dados, erro e sucesso** e atualização/refresh sem recarregar a página inteira, quando viável. Supabase Realtime é opcional apenas para tabelas e eventos necessários; prever fallback com atualização manual.

## 4. Autorização e hierarquia — requisito crítico

Separar **cargo/patente exibido** de **permissão efetiva**. Não assumir que um nome de patente concede automaticamente acesso administrativo. Definir um mecanismo RBAC controlado no servidor, com papéis iniciais sugeridos (ajustáveis):

- `admin` (Alto Comando): administração e liberação de módulos, contas e aprovações sensíveis.
- `comando` (Marshal/Xerife/Subxerife, se assim aprovado): gestão operacional configurável; não herda todas as ações sensíveis automaticamente.
- `instrutor`: treinamentos e presenças, conforme escopo autorizado.
- `recrutador`: seleção e avaliação de candidatos.
- `investigador`: acesso apenas aos casos permitidos.
- `oficial`: consulta operacional e criação de registros permitidos.
- `recruta`: visão básica, treinamentos e comunicados definidos pelo comando.

Criar matriz de permissões por **módulo + ação**, no mínimo `view`, `create`, `edit`, `approve`, `delete` quando aplicável, com escopo por jurisdição/registro quando necessário. Um usuário pode acumular funções de equipe, sem receber direitos não autorizados.

**Obrigatório:**
- A sidebar oculta itens sem acesso, mas **isso não substitui** autorização no backend.
- Reforçar permissões com RLS, policies, funções/RPC ou Netlify Functions autenticadas, conforme arquitetura do repositório.
- **Nunca** usar `SUPABASE_SECRET_KEY`, service role ou segredo administrativo no frontend. Credenciais privilegiadas apenas em Netlify Functions; validar identidade e autorização a cada operação.
- Nenhum usuário pode alterar a própria permissão para se promover; concessões sensíveis devem ficar auditadas.
- Preservar fluxo de login individual, troca de senha, contas e controle administrativo existentes; não voltar ao modelo de senha compartilhada.
- Não criar policies permissivas para `anon`/`authenticated`, não desativar RLS como atalho.

## 5. Registros — migração sem perda de funcionalidades

Mover a interface atual do **Registro Geral** para uma rota/módulo `Registros`, mantendo integralmente:
- Lista de oficiais e jurisdição de origem; filtros, busca e distribuição de efetivo.
- Campos existentes de situação/status, destino, proposta e observações.
- Marcação de exoneração **pendente versus executada**, sem excluir registros.
- Carimbo visual para exoneração efetivamente concluída.
- **Reverter exoneração**, com confirmação, justificativa e autorização `admin` já implantadas.
- Auditoria de alterações e rastreabilidade.

**Não** reescrever tabelas, renomear colunas, alterar IDs, remover fluxos, resetar informações ou refazer SQL de produção sem necessidade comprovada. Reutilizar serviços/componentes existentes sempre que possível.

## 6. Diretrizes visuais

- **Fundo da área de gestão:** tons claros quentes ou carvão/verde-escuro controlados, com cards bem definidos; contraste acessível.
- **Sidebar:** verde-floresta quase preto (`#15251D` como referência), detalhes em ouro antigo (`#BA8C3B`) e item ativo destacado; navegação intuitiva.
- **Cards:** superfícies limpas, bordas suaves, sombra discreta e raio moderado (10–14px), com texturas apenas em cabeçalhos ou detalhes.
- **Cores de estado:** verde para ativo/concluído, âmbar para pendente, vermelho para exonerado/erro; sempre com rótulo textual e não somente cor.
- **Tipografia:** serifada western apenas em títulos e destaques; fontes legíveis para labels, tabelas e formulários.
- **Ícones:** consistentes, incluindo estrela de xerife, pasta, escudo, medalha, calendário e gráfico, sem excesso de emojis.
- **Animações:** microinterações discretas (150–250ms), respeito a `prefers-reduced-motion`.
- Preservar logo Oeste Roleplay existente e coerência com o novo login cinematográfico.

## 7. Arquitetura recomendada

Primeiro **inspecionar o código real da `main`** e aderir à estrutura existente (inclusive `site/`, `netlify.toml`, Netlify Functions, Supabase, CSS e JS já criados), sem impor framework novo desnecessariamente.

Separar conceitualmente:
- shell/layout: sidebar, topbar, área principal e navegação;
- modules/pages: dashboard, registros e futuros módulos;
- shared UI: cards, tabelas, filtros, modais, badges, estados vazios e alerts;
- services: Supabase, autenticação, permissões e endpoints existentes;
- estilos: tokens/design system compartilhado.

Pode usar navegação por rotas ou estados conforme o projeto, garantindo link direto, voltar/avançar do navegador e proteção de rotas. Não assumir que `.html` legado possa ser removido: preservar links/redirects existentes.

## 8. Entrega incremental (não executar tudo de uma vez)

### Fase 0 — Diagnóstico e desenho técnico
- Fazer leitura de `README`/`LEIA-ME`, arquivos HTML, CSS, JS, `netlify.toml`, funções e SQL, além da branch `main` atualizada.
- Identificar autenticação, authorization/RLS, rotas, tabelas e limites reais; mapear funcionalidades existentes.
- Fornecer plano de migração com riscos, dependências de banco e proposta de menus/permissões.
- Não modificar SQL de produção nem publicar nada nessa fase.

### Fase 1 — Shell e dashboard (MVP visual funcional)
- Implementar sidebar, topbar, navegação responsiva e dashboard inicial.
- Migrar o Registro Geral inteiro para o módulo **Registros**, preservando seus fluxos.
- Integrar nome/cargo do usuário e permissões já existentes; nenhuma permissão nova implícita.
- Adicionar módulos futuros com tela de estado informativo, sem formulários falsamente funcionais.
- Dashboard utiliza somente dados existentes; gráficos/rankings sem dados mostram estado vazio.
- Criar testes de navegação, sessão, regressão de registros e responsividade.
- **Esta é a primeira etapa de código que deverá ser entregue e revisada.**

### Fase 2 — Autorização formal e avisos
- Propor e implementar permissões granulares após aprovação da matriz de papéis.
- Construir CRUD de avisos, publicação e leitura, com auditoria.
- Exigir migrações SQL versionadas, reversíveis e aplicadas separadamente no Supabase mediante aprovação.

### Fase 3 — Treinamentos, recrutamento e ações
- Implementar cada módulo com seus próprios formulários, tabelas, filtros, validações, estados e relatórios.
- Registrar atividades reais de RP; definir critérios para métricas/rankings com o comando antes de publicar.

### Fase 4 — Investigações, premiações e ranking avançado
- Casos e evidências com controle estrito de acesso; trilha de auditoria.
- Sistema de premiações com critérios e aprovação.
- Rankings filtráveis por período, jurisdição e tipo de ação, com dados verificáveis.

## 9. Regras operacionais para o Codex

1. Trabalhar no **clone oficial** `DevLUKASbr/cavalaria-oeste-roleplay`, em branch `feature/painel-modular-cavalaria` criada da `main` mais recente; não trabalhar nos arquivos antigos de `cavalaria_oeste_acesso_senha_unica`.
2. Se houver modificações não commitadas, não sobrescrevê-las; inspecionar `git status` antes de alterar.
3. **Primeiro responder com o diagnóstico e plano da Fase 1**; depois implementar somente a Fase 1, se o ambiente permitir, sem avançar para módulos de banco/permissões não definidos.
4. Não inventar dados, mudanças no banco ou acessos; levantar dúvidas essenciais com clareza.
5. Preservar login individual, gestão de contas, Netlify Functions, Supabase, auditoria e reversões.
6. Executar testes disponíveis e registrar resultados, limitações e riscos.
7. Ao fim, apresentar relatório com **Resumo / Arquivos alterados / Testes / Pendências / Impacto no banco / STATUS.md** (criar ou atualizar `STATUS.md`).
8. Commit e push apenas após validação; abrir Pull Request para `main`. **Não realizar merge nem deploy de produção sem aprovação expressa.**

## 10. Critérios de aceite da Fase 1

- O login atual continua funcionando com contas reais; rotas protegidas bloqueiam acesso não autenticado.
- Após autenticar, abre **Dashboard**, não o pergaminho longo.
- A sidebar muda de módulo sem perder sessão; indicação clara do item ativo.
- **Registros** contém todas as funções e dados atuais, incluindo exoneração e reversão autorizada.
- Dashboard mostra totais reais de efetivo (ou estados vazios quando faltarem dados), distribuição por jurisdição e atalhos autorizados.
- Os demais menus não criam falsas funcionalidades nem permitem ações sem autorização.
- Layout funcional em desktop e mobile; sem overflow horizontal indevido fora de tabelas.
- Estados de carregamento, erro, vazio e confirmação existentes.
- Nenhuma chave privilegiada exposta no navegador; nenhuma política RLS afrouxada.
- Documentação de teste e instruções claras para preview Netlify antes do merge.

---

## Prompt de execução (copiar no Codex com este arquivo aberto)

> Leia integralmente `CAVALARIA_REDESIGN_PAINEL_MODULAR.md` como especificação da evolução da Cavalaria Oeste Roleplay. Inspecione primeiro o repositório oficial e a `main` atual. Transforme a experiência pós-login em um painel modular tipo CRM, com sidebar western moderna, dashboard inicial dinâmico com dados reais e módulo Registros preservando 100% das funcionalidades. Planeje permissões por módulo/ação sem conceder acessos novos nesta fase; mantenha os demais módulos como placeholders honestos. Execute somente a Fase 1, com testes de regressão, responsividade e relatório Resumo/DIFF/STATUS.md. Trabalhe em branch própria, não altere SQL de produção e não faça merge/deploy sem minha aprovação.
