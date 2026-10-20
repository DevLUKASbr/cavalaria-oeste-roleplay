# Publicação gratuita: Cloudflare Pages + Supabase

## Publicação realizada em 20/10/2026

- Endereço público: **https://cavalaria-oeste-roleplay.pages.dev/**.
- Projeto Cloudflare Pages: `cavalaria-oeste-roleplay`, conectado somente a `DevLUKASbr/cavalaria-oeste-roleplay`, com deploy automático da `main`.
- Primeiro deploy: `9b9474cb-22ba-428c-a674-1466ea31a199`, commit `5e13cff` (merge do PR #15).
- API `cavalaria-api` publicada pelo editor do Supabase existente. A validação da sessão e dos cargos continua dentro da API.
- Verificação pública: login, HTML, CSS e JavaScript retornaram 200; as cinco rotas da API retornaram 401 sem sessão; um Bearer inválido foi encaminhado e rejeitado pela API. Cabeçalhos de proteção presentes.
- A confirmação dos fluxos com conta real depende do login do proprietário no novo domínio. Nenhum aviso fictício nem alteração de dados foi executado nesta migração.

Os merges das páginas já publicam automaticamente pela Cloudflare. O secret `SUPABASE_ACCESS_TOKEN` ainda precisa ser cadastrado pelo proprietário para automatizar atualizações da API pelo workflow; até lá, publique alterações da função pelo editor Supabase. O endereço antigo do Netlify continua separado.

## Como o sistema será publicado

- O GitHub continua guardando o código e recebendo os merges.
- A Cloudflare Pages publica apenas a pasta `site/`, com endereço HTTPS gratuito `*.pages.dev`.
- A rota `/api/*` encaminha a sessão do usuário para a Edge Function `cavalaria-api` no Supabase existente.
- A API valida a sessão no Supabase Auth, consulta o cargo no servidor e aplica as mesmas permissões dos módulos atuais.
- Contas, dados do Registro, bucket privado `cavalaria`, avisos, treinamentos, recrutamentos e investigações continuam no mesmo projeto Supabase. Esta migração não executa SQL, não move dados nem cria contas de usuários.

As páginas preservam os endereços relativos atuais e não precisam conhecer o endereço da API externa. A Cloudflare não recebe a chave administrativa: encaminha somente o Bearer da conta logada, o corpo JSON e a query string. Cookies do navegador não são encaminhados. As respostas da API não são cacheadas. `_routes.json` reserva Functions para `/api/*`; as páginas e os arquivos estáticos não gastam chamadas de Functions.

## 1. Criar a conta da Cloudflare

Crie uma conta gratuita em <https://dash.cloudflare.com/sign-up>. Não precisa comprar domínio. Depois, em **Workers & Pages**, escolha a opção de **Pages** para importar um repositório Git (a interface pode mostrar **Create application → Pages → Connect to Git**).

Ao autorizar o GitHub, selecione somente o repositório `DevLUKASbr/cavalaria-oeste-roleplay`. A autorização do aplicativo e os termos de criação da conta devem ser revisados e concluídos pelo proprietário.

## 2. Publicar a API no Supabase

O projeto existente é `qohigzayevglccdwtlkm`. A função nova é `cavalaria-api`.

### Pelo painel, sem criar token de automação

1. Execute `npm ci` e `npm run build:edge` neste checkout.
2. No Supabase Dashboard do projeto, abra **Edge Functions → Deploy a new function → Via Editor**.
3. Dê o nome `cavalaria-api`, mantenha um arquivo `index.ts` e substitua o exemplo pelo conteúdo completo de `dist/cavalaria-api/index.ts` (gerado pelo build, ignorado pelo Git).
4. A configuração de JWT deve corresponder a `verify_jwt = false` de `supabase/config.toml`. A validação do Bearer continua obrigatória dentro da API, usando o Supabase Auth; isto evita depender do verificador legado do gateway.
5. Publique e confira a URL: `https://qohigzayevglccdwtlkm.supabase.co/functions/v1/cavalaria-api`.

O Supabase injeta a URL e as chaves de servidor no próprio ambiente das Edge Functions. A API aceita `SUPABASE_SECRET_KEYS.default` e usa `SUPABASE_SERVICE_ROLE_KEY` como compatibilidade com projetos legados. Nenhuma chave secreta é necessária no frontend ou na Cloudflare.

### Atualizações automáticas pelo GitHub

O workflow `.github/workflows/deploy-supabase.yml` publica somente `cavalaria-api` quando alterações em `supabase/` entram na `main`. Ele não executa migrações de banco.

Para habilitar, o proprietário precisa gerar um token de acesso no Supabase e cadastrá-lo diretamente em **GitHub → repositório → Settings → Secrets and variables → Actions → New repository secret**, com o nome `SUPABASE_ACCESS_TOKEN`. Não enviar o token no chat nem colocá-lo em arquivos. O workflow usa o token apenas nas etapas que verificam a credencial e publicam a função.

Sem esse secret, o workflow falha com uma mensagem explicativa; é possível publicar manualmente pelo painel. Alterações somente nas páginas continuam publicando pela integração Git da Cloudflare.

Alternativa com Supabase CLI autenticado:

```powershell
supabase functions deploy cavalaria-api --project-ref qohigzayevglccdwtlkm --use-api
```

## 3. Conectar a Cloudflare ao GitHub

Depois que a branch de migração for revisada e integrada:

| Campo | Valor |
| --- | --- |
| Tipo de projeto | Pages |
| Repositório | `DevLUKASbr/cavalaria-oeste-roleplay` |
| Nome sugerido | `cavalaria-oeste-roleplay` (sujeito à disponibilidade) |
| Branch de produção | `main` |
| Framework preset | None |
| Build command | `npm run build:cloudflare` |
| Build output directory | `site` |
| Root directory | raiz do repositório |

`wrangler.toml` já declara a pasta de publicação, data de compatibilidade e a variável pública `SUPABASE_FUNCTION_URL`. O mesmo destino é usado em Production e Preview. Não criar `SUPABASE_SECRET_KEY` na Cloudflare.

Uma prévia usa as mesmas contas e os mesmos dados do Supabase. Para validar gravações, use uma conta e registros de teste autorizados. Não publicar conteúdo fictício no mural real.

## 4. Conferir antes de divulgar

1. Abra a URL `pages.dev` atribuída pela Cloudflare. Como o domínio mudou, será necessário entrar novamente; as contas e senhas existentes continuam válidas.
2. Confira login, Início, Avisos, Treinamentos e os módulos autorizados ao seu cargo.
3. Com uma conta de teste de liderança, publique um aviso de teste autorizado. Recarregue e confirme leitura em outra sessão de Membro. Valide também edição e arquivamento desse registro de teste.
4. Confirme que Membro não abre Contas nem gerencia avisos e que o backend devolve 401/403 para chamadas sem sessão ou sem permissão.
5. Confira os logs da Edge Function e os deploys da Cloudflare. Divulgue o novo endereço somente após essa validação.

Os adaptadores do Netlify foram preservados como compatibilidade com a hospedagem anterior, usando a mesma implementação de API. O site antigo não redireciona automaticamente: o subdomínio `netlify.app` pertence ao Netlify. A migração não apaga o projeto antigo.

## Verificação local

```powershell
npm ci
npm test
npm run build:edge
npm run build:cloudflare
npm run test:e2e
npm run preview:cloudflare
```

Os testes da migração usam HTTP e dados simulados; não leem nem gravam dados reais. A prévia Cloudflare encaminha requisições autenticadas à API configurada e, portanto, deve ser usada com o mesmo cuidado de uma prévia publicada.

## Limites que continuam existindo

Esta arquitetura usa cotas gratuitas, não serviço ilimitado. A Cloudflare tem limites de builds, CPU e chamadas de Functions; o Supabase tem cotas de tráfego, armazenamento, autenticação e Edge Functions. O armazenamento atual lista até 1.000 objetos por pasta, sem paginação para volumes maiores.

Cada chamada da Cloudflare faz no máximo uma requisição à API Supabase. A leitura individual dos arquivos JSON ocorre na Edge Function, evitando o limite de 50 subrequisições externas por chamada do Workers Free. Não há compra, alteração de plano ou cobrança configurada por este código.

Referências: [Cloudflare Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Cloudflare Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Supabase environment variables](https://supabase.com/docs/guides/functions/secrets), [Supabase deployment via GitHub Actions](https://supabase.com/docs/guides/functions/examples/github-actions).
