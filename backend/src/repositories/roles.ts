import { getSupabaseAdmin } from '../config/supabase.js';
import type { SystemRole } from '../../../shared/groups.js';

// Never trust user-editable auth metadata or a role submitted by the browser.
export async function systemRole(userId: string): Promise<SystemRole> {
  const result = await getSupabaseAdmin()
    .from('cashflow_user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.role === 'admin' ? 'admin' : 'user';
}
