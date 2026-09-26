import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import { REPORTS_BUCKET } from './reportStorage.js';

export async function ensureAccountCanBeDeleted(userId: string) {
  const admin = getSupabaseAdmin();
  const [memberships, ownRole] = await Promise.all([
    admin.from('cashflow_group_members').select('group_id').eq('user_id', userId).eq('role', 'leader'),
    admin.from('cashflow_user_roles').select('role').eq('user_id', userId).maybeSingle(),
  ]);
  if (memberships.error) throw memberships.error;
  if (ownRole.error) throw ownRole.error;
  for (const membership of memberships.data || []) {
    const leaders = await admin.from('cashflow_group_members').select('user_id').eq('group_id', membership.group_id).eq('role', 'leader');
    if (leaders.error) throw leaders.error;
    const others = (leaders.data || []).map(leader => leader.user_id).filter(id => id !== userId);
    if (!others.length) throw new HttpError(409, 'คุณเป็นหัวหน้าคนสุดท้ายของกลุ่ม กรุณาตั้งหัวหน้าคนอื่นหรือลบกลุ่มก่อนดำเนินการ');
    const paused = await admin.from('cashflow_account_pauses').select('user_id').in('user_id', others);
    if (paused.error) throw paused.error;
    const pausedIds = new Set((paused.data || []).map(row => row.user_id));
    if (others.every(id => pausedIds.has(id))) throw new HttpError(409, 'หัวหน้ากลุ่มคนอื่นพักบัญชีอยู่ กรุณาให้มีหัวหน้าที่ใช้งานได้ก่อนดำเนินการ');
  }
  if (ownRole.data?.role === 'admin') {
    const admins = await admin.from('cashflow_user_roles').select('user_id').eq('role', 'admin');
    if (admins.error) throw admins.error;
    const others = (admins.data || []).map(row => row.user_id).filter(id => id !== userId);
    if (!others.length) throw new HttpError(409, 'คุณเป็น admin คนสุดท้าย กรุณาตั้ง admin คนอื่นก่อนดำเนินการ');
    const paused = await admin.from('cashflow_account_pauses').select('user_id').in('user_id', others);
    if (paused.error) throw paused.error;
    const pausedIds = new Set((paused.data || []).map(row => row.user_id));
    if (others.every(id => pausedIds.has(id))) throw new HttpError(409, 'admin คนอื่นพักบัญชีอยู่ กรุณาให้มี admin ที่ใช้งานได้ก่อนดำเนินการ');
  }
}

async function removeStoredReports(userId: string) {
  const storage = getSupabaseAdmin().storage.from(REPORTS_BUCKET);
  // Auth user deletion can be rejected while the user owns Storage objects.
  while (true) {
    const listed = await storage.list(userId, { limit: 100 });
    if (listed.error) {
      if (String(listed.error.statusCode) === '404') return;
      throw listed.error;
    }
    const paths = (listed.data || []).filter(item => item.name && !item.name.startsWith('.')).map(item => `${userId}/${item.name}`);
    if (!paths.length) return;
    const removed = await storage.remove(paths);
    if (removed.error) throw removed.error;
    if (paths.length < 100) return;
  }
}

export async function deleteAccountPermanently(userId: string) {
  const admin = getSupabaseAdmin();
  await ensureAccountCanBeDeleted(userId);
  await removeStoredReports(userId);
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) {
    if (/last_leader/i.test(deleted.error.message)) throw new HttpError(409, 'กรุณาตั้งหัวหน้ากลุ่มคนอื่นหรือลบกลุ่มก่อนลบบัญชี');
    throw new HttpError(503, 'ลบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  // Delivery deduplication keys contain the old account ID and have no FK to
  // auth.users. Remove them after successful deletion as well.
  const cleared = await admin.from('cashflow_delivery_claims').delete().like('key', `%:${userId}:%`);
  if (cleared.error) console.error('Account delivery-key cleanup failed', { type: cleared.error.name });
}
