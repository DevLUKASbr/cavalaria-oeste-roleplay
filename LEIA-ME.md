# Registro Geral da Cavalaria — Oeste Roleplay

Painel do Alto Comando para revista de efetivo, avaliação de atividade e controle de exonerações.

- **Site** (pasta `site/`): login, dashboard modular, registros, treinamentos, recrutamento, investigações, ações e contas. HTML/JS puro, sem build.
- **Banco**: Supabase (Postgres com regras RLS + Realtime para o registro; Storage para tópicos de treinamento e fichas de recrutamento).
- **Netlify**: hospeda o site e roda as Functions `contas`, `treinamentos` e `recrutamentos` (rotas `/api/...`), que usam a chave secreta do Supabase guardada só no Netlify.

Cada oficial entra com a própria conta, e o histórico mostra o nome de quem fez cada alteração. **Ninguém precisa abrir o SQL Editor**: contas, nomes, cargos, senhas e tópicos são gerenciados pelo próprio site.

## Páginas

| Página | Quem acessa | O que faz |
|---|---|---|
| `index.html` | todos | Login com usuário (ou e-mail) e senha |
| `dashboard.html` (Início) | contas com algum módulo autorizado | Visão inicial, indicadores reais permitidos, distribuição por jurisdição, auditoria e atalhos |
| `painel.html` (Registros) | Xerife, Sub-Xerife, Adm e contas antigas com nível `xerife` | Registro dos oficiais, exonerações, histórico, CSV |
| `treinamentos.html` | Xerife, Sub-Xerife, Adm (criam e editam) · Membro (só lê) | Tópicos de treinamento com título, subtítulo, descrição e vídeos |
| `recrutamento.html` | Xerife, Sub-Xerife, Adm | Roteiro do recrutamento e fichas dos candidatos |
| `investigacoes.html` | Xerife, Sub-Xerife, Adm | Mapa do Oeste com alvos (pessoas e pontos de interesse) e grupos/territórios |
| `acoes.html` | Xerife, Sub-Xerife, Adm | **Em construção** |
| `contas.html` | Xerife, Sub-Xerife, Adm | Criar contas, definir nome e cargo, tirar acesso, gerar nova senha |

O menu de cada pessoa mostra só as páginas que o cargo dela permite. Quem abre uma página sem permissão é levado para a primeira página permitida.

Após o login, a entrada é o **Dashboard**. A navegação usa as rotas HTML existentes, com sidebar e topbar compartilhadas; a sessão individual continua persistida pelo Supabase. O Dashboard de quem não pode ver Registros não consulta efetivo nem auditoria. Premiações e Avisos são apenas indicações de etapas futuras, sem novas permissões.

O diagnóstico, os testes e as pendências da Fase 1 estão em [`STATUS.md`](STATUS.md) e [`docs/FASE1_DIAGNOSTICO.md`](docs/FASE1_DIAGNOSTICO.md). A implantação segue estática, sem build ou dependências de runtime. Para desenvolver e validar localmente:

```powershell
npm ci
npx playwright install chromium
npm test
npm run test:e2e
npm run preview
```

Os testes em navegador usam dados e credenciais fictícios, sem chamadas reais ao Supabase ou às Functions. Não substituem a homologação com contas reais no preview do Netlify.

## Cargos

| Cargo | Quem é | Acesso |
|---|---|---|
| **Xerife** | Sheriff da Cavalaria | todas as páginas |
| **Sub-Xerife** | Sub-Sheriff | todas as páginas |
| **Adm** | administra o site (não é cargo do RP) | todas as páginas |
| **Membro** | demais integrantes | **provisório:** só lê Treinamentos. O acesso definitivo ainda será definido. |

O cargo é escolhido em **Contas** e aparece na barra de cima do site.

**Onde as permissões estão definidas:** no mapa `PERMISSOES` de `netlify/lib/acesso.mjs`. É ele que vale de verdade. O `site/comum.js` tem uma cópia só para montar o menu: **mude os dois juntos**. Para mudar o acesso do Membro, basta acrescentar páginas na lista dele, nos dois arquivos.

O registro dos oficiais é protegido também pelo banco: só contas com nível na tabela `cavalaria_membros` leem e editam os registros. Xerife, Sub-Xerife e Adm recebem o nível `admin` (inclui reverter exoneração). O Membro não recebe nível, então não consegue ler o registro nem pela API. Se o Membro um dia ganhar acesso ao registro, também é preciso dar um nível a ele em `NIVEL_DO_CARGO` (`acesso.mjs`). Contas antigas sem cargo aparecem como **Adm** (nível `admin`) ou **Acesso limitado** (nível `xerife`, só o registro).

## Treinamentos

- Xerife, Sub-Xerife e Adm usam **Novo tópico**: título (obrigatório), subtítulo (opcional), descrição e até 10 links de vídeo.
- Links do YouTube viram player na própria página. Outros links (Medal, Drive, Twitch…) viram um botão "Assistir vídeo".
- Cada tópico mostra quem publicou e quem editou por último. Excluir pede confirmação e não tem volta.
- Os tópicos ficam no **Supabase Storage**, bucket privado `cavalaria`, pasta `treinamentos/` (um arquivo JSON por tópico; ver `netlify/lib/armazenamento.mjs`). O bucket é criado sozinho na primeira gravação. Só as Functions leem e gravam lá, com a chave secreta.

## Recrutamento

- **Roteiro:** as 7 etapas do recrutamento (anúncio, dados do candidato, conhecimento intrínseco, teste físico, questionário psicológico, os Quatro Pilares e contratação). Os botões **Copiar comando** copiam o `/anuncio` pronto para colar no jogo.
- **Fichas de recrutamento:** cada ficha é um recrutamento (data, responsável, auxiliares) com um ou mais candidatos. Para cada candidato: dados pessoais, disponibilidade, qualidades e defeitos, as 3 perguntas pessoais, os testes de caça e natação, as 8 perguntas do questionário, nota (0 a 10), resultado (Pendente, Aprovado, Reprovado) e observações.
- Fichas podem ser editadas e excluídas por Xerife, Sub-Xerife e Adm. Ficam no Supabase Storage, pasta `recrutamentos/`, como os treinamentos.
- **Mudar o roteiro:** o texto e as perguntas ficam no início de `site/recrutamento.js`. As respostas são guardadas pela ordem das perguntas. Para mudar a **quantidade** de perguntas, ajuste também `PERSONAL_QUESTIONS` / `PSYCH_QUESTIONS` em `netlify/functions/recrutamentos.mjs`.

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
- **Lugares:** lojas, saloons, bancos, fazendas, estábulos, hotéis, esconderijos e outros. Cada lugar tem categoria, cidade, endereço/referência, coordenadas e foto, e mostra quem trabalha lá. Um lugar também pode ser investigado (ex.: esconderijo).
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

## Configurar o Netlify (uma vez)

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

3. Preencha `site/config.js` com a URL e a chave **publishable** do projeto e configure o Netlify como acima. Daí em diante, tudo pela página Contas.

## Teste mínimo

1. Senha errada no login: acesso negado.
2. Conta sem cargo: "Esta conta não está autorizada".
3. Abrir `painel.html` sem estar logado: volta para o login.
4. Criar uma conta em **Contas** (ex.: Sub-Xerife) e entrar com ela em outro navegador. Deve pedir a senha pessoal.
5. A conta nova vê o botão **Contas** e o cargo certo na barra de cima.
6. Mudar uma situação no navegador A e ver no B. O histórico mostra o **nome** de quem alterou.
7. Tirar o acesso da conta de teste: ela não consegue mais entrar.
