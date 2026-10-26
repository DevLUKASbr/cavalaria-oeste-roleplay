# Organização do Registro Geral

Atualização de 26/10/2026. A visão inicial **Efetivo** exclui registros com `executed_at` preenchido. A aba **Exonerações** reúne apenas as execuções confirmadas, mantendo carimbo, data, responsável e reversão administrativa com justificativa. Marcar `Exonerar` continua sendo uma proposta; o oficial só sai do efetivo após confirmar a execução no jogo. Nenhum registro é apagado.

O botão **Editar oficial** permite corrigir o nome no RP e o contingente atual. Ao transferir, `origem` passa a representar o contingente atual, a linha muda de tabela e `destino` volta a `A definir`. Uma correção apenas de nome preserva o destino proposto. ID, ordem, status e histórico são mantidos. O nome da conta de login e snapshots antigos do Livro de Ações não são alterados por essa operação.

Os contadores do Registro consideram o efetivo sem os exonerados; o arquivo tem seu próprio contador. Busca, CSV e impressão seguem a aba e os filtros em consulta. O CSV identifica a situação efetiva e neutraliza valores interpretáveis como fórmulas. Os indicadores históricos do Dashboard mantêm sua definição própria.

## Cadastro de novos oficiais

O botão **Adicionar oficial** está no topo e no cabeçalho de cada contingente, inclusive nos vazios. O botão da jurisdição já seleciona esse contingente. O formulário recebe nome no RP, contingente, situação inicial (Ativo, Pendente ou Inativo) e observação opcional de até 400 caracteres. Depois de salvar, a consulta volta ao efetivo sem filtros e destaca o novo registro. O cadastro fica no histórico e não cria uma conta de login.

A migração adicional `supabase/migrations/20261026150000_registros_cadastro.sql` cria a RPC `criar_oficial`, restrita aos mesmos editores autorizados, sem conceder INSERT direto na tabela. ID da solicitação é estável durante as tentativas; repetir a confirmação após perda de resposta não insere outra linha. Um bloqueio transacional serializa os cadastros e reserva a próxima ordem sem renumerar registros existentes. O banco valida os campos e rejeita nome já presente no efetivo, desconsiderando caixa e espaços repetidos. Registros exonerados permanecem preservados e não impedem uma readmissão com novo cadastro.

O novo cadastro e a auditoria são gravados na mesma transação. `tests/registros-cadastro-db.sql` valida criação, repetição, duplicados, readmissão e autorização com registros fictícios e ROLLBACK ao final. A migração é independente da RPC de correção e não requer atualização da API Edge.

Migração de cadastro aplicada e QA transacional aprovado em 26/10/2026. Validação do projeto: 90 testes de servidor/cliente e 64 testes Chromium aprovados. Nenhum oficial real foi cadastrado durante a conferência.

## Banco e autorização

Aplicar somente `supabase/migrations/20261026_registros_edicao.sql` em projetos existentes; não reaplicar os cadastros iniciais de `supabase_instalacao.sql`. Este último foi atualizado apenas para projetos novos.

A migração adiciona `corrigir_oficial`, uma RPC limitada a uma linha do efetivo e aos editores já autorizados em `cavalaria_membros` (`admin` ou `xerife`). Não concede UPDATE direto em `nome`/`origem`, não muda as políticas RLS nem adiciona usuários ou cargos. A função valida nome e contingente, bloqueia alterações de exonerados e confere nome, contingente e `modified_at` anteriores sob bloqueio de linha para impedir sobrescrita concorrente.

O trigger mantém ID e ordem imutáveis, exige o contexto da RPC para corrigir nome/contingente e preserva as validações de confirmação/reversão. A auditoria passa a incluir `nome` e `contingente` antes/depois, além dos campos existentes e do autor autenticado. Entradas antigas permanecem legíveis.

## Validação e publicação

- Testes do navegador em `tests/browser/registros.spec.cjs`: separação de efetivo/arquivo, CSV, correção/transferência, foco, rascunho após falha ou conflito, cancelamento e layout 320/390/1440 px. Fixtures são fictícias e não acessam o Supabase real.
- `tests/registros-db.sql`: QA transacional, aplicado após a migração. Cria um oficial fictício, testa a RPC, auditoria, validação, autorização, exoneração e reversão, e termina com ROLLBACK. Nada desse teste deve permanecer no cadastro.
- A migração restrita foi aplicada e o QA transacional aprovado no projeto existente em 26/10/2026. Nenhum nome ou contingente real foi alterado e nenhuma exoneração real foi executada/revertida pelo agente.
- Publicação do frontend segue a `main` na Cloudflare. Não requer atualização da Edge Function, novas credenciais ou novos endpoints HTTP.

O trabalho de Perímetros das Ações permanece preservado separadamente no stash `wip: perimetros aguardando mapas originais` e não faz parte desta publicação.
