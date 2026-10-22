# Manual de Armamentos da Cavalaria

Página de consulta em `/armamentos` (`site/armamentos.html`), integrada ao menu e aos atalhos do Início. Todos os cargos já autorizados no painel podem consultar o manual. Não há cadastro, compra, concessão de armas ou alteração de patente por esta página.

## Fonte das permissões

A relação é a imagem fornecida pelo proprietário em 21/10/2026. O proprietário confirmou expressamente **seguir exatamente a tabela**, sem herança entre patentes. Isso inclui as exceções:

- Volcanic: somente Recruta e Oficial Júnior.
- Henry: somente Oficial.
- Mauser: Oficial e Oficial Sênior; não consta para Sub-Xerife ou Xerife.
- Winchester: Oficial Sênior, Sub-Xerife e Xerife; não consta para Oficial.
- Recruta não usa dual. Oficial Júnior pode usar duas armas de coldre, mas a tabela não define quantidade de armas nas costas nessa linha. Oficial, Oficial Sênior, Sub-Xerife e Xerife podem usar duas armas de coldre e duas nas costas, dentro dos modelos da própria patente.

| Patente | Revólveres | Pistolas | Repetidoras | Escopetas | Rifles |
| --- | --- | --- | --- | --- | --- |
| Recruta | LeMat | Volcanic | Evans | Nenhuma | Nenhum |
| Oficial Júnior | Schofield, LeMat | Volcanic | Evans | Nenhuma | Springfield |
| Oficial | Schofield, LeMat, Navy | M1899, Semiautomática, Mauser | Evans, Henry | Cano Duplo | Springfield, Ferrolho |
| Oficial Sênior | Schofield, LeMat, Navy | M1899, Semiautomática, Mauser | Evans, Winchester | Cano Duplo, Semiautomática, Repetidora | Springfield, Ferrolho |
| Sub-Xerife | Schofield, LeMat, Navy | M1899, Semiautomática | Evans, Winchester | Cano Duplo, Semiautomática, Repetidora | Springfield, Ferrolho |
| Xerife | Schofield, LeMat, Navy | M1899, Semiautomática | Evans, Winchester | Cano Duplo, Semiautomática, Repetidora | Springfield, Ferrolho |

Selecionar uma patente é apenas uma consulta ao regulamento. O cargo da conta (`Adm`, `Membro` etc.) não é convertido em patente militar. A página inicia em Recruta para todos, evitando inferir um posto inexistente no cadastro.

## Estrutura e comportamento

- `site/armamentos-dados.js`: fonte única com 15 armas, cinco categorias e seis patentes. `allowed` e `filter` são usados na lista, na ficha e na tabela comparativa. Para mudar a regra, editar os IDs explicitamente em `ranks` com autorização do Comando e atualizar o teste da matriz.
- `site/armamentos.js`: seleção de patente, busca sem depender de acentos, busca por aliases (Henry/Litchfield, Winchester/Lancaster, Ferrolho/Bolt Action), filtros combinados, exibição opcional de todo o arsenal e ficha em diálogo nativo com retorno de foco. Nenhuma preferência de consulta é enviada à conta ou ao banco.
- `site/armamentos.css`: identidade verde escuro, dourado e papel, insígnias vetoriais, imagens dos modelos do jogo, cartões e tabela com rolagem própria em telas pequenas. Indicadores de permissão usam texto, além de cores. Layout responsivo e suporte a movimento reduzido.
- Imagens em `site/assets/armamentos/`, servidas localmente. Por solicitação do proprietário em 22/10/2026, as 15 referências visuais usam a Red Dead Wiki / Fandom como fonte. Créditos, origens exatas e critérios de identificação em [ARMAMENTOS-IMAGENS.md](ARMAMENTOS-IMAGENS.md). Não remover marcas, molduras ou créditos das imagens.

Características são descritivas do modelo de jogo. Não foram inventados valores de dano, precisão, preço ou balanceamento do servidor. Os nomes da tabela são mantidos, com grafia Volcanic e aliases explicados nas fichas. Fotos não são prova de autorização: a matriz por patente determina a indicação da interface.

## Acesso e publicação

A permissão de leitura `armamentos` é espelhada em `site/comum.js` e `supabase/functions/_shared/lib/acesso.mjs` para os cargos existentes. Não altera as permissões de gestão, RLS, contas, dados reais ou patentes. Como nos outros módulos, o HTML e os recursos estáticos não contêm segredos; a navegação exige sessão via `requirePage`. Não há novo endpoint de armas, escrita ou chamada administrativa no manual. A presença continua pelo mecanismo compartilhado do painel.

Validar `npm test`, `npm run test:e2e` e builds Edge/Cloudflare. Publicar o bundle Edge pelo fluxo existente, integrar o PR à `main` e aguardar a Cloudflare publicar o commit correspondente. Conferir a página autenticada em produção, as seis patentes, imagens, filtros e ficha; sem criar registros de teste no livro ou alterar contas.
