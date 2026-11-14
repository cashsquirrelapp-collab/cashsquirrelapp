import { randomBytes } from 'node:crypto';
import type { Session } from '@supabase/supabase-js';
import type { Handler, VercelRequest, VercelResponse } from '../http/types.js';
import { HttpError, withGuard } from '../http/guard.js';
import { appOrigin } from '../config/env.js';
import { readCookie, writeCookie } from '../security/cookies.js';
import { requireUser, storeSession } from '../security/session.js';
import { keepCurrentAside, rememberAccount } from '../security/deviceAccounts.js';
import { isStaging, stagingLineAllowed } from '../security/staging.js';
import { hasConsent } from '../repositories/consents.js';
import { assertLinkedLineAccess, issueLinkedLineSession, linkedLineAccount } from '../services/lineSession.js';
import { lineSignupDeps } from '../services/lineSignup.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { isLineOnlyEmail } from '../../../shared/lineAccount.js';

// /api/line-login — เข้าสู่ระบบด้วย LINE on the website, and เชื่อม LINE in one click (owner, 2026-11-14: "เข้าทางไหนก็ได้
// ... ไม่ว่าจะเข้าทางไหนก็ได้เหมือนกัน"). LINE Login's own web sign-in (works on a computer: QR code or LINE's sign-in):
// POST gives LINE's address with a one-time state and nonce kept in a sealed cookie; LINE comes back here (GET) with a code,
// exchanged on the server with the LINE Login channel's secret; the person is whoever LINE's ID token says.
// - signin: the account linked to that LINE opens, as a LINE sign-in does (the one already open waits in the switcher).
// - link: the signed-in account is linked to that LINE (it agreed to connecting LINE just before, as with the code).
// Off until LINE_LOGIN_CHANNEL_SECRET is set (the button does not show). On staging only the owner's LINE is let in.

type Purpose = 'signin' | 'link';
type Pending = { state: string; nonce: string; purpose: Purpose; userId?: string; returnTo: string; expires: number };
const COOKIE = 'line-oauth';
const TEN_MINUTES = 600_000;

export function lineLoginReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^\d{6,20}$/.test(env.LINE_CHANNEL_ID || '') && (env.LINE_LOGIN_CHANNEL_SECRET || '').length >= 16;
}

const callbackUrl = () => `${appOrigin()}/api/line-login`;
/** Only this app's own pages: never another site, never a protocol-relative address. */
export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(value) && value.length <= 200 && !value.startsWith('/api/') ? value : '/';
}

export interface LineLoginDeps {
  ready: () => boolean;
  user: (req: VercelRequest, res: VercelResponse) => Promise<{ id: string }>;
  consented: (userId: string) => Promise<boolean>;
  random: () => string;
  now: () => number;
  /** LINE's code → the LINE user it belongs to (ID token checked by LINE, with our nonce); null when it does not check out. */
  identify: (code: string, nonce: string) => Promise<{ sub: string } | null>;
  allowed: (sub: string) => boolean;
  accountOf: (sub: string) => Promise<string | null>;
  lineOf: (userId: string) => Promise<string | null>;
  access: (userId: string) => Promise<void>;
  issue: (userId: string) => Promise<Session>;
  /** Opens the session, putting the account already open here aside for the switcher. */
  adopt: (req: VercelRequest, res: VercelResponse, session: Session) => Promise<void>;
  link: (userId: string, sub: string) => Promise<void>;
  /** The card in the LINE chat once it is linked, and its menu; best effort. */
  welcome: (sub: string) => Promise<void>;
}

async function identifyWithLine(code: string, nonce: string): Promise<{ sub: string } | null> {
  const clientId = process.env.LINE_CHANNEL_ID || '';
  const token = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(), client_id: clientId, client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET || '' }),
  });
  if (!token.ok) return null;
  const idToken = ((await token.json()) as { id_token?: unknown }).id_token;
  if (typeof idToken !== 'string' || !idToken) return null;
  const verified = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ id_token: idToken, client_id: clientId, nonce }),
  });
  if (!verified.ok) return null;
  const claims = (await verified.json()) as { sub?: unknown; aud?: unknown; nonce?: unknown };
  if (typeof claims.sub !== 'string' || !/^U[0-9a-f]{32}$/.test(claims.sub) || claims.aud !== clientId || claims.nonce !== nonce) return null;
  return { sub: claims.sub };
}

