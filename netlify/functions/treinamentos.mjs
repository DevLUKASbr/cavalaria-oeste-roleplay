import handler from '../../supabase/functions/_shared/handlers/treinamentos.mjs';
export default request => handler(request);
export const config = { path: '/api/treinamentos' };
