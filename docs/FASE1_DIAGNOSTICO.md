# Diagnóstico e desenho técnico — Fase 1

Base final: `origin/main` em `6d18ab8`, clone oficial `DevLUKASbr/cavalaria-oeste-roleplay`. Branch: `feature/painel-modular-cavalaria`. A implementação começou em `2952d1c` e incorporou o Recrutamento integrado à main durante a execução.

Especificação: [CAVALARIA_REDESIGN_PAINEL_MODULAR.md](CAVALARIA_REDESIGN_PAINEL_MODULAR.md), copiada do anexo fornecido pelo usuário porque o caminho `docs/` ainda não existia no clone. O escopo executado é exclusivamente a Fase 1.

## Arquitetura encontrada

- HTML, CSS e JavaScript sem framework ou build; publicação estática de `site/` no Netlify.
- `comum.js` cria o cliente Supabase, normaliza usuário/e-mail, verifica a sessão e o usuário atualizado com `getUser`, obtém o nível em `cavalaria_membros`, monta o acesso e protege as rotas com `requirePage`.
- Cargos e permissões efetivas permanecem definidos em `netlify/lib/acesso.mjs`, espelhados no frontend. O cargo vem de `app_metadata`, que o próprio usuário não pode editar.
- `painel.js` mantém o estado de oficiais, busca, filtros, atualização, CSV, impressão, auditoria, confirmação e reversão. Consulta `cavalaria_oficiais` e `cavalaria_auditoria` com RLS e recebe eventos Realtime. Os nomes são consultados em `/api/contas` com o token da sessão.
- A confirmação usa a RPC `confirmar_exoneracao`. A reversão usa `reverter_exoneracao`, exige nível `admin` no banco e justificativa de pelo menos 10 caracteres. Registros executados ficam imutáveis e preservados.
- `contas.js` usa `/api/contas` para criar contas individuais, editar nome/cargo, remover acesso e gerar senhas temporárias. A Function impede a retirada do próprio acesso administrativo.
- `treinamentos.js` usa `/api/treinamentos` e preserva os tópicos atuais com vídeos, autoria e edição. O armazenamento é privado no Supabase Storage; só a Function usa a chave secreta.
- Recrutamento ganhou roteiro, fichas e candidatos no PR #7 da main durante esta execução. O módulo e a Function `/api/recrutamentos` foram incorporados sem reescrever seus fluxos ou armazenamento; o helper oficial `netlify/lib/armazenamento.mjs` continua compartilhado com Treinamentos.
- Investigações e Ações possuem apenas rotas protegidas informativas. Não há armazenamento implementado para Avisos, Premiações, operações ou rankings.

## Desenho adotado e migração

1. Criar `admin-shell.js` e `admin.css`, compartilhados pelas páginas internas. O ponto de montagem existente `#shell` é reaproveitado para sidebar, topbar, avisos informativos e controles de sessão.
2. Preservar cada rota HTML, seus IDs e os scripts de negócio. A área principal muda conforme a rota; o histórico, voltar/avançar e links diretos usam a navegação nativa do navegador. O cliente Supabase continua mantendo a sessão entre páginas. Cada rota revalida o acesso antes de revelar seu conteúdo. Esse isolamento também preserva o ciclo de vida dos listeners e canais Realtime de cada módulo.
3. Criar `dashboard.html` e `dashboard.js` como entrada após login. Em `login.js`, mudar apenas o destino visual depois das mesmas verificações de acesso, sem alterar autenticação, credenciais, sessões ou mensagens.
4. Permitir `requirePage('inicio')` somente se já houver um módulo autorizado. Início não é adicionado à matriz de permissões do backend e não habilita dados de outros módulos.
5. Consultar oficiais/auditoria só quando `can(access, 'registro')` for verdadeiro. As leituras continuam sujeitas à RLS existente. Cards calculam os estados já gravados e distinguem `executed_at` de uma proposta `Exonerar`. A distribuição declara que utiliza jurisdição de origem e inclui todos os registros preservados.
6. Dashboard com carregamento, sucesso, vazio, erro, erro parcial da auditoria e atualização manual. Não há um novo canal Realtime no Dashboard; a atualização em tempo real de Registros continua intacta.
7. Preservar Contas, Treinamentos e o Recrutamento recém-integrado à main. O gerenciamento de sessões, participantes e presenças de Treinamentos proposto para a Fase 3 não é antecipado. Nenhum CRUD novo de Recrutamento foi implementado nesta branch: o existente foi mantido.
8. Exibir módulos futuros de forma informativa. Investigações/Ações mantêm as permissões atuais; Premiações/Avisos não têm links ou ações funcionais. Não há formulários falsos ou métricas inferidas de atividade.

## Matriz existente preservada

| Acesso atual | Início | Registros | Treinamentos | Recrutamento | Contas | Rotas futuras já autorizadas |
| --- | --- | --- | --- | --- | --- | --- |
| Xerife / Sub-Xerife / Adm | visão dos módulos permitidos | sim; reversão depende de `admin` no banco | leitura e edição | leitura e edição | sim | Investigações, Ações |
| Membro | visão sem efetivo/auditoria | não | leitura | não | não | nenhuma |
| Conta antiga com nível `xerife` | visão do Registro | sim; sem reversão | não | não | não | nenhuma |
| Sem cargo ou permissão reconhecida | bloqueado | bloqueado | bloqueado | bloqueado | bloqueado | nenhuma |

Início é um agrupamento visual de direitos existentes. A sidebar não é a barreira de segurança: Supabase/RLS/RPC e as Functions continuam verificando os acessos reais. Nenhuma concessão de permissão ou nome de cargo novo foi implementado.

## Riscos, limites e próximas decisões

- A Fase 2 depende da aprovação da matriz granular `módulo + ação` e dos escopos por jurisdição; os papéis sugeridos na especificação não foram criados implicitamente.
- Avisos, Premiações e registros estruturados dos módulos futuros precisarão de dados, regras, auditoria e migrações próprias, versionadas e aprovadas separadamente. Não há dependência de banco para aprovar esta Fase 1.
- O Dashboard mostra o cadastro completo autorizado, incluindo registros exonerados, com rótulos explícitos. Alterar a definição de efetivo ou métricas operacionais exige decisão de produto; não foi inferida nesta fase.
- A atividade recente é exclusivamente a auditoria existente de Registros. Não representa operações, presenças ou abates.
- Os testes locais simulam Supabase e Functions. RLS, dados de produção, Realtime entre dois navegadores, revogação real de conta e o fluxo de senha precisam de homologação no Deploy Preview com contas autorizadas.
- Módulos usam rotas HTML, preservando sua independência. Novos módulos devem declarar metadados de navegação em `admin-shell.js` e só ganhar uma permissão real após implementação no servidor e aprovação da matriz.
