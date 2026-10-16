# Registro Geral da Cavalaria — Oeste Roleplay

Painel do Alto Comando para revista de efetivo, avaliação de atividade e controle de exonerações.

- **Site** (pasta `site/`): tela de login, painel do registro e gestão de contas. HTML/JS puro, sem build.
- **Banco**: Supabase (Postgres com regras RLS + Realtime).
- **Netlify**: hospeda o site e roda a Function `netlify/functions/contas.mjs` (rota `/api/contas`), que gerencia as contas usando a chave secreta do Supabase guardada só no Netlify.

Cada oficial entra com a própria conta, e o histórico mostra o nome de quem fez cada alteração. **No dia a dia ninguém precisa abrir o SQL Editor**: contas, nomes, cargos e senhas são gerenciados na página **Contas** do painel.

## Páginas

| Página | Quem acessa | O que faz |
|---|---|---|
| `index.html` | todos | Login com usuário (ou e-mail) e senha |
| `painel.html` | Xerife, Sub-Xerife e Adm | Registro dos oficiais, exonerações, histórico, CSV |
| `contas.html` | Xerife, Sub-Xerife e Adm | Criar contas, definir nome e cargo, tirar acesso, gerar nova senha |

## Cargos

| Cargo | Quem é | Acesso |
|---|---|---|
| **Xerife** | Sheriff da Cavalaria | todas as páginas |
| **Sub-Xerife** | Sub-Sheriff | todas as páginas |
| **Adm** | administra o site (não é cargo do RP) | todas as páginas |

Por enquanto só esses três cargos têm conta, e todos têm **acesso total**: painel, página Contas e reverter exonerações. O cargo é escolhido em **Contas** e aparece na barra de cima do site.

Por baixo, cada cargo vira um nível de acesso na tabela `cavalaria_membros`: `admin` = acesso total, `xerife` = só o painel. O nível `xerife` continua existindo para quando outros cargos (ex.: Oficial-Sênior) ganharem acesso limitado. Para isso, basta mudar o mapa `CARGOS` em `netlify/functions/contas.mjs` e a lista em `site/comum.js`. Contas antigas sem cargo aparecem como **Adm** (acesso total) ou **Acesso limitado**.

## Configurar o Netlify (uma vez)

O `netlify.toml` já diz ao Netlify o que publicar (`site/`) e onde está a Function. Falta só:

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
