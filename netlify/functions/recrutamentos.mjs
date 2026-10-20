import handler from '../../supabase/functions/_shared/handlers/recrutamentos.mjs';
export default request => handler(request);
export const config = { path: '/api/recrutamentos' };
