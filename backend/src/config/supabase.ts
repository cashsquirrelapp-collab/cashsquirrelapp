import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { required, supabaseUrl } from './env.js';
import { supabaseFetch } from './supabaseFetch.js';
let admin: SupabaseClient | undefined;
export function getSupabaseAdmin(): SupabaseClient {
  return admin ??= createClient(supabaseUrl(), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: supabaseFetch } });
}
export function createAuthClient() {
  return createClient(supabaseUrl(), required('SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' }, global: { fetch: supabaseFetch } });
}
// Lazy initialization lets the application start without optional integrations configured.
export const supabaseAdmin = new Proxy({} as SupabaseClient, { get(_target, key) {
  const client = getSupabaseAdmin(); const value = Reflect.get(client, key);
  return typeof value === 'function' ? value.bind(client) : value;
} });
