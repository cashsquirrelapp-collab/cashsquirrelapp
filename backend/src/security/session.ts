import type { Session, User } from '@supabase/supabase-js';
import { readCookie, writeCookie } from './cookies.js';
import { createAuthClient, getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { z } from 'zod';
import { systemRole } from '../repositories/roles.js';
export type PrivateSession = Pick<Session, 'access_token' | 'refresh_token' | 'expires_at'> & { issued_at: number };
const identitySchema = z.object({ sub: z.uuid(), session_id: z.uuid() });
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
// Only call with a provider-verified token or a token read from an authenticated,
// encrypted server cookie. Decoding a caller-supplied JWT does not authenticate it.
export function sealedSessionIdentity(token: string) {
  try { return identitySchema.parse(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())); }
  catch { throw new HttpError(401, 'Session invalid'); }
}
export async function publicUser(user: User) { return { id: user.id, email: user.email, role: await systemRole(user.id), created_at: user.created_at, user_metadata: { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url } }; }
export function storeSession(res: VercelResponse, session: Session, issuedAt = Date.now()) {
  const identity = sealedSessionIdentity(session.access_token);
  if (session.user.id !== identity.sub) throw new HttpError(401, 'Session invalid');
  writeCookie(res, { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, issued_at: issuedAt }, 'session', Math.max(0, Math.floor((issuedAt + SESSION_LIFETIME - Date.now()) / 1000)));
}
export async function revokeSession(session: Pick<PrivateSession, 'access_token'>, expectedAccount?: string) {
  const identity = sealedSessionIdentity(session.access_token);
  if (expectedAccount && expectedAccount !== identity.sub) throw new HttpError(401, 'Account changed');
  const admin = getSupabaseAdmin();
  const result = await admin.from('cashflow_revoked_sessions').upsert({ session_id: identity.session_id, user_id: identity.sub });
  if (result.error) throw result.error;
  // The durable BFF revocation is authoritative even when GoTrue rejects an
  // expired JWT. Never depend on getUser(expiredToken) to perform logout.
  const signedOut = await admin.auth.admin.signOut(session.access_token, 'local');
  if (signedOut.error) console.error('Provider signout failed after session revocation', { type: signedOut.error.name });
}
export async function requireUser(req: VercelRequest, res: VercelResponse, checkAccount = true): Promise<User> {
  let session = readCookie<PrivateSession>(req);
  if (!session?.access_token || !session.refresh_token) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  const original = sealedSessionIdentity(session.access_token);
  const checked = await getSupabaseAdmin().rpc('cashflow_session_active', { p_user_id: original.sub, p_session_id: original.session_id });
  if (checked.error) throw checked.error;
  if (!checked.data) { writeCookie(res, null); throw new HttpError(401, 'Session revoked'); }
  if (!Number.isFinite(session.issued_at) || session.issued_at > Date.now() || session.issued_at + SESSION_LIFETIME <= Date.now()) {
    await revokeSession(session); writeCookie(res, null); throw new HttpError(401, 'Session expired');
  }
  const auth = createAuthClient();
  if ((session.expires_at || 0)*1000 < Date.now()+30000) {
    const refreshed = await auth.auth.refreshSession({ refresh_token: session.refresh_token });
    if (refreshed.error || !refreshed.data.session) { writeCookie(res, null); throw new HttpError(401, 'Session expired'); }
    const identity = sealedSessionIdentity(refreshed.data.session.access_token);
    if (identity.sub !== original.sub || identity.session_id !== original.session_id) throw new HttpError(401, 'Session invalid');
    const issuedAt = session.issued_at;
    session = { ...refreshed.data.session, issued_at: issuedAt }; storeSession(res, refreshed.data.session, issuedAt);
  }
  const { data, error } = await auth.auth.getUser(session.access_token);
  if (error || !data.user) { writeCookie(res, null); throw new HttpError(401, 'Session expired'); }
  if (data.user.id !== original.sub) throw new HttpError(401, 'Session invalid');
  if (checkAccount && req.headers['x-account-id'] && req.headers['x-account-id'] !== data.user.id) throw new HttpError(401, 'บัญชีผู้ใช้เปลี่ยนแล้ว กรุณาโหลดหน้าใหม่');
  // Recheck after provider I/O so a concurrent logout/reset cannot be missed.
  const active = await getSupabaseAdmin().rpc('cashflow_session_active', { p_user_id: data.user.id, p_session_id: original.session_id });
  if (active.error) throw active.error;
  if (!active.data) { writeCookie(res, null); throw new HttpError(401, 'Session revoked'); }
  return data.user;
}
