# Registro Geral da Cavalaria — Oeste Roleplay

Painel do Alto Comando para revista de efetivo, avaliação de atividade e controle de exonerações.

- **Site** (pasta `site/`): login, registro, treinamentos, recrutamento, investigações, ações e contas. HTML/JS puro, sem build.
- **Banco**: Supabase (Postgres com regras RLS + Realtime para o registro; Storage para os tópicos de treinamento).
- **Netlify**: hospeda o site e roda as Functions `contas` e `treinamentos` (rotas `/api/contas` e `/api/treinamentos`), que usam a chave secreta do Supabase guardada só no Netlify.

Cada oficial entra com a própria conta, e o histórico mostra o nome de quem fez cada alteração. **Ninguém precisa abrir o SQL Editor**: contas, nomes, cargos, senhas e tópicos são gerenciados pelo próprio site.

## Páginas

| Página | Quem acessa | O que faz |
|---|---|---|
| `index.html` | todos | Login com usuário (ou e-mail) e senha |
| `painel.html` (Registro) | Xerife, Sub-Xerife, Adm | Registro dos oficiais, exonerações, histórico, CSV |
| `treinamentos.html` | Xerife, Sub-Xerife, Adm (criam e editam) · Membro (só lê) | Tópicos de treinamento com título, subtítulo, descrição e vídeos |
| `recrutamento.html` | Xerife, Sub-Xerife, Adm | **Em construção** |
| `investigacoes.html` | Xerife, Sub-Xerife, Adm | **Em construção** |
| `acoes.html` | Xerife, Sub-Xerife, Adm | **Em construção** |
| `contas.html` | Xerife, Sub-Xerife, Adm | Criar contas, definir nome e cargo, tirar acesso, gerar nova senha |

O menu de cada pessoa mostra só as páginas que o cargo dela permite. Quem abre uma página sem permissão é levado para a primeira página permitida.

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
- Os tópicos ficam no **Supabase Storage**, bucket privado `cavalaria`, pasta `treinamentos/` (um arquivo JSON por tópico). O bucket é criado sozinho na primeira publicação. Só a Function lê e grava lá, com a chave secreta.

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
