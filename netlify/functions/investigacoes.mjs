import handler from '../../supabase/functions/_shared/handlers/investigacoes.mjs';
export default request => handler(request);
export const config = { path: '/api/investigacoes' };
