# Registro Geral da Cavalaria — Oeste Roleplay

Painel do Alto Comando para revista de efetivo, avaliação de atividade e controle de exonerações.

- **Site** (pasta `site/`): login, dashboard modular, registros, treinamentos, recrutamento, investigações, avisos, ações e contas. HTML/JS puro, sem build.
- **Banco**: Supabase (Postgres com regras RLS + Realtime para o registro; Storage privado para os módulos de conteúdo, incluindo avisos).
- **Cloudflare Pages + Supabase Edge Functions**: nova arquitetura. A Cloudflare publica as páginas e encaminha `/api/...` à função `cavalaria-api`; a chave administrativa fica no próprio Supabase. Os adaptadores Netlify permanecem disponíveis durante a transição.

Cada oficial entra com a própria conta, e o histórico mostra o nome de quem fez cada alteração. **Ninguém precisa abrir o SQL Editor**: contas, nomes, cargos, senhas e tópicos são gerenciados pelo próprio site.

## Publicação na Cloudflare

O painel está publicado em **https://cavalaria-oeste-roleplay.pages.dev/** desde 20/10/2026. A Cloudflare acompanha a branch `main` deste repositório e publica as páginas automaticamente após novos merges. A API `cavalaria-api` está publicada no projeto Supabase existente; contas, senhas e dados foram preservados. No novo domínio, é necessário entrar novamente.

O guia de publicação e manutenção está em [docs/MIGRACAO_CLOUDFLARE.md](docs/MIGRACAO_CLOUDFLARE.md). A automação de atualizações da API é separada: requer o secret `SUPABASE_ACCESS_TOKEN` no GitHub. Enquanto ele não estiver configurado, alterações da API devem ser publicadas pelo editor do Supabase; alterações das páginas continuam automáticas na Cloudflare.

**Onde editar o código da API:** em `supabase/functions/_shared/` — `handlers/` (um arquivo por rota `/api/...`), `lib/` (código comum, como permissões e armazenamento) e `router.mjs` (liga cada rota ao seu arquivo). É a única cópia. Os arquivos em `netlify/` têm só 3 linhas, reaproveitam esse código e não devem ser editados. Mudanças só em `site/` vão ao ar sozinhas; mudanças em `supabase/` precisam ser publicadas (workflow ou editor do Supabase, como acima).

## Páginas

| Página | Quem acessa | O que faz |
|---|---|---|
| `index.html` | todos | Login com usuário (ou e-mail) e senha |
| `dashboard.html` (Início) | contas com algum módulo autorizado | Visão inicial, indicadores reais permitidos, distribuição por jurisdição, auditoria e atalhos |
| `painel.html` (Registros) | Xerife, Sub-Xerife, Adm e contas antigas com nível `xerife` | Registro dos oficiais, exonerações, histórico, CSV |
| `treinamentos.html` | Xerife, Sub-Xerife, Adm (criam e editam) · Membro (só lê) | Tópicos de treinamento com título, subtítulo, descrição e vídeos |
| `recrutamento.html` | Xerife, Sub-Xerife, Adm | Roteiro do recrutamento e fichas dos candidatos |
| `investigacoes.html` | Xerife, Sub-Xerife, Adm | Mapa do Oeste com alvos (pessoas e pontos de interesse) e grupos/territórios |
| `acoes.html` | todos os oficiais autorizados | Livro de ações: confronto, vitória/derrota, participantes, autoria e patente; filtros, indicadores e CSV |
| `avisos.html` | todos os cargos autorizados leem; Xerife, Sub-Xerife e Adm gerenciam | Publicar, editar, buscar, arquivar e republicar comunicados com prioridade e identificação do autor |
| `contas.html` | Xerife, Sub-Xerife, Adm | Criar contas, definir nome e cargo, tirar acesso, gerar nova senha |

O menu de cada pessoa mostra só as páginas que o cargo dela permite. Quem abre uma página sem permissão é levado para a primeira página permitida.

Após o login, a entrada é o **Dashboard**. A navegação usa as rotas HTML existentes, com sidebar e topbar compartilhadas; a sessão individual continua persistida pelo Supabase. O Dashboard de quem não pode ver Registros não consulta efetivo nem auditoria. Premiações permanece como indicação de etapa futura. Os avisos publicados aparecem no Início, no sino e na aba Avisos.

## Organização dos Registros

Para organização do Registro Geral, consulte [docs/REGISTROS.md](docs/REGISTROS.md): efetivo separado das exonerações concluídas, correção de nome e transferência efetiva por contingente, com auditoria. Projetos existentes usam a migração incremental indicada no guia; não reaplicar os cadastros iniciais.

