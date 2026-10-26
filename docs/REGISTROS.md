# Organização do Registro Geral

Atualização de 26/10/2026. A visão inicial **Efetivo** exclui registros com `executed_at` preenchido. A aba **Exonerações** reúne apenas as execuções confirmadas, mantendo carimbo, data, responsável e reversão administrativa com justificativa. Marcar `Exonerar` continua sendo uma proposta; o oficial só sai do efetivo após confirmar a execução no jogo. Nenhum registro é apagado.

O botão **Editar oficial** permite corrigir o nome no RP e o contingente atual. Ao transferir, `origem` passa a representar o contingente atual, a linha muda de tabela e `destino` volta a `A definir`. Uma correção apenas de nome preserva o destino proposto. ID, ordem, status e histórico são mantidos. O nome da conta de login e snapshots antigos do Livro de Ações não são alterados por essa operação.

Os contadores do Registro consideram o efetivo sem os exonerados; o arquivo tem seu próprio contador. Busca, CSV e impressão seguem a aba e os filtros em consulta. O CSV identifica a situação efetiva e neutraliza valores interpretáveis como fórmulas. Os indicadores históricos do Dashboard mantêm sua definição própria.

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
