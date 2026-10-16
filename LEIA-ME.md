# Registro Geral da Cavalaria — Oeste Roleplay

Aplicação estática colaborativa: Supabase Auth + PostgreSQL + Realtime. **Não está publicada nem conectada até você concluir estes passos.**

## Instalar

1. Crie um projeto em https://supabase.com/dashboard.
2. Em **SQL Editor**, cole e execute todo `supabase_instalacao.sql` em um projeto novo. Ele cria tabelas, regras de acesso, logs, rotina de confirmação de exoneração e importa os **109 nomes**. Não execute em banco com tabelas homônimas preexistentes sem revisar o script.
3. Em **Authentication → Users → Add user → Create new user**, crie **UMA conta compartilhada**, com e-mail válido sob controle do Alto Comando e uma senha forte definida por você. Marque confirmação automática caso disponível. Os xerifes **não precisarão digitar nem saber o e-mail**: ele será usado internamente pela aplicação. **Não coloque a senha no HTML, SQL nem em `config.js`.** Se possível, desabilite novas inscrições públicas em **Authentication → Providers → Email**.
4. Autorize essa conta no SQL Editor (substitua pelo e-mail REAL criado e execute):

```sql
insert into public.cavalaria_membros(user_id,role)
select id, 'admin' from auth.users where email='CONTA_COMPARTILHADA@EXEMPLO.COM'
on conflict(user_id) do update set role=excluded.role;

select m.user_id, m.role from public.cavalaria_membros m
join auth.users u on u.id=m.user_id
where u.email='CONTA_COMPARTILHADA@EXEMPLO.COM';
```

A segunda consulta precisa retornar **1 linha**; caso contrário, confira o e-mail cadastrado.
5. Em **Project Settings → API Keys** (ou botão **Connect**), copie **Project URL** e **publishable / anon key**. Preencha as três propriedades em `config.js`: URL, chave pública e `sharedLoginEmail` com o e-mail da conta única. Esse e-mail é apenas identificador público, **não é segredo**. A senha permanece somente na autenticação do Supabase. **NUNCA use `service_role` ou secret key no front-end.**
6. Publique **index.html, app.js, config.js** na mesma pasta em uma hospedagem estática como Netlify Drop ou Vercel. Não publique o SQL de instalação nem informações sigilosas. A URL definitiva só existirá depois da publicação.
7. Abra o link em dois navegadores diferentes e informe **somente a senha** nos dois. Teste uma alteração inofensiva de situação no primeiro navegador e confira se aparece no segundo. Todos usam **a mesma identidade técnica** e são indistinguíveis na auditoria; para identificação individual, será preciso evoluir o projeto.
8. Se a senha vazar, altere-a imediatamente pelo Supabase e encerre/revogue sessões existentes conforme necessário: alterar apenas a senha pode não invalidar sessões já emitidas de imediato. Sem contas individuais, qualquer integrante pode repassar a credencial.

## Nota de segurança importante

A tela solicita apenas a senha, mas por trás utiliza **uma conta Supabase com e-mail fixo** definido no arquivo público `config.js`. Isso oferece simplicidade sem abrir acesso anônimo ao banco, aproveitando as políticas RLS já instaladas. O e-mail **não funciona como segredo**; qualquer pessoa pode inspecioná-lo, mas precisa da senha para autenticar. O acesso é compartilhado: não existe identificação confiável do xerife individual que realizou cada alteração.

## Fluxo correto de exoneração

- **Pendente** → revisão não feita.
- **Ativo** ou **Inativo** → avaliação de comparecimento.
- **Exonerar** → exoneração proposta, **ainda não executada no jogo**. O botão `Confirmar exoneração` fica disponível.
- Após executar a exoneração **dentro do RP**, o responsável confirma no painel, após confirmação explícita. Banco registra data, horário e autor; a pessoa passa a aparecer em vermelho e carimbada **EXONERADO**. Nunca ocorre exclusão.
- Registros confirmados tornam-se somente leitura. Se houver erro de avaliação, somente o usuário com papel `admin` verá o botão `Reverter exoneração`; a ação exige confirmação e justificativa obrigatória, retorna o oficial para `Ativo` e preserva o evento no histórico.

## Proteção e limitações

- Login com senha na interface e e-mail fixo interno; a conta compartilhada explicitamente liberada via `cavalaria_membros` são os únicos com acesso aos registros (RLS). Não existe link público de leitura sem autenticação.
- `admin` e `xerife` têm **o mesmo direito de editar registros** nesta versão; o cargo é informativo. Pode-se implementar restrições por jurisdição mais tarde.
- Histórico dos campos editáveis é armazenado no servidor, com data e identificação da conta compartilhada (não da pessoa). Limite de 100 eventos na interface.
- Sincronização pelo Postgres Changes do Supabase; dependendo de rede/conexão pode haver pequenos atrasos e reconexões.
- Exoneração executada é bloqueada por trigger, inclusive contra UPDATE normal. Exclusão não é concedida a usuários da aplicação.
- Como todos editam os registros, atualizações concorrentes no mesmo campo podem prevalecer pela última gravação. Combinem quem avalia cada jurisdição.
- Se o banco ou credenciais não forem configurados, a página apresenta instrução de configuração; não simula sincronização.
- Mantenha o projeto Supabase ativo, faça backups e lembre-se de que planos grátis podem ter pausas/limites.

## Teste mínimo

1. Abrir a página e digitar senha errada: acesso negado.
2. Digitar a senha correta da conta autorizada: ver 109 nomes.
3. Mudar Troy Riley para `Exonerar` no navegador A e verificar no B.
4. Somente após ação fictícia no RP, clicar `Confirmar exoneração`, conferir carimbo e data.
5. Para testar uma correção administrativa, entrar com uma conta `admin`, clicar `Reverter exoneração`, confirmar e informar uma justificativa; conferir a reversão e o motivo no histórico.
6. Abrir histórico, verificar identidade do autor, e exportar CSV.