const defaults: LineLoginDeps = {
  ready: () => lineLoginReady(),
  user: (req, res) => requireUser(req, res),
  consented: userId => hasConsent(userId, 'line'),
  random: () => randomBytes(24).toString('base64url'),
  now: () => Date.now(),
  identify: identifyWithLine,
  allowed: sub => !isStaging() || stagingLineAllowed(sub),
  accountOf: linkedLineAccount,
  async lineOf(userId) {
    const found = await getSupabaseAdmin().from('cashflow_line_links').select('line_user_id').eq('user_id', userId).maybeSingle();
    if (found.error) throw found.error;
    return (found.data as { line_user_id?: string } | null)?.line_user_id ?? null;
  },
  access: assertLinkedLineAccess,
  issue: issueLinkedLineSession,
  async adopt(req, res, session) {
    await keepCurrentAside(req, res, session.user.id);
    storeSession(res, session);
    const meta = session.user.user_metadata || {};
    const name = [meta.display_name, meta.full_name, meta.name].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    // An account with only its LINE address is not offered in the switcher by address (rememberAccount skips it).
    rememberAccount(req, res, { id: session.user.id, email: isLineOnlyEmail(session.user.email) ? null : session.user.email, ...(name ? { name: name.trim().slice(0, 80) } : {}) });
  },
  link: (userId, sub) => lineSignupDeps.link(userId, sub),
  async welcome(sub) {
    const [{ welcomeAfterLink }, { sendLineMessagePayload }, menus] = await Promise.all([
      import('./line-webhook.js'), import('../services/line.js'), import('../services/lineRichMenus.js'),
    ]);
    await sendLineMessagePayload(sub, await welcomeAfterLink(sub));
    menus.forgetLineMenu(sub);
    const menuDeps = menus.lineMenuDeps();
    if (menuDeps) await menus.syncLineMenuFor(sub, menuDeps);
  },
};

export function createLineLoginHandler(deps: LineLoginDeps = defaults): Handler {
  return withGuard(async (req, res) => {
    if (!deps.ready()) throw new HttpError(404, 'Not found');
    if (req.method === 'POST') {
      const purpose: Purpose = req.body?.purpose === 'link' ? 'link' : 'signin';
      let userId: string | undefined;
      if (purpose === 'link') {
        const user = await deps.user(req, res);
        if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'Account mismatch');
        // As with the link code: only after the account agreed to connecting LINE (the app asks just before).
        if (!(await deps.consented(user.id))) throw new HttpError(428, 'กรุณาอ่านและกดยินยอมการเชื่อมต่อ LINE ก่อน', 'line_consent_required');
        userId = user.id;
      }
      const pending: Pending = { state: deps.random(), nonce: deps.random(), purpose, ...(userId ? { userId } : {}),
        returnTo: purpose === 'link' ? '/settings' : safeReturnTo(req.body?.returnTo), expires: deps.now() + TEN_MINUTES };
      writeCookie(res, pending, COOKIE, TEN_MINUTES / 1000);
      const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
      url.search = new URLSearchParams({ response_type: 'code', client_id: process.env.LINE_CHANNEL_ID || '', redirect_uri: callbackUrl(),
        state: pending.state, scope: 'openid profile', nonce: pending.nonce, bot_prompt: 'normal' }).toString();
      res.json({ url: url.toString() });
      return;
    }
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const pending = readCookie<Pending>(req, COOKIE);
    writeCookie(res, null, COOKIE);
    const go = (path: string) => { res.status(302); res.setHeader('Location', `${appOrigin()}${path}`); res.end(); };
    const fail = (result: string) => go(pending?.purpose === 'link' ? `/settings?line=${result}` : `/login?line=${result}`);
    if (!pending || pending.expires < deps.now() || typeof req.query.state !== 'string' || req.query.state !== pending.state) { fail('failed'); return; }
    // The person pressed ยกเลิก on LINE's page.
    if (typeof req.query.error === 'string' || typeof req.query.code !== 'string' || !req.query.code) { fail('cancelled'); return; }
    const identity = await deps.identify(req.query.code, pending.nonce).catch(() => null);
    if (!identity) { fail('failed'); return; }
    if (!deps.allowed(identity.sub)) { fail('staging'); return; }
    const holder = await deps.accountOf(identity.sub);

    if (pending.purpose === 'signin') {
      if (!holder) { fail('not_linked'); return; }
      await deps.access(holder);
      const session = await deps.issue(holder);
      if (session.user.id !== holder) { fail('failed'); return; }
      await deps.adopt(req, res, session);
      go(pending.returnTo);
      return;
    }

    // link: the account that started it must still be the one signed in here.
    let user: { id: string };
    try { user = await deps.user(req, res); } catch { go('/login'); return; }
    if (user.id !== pending.userId) { fail('failed'); return; }
    if (holder === user.id) { go('/settings?line=linked'); return; }
    if (holder) { fail('taken'); return; }
    const current = await deps.lineOf(user.id);
    if (current && current !== identity.sub) { fail('other'); return; }
    await deps.link(user.id, identity.sub);
    try { await deps.welcome(identity.sub); } catch { console.error('line-login: the linked welcome card was not sent'); }
    go('/settings?line=linked');
  }, { csrf: true });
}

export default createLineLoginHandler();
