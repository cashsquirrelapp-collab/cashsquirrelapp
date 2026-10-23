// Accounts signed in on this browser, switchable like Google or Facebook (owner, 2026-10-21).
// - The active account keeps the usual 'session' cookie.
// - Up to three other signed-in accounts wait in their own sealed cookies (AES-GCM, HttpOnly, Secure,
//   SameSite=Lax), scoped to /api/auth so ordinary API requests never carry them.
// - A sealed 'known' cookie remembers who signed in here (id, email, name) for 30 days, so an account
//   whose session ended (30 days unused, see security/session.ts) still appears in the switcher and only
//   needs its password again.
// Switching re-checks that the stored session was not revoked; signing out ends every session here.
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { appOrigin } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import { readCookie, seal, unseal, writeCookie } from './cookies.js';
import { revokeSession, sealedSessionIdentity, sessionAlive, sessionMaxAge, type PrivateSession } from './session.js';

export const MAX_DEVICE_ACCOUNTS = 4;
const SLOTS = ['acct-2', 'acct-3', 'acct-4'] as const;
type Slot = typeof SLOTS[number];
const KNOWN = 'known';
const KNOWN_MAX_AGE = 30 * 24 * 60 * 60;
const KNOWN_LIMIT = 8;

type KnownAccount = { id: string; email: string; name?: string; at: number };
export type DeviceAccount = { id: string; email: string; name?: string; current: boolean; ready: boolean };
type Stashed = { slot: Slot; session: PrivateSession; sub: string; sessionId: string };

