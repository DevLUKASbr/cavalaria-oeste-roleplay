/*
 * Netlify Function: gestão de contas do painel da Cavalaria (rota /api/contas).
 *
 * Usa a chave secreta do Supabase, que fica SOMENTE nas variáveis de ambiente do Netlify
 * (SUPABASE_URL e SUPABASE_SECRET_KEY) e nunca chega ao navegador.
 *
 *   GET  → lista de contas. Xerife recebe só { email, nome }; Alto Comando recebe tudo.
 *   POST { acao: 'criar',  email, nome, role, senha }   (Alto Comando)
 *   POST { acao: 'editar', id, nome, role|null }         (Alto Comando; role null = sem acesso)
 *   POST { acao: 'senha',  id, senha }                   (Alto Comando)
 *
 * O nome do oficial fica em app_metadata.nome (só a chave secreta altera) e o cargo em
 * public.cavalaria_membros, a mesma tabela que as regras RLS do banco já consultam.
 */

const ROLES = ['admin', 'xerife'];
const BAN_FOREVER = '876000h'; // ~100 anos: impede renovar a sessão de quem perdeu o acesso
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function env(name) {
  return globalThis.Netlify?.env?.get(name) ?? globalThis.process?.env?.[name];
}

// ---------------------------------------------------------------------------
// Acesso ao Supabase com a chave secreta
// ---------------------------------------------------------------------------

function supabase() {
  const url = env('SUPABASE_URL')?.replace(/\/+$/, '');
  const key = env('SUPABASE_SECRET_KEY');
  if (!url || !key) {
    throw new HttpError(503, 'Gestão de contas não configurada: defina SUPABASE_URL e SUPABASE_SECRET_KEY no Netlify.');
  }

  // Chaves novas (sb_secret_…) vão só no header apikey; as antigas (JWT service_role) também no Authorization.
  const serviceHeaders = { apikey: key, 'content-type': 'application/json' };
  if (!key.startsWith('sb_')) serviceHeaders.authorization = `Bearer ${key}`;

  async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(url + path, {
      method,
      headers: { ...serviceHeaders, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const reason = data?.msg || data?.message || data?.error_description || data?.error || response.statusText;
      throw new HttpError(response.status >= 500 ? 502 : 400, `Supabase: ${reason}`);
    }
    return data;
  }

  return {
    // Valida o token do usuário logado e devolve o usuário (ou null se inválido/expirado).
    async userFromToken(token) {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, authorization: `Bearer ${token}` },
      });
      return response.ok ? response.json() : null;
    },

    async listUsers() {
      const users = [];
      for (let page = 1; ; page++) {
        const data = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
        const batch = data?.users || [];
        users.push(...batch);
        if (batch.length < 200) return users;
      }
    },

    createUser: attrs => call('/auth/v1/admin/users', { method: 'POST', body: attrs }),
    updateUser: (id, attrs) => call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: attrs }),

    listMembers: () => call('/rest/v1/cavalaria_membros?select=user_id,role'),
    async roleOf(userId) {
      const rows = await call(`/rest/v1/cavalaria_membros?select=role&user_id=eq.${encodeURIComponent(userId)}`);
      return rows?.[0]?.role || null;
    },
    setRole: (userId, role) => call('/rest/v1/cavalaria_membros?on_conflict=user_id', {
      method: 'POST',
      body: { user_id: userId, role },
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    }),
    removeRole: userId => call(`/rest/v1/cavalaria_membros?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    }),
  };
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function cleanName(nome) {
  const value = String(nome ?? '').trim();
  if (value.length < 2 || value.length > 80) throw new HttpError(400, 'Informe o nome no RP (2 a 80 caracteres).');
  return value;
}

function cleanRole(role, { allowNone = false } = {}) {
  if (allowNone && (role === null || role === '')) return null;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Cargo inválido.');
  return role;
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

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function listAccounts(sb, isAdmin) {
  const [users, members] = await Promise.all([sb.listUsers(), sb.listMembers()]);
  const roleById = new Map(members.map(m => [m.user_id, m.role]));
  const accounts = users.map(u => ({
    id: u.id,
    email: u.email,
    nome: u.app_metadata?.nome || '',
    role: roleById.get(u.id) || null,
    ultimo_acesso: u.last_sign_in_at || null,
  }));
  if (isAdmin) return accounts;
  return accounts.filter(a => a.role).map(({ email, nome }) => ({ email, nome }));
}

async function createAccount(sb, body) {
  const email = cleanEmail(body.email);
  const nome = cleanName(body.nome);
  const role = cleanRole(body.role);
  const user = await sb.createUser({
    email,
    password: cleanPassword(body.senha),
    email_confirm: true,
    app_metadata: { nome },
    user_metadata: { trocar_senha: true },
  }).catch(e => {
    if (/already been registered|already exists/i.test(e.message)) throw new HttpError(409, 'Já existe uma conta com esse usuário ou e-mail.');
    throw e;
  });
  await sb.setRole(user.id, role);
  return { id: user.id };
}

async function editAccount(sb, body, caller) {
  const id = String(body.id ?? '');
  if (!id) throw new HttpError(400, 'Conta não informada.');
  const nome = cleanName(body.nome);
  const role = cleanRole(body.role, { allowNone: true });
  if (id === caller.id && role !== 'admin') {
    throw new HttpError(400, 'Você não pode tirar o próprio acesso de Alto Comando.');
  }

  // Sem acesso: sai da lista de membros (as regras RLS bloqueiam na hora) e não renova mais a sessão.
  await sb.updateUser(id, { app_metadata: { nome }, ban_duration: role ? 'none' : BAN_FOREVER });
  if (role) await sb.setRole(id, role);
  else await sb.removeRole(id);
  return { ok: true };
}

async function resetPassword(sb, body) {
  const id = String(body.id ?? '');
  if (!id) throw new HttpError(400, 'Conta não informada.');
  await sb.updateUser(id, { password: cleanPassword(body.senha), user_metadata: { trocar_senha: true } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

    const sb = supabase();
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const caller = token ? await sb.userFromToken(token) : null;
    if (!caller) throw new HttpError(401, 'Sessão inválida ou expirada. Entre novamente.');

    const role = await sb.roleOf(caller.id);
    if (!role) throw new HttpError(403, 'Esta conta não está autorizada.');
    const isAdmin = role === 'admin';

    if (req.method === 'GET') return json(200, { contas: await listAccounts(sb, isAdmin) });

    if (!isAdmin) throw new HttpError(403, 'Apenas o Alto Comando gerencia contas.');
    const body = await req.json().catch(() => ({}));
    switch (body.acao) {
      case 'criar': return json(201, await createAccount(sb, body));
      case 'editar': return json(200, await editAccount(sb, body, caller));
      case 'senha': return json(200, await resetPassword(sb, body));
      default: throw new HttpError(400, 'Ação desconhecida.');
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { erro: e.message });
    console.error(e);
    return json(500, { erro: 'Erro interno na gestão de contas.' });
  }
}

export const config = { path: '/api/contas' };
