import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { withGuard, HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { challengeHash, rateLimit } from '../security/rateLimit.js';
import { sendGmailEmail } from '../services/gmail.js';

const input = z.object({ action: z.enum(['request', 'verify']), email: z.email().max(254), code: z.string().regex(/^\d{6}$/).optional() });

export default withGuard(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const parsed = input.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'กรุณากรอกอีเมลสำรองและรหัสให้ถูกต้อง');
  const { action, code } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  await rateLimit(`recover-${action}`, email, action === 'request' ? 4 : 8, 900);
  const admin = getSupabaseAdmin();
  const backup = await admin.from('cashflow_backup_emails').select('user_id').eq('verified_email', email).maybeSingle();
  if (backup.error) throw backup.error;
  const userId = backup.data?.user_id;
  const generic = { ok: true, message: 'หากอีเมลนี้ผูกกับบัญชีที่กู้คืนได้ ระบบจะส่งรหัสให้' };
  if (action === 'request') {
    if (!userId) { res.json(generic); return; }
    const closure = await admin.from('cashflow_account_pauses').select('delete_after').eq('user_id', userId)
      .eq('closure_kind', 'deletion').eq('state', 'paused').gt('delete_after', new Date().toISOString()).maybeSingle();
    if (closure.error) throw closure.error;
    if (!closure.data) { res.json(generic); return; }
    const otp = String(randomInt(100000, 1000000));
    const saved = await admin.from('cashflow_challenges').upsert({ user_id: userId, purpose: 'account-recover',
      code_hash: challengeHash(`${userId}:${email}:${otp}`), expires_at: new Date(Date.now() + 300_000).toISOString(), attempts: 0 });
    if (saved.error) throw saved.error;
    const sent = await sendGmailEmail(email, 'กู้คืนบัญชี Krarok Tunngern',
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>กู้คืนบัญชี</h2><p>รหัสกู้คืนคือ <strong style="font-size:28px">${otp}</strong></p><p>รหัสใช้ได้ 5 นาที หากไม่ได้ทำรายการนี้ให้ละเว้นอีเมล</p></div>`);
    if (!sent) {
      await admin.from('cashflow_challenges').delete().eq('user_id', userId).eq('purpose', 'account-recover');
      throw new HttpError(503, 'ส่งรหัสไม่สำเร็จ กรุณาลองใหม่');
    }
    res.json(generic); return;
  }
  if (!code) throw new HttpError(400, 'กรุณากรอกรหัส 6 หลัก');
  if (!userId) throw new HttpError(400, 'รหัสไม่ถูกต้องหรือหมดอายุ');
  const consumed = await admin.rpc('cashflow_consume_challenge', { p_user_id: userId, p_purpose: 'account-recover', p_hash: challengeHash(`${userId}:${email}:${code}`) });
  if (consumed.error) throw consumed.error;
  if (!consumed.data) throw new HttpError(400, 'รหัสไม่ถูกต้องหรือหมดอายุ');
  const removed = await admin.from('cashflow_account_pauses').delete().eq('user_id', userId).eq('closure_kind', 'deletion')
    .eq('state', 'paused').gt('delete_after', new Date().toISOString()).select('user_id').maybeSingle();
  if (removed.error) throw removed.error;
  if (!removed.data) throw new HttpError(409, 'พ้นระยะกู้คืนหรือระบบกำลังลบบัญชีแล้ว');
  const account = await admin.auth.admin.getUserById(userId);
  if (account.error || !account.data.user) throw new HttpError(503, 'กู้คืนบัญชีไม่สำเร็จ กรุณาติดต่อผู้ดูแล');
  const updated = await admin.auth.admin.updateUserById(userId, { app_metadata: { ...account.data.user.app_metadata,
    account_paused: false, account_closure_kind: null, account_paused_at: null, account_delete_after: null } });
  if (updated.error) {
    // Keep the account closed and eligible for another recovery attempt.
    await admin.from('cashflow_account_pauses').insert({ user_id: userId, paused_at: account.data.user.app_metadata?.account_paused_at,
      delete_after: account.data.user.app_metadata?.account_delete_after, closure_kind: 'deletion' });
    throw new HttpError(503, 'กู้คืนบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  res.json({ ok: true });
}, { csrf: true });
