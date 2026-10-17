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
