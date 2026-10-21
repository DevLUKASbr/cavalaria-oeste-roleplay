// Só inicia após requirePage validar a conta e a permissão. Login não envia presença.
(() => {
  'use strict';
  let running = false, timer = null, api = null, pending = null, controller = null, lastAttempt = -Infinity;
  const visible = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
  async function touch() {
    if (!running || !visible()) return;
    if (pending) return pending;
    if (Date.now() - lastAttempt < 30000) return;
    lastAttempt = Date.now();
    const requestController = controller = new AbortController();
    const timeout = setTimeout(() => requestController.abort(), 12000);
    pending = (async () => {
      try { await api('presenca', 'POST', {}, { signal: requestController.signal }); }
      catch { /* Presença indisponível não impede o uso dos módulos. Tentar no próximo ciclo. */ }
      finally { clearTimeout(timeout); pending = null; if (controller === requestController) controller = null; }
    })();
    return pending;
  }
  function stop() {
    running = false;
    clearInterval(timer); timer = null;
    controller?.abort();
  }
  function start(access, call) {
    if (running || !access.permissions.includes('acoes')) return;
    api = call; running = true; lastAttempt = -Infinity;
    touch(); timer = setInterval(touch, 45000);
  }
  document.addEventListener('visibilitychange', touch);
  window.addEventListener('online', () => { lastAttempt = -Infinity; touch(); });
  window.addEventListener('pagehide', stop);
  // Retorno pelo cache de navegação: retomar usando a sessão atual, sem guardar token.
  window.addEventListener('pageshow', event => { if (event.persisted && api) { running = true; lastAttempt = -Infinity; touch(); clearInterval(timer); timer = setInterval(touch, 45000); } });
  window.CavalariaPresence = { start, stop, touch };
})();
