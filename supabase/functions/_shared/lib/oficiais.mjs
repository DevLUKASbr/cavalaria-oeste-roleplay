import { HttpError, cargoOf, can } from './acesso.mjs';

const normalize = name => String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');

// Diretório mínimo para seleção. Não expõe e-mails, sessões ou dados administrativos.
// Todos os oficiais autorizados entram na lista, inclusive quem nunca fez login.
export async function listOfficers(sb) {
  const [users, members] = await Promise.all([
    (async () => {
      const result = [];
      for (let page = 1; ; page++) {
        const data = await sb.call(`/auth/v1/admin/users?page=${page}&per_page=200`);
        if (!Array.isArray(data?.users)) throw new HttpError(502, 'Não foi possível consultar os oficiais cadastrados.');
        result.push(...data.users);
        if (data.users.length < 200) return result;
      }
    })(),
    sb.call('/rest/v1/cavalaria_membros?select=user_id,role'),
  ]);
  if (!Array.isArray(members)) throw new HttpError(502, 'Não foi possível conferir o acesso dos oficiais.');
  const roles = new Map(members.map(member => [member.user_id, member.role]));
  const found = new Map();
  for (const user of users) {
    const nome = normalize(user.app_metadata?.nome), cargo = cargoOf(user, roles.get(user.id));
    if (!user.id || nome.length < 2 || nome.length > 100 || !can(cargo, 'acoes') || (user.banned_until && Date.parse(user.banned_until) > Date.now())) continue;
    found.set(user.id, { id: user.id, nome, cargo });
  }
  return [...found.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
}

export async function resolveParticipants(sb, body, current = null) {
  const directory = await listOfficers(sb);
  const available = new Map(directory.map(officer => [officer.id, officer]));
  const previous = new Map((current?.participantes || []).map((nome, i) => [current.participantes_ids?.[i] || `anterior:${i}`, { id: current.participantes_ids?.[i] || null, nome }]));
  let ids = body.participantes_ids;
  // Compatibilidade com páginas anteriores: nomes só são aceitos quando identificam
  // um oficial cadastrado sem ambiguidade, ou um participante do próprio registro.
  if (ids === undefined && Array.isArray(body.participantes)) {
    ids = body.participantes.map(name => {
      if (typeof name !== 'string') throw new HttpError(400, 'Selecione os oficiais participantes.');
      const key = normalize(name).toLocaleLowerCase('pt-BR');
      const old = [...previous].filter(([, person]) => normalize(person.nome).toLocaleLowerCase('pt-BR') === key);
      if (old.length === 1) return old[0][0];
      const matches = directory.filter(person => person.nome.toLocaleLowerCase('pt-BR') === key);
      if (matches.length !== 1) throw new HttpError(400, 'Atualize a página e selecione os oficiais cadastrados.');
      return matches[0].id;
    });
  }
  if (!Array.isArray(ids) || ids.length !== body.cavalaria || ids.length < 1 || ids.length > 200 || ids.some(id => typeof id !== 'string' || id.length > 128)) throw new HttpError(400, 'A seleção de oficiais deve conferir com a quantidade da Cavalaria.');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'O mesmo oficial foi selecionado mais de uma vez.');
  const selected = ids.map(id => {
    // Preservar os nomes históricos e permitir manter participantes que perderam
    // acesso depois da ocorrência, sem disponibilizá-los para novos registros.
    if (previous.has(id)) return previous.get(id);
    const person = available.get(id);
    if (!person) throw new HttpError(400, 'Um oficial selecionado não está mais disponível. Atualize a lista de oficiais.');
    return person;
  });
  return { participantes: selected.map(person => person.nome), participantes_ids: selected.map(person => person.id) };
}
