import { randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { withGuard, HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { readCookie, writeCookie } from '../security/cookies.js';
import { challengeHash, rateLimit } from '../security/rateLimit.js';
import { publicUser, requireUser } from '../security/session.js';
import { sendGmailEmail } from '../services/gmail.js';
import { deleteAccountPermanently, ensureAccountCanBeDeleted } from '../services/accountDeletion.js';

type DeleteChallenge = { userId: string; hash: string; expires: number };
const inputSchema = z.object({ action: z.enum(['pause', 'reactivate', 'request-delete', 'delete']), code: z.string().regex(/^\d{6}$/).optional() });

export default withGuard(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'คำขอไม่ถูกต้อง');
  const { action, code } = parsed.data;
  const user = await requireUser(req, res, true, true);
  const admin = getSupabaseAdmin();
  await rateLimit(`account-${action}`, user.id, action === 'delete' ? 8 : 5, 900);

  if (action === 'pause') {
    if (user.app_metadata?.account_paused === true) throw new HttpError(409, 'บัญชีพักใช้งานอยู่แล้ว');
    await ensureAccountCanBeDeleted(user.id);
    const pausedAt = new Date();
    const deleteAfter = new Date(pausedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const saved = await admin.from('cashflow_account_pauses').insert({ user_id: user.id, paused_at: pausedAt.toISOString(), delete_after: deleteAfter.toISOString() });
    if (saved.error) throw saved.error;
    const updated = await admin.auth.admin.updateUserById(user.id, { app_metadata: {
      ...user.app_metadata, account_paused: true, account_paused_at: pausedAt.toISOString(), account_delete_after: deleteAfter.toISOString(),
    } });
    if (updated.error) {
      await admin.from('cashflow_account_pauses').delete().eq('user_id', user.id).eq('state', 'paused');
      throw updated.error;
    }
    const revoked = await admin.rpc('cashflow_revoke_user_sessions', { p_user_id: user.id });
    if (revoked.error) throw revoked.error;
    writeCookie(res, null);
    res.json({ session: null });
    return;
  }

  if (action === 'reactivate') {
    if (user.app_metadata?.account_paused !== true) throw new HttpError(409, 'บัญชีนี้เปิดใช้งานอยู่แล้ว');
    const removed = await admin.from('cashflow_account_pauses').delete().eq('user_id', user.id)
      .eq('state', 'paused').gt('delete_after', new Date().toISOString()).select('user_id');
    if (removed.error) throw removed.error;
    if (!removed.data?.length) {
      const pending = await admin.from('cashflow_account_pauses').select('state,delete_after').eq('user_id', user.id).maybeSingle();
      if (pending.error) throw pending.error;
      if (pending.data) throw new HttpError(409, 'พ้นระยะเปิดใช้บัญชี 30 วันแล้ว ระบบกำลังดำเนินการลบถาวร');
    }
    const updated = await admin.auth.admin.updateUserById(user.id, { app_metadata: {
      ...user.app_metadata, account_paused: false, account_paused_at: null, account_delete_after: null,
    } });
    if (updated.error || !updated.data.user) throw new HttpError(503, 'เปิดใช้บัญชีไม่สำเร็จ กรุณาลองอีกครั้ง');
    res.json({ session: { user: await publicUser(updated.data.user) } });
    return;
  }

  await ensureAccountCanBeDeleted(user.id);
  if (action === 'request-delete') {
    if (!user.email || !user.email_confirmed_at) throw new HttpError(400, 'กรุณายืนยันอีเมลของบัญชีก่อนลบบัญชี');
    const otp = String(randomInt(100000, 1000000));
    const sent = await sendGmailEmail(user.email, 'รหัสยืนยันลบบัญชีถาวร | Krarok Tunngern',
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#34251d"><h2>ยืนยันการลบบัญชีถาวร</h2><p>รหัสสำหรับลบบัญชี Krarok Tunngern ของคุณคือ</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p><p>รหัสนี้ใช้ได้ 5 นาที หากคุณไม่ได้ขอลบบัญชี กรุณาอย่าเปิดเผยรหัสนี้</p></div>`);
    if (!sent) throw new HttpError(503, 'ส่งรหัสยืนยันไม่สำเร็จ กรุณาลองอีกครั้ง');
    writeCookie(res, { userId: user.id, hash: challengeHash(`${user.id}:${otp}`), expires: Date.now() + 300_000 } satisfies DeleteChallenge, 'account-delete', 300);
    res.json({ ok: true });
    return;
  }

  if (!code) throw new HttpError(400, 'กรุณากรอกรหัสยืนยัน 6 หลัก');
  const challenge = readCookie<DeleteChallenge>(req, 'account-delete');
  if (!challenge || challenge.userId !== user.id || challenge.expires < Date.now()) throw new HttpError(400, 'รหัสยืนยันหมดอายุ กรุณาขอรหัสใหม่');
  const expected = Buffer.from(challenge.hash, 'hex');
  const actual = Buffer.from(challengeHash(`${user.id}:${code}`), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new HttpError(400, 'รหัสยืนยันไม่ถูกต้อง');
  writeCookie(res, null, 'account-delete');
  await deleteAccountPermanently(user.id);
  writeCookie(res, null);
  res.json({ session: null });
}, { csrf: true });