## Ações

Todos os oficiais autorizados, incluindo Membro e Acesso limitado legado, podem registrar e consultar ações. O formulário pede ação, data e hora, quantidade de oponentes, vitória ou derrota, seleção dos participantes e patente de quem registra. Os oficiais são marcados em caixas de seleção, com busca pelo Nome no RP cadastrado em Contas e permissões; a lista inclui todas as contas autorizadas, independentemente de estarem conectadas ou terem feito login. A quantidade da Cavalaria é preenchida automaticamente pela seleção. O relato é opcional. O responsável e o horário de registro vêm do servidor; a patente é declarada pelo oficial, pois não existe cadastro de patentes neste painel.

Cada oficial pode corrigir seus próprios registros. Xerife, Sub-Xerife e Adm podem revisar qualquer registro, arquivar e restaurar; a autoria original é preservada. Ações arquivadas saem do livro e dos indicadores ativos, permanecendo acessíveis à liderança. Não há exclusão definitiva. Relatórios respeitam período, busca e resultado, considerando todas as páginas. O CSV é compatível com planilhas e neutraliza fórmulas em campos de texto. Datas são exibidas no horário de Brasília.

O Início resume as ações do mês. Os dados ficam na pasta privada `acoes/` do bucket `cavalaria`, com paginação e leitura completa para relatórios maiores que mil ações. Nenhuma tabela, conta ou política RLS nova é necessária. A API deve ser publicada junto com as páginas; conferir [docs/ACOES.md](docs/ACOES.md) antes de alterar a integração. Discord e importação do livro do jogo são etapas futuras, ainda sem endpoint ou credencial configurados.

## Avisos

Xerife, Sub-Xerife e Adm podem publicar título, comunicado em texto simples e prioridade (Normal, Importante ou Urgente). Os mais prioritários aparecem primeiro; entre avisos da mesma prioridade, os mais recentes vêm antes. Membro e contas legadas com Acesso limitado podem ler os publicados, sem acesso aos controles de edição nem ao arquivo.

Arquivar retira o aviso da leitura dos membros e preserva o registro para o Comando, que pode republicá-lo. Autor/data de criação e responsável/data da última alteração são definidos pela Function, sem aceitar autoria enviada pelo navegador. Não há exclusão definitiva nem histórico completo de versões neste módulo.

Os dados ficam em `avisos/<id>.json`, no bucket privado `cavalaria` do Supabase Storage, usando o armazenamento existente. Não é necessário executar SQL, alterar RLS, criar contas ou configurar novas variáveis de ambiente. As permissões `avisos` e `avisos.editar` são verificadas no servidor; as permissões dos módulos anteriores permanecem iguais.

Use **Atualizar avisos** para buscar novas publicações. O sino busca os comunicados ao abrir; não há confirmação de leitura, contador de não lidos, envio de mensagens externas ou atualização automática em tempo real. A validação da persistência real deve ser feita no Deploy Preview com contas de teste autorizadas, antes da aprovação do PR.

O diagnóstico, os testes e as pendências da Fase 1 estão em [`STATUS.md`](STATUS.md) e [`docs/FASE1_DIAGNOSTICO.md`](docs/FASE1_DIAGNOSTICO.md). A implantação segue estática, sem build ou dependências de runtime. Para desenvolver e validar localmente:

```powershell
npm ci
npx playwright install chromium
npm test
npm run test:e2e
npm run preview
```

Os testes em navegador usam dados e credenciais fictícios, sem chamadas reais ao Supabase ou às Functions. Não substituem a homologação com contas reais na prévia (Preview) da Cloudflare.

## Cargos

| Cargo | Quem é | Acesso |
|---|---|---|
| **Xerife** | Sheriff da Cavalaria | todas as páginas |
| **Sub-Xerife** | Sub-Sheriff | todas as páginas |
| **Adm** | administra o site (não é cargo do RP) | todas as páginas |
| **Membro** | demais integrantes | Lê Treinamentos e Avisos; registra/consulta Ações e corrige as próprias. Não acessa Registros, Contas, Recrutamento ou Investigações. |

O cargo é escolhido em **Contas** e aparece na barra de cima do site.

**Onde as permissões estão definidas:** no mapa `PERMISSOES` de `supabase/functions/_shared/lib/acesso.mjs`. É ele que vale de verdade. O `site/comum.js` tem uma cópia só para montar o menu: **mude os dois juntos**. Para mudar o acesso do Membro, basta acrescentar páginas na lista dele, nos dois arquivos.

