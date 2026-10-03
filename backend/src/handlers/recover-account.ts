import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { withGuard, HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { challengeHash, rateLimit } from '../security/rateLimit.js';
import { sendGmailEmail } from '../services/gmail.js';

const input = z.object({
  action: z.enum(['request', 'verify']),
  email: z.email().max(254),
  token: z.string().min(24).max(100),
  code: z.string().regex(/^\d{6}$/).optional(),
});
const generic = { ok: true, message: 'หากลิงก์และอีเมลสำรองนี้ใช้กู้คืนได้ ระบบจะส่งรหัสให้' };

async function findActiveRecovery(admin: ReturnType<typeof getSupabaseAdmin>, token: string) {
  const tokenHash = challengeHash(`account-recovery-link:${token}`);
  const link = await admin.from('cashflow_account_recovery_links')
    .select('created_at,expires_at').eq('token_hash', tokenHash)
    .is('consumed_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (link.error) throw link.error;
  if (!link.data) return null;
  // Enforce the one-hour maximum even for links issued before the TTL change.
  if (Date.now() - Date.parse(link.data.created_at) >= 60 * 60 * 1000) return null;
  return { tokenHash, createdAt: link.data.created_at };
}

async function releaseRecoveryLink(admin: ReturnType<typeof getSupabaseAdmin>, tokenHash: string) {
  await admin.from('cashflow_account_recovery_links').update({
    consumed_at: null, recovered_user_id: null, recovered_email: null,
  }).eq('token_hash', tokenHash);
}

export default withGuard(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const parsed = input.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'ลิงก์กู้คืนหมดอายุหรือไม่ถูกต้อง');
  const { action, code, token } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const admin = getSupabaseAdmin();
  const tokenHash = challengeHash(`account-recovery-link:${token}`);
  await rateLimit(`recover-link-${action}`, `${tokenHash}:${email}`, action === 'request' ? 4 : 8, 900);
  const recovery = await findActiveRecovery(admin, token);
  if (!recovery) {
    if (action === 'request') { res.json(generic); return; }
    throw new HttpError(400, 'ลิงก์กู้คืน รหัส หรืออีเมลสำรองไม่ถูกต้องหรือหมดอายุ');
  }
  const backup = await admin.from('cashflow_backup_emails').select('user_id,verified_email,verified_at')
    .eq('verified_email', email).maybeSingle();
  if (backup.error) throw backup.error;
  if (!backup.data?.verified_email || !backup.data.verified_at || backup.data.verified_email.toLowerCase() !== email) {
    if (action === 'request') {
      throw new HttpError(400,
        'ไม่พบอีเมลนี้ในรายการอีเมลสำรองที่ยืนยันแล้ว โปรดตรวจสอบอีเมลที่กรอกและลองอีกครั้ง',
        'backup_email_not_verified');
    }
    throw new HttpError(400, 'ลิงก์กู้คืน รหัส หรืออีเมลสำรองไม่ถูกต้องหรือหมดอายุ');
  }
  const pendingClosure = await admin.from('cashflow_account_pauses').select('user_id,paused_at,delete_after')
    .eq('user_id', backup.data.user_id).eq('closure_kind', 'deletion').eq('state', 'paused')
    .gt('delete_after', new Date().toISOString()).maybeSingle();
  if (pendingClosure.error) throw pendingClosure.error;
  if (!pendingClosure.data) {
    if (action === 'request') { res.json(generic); return; }
    throw new HttpError(400, 'ลิงก์กู้คืน รหัส หรืออีเมลสำรองไม่ถูกต้องหรือหมดอายุ');
  }
  const userId = pendingClosure.data.user_id;

  if (action === 'request') {
    const otp = String(randomInt(100000, 1000000));
    const saved = await admin.from('cashflow_challenges').upsert({
      user_id: userId, purpose: 'account-recover',
      code_hash: challengeHash(`${userId}:${email}:${otp}`),
      expires_at: new Date(Date.now() + 300_000).toISOString(), attempts: 0,
    });
    if (saved.error) throw saved.error;
    const sent = await sendGmailEmail(email, 'กู้คืนบัญชี Krarok Tunngern',
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>กู้คืนบัญชี</h2><p>รหัสกู้คืนบัญชีที่กำลังรอลบคือ <strong style="font-size:28px">${otp}</strong></p><p>รหัสใช้ได้ 5 นาที หากไม่ได้ทำรายการนี้ให้ละเว้นอีเมล</p></div>`);
    if (!sent) {
      await admin.from('cashflow_challenges').delete().eq('user_id', userId).eq('purpose', 'account-recover');
      throw new HttpError(503, 'ส่งรหัสไม่สำเร็จ กรุณาลองใหม่');
    }
    res.json(generic);
    return;
  }

  if (!code) throw new HttpError(400, 'กรุณากรอกรหัส 6 หลัก');
  const consumed = await admin.rpc('cashflow_consume_challenge', {
    p_user_id: userId,
    p_purpose: 'account-recover',
    p_hash: challengeHash(`${userId}:${email}:${code}`),
  });
  if (consumed.error) throw consumed.error;
  if (!consumed.data) throw new HttpError(400, 'ลิงก์กู้คืน รหัส หรืออีเมลสำรองไม่ถูกต้องหรือหมดอายุ');

  const now = new Date().toISOString();
  if (Date.now() - Date.parse(recovery.createdAt) >= 60 * 60 * 1000) {
    throw new HttpError(400, 'ลิงก์กู้คืนหมดอายุแล้ว กรุณาติดต่อผู้ดูแลเพื่อขอลิงก์ใหม่');
  }
  const usedLink = await admin.from('cashflow_account_recovery_links').update({
    consumed_at: now, recovered_user_id: userId, recovered_email: email,
  })
    .eq('token_hash', recovery.tokenHash)
    .is('consumed_at', null).is('revoked_at', null).gt('expires_at', now)
    .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .select('id').maybeSingle();
  if (usedLink.error) throw usedLink.error;
  if (!usedLink.data) throw new HttpError(409, 'ลิงก์กู้คืนถูกใช้แล้วหรือหมดอายุ กรุณาติดต่อผู้ดูแลเพื่อขอลิงก์ใหม่');

  const removed = await admin.from('cashflow_account_pauses').delete().eq('user_id', userId)
    .eq('closure_kind', 'deletion').eq('state', 'paused').gt('delete_after', now)
    .select('user_id').maybeSingle();
  if (removed.error) {
    await releaseRecoveryLink(admin, recovery.tokenHash);
    throw removed.error;
  }
  if (!removed.data) {
    await releaseRecoveryLink(admin, recovery.tokenHash);
    throw new HttpError(409, 'พ้นกำหนดกู้คืนแล้ว ระบบกำลังลบบัญชี');
  }

  const account = await admin.auth.admin.getUserById(userId);
  if (account.error || !account.data.user) {
    await admin.from('cashflow_account_pauses').insert({
      user_id: userId, paused_at: pendingClosure.data.paused_at,
      delete_after: pendingClosure.data.delete_after, closure_kind: 'deletion',
    });
    await releaseRecoveryLink(admin, recovery.tokenHash);
    throw new HttpError(503, 'กู้คืนบัญชีไม่สำเร็จ กรุณาลองใหม่');
  }
  const updated = await admin.auth.admin.updateUserById(userId, { app_metadata: {
    ...account.data.user.app_metadata,
    account_paused: false, account_closure_kind: null, account_paused_at: null, account_delete_after: null,
  } });
  if (updated.error) {
    await admin.from('cashflow_account_pauses').insert({
      user_id: userId, paused_at: pendingClosure.data.paused_at,
      delete_after: pendingClosure.data.delete_after, closure_kind: 'deletion',
    });
    await releaseRecoveryLink(admin, recovery.tokenHash);
    throw new HttpError(503, 'กู้คืนบัญชีไม่สำเร็จ กรุณาลองใหม่');
  }
  res.json({ ok: true });
}, { csrf: true });
