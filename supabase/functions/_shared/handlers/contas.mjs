/*
 * API: gestão de contas (rota /api/contas).
 *
 *   GET  → lista de contas. Quem gerencia contas recebe tudo; quem só vê o registro recebe
 *          { email, nome } (para mostrar nomes no histórico).
 *   POST { acao: 'criar',  email, nome, cargo, senha }   (permissão 'contas')
 *   POST { acao: 'editar', id, nome, cargo|null }         (permissão 'contas'; null = sem acesso;
 *                                                          sem o campo cargo = só renomear)
 *   POST { acao: 'senha',  id, senha }                    (permissão 'contas')
 *
 * Nome e cargo ficam em app_metadata da conta (só a chave secreta altera). O nível de acesso ao
 * registro fica em public.cavalaria_membros, que as regras RLS do banco consultam. Cargos e
 * permissões: netlify/lib/acesso.mjs.
 */
import { HttpError, json, respond, supabase, authenticate, cargoOf, NIVEL_DO_CARGO } from '../lib/acesso.mjs';

const BAN_FOREVER = '876000h'; // ~100 anos: impede renovar a sessão de quem perdeu o acesso
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Supabase: usuários e níveis de acesso
// ---------------------------------------------------------------------------

function accountsApi(sb) {
  return {
    async listUsers() {
      const users = [];
      for (let page = 1; ; page++) {
        const data = await sb.call(`/auth/v1/admin/users?page=${page}&per_page=200`);
        const batch = data?.users || [];
        users.push(...batch);
        if (batch.length < 200) return users;
      }
    },
    createUser: attrs => sb.call('/auth/v1/admin/users', { method: 'POST', body: attrs }),
    updateUser: (id, attrs) => sb.call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: attrs }),
    listMembers: () => sb.call('/rest/v1/cavalaria_membros?select=user_id,role'),
    setRole: (userId, role) => sb.call('/rest/v1/cavalaria_membros?on_conflict=user_id', {
      method: 'POST',
      body: { user_id: userId, role },
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    }),
    removeRole: userId => sb.call(`/rest/v1/cavalaria_membros?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    }),
  };
}

// O nível no banco acompanha o cargo: cargo sem acesso ao registro (ex.: Membro) não fica na tabela.
async function syncRole(api, userId, cargo) {
  const role = cargo ? NIVEL_DO_CARGO[cargo] : null;
  if (role) await api.setRole(userId, role);
  else await api.removeRole(userId);
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function cleanName(nome) {
  const value = String(nome ?? '').trim();
  if (value.length < 2 || value.length > 80) throw new HttpError(400, 'Informe o nome no RP (2 a 80 caracteres).');
  return value;
}

function cleanCargo(cargo, { allowNone = false } = {}) {
  if (allowNone && (cargo === null || cargo === '')) return null;
  if (!Object.hasOwn(NIVEL_DO_CARGO, cargo)) throw new HttpError(400, 'Cargo inválido.');
  return cargo;
}

function cleanPassword(senha) {
  const value = String(senha ?? '');
  if (value.length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  return value;
}

function cleanEmail(email) {
  const value = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(value)) throw new HttpError(400, 'Usuário ou e-mail inválido.');
  return value;
}

function cleanId(id) {
  const value = String(id ?? '');
  if (!value) throw new HttpError(400, 'Conta não informada.');
  return value;
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function listAccounts(api, full) {
  const [users, members] = await Promise.all([api.listUsers(), api.listMembers()]);
  const roleById = new Map(members.map(m => [m.user_id, m.role]));
  const accounts = users.map(u => ({
    id: u.id,
    email: u.email,
    nome: u.app_metadata?.nome || '',
    cargo: cargoOf(u, roleById.get(u.id)),
    ultimo_acesso: u.last_sign_in_at || null,
  }));
  if (full) return accounts;
  return accounts.filter(a => a.cargo).map(({ email, nome }) => ({ email, nome }));
}

async function createAccount(api, body) {
  const email = cleanEmail(body.email);
  const nome = cleanName(body.nome);
  const cargo = cleanCargo(body.cargo);
  const user = await api.createUser({
    email,
    password: cleanPassword(body.senha),
    email_confirm: true,
    app_metadata: { nome, cargo },
    user_metadata: { trocar_senha: true },
  }).catch(e => {
    if (/already been registered|already exists/i.test(e.message)) throw new HttpError(409, 'Já existe uma conta com esse usuário ou e-mail.');
    throw e;
  });
  await syncRole(api, user.id, cargo);
  return { id: user.id };
}

async function editAccount(api, body, caller) {
  const id = cleanId(body.id);
  const nome = cleanName(body.nome);
  if (body.cargo === undefined) {
    await api.updateUser(id, { app_metadata: { nome } });
    return { ok: true };
  }

  const cargo = cleanCargo(body.cargo, { allowNone: true });
  if (id === caller.user.id && NIVEL_DO_CARGO[cargo] !== 'admin') {
    throw new HttpError(400, 'Você não pode tirar o próprio acesso à página Contas.');
  }

  // Sem acesso: bloqueia a conta (não renova mais a sessão) e tira o nível do registro na hora.
  await api.updateUser(id, { app_metadata: { nome, cargo }, ban_duration: cargo ? 'none' : BAN_FOREVER });
  await syncRole(api, id, cargo);
  return { ok: true };
}

async function resetPassword(api, body) {
  const id = cleanId(body.id);
  await api.updateUser(id, { password: cleanPassword(body.senha), user_metadata: { trocar_senha: true } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default (req, runtimeEnv) => respond(async () => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

  const sb = supabase(runtimeEnv);
  const caller = await authenticate(req, sb);
  const api = accountsApi(sb);

  if (req.method === 'GET') {
    if (!caller.can('contas') && !caller.can('registro')) throw new HttpError(403, 'Sem permissão para ver as contas.');
    return json(200, { contas: await listAccounts(api, caller.can('contas')) });
  }

  if (!caller.can('contas')) throw new HttpError(403, 'Sua conta não tem permissão para gerenciar contas.');
  const body = await req.json().catch(() => ({}));
  switch (body.acao) {
    case 'criar': return json(201, await createAccount(api, body));
    case 'editar': return json(200, await editAccount(api, body, caller));
    case 'senha': return json(200, await resetPassword(api, body));
    default: throw new HttpError(400, 'Ação desconhecida.');
  }
});

export const config = { path: '/api/contas' };
