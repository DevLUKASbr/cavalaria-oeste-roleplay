/* Cálculos do livro e CSV. Sem acesso à sessão, rede ou armazenamento. */
(() => {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  function dayKey(value = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = name => parts.find(p => p.type === name).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  const formatWhen = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'short' });
  function filter(records, { search = '', from = '', to = '', result = '' } = {}) {
    const term = normalize(search);
    return records.filter(item => {
      const day = dayKey(item.ocorrido_em);
      return (!from || day >= from) && (!to || day <= to) && (!result || item.resultado === result)
        && (!term || normalize([item.titulo, item.relato, item.autor?.nome, item.autor?.patente, ...(item.participantes || [])].join(' ')).includes(term));
    });
  }
  function stats(records) {
    const total = records.length, wins = records.filter(item => item.resultado === 'vitoria').length;
    const identities = new Map(), people = new Set();
    for (const item of records) (item.participantes || []).forEach((name, i) => {
      const id = item.participantes_ids?.[i];
      if (id) { const key = normalize(name); if (!identities.has(key)) identities.set(key, new Set()); identities.get(key).add(id); }
    });
    for (const item of records) (item.participantes || []).forEach((name, i) => {
      const known = identities.get(normalize(name));
      const id = item.participantes_ids?.[i] || (known?.size === 1 ? [...known][0] : null);
      people.add(id ? 'id:' + id : 'nome:' + normalize(name));
    });
    return { total, wins, losses: records.filter(item => item.resultado === 'derrota').length, rate: total ? Math.round(wins / total * 100) : null, officers: people.size };
  }
  function csv(records) {
    const cell = value => { let text = String(value ?? ''); if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const rows = [['ID', 'Data e hora (Brasília)', 'Ação', 'Resultado', 'Cavalaria', 'Oponentes', 'Participantes', 'Registrado por', 'Patente no registro', 'Relato', 'Registrado em (UTC)', 'Última alteração por', 'Patente na alteração', 'Alterado em (UTC)', 'Arquivado em (UTC)']];
    for (const item of records) rows.push([item.id, formatWhen(item.ocorrido_em), item.titulo, item.resultado === 'vitoria' ? 'Vitória' : 'Derrota', item.cavalaria, item.oponentes, item.participantes.join(' | '), item.autor?.nome, item.autor?.patente, item.relato, item.criado_em, item.atualizado_por?.nome, item.atualizado_por?.patente, item.atualizado_em, item.arquivado_em]);
    return '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n');
  }
  const helpers = { normalize, dayKey, formatWhen, filter, stats, csv };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  else window.CavalariaAcoes = helpers;
})();
