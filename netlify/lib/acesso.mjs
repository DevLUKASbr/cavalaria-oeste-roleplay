/*
 * Código comum das Netlify Functions: acesso ao Supabase com a chave secreta, cargos,
 * permissões e identificação de quem está chamando.
 *
 * A chave secreta fica SOMENTE nas variáveis de ambiente do Netlify (SUPABASE_URL e
 * SUPABASE_SECRET_KEY) e nunca chega ao navegador.
 */

// ---------------------------------------------------------------------------
// Cargos e permissões. É AQUI que a regra vale de verdade; site/comum.js só espelha
// este mapa para montar o menu (manter os dois iguais).
// ---------------------------------------------------------------------------

export const PAGES = ['registro', 'treinamentos', 'recrutamento', 'investigacoes', 'acoes', 'contas'];
const FULL_ACCESS = [...PAGES, 'treinamentos.editar'];

export const PERMISSOES = {
  'Xerife': FULL_ACCESS,
  'Sub-Xerife': FULL_ACCESS,
  'Adm': FULL_ACCESS,
  'Membro': ['treinamentos'], // provisório: o acesso do Membro ainda será definido
  'Acesso limitado': ['registro'], // contas antigas com nível 'xerife' e sem cargo
};

// Cargo → nível em public.cavalaria_membros, a tabela que as regras RLS do registro consultam.
// 'admin' = registro completo (inclui reverter exoneração); null = não acessa o registro.
export const NIVEL_DO_CARGO = { 'Xerife': 'admin', 'Sub-Xerife': 'admin', 'Adm': 'admin', 'Membro': null };

// Cargo vem de app_metadata (só a chave secreta altera). Contas antigas sem cargo usam o nível do banco.
export function cargoOf(user, role) {
  if (user?.app_metadata?.cargo) return user.app_metadata.cargo;
  if (role === 'admin') return 'Adm';
  if (role) return 'Acesso limitado';
  return null;
}

export const can = (cargo, permission) => (PERMISSOES[cargo] || []).includes(permission);

// ---------------------------------------------------------------------------
// Respostas e erros
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// Executa o handler e transforma HttpError em resposta JSON { erro }.
export async function respond(work) {
  try {
    return await work();
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { erro: e.message });
    console.error(e);
    return json(500, { erro: 'Erro interno no servidor.' });
  }
}

function env(name) {
  return globalThis.Netlify?.env?.get(name) ?? globalThis.process?.env?.[name];
}

// ---------------------------------------------------------------------------
// Supabase com a chave secreta
// ---------------------------------------------------------------------------

export function supabase() {
  const url = env('SUPABASE_URL')?.replace(/\/+$/, '');
  const key = env('SUPABASE_SECRET_KEY');
  if (!url || !key) {
    throw new HttpError(503, 'Servidor não configurado: defina SUPABASE_URL e SUPABASE_SECRET_KEY no Netlify.');
  }

  // Chaves novas (sb_secret_…) vão só no header apikey; as antigas (JWT service_role) também no Authorization.
  const serviceHeaders = { apikey: key };
  if (!key.startsWith('sb_')) serviceHeaders.authorization = `Bearer ${key}`;

  // body: objeto → JSON; string → enviado como está. raw: devolve a Response sem lançar erro.
  async function call(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const response = await fetch(url + path, {
      method,
      headers: { ...serviceHeaders, 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    if (raw) return response;
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const reason = data?.msg || data?.message || data?.error_description || data?.error || response.statusText;
      throw new HttpError(response.status >= 500 ? 502 : 400, `Supabase: ${reason}`);
    }
    return data;
  }

  return {
    call,

    // Valida o token do usuário logado e devolve o usuário (ou null se inválido/expirado/bloqueado).
    async userFromToken(token) {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, authorization: `Bearer ${token}` },
      });
      return response.ok ? response.json() : null;
    },

    async roleOf(userId) {
      const rows = await call(`/rest/v1/cavalaria_membros?select=role&user_id=eq.${encodeURIComponent(userId)}`);
      return rows?.[0]?.role || null;
    },
  };
}

// Identifica quem chama a Function. Exige sessão válida e um cargo com alguma permissão.
export async function authenticate(req, sb) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await sb.userFromToken(token) : null;
  if (!user) throw new HttpError(401, 'Sessão inválida ou expirada. Entre novamente.');

  const role = await sb.roleOf(user.id);
  const cargo = cargoOf(user, role);
  if (!cargo || !PERMISSOES[cargo]) throw new HttpError(403, 'Esta conta não está autorizada.');
  return {
    user,
    role,
    cargo,
    nome: user.app_metadata?.nome || user.email,
    can: permission => can(cargo, permission),
  };
}
