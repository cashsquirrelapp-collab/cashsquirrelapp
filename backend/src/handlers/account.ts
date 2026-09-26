import { randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { withGuard, HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { readCookie, writeCookie } from '../security/cookies.js';
import { challengeHash, rateLimit } from '../security/rateLimit.js';
import { publicUser, requireUser } from '../security/session.js';
import { sendGmailEmail } from '../services/gmail.js';
import { ensureAccountCanBeDeleted } from '../services/accountDeletion.js';

type DeleteChallenge = { userId: string; hash: string; expires: number };
const inputSchema = z.object({ action: z.enum(['pause', 'reactivate', 'request-delete', 'delete', 'backup-request', 'backup-confirm']), code: z.string().regex(/^\d{6}$/).optional(), email: z.email().max(254).optional() });

export default withGuard(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') {
    const user = await requireUser(req, res);
    const saved = await getSupabaseAdmin().from('cashflow_backup_emails').select('verified_email').eq('user_id', user.id).maybeSingle();
    if (saved.error) throw saved.error;
    res.json({ backupEmail: saved.data?.verified_email || null });
    return;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'คำขอไม่ถูกต้อง');
  const { action, code } = parsed.data;
  const user = await requireUser(req, res, true, true);
  const admin = getSupabaseAdmin();
  await rateLimit(`account-${action}`, user.id, action === 'delete' ? 8 : 5, 900);
  if (user.app_metadata?.account_paused === true && action !== 'reactivate') throw new HttpError(403, 'บัญชีนี้ปิดใช้งานอยู่');

  if (action === 'backup-request') {
    const email = parsed.data.email?.toLowerCase();
    if (!email || email === user.email?.toLowerCase()) throw new HttpError(400, 'กรุณาใช้อีเมลสำรองที่ต่างจากอีเมลหลัก');
    const otp = String(randomInt(100000, 1000000));
    const existing = await admin.from('cashflow_backup_emails').select('user_id').eq('user_id', user.id).maybeSingle();
    if (existing.error) throw existing.error;
    const pending = { pending_email: email, pending_hash: challengeHash(`${user.id}:${email}:${otp}`),
      pending_expires_at: new Date(Date.now() + 300_000).toISOString(), pending_attempts: 0 };
    const saved = existing.data
      ? await admin.from('cashflow_backup_emails').update(pending).eq('user_id', user.id)
      : await admin.from('cashflow_backup_emails').insert({ user_id: user.id, ...pending });
    if (saved.error) throw saved.error;
    const sent = await sendGmailEmail(email, 'ยืนยันอีเมลสำรอง | Krarok Tunngern',
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>ยืนยันอีเมลสำรอง</h2><p>รหัสยืนยันของคุณคือ <strong style="font-size:28px">${otp}</strong></p><p>ใช้ได้ 5 นาที หากไม่ได้ทำรายการนี้ให้ละเว้นอีเมล</p></div>`);
    if (!sent) throw new HttpError(503, 'ส่งรหัสไม่สำเร็จ กรุณาลองใหม่');
    res.json({ ok: true }); return;
  }
  if (action === 'backup-confirm') {
    if (!code) throw new HttpError(400, 'กรุณากรอกรหัส 6 หลัก');
    const row = await admin.from('cashflow_backup_emails').select('pending_email,pending_hash,pending_expires_at,pending_attempts').eq('user_id', user.id).maybeSingle();
    if (row.error) throw row.error;
    const pending = row.data;
    if (!pending?.pending_email || !pending.pending_hash || !pending.pending_expires_at || new Date(pending.pending_expires_at).getTime() <= Date.now() || pending.pending_attempts >= 5) throw new HttpError(400, 'รหัสหมดอายุหรือใช้ครบจำนวนครั้ง กรุณาขอรหัสใหม่');
    const expected = Buffer.from(pending.pending_hash, 'hex');
    const actual = Buffer.from(challengeHash(`${user.id}:${pending.pending_email}:${code}`), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      await admin.from('cashflow_backup_emails').update({ pending_attempts: pending.pending_attempts + 1 }).eq('user_id', user.id);
      throw new HttpError(400, 'รหัสยืนยันไม่ถูกต้อง');
    }
    const updated = await admin.from('cashflow_backup_emails').update({ verified_email: pending.pending_email, verified_at: new Date().toISOString(),
      pending_email: null, pending_hash: null, pending_expires_at: null, pending_attempts: 0 }).eq('user_id', user.id).eq('pending_hash', pending.pending_hash).select('verified_email').maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new HttpError(409, 'รหัสถูกเปลี่ยนแล้ว กรุณาลองใหม่');
    res.json({ backupEmail: updated.data.verified_email }); return;
  }

  if (action === 'pause') {
    if (user.app_metadata?.account_paused === true) throw new HttpError(409, 'บัญชีพักใช้งานอยู่แล้ว');
    await ensureAccountCanBeDeleted(user.id);
    const pausedAt = new Date();
    const deleteAfter = new Date(pausedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const saved = await admin.from('cashflow_account_pauses').insert({ user_id: user.id, paused_at: pausedAt.toISOString(), delete_after: deleteAfter.toISOString(), closure_kind: 'pause' });
    if (saved.error) throw saved.error;
    const updated = await admin.auth.admin.updateUserById(user.id, { app_metadata: {
      ...user.app_metadata, account_paused: true, account_closure_kind: 'pause', account_paused_at: pausedAt.toISOString(), account_delete_after: deleteAfter.toISOString(),
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
    if (user.app_metadata?.account_paused !== true || user.app_metadata?.account_closure_kind === 'deletion') throw new HttpError(409, 'บัญชีนี้ไม่สามารถเปิดผ่านขั้นตอนพักบัญชีได้');
    const removed = await admin.from('cashflow_account_pauses').delete().eq('user_id', user.id)
      .eq('state', 'paused').eq('closure_kind', 'pause').gt('delete_after', new Date().toISOString()).select('user_id');
    if (removed.error) throw removed.error;
    if (!removed.data?.length) {
      const pending = await admin.from('cashflow_account_pauses').select('state,delete_after').eq('user_id', user.id).maybeSingle();
      if (pending.error) throw pending.error;
      if (pending.data) throw new HttpError(409, 'พ้นระยะเปิดใช้บัญชี 30 วันแล้ว ระบบกำลังดำเนินการลบถาวร');
      throw new HttpError(409, 'ไม่พบคำขอพักบัญชี กรุณาติดต่อผู้ดูแล');
    }
    const updated = await admin.auth.admin.updateUserById(user.id, { app_metadata: {
      ...user.app_metadata, account_paused: false, account_closure_kind: null, account_paused_at: null, account_delete_after: null,
    } });
    if (updated.error || !updated.data.user) {
      const pausedAt = typeof user.app_metadata?.account_paused_at === 'string' ? user.app_metadata.account_paused_at : new Date().toISOString();
      const deleteAfter = typeof user.app_metadata?.account_delete_after === 'string' ? user.app_metadata.account_delete_after : new Date(Date.now() + 30 * 86_400_000).toISOString();
      await admin.from('cashflow_account_pauses').insert({ user_id: user.id, paused_at: pausedAt, delete_after: deleteAfter, closure_kind: 'pause' });
      throw new HttpError(503, 'เปิดใช้บัญชีไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
    res.json({ session: { user: await publicUser(updated.data.user) } });
    return;
  }

  await ensureAccountCanBeDeleted(user.id);
  if (action === 'request-delete') {
    const backup = await admin.from('cashflow_backup_emails').select('verified_email').eq('user_id', user.id).maybeSingle();
    if (backup.error) throw backup.error;
    if (!backup.data?.verified_email) throw new HttpError(409, 'กรุณาเพิ่มและยืนยันอีเมลสำรองในหน้าตั้งค่าก่อนลบบัญชี');
    if (!user.email || !user.email_confirmed_at) throw new HttpError(400, 'กรุณายืนยันอีเมลของบัญชีก่อนลบบัญชี');
    const otp = String(randomInt(100000, 1000000));
    const sent = await sendGmailEmail(user.email, 'รหัสยืนยันลบบัญชีถาวร | Krarok Tunngern',
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#34251d"><h2>ยืนยันการปิดบัญชี</h2><p>รหัสสำหรับปิดบัญชี Krarok Tunngern ของคุณคือ</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p><p>บัญชีจะถูกปิดทันที ข้อมูลจะถูกลบหลัง 30 วัน ระหว่างนี้กู้คืนผ่านอีเมลสำรองได้ รหัสใช้ได้ 5 นาที</p></div>`);
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
  const backup = await admin.from('cashflow_backup_emails').select('verified_email').eq('user_id', user.id).maybeSingle();
  if (backup.error) throw backup.error;
  if (!backup.data?.verified_email) throw new HttpError(409, 'กรุณายืนยันอีเมลสำรองก่อนลบบัญชี');
  const closedAt = new Date();
  const deleteAfter = new Date(closedAt.getTime() + 30 * 86_400_000);
  const saved = await admin.from('cashflow_account_pauses').insert({ user_id: user.id, paused_at: closedAt.toISOString(), delete_after: deleteAfter.toISOString(), closure_kind: 'deletion' });
  if (saved.error) throw saved.error;
  const updated = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, account_paused: true,
    account_closure_kind: 'deletion', account_paused_at: closedAt.toISOString(), account_delete_after: deleteAfter.toISOString() } });
  if (updated.error) {
    await admin.from('cashflow_account_pauses').delete().eq('user_id', user.id).eq('closure_kind', 'deletion');
    throw updated.error;
  }
  const revoked = await admin.rpc('cashflow_revoke_user_sessions', { p_user_id: user.id });
  if (revoked.error) throw revoked.error;
  writeCookie(res, null);
  res.json({ session: null });
}, { csrf: true });
