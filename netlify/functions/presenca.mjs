import handler from '../../supabase/functions/_shared/handlers/presenca.mjs';
export default request => handler(request);
export const config = { path: '/api/presenca' };