const cookieName = (kind: string) => `${appOrigin().startsWith('https:') ? '__Secure-' : ''}cashflow-${kind}`;
function readScoped<T>(req: VercelRequest, kind: string): T | null {
  const part = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName(kind)}=`));
  return part ? unseal<T>(part.slice(part.indexOf('=') + 1)) : null;
}
function writeScoped(res: VercelResponse, kind: string, value: unknown, maxAge: number): void {
  const cookie = `${cookieName(kind)}=${value === null ? '' : seal(value)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${value === null ? 0 : Math.max(0, Math.floor(maxAge))}${appOrigin().startsWith('https:') ? '; Secure' : ''}`;
  if (cookie.length > 4096) throw new Error('Account cookie exceeds browser limit');
  const existing = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : []), cookie]);
}

/** Display details from a token our own sealed cookie carried (never a caller-supplied token). */
function claims(session: PrivateSession): { email: string; name?: string } {
  try {
    const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()) as { email?: unknown; user_metadata?: Record<string, unknown> };
    const meta = payload.user_metadata || {};
    const name = [meta.full_name, meta.name, meta.display_name].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return { email: typeof payload.email === 'string' ? payload.email : '', ...(name ? { name: name.trim().slice(0, 80) } : {}) };
  } catch { return { email: '' }; }
}
function identityOf(session: PrivateSession | null) {
  if (!session?.access_token) return null;
  try { return sealedSessionIdentity(session.access_token); } catch { return null; }
}

function stashed(req: VercelRequest): Stashed[] {
  const out: Stashed[] = [];
  for (const slot of SLOTS) {
    const session = readScoped<PrivateSession>(req, slot);
    const identity = identityOf(session);
    if (session && identity && sessionAlive(session)) out.push({ slot, session, sub: identity.sub, sessionId: identity.session_id });
  }
  return out;
}
function readKnown(req: VercelRequest): KnownAccount[] {
  const list = readScoped<KnownAccount[]>(req, KNOWN);
  return Array.isArray(list) ? list.filter(item => item && typeof item.id === 'string' && typeof item.email === 'string').slice(0, KNOWN_LIMIT) : [];
}
function writeKnown(res: VercelResponse, list: KnownAccount[]) {
  writeScoped(res, KNOWN, list.slice(0, KNOWN_LIMIT), KNOWN_MAX_AGE);
}
function upsertKnown(list: KnownAccount[], account: Omit<KnownAccount, 'at'>): KnownAccount[] {
  return [{ ...account, at: Date.now() }, ...list.filter(item => item.id !== account.id)];
}

/** Remember who just signed in, for the switcher. */
export function rememberAccount(req: VercelRequest, res: VercelResponse, account: { id: string; email?: string | null; name?: string }) {
  if (!account.email) return;
  writeKnown(res, upsertKnown(readKnown(req), { id: account.id, email: account.email, ...(account.name ? { name: account.name } : {}) }));
}

/** Before another account's session replaces the active one, keep the current one signed in aside. */
export async function keepCurrentAside(req: VercelRequest, res: VercelResponse, nextUserId: string) {
  const current = readCookie<PrivateSession>(req);
  const identity = identityOf(current);
  if (!current || !identity || identity.sub === nextUserId || !sessionAlive(current)) return;
  const slots = stashed(req);
  const sameAccount = slots.find(item => item.sub === identity.sub);
  const free = SLOTS.find(slot => !slots.some(item => item.slot === slot));
  const oldest = [...slots].sort((a, b) => a.session.issued_at - b.session.issued_at)[0];
  const slot = sameAccount?.slot ?? free ?? oldest?.slot;
  if (!slot) return;
  const dropped = slots.find(item => item.slot === slot && item.sub !== identity.sub);
  if (dropped) { try { await revokeSession(dropped.session); } catch { /* best effort: it ends with its lifetime */ } }
  writeScoped(res, slot, current, sessionMaxAge(current));
  // A session made before this feature may not be in the list yet.
  const info = claims(current);
  if (info.email) writeKnown(res, upsertKnown(readKnown(req).filter(item => item.id !== nextUserId), { id: identity.sub, ...info }));
}

/** The accounts the switcher shows: the active one first, then the others on this browser. */
export function listDeviceAccounts(req: VercelRequest): DeviceAccount[] {
  const current = readCookie<PrivateSession>(req);
  const currentIdentity = sessionAlive(current) ? identityOf(current) : null;
  const waiting = stashed(req);
  const ready = new Set(waiting.map(item => item.sub));
  const known = readKnown(req);
  const accounts: DeviceAccount[] = [];
  if (currentIdentity && current) {
    const fromList = known.find(item => item.id === currentIdentity.sub);
    const info = fromList ? { email: fromList.email, name: fromList.name } : claims(current);
    accounts.push({ id: currentIdentity.sub, email: info.email, ...(info.name ? { name: info.name } : {}), current: true, ready: true });
  }
  for (const item of known) {
    if (item.id === currentIdentity?.sub) continue;
    accounts.push({ id: item.id, email: item.email, ...(item.name ? { name: item.name } : {}), current: false, ready: ready.has(item.id) });
  }
  // A waiting session always shows, even if the list cookie was lost.
  for (const item of waiting) {
    if (accounts.some(account => account.id === item.sub)) continue;
    const info = claims(item.session);
    if (info.email) accounts.push({ id: item.sub, email: info.email, ...(info.name ? { name: info.name } : {}), current: false, ready: true });
  }
  return accounts.slice(0, KNOWN_LIMIT);
}

/** Make a waiting account the active one; the previous one waits in its place. */
export async function switchToAccount(req: VercelRequest, res: VercelResponse, accountId: string) {
  const target = stashed(req).find(item => item.sub === accountId);
  if (!target) throw new HttpError(409, 'บัญชีนี้ต้องเข้าสู่ระบบอีกครั้ง', 'account_signin_required');
  const active = await getSupabaseAdmin().rpc('cashflow_session_active', { p_user_id: target.sub, p_session_id: target.sessionId });
  if (active.error) throw active.error;
  if (!active.data) {
    writeScoped(res, target.slot, null, 0);
    throw new HttpError(409, 'บัญชีนี้ต้องเข้าสู่ระบบอีกครั้ง', 'account_signin_required');
  }
  const current = readCookie<PrivateSession>(req);
  const currentIdentity = sessionAlive(current) ? identityOf(current) : null;
  if (current && currentIdentity && currentIdentity.sub !== accountId) writeScoped(res, target.slot, current, sessionMaxAge(current));
  else writeScoped(res, target.slot, null, 0);
  writeCookie(res, target.session, 'session', sessionMaxAge(target.session));
}

/** Take an account off this browser: its waiting session ends and it leaves the list. */
export async function forgetDeviceAccount(req: VercelRequest, res: VercelResponse, accountId: string) {
  const currentIdentity = identityOf(readCookie<PrivateSession>(req));
  if (currentIdentity?.sub === accountId) throw new HttpError(400, 'ออกจากระบบบัญชีที่ใช้อยู่ด้วยปุ่มออกจากระบบ');
  for (const item of stashed(req).filter(entry => entry.sub === accountId)) {
    try { await revokeSession(item.session); } catch { /* best effort */ }
    writeScoped(res, item.slot, null, 0);
  }
  writeKnown(res, readKnown(req).filter(item => item.id !== accountId));
}

/** Signing out ends every session waiting on this browser too. */
export async function signOutDeviceAccounts(req: VercelRequest, res: VercelResponse) {
  for (const item of stashed(req)) {
    try { await revokeSession(item.session); } catch { /* best effort */ }
  }
  for (const slot of SLOTS) writeScoped(res, slot, null, 0);
}