O registro dos oficiais é protegido também pelo banco: só contas com nível na tabela `cavalaria_membros` leem e editam os registros. Xerife, Sub-Xerife e Adm recebem o nível `admin` (inclui reverter exoneração). O Membro não recebe nível, então não consegue ler o registro nem pela API. Se o Membro um dia ganhar acesso ao registro, também é preciso dar um nível a ele em `NIVEL_DO_CARGO` (`acesso.mjs`). Contas antigas sem cargo aparecem como **Adm** (nível `admin`) ou **Acesso limitado** (nível `xerife`, acesso ao registro e leitura de Avisos).

## Treinamentos

- Xerife, Sub-Xerife e Adm usam **Novo tópico**: título (obrigatório), subtítulo (opcional), descrição e até 10 links de vídeo.
- Links do YouTube viram player na própria página. Outros links (Medal, Drive, Twitch…) viram um botão "Assistir vídeo".
- Cada tópico mostra quem publicou e quem editou por último. Excluir pede confirmação e não tem volta.
- Os tópicos ficam no **Supabase Storage**, bucket privado `cavalaria`, pasta `treinamentos/` (um arquivo JSON por tópico; ver `supabase/functions/_shared/lib/armazenamento.mjs`). O bucket é criado sozinho na primeira gravação. Só as Functions leem e gravam lá, com a chave secreta.

## Recrutamento

- **Roteiro:** as 7 etapas do recrutamento (anúncio, dados do candidato, conhecimento intrínseco, teste físico, questionário psicológico, os Quatro Pilares e contratação). Os botões **Copiar comando** copiam o `/anuncio` pronto para colar no jogo.
- **Fichas de recrutamento:** cada ficha é um recrutamento (data, responsável, auxiliares) com um ou mais candidatos. Para cada candidato: dados pessoais, disponibilidade, qualidades e defeitos, as 3 perguntas pessoais, os testes de caça e natação, as 8 perguntas do questionário, nota (0 a 10), resultado (Pendente, Aprovado, Reprovado) e observações.
- Fichas podem ser editadas e excluídas por Xerife, Sub-Xerife e Adm. Ficam no Supabase Storage, pasta `recrutamentos/`, como os treinamentos.
- **Mudar o roteiro:** o texto e as perguntas ficam no início de `site/recrutamento.js`. As respostas são guardadas pela ordem das perguntas. Para mudar a **quantidade** de perguntas, ajuste também `PERSONAL_QUESTIONS` / `PSYCH_QUESTIONS` em `supabase/functions/_shared/handlers/recrutamentos.mjs`.

## Investigações

A página tem quatro abas:

- **Mapa e alvos:** mapa interativo do Oeste com zoom e arraste.
  - Os alvos (pessoas e lugares **sob investigação**) aparecem coloridos pelo nível de ameaça: vermelho = Crítico, laranja = Médio, verde = Baixo.
  - Lugares aparecem com o ícone da categoria, e grupos com ⌂.
  - Filtros mostram ou escondem lugares, pessoas fora de investigação (em cinza) e grupos.
  - Abaixo do mapa fica a lista de alvos, com busca e filtros por ameaça e por grupo.
- **Pessoas:** grafo, lista de vínculos e cadastro de pessoas.
  - **Grafo de conspiração e liderança:** as pessoas são círculos (com foto, se houver), que crescem com o número de vínculos e ganham peso extra para **líderes** e **sublíderes**. Grupos (⌂) e lugares aparecem como caixas, ligados por "membro" e "trabalha em". Os nós podem ser arrastados. Há botões de zoom e navegação, e o **Resetar zoom** reenquadra tudo. Clique duas vezes num nó para editar.
  - **Vínculos** entre pessoas, criados em **Novo vínculo**:
    - Hierarquia: Líder/Chefe → e Sublíder →
    - Pessoais: Casal/Romance e Família
    - Negócios: Sócio/Parceiro e Funcionário de →
    - Relações: Amizade e Rival/Inimigo
  - Os tipos com → têm direção: o formulário explica quem vai em "De" e quem vai em "Para".
  - **Cadastro de pessoas**, investigadas ou não: ocupação, **trabalha em** (um lugar cadastrado), cidade, grupo, coordenadas e descrição. **Investigar** marca a pessoa como alvo (pede o nível de ameaça), e **Encerrar** tira a pessoa dos alvos sem apagar o cadastro.
