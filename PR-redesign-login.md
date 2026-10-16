# Redesign cinematográfico do login da Cavalaria

Branch: `feature/redesign-login-faroeste`

A tela de entrada passa a usar o cenário de faroeste ao pôr do sol e o painel de pergaminho da referência. O formulário é HTML funcional, com logomarca original, moldura vetorial ornamentada, campos com ícones, foco visível, botão verde com detalhes dourados e controle acessível de mostrar/ocultar senha. O layout tem ajustes para celulares e desktops de menor altura; telas curtas podem rolar sem cortar os controles.

## Escopo

- `site/index.html`: composição, labels explícitos, ícones, mensagens acessíveis e carregamento dos novos recursos.
- `site/login.css`: visual exclusivo do login, enquadramento do cenário e adaptação responsiva.
- `site/login-ui.js`: mostrar/ocultar senha, sem acesso à autenticação ou ao Supabase. A senha volta a ficar oculta ao enviar o formulário ou sair da página.
- `site/assets/login-frame.svg`: moldura e textura de pergaminho em SVG, sem textos ou controles desenhados.
- `site/assets/login-scenery.webp`: apenas o cenário, otimizado para WebP (1672 × 941; 243.146 bytes).
- `tests/login.test.cjs` e `tests/login-ui.test.cjs`: testes de regressão sem dependências externas, contas reais ou chamadas de rede.
- `PR-redesign-login.md`: documentação do escopo, validações, pendências e origem do cenário.

`login.js`, `comum.js`, `config.js`, `estilo.css`, painel, gestão de contas, Treinamentos, Netlify Functions, configuração do Netlify e SQL permanecem idênticos à `main` oficial usada como base (`0230888`). A branch foi atualizada para incluir o cargo Membro e o fluxo de Treinamentos já presentes no repositório oficial; apenas os testes foram adaptados a esses fluxos. Nenhum arquivo da pasta antiga foi utilizado.

## Validação

```powershell
node --test tests/*.test.cjs
git diff --check
```

- 28 testes passaram: configuração ausente, verificação de sessão antes da exibição, sessão existente autorizada, sessão revogada, usuário individual, e-mail completo, senha incorreta, consulta de associação com falha, conta sem autorização, bloqueio do botão durante autenticação, mensagens de retorno, proteção de páginas internas, restrição administrativa, encerramento de sessão, visibilidade da senha, redirecionamento de Membro a Treinamentos, acesso de Xerife/Sub-Xerife/Adm a Contas, primeiro acesso e verificação do usuário no servidor.
- `node --check` passou nos 13 arquivos JavaScript do sistema e dos testes.
- Recursos locais e páginas existentes responderam HTTP 200 em servidor estático local.
- HTML5 analisado com parser estrito (`html5lib`), IDs únicos e associação de labels; 79 regras CSS analisadas sem erros de parsing (`tinycss2`); SVG validado como XML e WebP validado como imagem. Os parsers foram instalados apenas em pasta temporária, sem dependências novas no projeto.
- Arquivos preservados conferidos com `git diff --exit-code origin/main -- ...`.
- Arquivos candidatos revisados e analisados em busca de tokens, JWTs, chaves privadas e credenciais administrativas: nenhum segredo real detectado. As credenciais dos testes são fictícias. Nenhum arquivo temporário ou configuração de ambiente integra o commit.

Limites: os testes simulam DOM e Supabase e executam os scripts reais. Não houve login com contas reais, teste de integração com o Supabase/Netlify nem inspeção visual em navegador, pois não há navegador conectado disponível nesta sessão. A revisão em navegador desktop e celular e a conferência do fluxo com uma conta de teste continuam pendentes antes do merge.

O envio é exclusivo à branch `feature/redesign-login-faroeste`; o merge em `main` e o deploy de produção não fazem parte desta alteração. O projeto não exige instalação de dependências nem etapa de build. Para abrir a prévia local:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory site
# Abrir http://127.0.0.1:4173 no navegador.
```

## Origem do cenário

Gerado com a ferramenta integrada `image_gen` a partir da imagem de referência enviada pelo usuário, com remoção de todo o painel, textos e controles. A imagem foi convertida para WebP localmente, mantendo a resolução. O cenário está versionável no próprio repositório, sem dependência do caminho de geração ou de hospedagem externa.

Prompt utilizado:

> Use case: historical-scene. Asset type: background-only image for a working Cavalaria Oeste Roleplay login page. Use the attached reference only for the cinematic scenery composition, lighting and art direction. Generate a wide 16:9 realistic cinematic Old West scene circa 1900, at intense orange amber sunset: mounted cavalry officer in dark uniform with black hat and gold badge on a dark brown horse at the left third, looking ahead. Wooden post and warm hanging lantern at far left. Dust and golden rim light, layered mountains, a river reflecting sunset, small frontier town with wooden buildings, church and windmill on the right, rustic fences and wagon wheel in foreground right. Dramatic orange clouds and sun near the right horizon. Center third must be uninterrupted natural distant scenery with lower visual detail, suitable to be covered by a real vertical HTML form. CRITICAL: remove the entire parchment panel, all UI, all lettering, logos, gold ornaments, input fields and buttons from the reference. Render only the landscape and mounted officer, edge to edge. No text, no watermark, no interface, no parchment. Professional cinematic realism with atmospheric depth, realistic horse anatomy, richly detailed but readable as a background. Output landscape 2560x1440 or similar 16:9.
