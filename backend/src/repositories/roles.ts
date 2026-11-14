import { getSupabaseAdmin } from '../config/supabase.js';
import type { SystemRole } from '../../../shared/groups.js';
import { isOwnerAccount } from '../security/adminAnalyticsAccess.js';
import { stagingOwnerAccount } from './stagingOwner.js';

// Never trust user-editable auth metadata or a role submitted by the browser.
export async function systemRole(userId: string): Promise<SystemRole> {
  if (await stagingOwnerAccount(userId)) return 'admin';
  const result = await getSupabaseAdmin()
    .from('cashflow_user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.role === 'admin' ? 'admin' : 'user';
}

/**
 * The owner's own account (ผู้ดูแล): the admin role and the owner's verified email. Only it gets what admins used to get
 * beyond the admin page: unreleased features, the admin token allowance, LINE's admin menu and the owner's reports
 * (owner, 2026-11-04: "แอดมินคนอื่นไม่มีสิทธิ์ได้ฟังก์ชันโปรนะเว้ย แค่สามารถใช้ดูหลังบ้านได้แค่นั้นเอง"). Fails closed.
 */
export async function isOwnerUserId(userId: string): Promise<boolean> {
  try {
    if (await systemRole(userId) !== 'admin') return false;
    const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
    return !error && !!data.user && isOwnerAccount(data.user);
  } catch { return false; }
}
