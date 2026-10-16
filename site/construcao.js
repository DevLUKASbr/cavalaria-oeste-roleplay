/* Páginas ainda sem conteúdo (Recrutamento, Investigações, Ações): só checam o acesso e montam o menu. */
(async () => {
  'use strict';
  const access = await window.Cavalaria.requirePage(document.body.dataset.pagina);
  if (access) window.Cavalaria.setHidden('private', false);
})();
