import { isAuthRetryableFetchError, type Session, type User } from '@supabase/supabase-js';
import { readCookie, writeCookie } from './cookies.js';
import { createAuthClient, getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { z } from 'zod';
import { systemRole } from '../repositories/roles.js';
import { canViewAdminAnalytics } from './adminAnalyticsAccess.js';
export type PrivateSession = Pick<Session, 'access_token' | 'refresh_token' | 'expires_at'> & { issued_at: number };
const identitySchema = z.object({ sub: z.uuid(), session_id: z.uuid() });
// A sign-in lasts while it is used (owner, 2026-10-22: no new sign-in after every update). Each token
// refresh, about hourly while the app is in use, starts the window again; 30 days without use signs
// out. Before, it ended 8 hours after signing in however actively the app was used.
export const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;
/** Whether a stored session is still within its window (deviceAccounts keeps several). */
export function sessionAlive(session: Pick<PrivateSession, 'issued_at'> | null | undefined): boolean {
  return Boolean(session) && Number.isFinite(session!.issued_at) && session!.issued_at <= Date.now() && session!.issued_at + SESSION_LIFETIME > Date.now();
}
/** Seconds a stored session's cookie may live. */
export function sessionMaxAge(session: Pick<PrivateSession, 'issued_at'>): number {
  return Math.max(0, Math.floor((session.issued_at + SESSION_LIFETIME - Date.now()) / 1000));
}
// Only call with a provider-verified token or a token read from an authenticated,
// encrypted server cookie. Decoding a caller-supplied JWT does not authenticate it.
export function sealedSessionIdentity(token: string) {
  try { return identitySchema.parse(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())); }
  catch { throw new HttpError(401, 'Session invalid'); }
}
export async function publicUser(user: User) {
  const accountPaused = user.app_metadata?.account_paused === true;
  let accountDeleteAfter: string | null = accountPaused && typeof user.app_metadata?.account_delete_after === 'string'
    ? user.app_metadata.account_delete_after : null;
  // Older paused accounts were backfilled by the migration without Auth metadata dates.
  if (accountPaused && !accountDeleteAfter) {
    const pause = await getSupabaseAdmin().from('cashflow_account_pauses').select('delete_after').eq('user_id', user.id).maybeSingle();
    if (pause.error) throw pause.error;
    accountDeleteAfter = pause.data?.delete_after || null;
  }
  const role = await systemRole(user.id);
  return { id: user.id, email: user.email, role, canViewAdminAnalytics: canViewAdminAnalytics(user, role), accountPaused, accountDeleteAfter,
    accountClosureKind: user.app_metadata?.account_closure_kind === 'deletion' ? 'deletion' : 'pause',
    created_at: user.created_at, user_metadata: { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url } };
}
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
// Supabase Auth did not answer (a timeout or its own 5xx): the session may be perfectly valid, so the
// person is not signed out; the request fails as temporarily unavailable and the browser tries again.
const authUnavailable = () => new HttpError(503, 'ระบบตอบช้าชั่วคราว กรุณาลองใหม่อีกครั้ง');
export async function requireUser(req: VercelRequest, res: VercelResponse, checkAccount = true, allowPaused = false): Promise<User> {
  let session = readCookie<PrivateSession>(req);
  if (!session?.access_token || !session.refresh_token) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  const original = sealedSessionIdentity(session.access_token);
  const auth = createAuthClient();
  const activeRequest = getSupabaseAdmin().rpc('cashflow_session_active', { p_user_id: original.sub, p_session_id: original.session_id });
  const sessionExpired = !Number.isFinite(session.issued_at) || session.issued_at > Date.now() || session.issued_at + SESSION_LIFETIME <= Date.now();
  const needsRefresh = (session.expires_at || 0)*1000 < Date.now()+30000;
  // For a normal request these independent checks can share one network round trip.
  // Expired or refreshing sessions keep the sequential path below so revocation is
  // checked before any provider refresh or expiry handling.
  const userRequest = !sessionExpired && !needsRefresh
    ? auth.auth.getUser(session.access_token)
    : null;
  const [checked, initialUser] = userRequest
    ? await Promise.all([activeRequest, userRequest])
    : [await activeRequest, null];
  if (checked.error) throw checked.error;
  if (!checked.data) { writeCookie(res, null); throw new HttpError(401, 'Session revoked'); }
  if (sessionExpired) {
    await revokeSession(session); writeCookie(res, null); throw new HttpError(401, 'Session expired');
  }
  if (needsRefresh) {
    const refreshed = await auth.auth.refreshSession({ refresh_token: session.refresh_token });
    if (isAuthRetryableFetchError(refreshed.error)) throw authUnavailable();
    if (refreshed.error || !refreshed.data.session) { writeCookie(res, null); throw new HttpError(401, 'Session expired'); }
    const identity = sealedSessionIdentity(refreshed.data.session.access_token);
    if (identity.sub !== original.sub || identity.session_id !== original.session_id) throw new HttpError(401, 'Session invalid');
    // In use: the window starts again from now (revocation was checked above and is checked again below).
    const issuedAt = Date.now();
    session = { ...refreshed.data.session, issued_at: issuedAt }; storeSession(res, refreshed.data.session, issuedAt);
  }
  const { data, error } = initialUser || await auth.auth.getUser(session.access_token);
  if (isAuthRetryableFetchError(error)) throw authUnavailable();
  if (error || !data.user) { writeCookie(res, null); throw new HttpError(401, 'Session expired'); }
  if (data.user.id !== original.sub) throw new HttpError(401, 'Session invalid');
  if (checkAccount && req.headers['x-account-id'] && req.headers['x-account-id'] !== data.user.id) throw new HttpError(401, 'บัญชีผู้ใช้เปลี่ยนแล้ว กรุณาโหลดหน้าใหม่');
  // Recheck after provider I/O so a concurrent logout/reset cannot be missed.
  const active = await getSupabaseAdmin().rpc('cashflow_session_active', { p_user_id: data.user.id, p_session_id: original.session_id });
  if (active.error) throw active.error;
  if (!active.data) { writeCookie(res, null); throw new HttpError(401, 'Session revoked'); }
  if (!allowPaused && data.user.app_metadata?.account_paused === true) throw new HttpError(403, 'บัญชีนี้พักใช้งานอยู่ กรุณาเปิดใช้งานอีกครั้ง');
  return data.user;
}
