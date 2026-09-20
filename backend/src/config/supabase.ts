import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { required, supabaseUrl } from './env.js';
let admin: SupabaseClient | undefined;
export function getSupabaseAdmin(): SupabaseClient {
  return admin ??= createClient(supabaseUrl(), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export function createAuthClient() {
  return createClient(supabaseUrl(), required('SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' } });
}
// Lazy initialization lets the application start without optional integrations configured.
export const supabaseAdmin = new Proxy({} as SupabaseClient, { get(_target, key) {
  const client = getSupabaseAdmin(); const value = Reflect.get(client, key);
  return typeof value === 'function' ? value.bind(client) : value;
} });