- **Lugares:** lojas, saloons, bancos, fazendas, estábulos, hotéis, hospitais, reservas indígenas, esconderijos e outros. Cada lugar tem categoria, cidade, endereço/referência, coordenadas e foto, e mostra quem trabalha lá. Um lugar também pode ser investigado (ex.: esconderijo).
- **Grupos:** bandos e organizações, com cidade, território no mapa e descrição.

**Um cadastro só:** pessoas e lugares viram "alvo" quando marcados como **sob investigação**, e não existe cadastro duplicado. Os alvos criados antes das abas continuam sendo alvos. O antigo "Ponto de interesse" agora é "Lugar".

**Exclusões não deixam referências soltas:**
- Excluir uma pessoa apaga também os vínculos dela.
- Excluir um lugar deixa sem lugar de trabalho quem trabalhava nele.
- Excluir um grupo deixa os membros sem grupo.

- **Coordenadas:** no formato do jogo (x, y). Dá pra digitar (o ponto aparece no mapa na hora) ou usar **Marcar no mapa** e clicar no lugar. Esc ou clique direito cancela. O botão ⌖ centraliza o item no mapa.
- **Acesso:** Xerife, Sub-Xerife e Adm leem e editam (permissões `investigacoes` e `investigacoes.editar`). O Membro não acessa.
- **Bibliotecas:**
  - O mapa usa as imagens oficiais do mapa interativo da Rockstar (`s.rsg.sc`), carregadas com [Leaflet](https://leafletjs.com/) 1.9.4. A conversão de coordenadas usa a mesma fórmula do mapa da comunidade [RDR2CollectorsMap](https://github.com/jeanropke/RDR2CollectorsMap) (domínio público).
  - O grafo usa [vis-network](https://visjs.github.io/vis-network/) 9.1.9 (Apache-2.0 ou MIT).
  - As duas bibliotecas ficam no próprio site, em `site/vendor/`, sem depender de CDN.
- **Fotos:** links do Discord costumam expirar depois de um tempo. Prefira links permanentes (ex.: Imgur). Foto quebrada vira o ícone 👤.
- **Onde ficam os dados:** no Supabase Storage, pastas `investigacoes-alvos/` (pessoas e lugares), `investigacoes-grupos/` e `investigacoes-vinculos/`, pela Function `/api/investigacoes`.

## Hospedagem anterior: Netlify (legado)

**Não é mais a produção.** Desde 20/10/2026 o site oficial é o da Cloudflare (acima). Esta seção fica só como referência, enquanto os adaptadores em `netlify/` existirem.

O `netlify.toml` já diz ao Netlify o que publicar (`site/`) e onde estão as Functions. Falta só:

1. Em **Project configuration → Environment variables**, criar:
   - `SUPABASE_URL` = `https://qohigzayevglccdwtlkm.supabase.co`
   - `SUPABASE_SECRET_KEY` = a chave **secret** (ou a antiga `service_role`) de **Supabase → Project Settings → API Keys**.

   Marque a chave secreta como segredo e deixe-a disponível para **Functions**. **Ela nunca vai para o código nem para o `config.js`.**
2. Fazer um novo deploy (qualquer push no GitHub já dispara).

Sem essas variáveis o painel continua funcionando, mas mostra e-mails no lugar dos nomes, e a página Contas avisa que a gestão não está configurada.

## Configurar o Supabase (uma vez)

1. Em **Authentication → Sign In / Providers → Email**, **desative novas inscrições públicas** ("Allow new users to sign up"). Só quem tem acesso à página Contas cria contas.
2. O banco já está instalado. O `supabase_instalacao.sql` só é necessário para montar um projeto Supabase do zero (veja abaixo).

## Primeiro acesso depois desta versão

1. Entre com a conta que já existe (a antiga conta compartilhada, `lukasbr881@gmail.com`).
2. Em **Contas**, coloque o próprio nome no RP, escolha o cargo e clique em **Salvar**.
3. Crie as contas dos demais. Para cada uma: nome no RP, usuário (ex.: `snyx`), cargo e senha temporária (botão **Gerar**). O painel mostra o usuário e a senha **uma única vez**: passe ao oficial em particular.
4. No primeiro acesso, o oficial é obrigado a definir uma senha pessoal.
5. **Troque a senha da antiga conta compartilhada** (botão **Trocar senha** no painel). Enquanto ela não mudar, quem conhece a senha antiga ainda entra nessa conta.

O histórico anterior a esta versão continua mostrando a conta compartilhada, porque não há como saber quem fez cada alteração antiga.

## Usuário ou e-mail

O `config.js` define `loginDomain: "cavalaria.oeste"`. Quem digita só `snyx` entra como `snyx@cavalaria.oeste`, um e-mail que não precisa existir. Contas com e-mail real continuam entrando com o e-mail completo. Como esses e-mails não recebem mensagens, senha esquecida se resolve em **Contas → Nova senha**.

## Fluxo correto de exoneração

- **Pendente** → revisão não feita.
- **Ativo** ou **Inativo** → avaliação de comparecimento.
- **Exonerar** → exoneração proposta, **ainda não executada no jogo**. O botão `Confirmar exoneração` fica disponível.
- Após executar a exoneração **dentro do RP**, o responsável confirma no painel. O banco registra data, horário e quem confirmou; a pessoa passa a aparecer em vermelho e carimbada **EXONERADO**. Nunca ocorre exclusão.
- Registros confirmados tornam-se somente leitura. Se houver erro de avaliação, só quem tem acesso total vê `Reverter exoneração`, que exige justificativa, volta o oficial para `Ativo` e fica no histórico.

## Proteção e limitações

- Só contas com cargo (tabela `cavalaria_membros`) acessam os registros (RLS). Tirar o acesso em **Contas** remove o cargo e bloqueia a conta no Supabase: ela perde o acesso na hora e não consegue entrar de novo. O histórico dela é preservado.
- O nome do oficial fica em `app_metadata` da conta, que só a chave secreta altera. O próprio usuário não consegue trocar o nome que aparece no histórico.
- Ninguém consegue tirar o próprio acesso total (evita o site ficar sem nenhum administrador).
- Os níveis `admin` e `xerife` editam os registros da mesma forma; só `admin` reverte exonerações e gerencia contas.
- Atualizações concorrentes no mesmo campo prevalecem pela última gravação. Combinem quem avalia cada jurisdição.
- Lemoyne e "Sem jurisdição" seguem como destino possível: os contingentes fechados podem reabrir.
- Mantenha o projeto Supabase ativo e faça backups; planos grátis podem ter pausas/limites.

## Montar do zero (outro projeto Supabase)

1. Crie o projeto em https://supabase.com/dashboard e execute `supabase_instalacao.sql` no **SQL Editor**. Isso cria tabelas, regras, histórico e os 109 nomes.
2. Crie a primeira conta em **Authentication → Users → Add user** (marque **Auto Confirm User**) e dê a ela acesso total:

```sql
insert into public.cavalaria_membros(user_id, role)
select id, 'admin' from auth.users where email = 'EMAIL_DA_CONTA';
```

3. Preencha `site/config.js` com a URL e a chave **publishable** do projeto e publique o site e a API seguindo [docs/MIGRACAO_CLOUDFLARE.md](docs/MIGRACAO_CLOUDFLARE.md). Daí em diante, tudo pela página Contas.

## Manual de Armamentos

Em **Manual de armamentos**, todos os oficiais autorizados consultam as armas permitidas por patente, regras de porte e fichas com fotos e características. A consulta respeita exatamente a relação fornecida pelo Comando, sem presumir que patentes superiores herdam as armas das anteriores. Escolher uma patente na tela não altera a conta. Há busca por nome, filtros por categoria e tabela completa. Guia: [docs/ARMAMENTOS.md](docs/ARMAMENTOS.md).

## Presença dos oficiais

O seletor de participantes de Ações lista todos os oficiais autorizados e mostra Online no painel ou Offline. O indicador considera atividade em uma página interna visível nos últimos dois minutos; não representa o status dentro do jogo. Falhas de consulta mostram Status indisponível e não impedem selecionar os participantes. Busca, seleção e quantidade do confronto continuam independentes do status.

O painel confirma presença automaticamente após validar a sessão. Fechar o site, deixar todas as abas ocultas ou sair da conta faz a presença expirar em até dois minutos após a última confirmação. Outra aba/dispositivo ativo mantém a mesma conta online. Detalhes técnicos e limites em [docs/ACOES.md](docs/ACOES.md).

## Teste mínimo

1. Senha errada no login: acesso negado.
2. Conta sem cargo: "Esta conta não está autorizada".
3. Abrir `painel.html` sem estar logado: volta para o login.
4. Criar uma conta em **Contas** (ex.: Sub-Xerife) e entrar com ela em outro navegador. Deve pedir a senha pessoal.
5. A conta nova vê o botão **Contas** e o cargo certo na barra de cima.
6. Mudar uma situação no navegador A e ver no B. O histórico mostra o **nome** de quem alterou.
7. Tirar o acesso da conta de teste: ela não consegue mais entrar.
