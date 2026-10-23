import type { Session, User } from '@supabase/supabase-js';
import { createAuthClient, getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import { checkLinkedAccountWriteAccess } from './linkedAccountAccess.js';

export async function linkedLineAccount(lineUserId: string): Promise<string | null> {
  const result = await getSupabaseAdmin().from('cashflow_line_links').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.user_id || null;
}

export function assertLineLoginAccount(user: User | null, expectedId: string): asserts user is User {
  if (!user || user.id !== expectedId || !user.email || !user.email_confirmed_at) throw new HttpError(403, 'กรุณายืนยันอีเมลของบัญชีในเว็บไซต์ก่อน');
  const bannedUntil = (user as User & { banned_until?: string }).banned_until;
  if ((bannedUntil && Date.parse(bannedUntil) > Date.now()) || user.app_metadata?.account_paused === true || user.app_metadata?.account_closure_kind === 'deletion') {
    throw new HttpError(403, 'บัญชีนี้ยังไม่พร้อมใช้งาน กรุณาตรวจสอบสถานะในเว็บไซต์');
  }
  if (user.factors?.some(factor => factor.status === 'verified')) throw new HttpError(403, 'บัญชีนี้ต้องยืนยันตัวตนเพิ่มเติม กรุณาเข้าสู่ระบบผ่านเว็บไซต์', 'additional_verification_required');
}

/** Exchange a server-verified, already-linked LINE identity. Tokens never leave the BFF. */
export async function issueLinkedLineSession(userId: string): Promise<Session> {
  const admin = getSupabaseAdmin();
  const account = await admin.auth.admin.getUserById(userId);
  if (account.error) throw new HttpError(503, 'ตรวจสอบบัญชีไม่ได้ กรุณาลองอีกครั้ง');
  assertLineLoginAccount(account.data.user, userId);
  // generateLink does not send an email. Consume its one-time hash on the server immediately.
  const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: account.data.user.email! });
  if (generated.error || generated.data.user?.id !== userId || !generated.data.properties?.hashed_token) throw new HttpError(503, 'เปิดบัญชีไม่ได้ กรุณาลองอีกครั้ง');
  const auth = createAuthClient();
  const verified = await auth.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'magiclink' });
  const session = verified.data.session;
  if (verified.error || !session) throw new HttpError(503, 'เปิดบัญชีไม่ได้ กรุณาลองอีกครั้ง');
  try { assertLineLoginAccount(session.user, userId); }
  catch (error) { await admin.auth.admin.signOut(session.access_token, 'local'); throw error; }
  return session;
}

export async function assertLinkedLineAccess(userId: string) {
  const access = await checkLinkedAccountWriteAccess(userId);
  if (!access.allowed) throw new HttpError(access.status, access.error);
}
