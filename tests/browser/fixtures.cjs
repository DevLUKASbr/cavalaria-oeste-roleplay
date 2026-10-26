// Fixtures fictícias. Nenhuma conta, credencial ou chamada real ao Supabase é usada.
function supabaseMock() {
  const settings = window.__testSettings || {};
  const user = { id: 'test-official', email: 'oficial@example.test', app_metadata: { nome: 'Morgan West', cargo: settings.cargo ?? 'Xerife' }, user_metadata: { trocar_senha: !!settings.firstAccess } };
  let listeners = [];
  const state = window.__mock = {
    calls: [], fail: !!settings.fail, officers: settings.empty ? [] : [
      { id: 'a', ordem: 1, nome: 'Arthur Teste', origem: 'New Hanover', status: 'Ativo', destino: 'A definir', observacao: '', executed_at: null },
      { id: 'b', ordem: 2, nome: 'Bonnie Teste', origem: 'West Elizabeth', status: 'Exonerar', destino: 'West Elizabeth', observacao: 'Revisão registrada', executed_at: null },
      { id: 'c', ordem: 3, nome: 'Charles Teste', origem: 'Lemoyne', status: 'Exonerar', destino: 'Lemoyne', observacao: '', executed_at: '2026-10-15T15:00:00Z', executed_by_email: 'comando@example.test' },
      { id: 'd', ordem: 4, nome: 'Diana Teste', origem: 'New Hanover', status: 'Pendente', destino: 'A definir', observacao: '', executed_at: null },
      { id: 'e', ordem: 5, nome: 'Elias Teste', origem: 'Sem jurisdição', status: 'Inativo', destino: 'A definir', observacao: '', executed_at: null },
    ],
    audit: settings.empty ? [] : [{ oficial_nome: 'Arthur Teste', alterado_em: '2026-10-16T14:00:00Z', autor_email: 'comando@example.test', antes: { situacao: 'Pendente' }, depois: { situacao: 'Ativo' } }],
  };
  function builder(table) {
    let patch = null, id = null, resultFields = null, conditions = [];
    const query = {
      select(fields) { resultFields = fields; return query; },
      order() { return query; },
      limit() { return query; },
      eq(field, value) { if (field === 'id') id = value; else conditions.push([field, value]); return query; },
      is() { return query; },
      update(value) { patch = value; return query; },
      maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    async function execute(single) {
      state.calls.push({ table, patch, id, fields: resultFields });
      if (settings.delay) await new Promise(resolve => setTimeout(resolve, settings.delay));
      if (table === 'cavalaria_membros') return { data: settings.cargo === 'Membro' || settings.noRole ? null : { role: settings.role || 'admin' }, error: null };
      if (state.fail || (table === 'cavalaria_auditoria' && settings.auditFail)) return { data: null, error: { message: 'Fixture indisponível' } };
      if (patch) {
        if (state.saveFail) return { data: null, error: { message: 'Falha fictícia ao salvar' } };
        const officer = state.officers.find(row => row.id === id && !row.executed_at);
        if (!officer || !conditions.every(([field,value]) => officer[field] === value)) return { data: null, error: null };
        state.audit.unshift({ oficial_nome: patch.nome || officer.nome, alterado_em: new Date().toISOString(), autor_email: 'comando@example.test', antes: { nome: officer.nome, contingente: officer.origem }, depois: { nome: patch.nome || officer.nome, contingente: patch.origem || officer.origem } });
        Object.assign(officer, patch);
        return { data: { id }, error: null };
      }
      return { data: table === 'cavalaria_oficiais' ? structuredClone(state.officers) : structuredClone(state.audit), error: null };
    }
    return query;
  }
  window.supabase = { createClient: () => ({
    auth: {
      async getSession() { return { data: { session: settings.noSession || sessionStorage.getItem('test-signed-out') ? null : { user, access_token: 'fixture-session' } } }; },
      async getUser() { return { data: { user }, error: null }; },
      async signInWithPassword() { sessionStorage.removeItem('test-signed-out'); settings.noSession = false; return { error: null }; },
      async signOut() { sessionStorage.setItem('test-signed-out', 'true'); listeners.forEach(handler => handler('SIGNED_OUT')); return { error: null }; },
      onAuthStateChange(handler) { listeners.push(handler); return { data: { subscription: { unsubscribe() {} } } }; },
      async updateUser() { state.calls.push({ type: 'password' }); return { error: null }; },
    },
    from: builder,
    async rpc(name, payload) {
      state.calls.push({ rpc: name, payload });
      const officer = state.officers.find(row => row.id === payload.p_oficial);
      if (name === 'corrigir_oficial') {
        if (state.saveFail) return { data:null,error:{message:'Falha fictícia ao salvar'} };
        if (!officer || officer.executed_at || officer.nome !== payload.p_nome_anterior || officer.origem !== payload.p_contingente_anterior) return {data:null,error:{message:'O registro mudou desde a abertura'}};
        state.audit.unshift({oficial_nome:payload.p_nome,alterado_em:new Date().toISOString(),autor_email:'comando@example.test',antes:{nome:officer.nome,contingente:officer.origem},depois:{nome:payload.p_nome,contingente:payload.p_contingente}});
        if (officer.origem !== payload.p_contingente) officer.destino='A definir';
        officer.nome=payload.p_nome; officer.origem=payload.p_contingente;
      }
      if (name === 'confirmar_exoneracao') officer.executed_at = '2026-10-16T15:00:00Z';
      if (name === 'reverter_exoneracao') { officer.executed_at = null; officer.status = 'Ativo'; }
      return { data: true, error: null };
    },
    channel() { const channel = { on() { return channel; }, subscribe(callback) { callback?.('SUBSCRIBED'); return channel; } }; return channel; },
  }) };
}

async function prepare(page, settings = {}) {
  const calls = [];
  let topics = settings.topics || [];
  let records = [];
  let targets = [];
  let groups = [];
  let links = [];
  let notices = settings.notices || [];
  let actions = settings.actions || [];
  await page.addInitScript(value => { window.__testSettings = value; }, settings);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: `(${supabaseMock.toString()})();` });
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      const request = route.request();
      const payload = request.method() === 'POST' ? request.postDataJSON() : null;
      calls.push({ path: url.pathname, payload, authenticated: request.headers().authorization === 'Bearer fixture-session' });
      if (url.pathname === '/api/presenca') {
        if (settings.presenceFail) return route.fulfill({ status: 502, json: { erro: 'Presença indisponível.' } });
        const now = new Date();
        return route.fulfill({ json: payload ? { confirmado: true } : { servidor_em: now.toISOString(), online: (settings.onlineIds || ['test-official']).map(id => ({ id, expira_em: new Date(now.getTime() + (settings.presenceTTL ?? 120000)).toISOString() })) } });
      }
      if (url.pathname === '/api/acoes') {
        const people = settings.actionOfficers || [{ id: 'test-official', nome: 'Morgan West', cargo: 'Membro' }, { id: 'john-official', nome: 'John Carter', cargo: 'Membro' }, { id: 'joao-official', nome: 'João do Oeste', cargo: 'Membro' }];
        if (url.searchParams.get('oficiais') === '1') return route.fulfill({ status: settings.officersFail ? 502 : 200, json: settings.officersFail ? { erro: 'Falha fictícia ao carregar oficiais.' } : { oficiais: people } });
        if (settings.actionsFail) return route.fulfill({ status: 502, json: { erro: 'Falha fictícia ao consultar ações.' } });
        if (payload && settings.actionSaveFail) return route.fulfill({ status: 502, json: { erro: 'Falha fictícia ao salvar ação.' } });
        if (payload && settings.actionSaveDelay) await new Promise(resolve => setTimeout(resolve, settings.actionSaveDelay));
        const now = new Date().toISOString();
        const author = { id: 'test-official', nome: 'Morgan West', cargo: settings.cargo || 'Xerife', patente: payload?.patente };
        let saved;
        if (payload?.acao === 'criar') {
          saved = { ...payload, participantes: payload.participantes_ids.map(id => people.find(person => person.id === id).nome), id: 'fixture-action-' + actions.length, autor: author, criado_em: now, atualizado_em: null, arquivado_em: null, origem: 'manual' };
          actions.push(saved);
        }
        if (payload && payload.acao !== 'criar') {
          const current = actions.find(item => item.id === payload.id);
          if (!current) return route.fulfill({ status: 404, json: { erro: 'Ação fictícia não encontrada.' } });
          saved = { ...current, ...(payload.acao === 'editar' ? payload : {}), autor: current.autor, atualizado_em: now, atualizado_por: author };
          if (payload.acao === 'editar') {
            const oldPeople = new Map(current.participantes.map((nome, i) => [current.participantes_ids?.[i] || `anterior:${i}`, nome]));
            saved.participantes = payload.participantes_ids.map(id => oldPeople.get(id) || people.find(person => person.id === id)?.nome);
          }
          if (payload.acao === 'arquivar') Object.assign(saved, { arquivado_em: now, arquivado_por: author });
          if (payload.acao === 'restaurar') Object.assign(saved, { arquivado_em: null, arquivado_por: null });
          actions = actions.map(item => item.id === saved.id ? saved : item);
        }
        return route.fulfill({ status: payload?.acao === 'criar' ? 201 : 200, json: payload ? { acao: saved } : { acoes: actions.filter(item => Boolean(item.arquivado_em) === (url.searchParams.get('arquivados') === '1')).sort((a,b) => b.ocorrido_em.localeCompare(a.ocorrido_em)) } });
      }
      if (url.pathname === '/api/avisos') {
        if (settings.noticesFail) return route.fulfill({ status: 502, json: { erro: 'Falha fictícia ao acessar avisos.' } });
        if (payload && settings.noticeSaveFail) return route.fulfill({ status: 502, json: { erro: 'Falha fictícia ao publicar aviso.' } });
        const author = { nome: 'Morgan West', cargo: settings.cargo || 'Xerife' };
        if (payload?.acao === 'criar') notices.push({ ...payload, id: 'fixture-notice-' + notices.length, autor: author, criado_em: '2026-10-17T14:00:00Z', arquivado_em: null });
        if (payload?.acao === 'editar') notices = notices.map(item => item.id === payload.id ? { ...item, ...payload, atualizado_em: '2026-10-17T15:00:00Z', atualizado_por: author } : item);
        if (payload?.acao === 'arquivar' || payload?.acao === 'restaurar') notices = notices.map(item => item.id === payload.id ? { ...item, arquivado_em: payload.acao === 'arquivar' ? '2026-10-17T15:00:00Z' : null, arquivado_por: author } : item);
        return route.fulfill({ json: { avisos: notices.filter(item => Boolean(item.arquivado_em) === (url.searchParams.get('arquivados') === '1')) } });
      }
      if (url.pathname === '/api/contas') return route.fulfill({ json: { contas: [{ id: 'account-test', nome: 'Morgan West', email: 'comando@example.test', cargo: 'Xerife', ultimo_acesso: '2026-10-16T14:00:00Z' }] } });
      if (url.pathname === '/api/treinamentos') {
        if (payload?.acao === 'criar') topics.push({ ...payload, id: 'fixture-topic', criado_em: '2026-10-16T14:00:00Z', autor: { nome: 'Morgan West' } });
        if (payload?.acao === 'editar') topics = topics.map(topic => topic.id === payload.id ? { ...topic, ...payload } : topic);
        if (payload?.acao === 'excluir') topics = topics.filter(topic => topic.id !== payload.id);
        return route.fulfill({ json: { topicos: topics } });
      }
      if (url.pathname === '/api/recrutamentos') {
        if (payload?.acao === 'criar') records.push({ ...payload, id: 'fixture-recruitment', criado_em: '2026-10-16T14:00:00Z', autor: { nome: 'Morgan West' } });
        if (payload?.acao === 'editar') records = records.map(record => record.id === payload.id ? { ...record, ...payload } : record);
        if (payload?.acao === 'excluir') records = records.filter(record => record.id !== payload.id);
        return route.fulfill({ json: { fichas: records } });
      }
      if (url.pathname === '/api/investigacoes') {
        if (payload?.acao === 'salvar-grupo') {
          const group = { ...payload.grupo, id: payload.grupo.id || 'fixture-group' };
          groups = [...groups.filter(item => item.id !== group.id), group];
        }
        if (payload?.acao === 'salvar-alvo') {
          const target = { ...payload.alvo, id: payload.alvo.id || `fixture-target-${targets.length + 1}` };
          targets = [...targets.filter(item => item.id !== target.id), target];
        }
        if (payload?.acao === 'excluir-alvo') {
          targets = targets.filter(item => item.id !== payload.id).map(item => (item.local_id === payload.id ? { ...item, local_id: null } : item));
          links = links.filter(link => link.de !== payload.id && link.para !== payload.id);
        }
        if (payload?.acao === 'salvar-vinculo') {
          const link = { ...payload.vinculo, id: payload.vinculo.id || `fixture-link-${links.length + 1}` };
          links = [...links.filter(item => item.id !== link.id), link];
        }
        if (payload?.acao === 'excluir-vinculo') links = links.filter(link => link.id !== payload.id);
        if (payload?.acao === 'excluir-grupo') {
          groups = groups.filter(item => item.id !== payload.id);
          targets = targets.map(item => (item.grupo_id === payload.id ? { ...item, grupo_id: null } : item));
        }
        return route.fulfill({ json: { alvos: targets, grupos: groups, vinculos: links } });
      }
    }
    return route.continue();
  });
  return { calls };
}
module.exports = { prepare };
