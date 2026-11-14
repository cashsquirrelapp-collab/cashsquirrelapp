import { createHash } from 'node:crypto';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Handler } from '../http/types.js';
import { HttpError, withGuard } from '../http/guard.js';
import { verifyLiffIdToken } from '../security/lineIdentity.js';
import { rateLimit } from '../security/rateLimit.js';
import { revokeSession, storeSession } from '../security/session.js';
import { safeLineDestination } from '../../../shared/lineDestination.js';
import { lineSignupOn } from '../services/lineFirst.js';
import { lineSignupDeps, lineSignupSchema, signUpFromLine, type LineSignupDeps } from '../services/lineSignup.js';
import { assertLinkedLineAccess, issueLinkedLineSession } from '../services/lineSession.js';
import type { TryDraft } from '../services/lineTry.js';
import { createAuthClient, getSupabaseAdmin } from '../config/supabase.js';
import { saveConsent } from '../repositories/consents.js';
import { linkedLineAccount } from '../services/lineSession.js';

// POST /api/line-signup — the เริ่มใช้งาน page inside LINE (liff-add.js signup view). The LINE identity comes only from
// LINE's own ID-token check, never from the request. Off unless LINE_SIGNUP=enabled (services/lineFirst.ts).

export interface LineSignupHandlerDeps {
  on: () => boolean;
  verify: typeof verifyLiffIdToken;
  limit: typeof rateLimit;
  signup: (lineUserId: string, input: Parameters<typeof signUpFromLine>[1]) => Promise<{ userId: string; created: boolean; first?: TryDraft }>;
  access: typeof assertLinkedLineAccess;
  issue: typeof issueLinkedLineSession;
  store: typeof storeSession;
  revoke: (session: Session) => Promise<void>;
  /** The welcome card in the chat and the account's LINE menu; best effort, never fails the sign-up. */
  welcome: (lineUserId: string, userId: string, recordsIn?: string | null, first?: TryDraft | null, name?: string | null) => Promise<void>;
  /** มีบัญชีอยู่แล้ว: linking the LINE chat to an account made on the website. */
  existing: ExistingLinkDeps;
}

export interface ExistingLinkDeps {
  /** The account behind this email and password (checked as the website's sign-in checks it); null when they do not match. */
  signIn: (email: string, password: string) => Promise<{ userId: string; session: Session; mfa: boolean } | null>;
  /** The LINE chat already linked to this account, if any. */
  lineOf: (userId: string) => Promise<string | null>;
  /** The account already linked to this LINE chat, if any. */
  accountOf: (lineUserId: string) => Promise<string | null>;
  link: (userId: string, lineUserId: string) => Promise<void>;
  consent: (userId: string) => Promise<void>;
  /** The card sent to the chat once it is linked, and the account's LINE menu; best effort. */
  welcome: (lineUserId: string) => Promise<void>;
}

// มีบัญชีอยู่แล้ว (owner, 2026-11-14: "เข้าทางไหนก็ได้"; one account however you come in): someone who signs up inside LINE
// but already has an account from the website signs in with its email and password instead, and the LINE chat is linked to
// that account. No second account is made. Google sign-in does not run inside LINE, so those accounts link from the
// website (ตั้งค่า › เชื่อมต่อ LINE).
const linkSchema = z.object({
  action: z.literal('link'),
  idToken: z.string().min(1).max(8192),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  agreed: z.literal(true),
  destination: z.string().max(500).optional(),
}).strict();
const emailKey = (email: string) => createHash('sha256').update(email).digest('hex').slice(0, 32);

const existingDeps: ExistingLinkDeps = {
  async signIn(email, password) {
    const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user || !data.user.email_confirmed_at || data.user.email?.toLowerCase() !== email
      || data.user.app_metadata?.account_closure_kind === 'deletion') return null;
    const mfa = (data.user.factors ?? []).some(factor => factor.status === 'verified');
    return { userId: data.user.id, session: data.session, mfa };
  },
  async lineOf(userId) {
    const found = await getSupabaseAdmin().from('cashflow_line_links').select('line_user_id').eq('user_id', userId).maybeSingle();
    if (found.error) throw found.error;
    return (found.data as { line_user_id?: string } | null)?.line_user_id ?? null;
  },
  accountOf: linkedLineAccount,
  link: (userId, lineUserId) => lineSignupDeps.link(userId, lineUserId),
  async consent(userId) { await saveConsent(userId, 'line', true); },
  async welcome(lineUserId) {
    const [{ welcomeAfterLink }, { sendLineMessagePayload }, menus] = await Promise.all([
      import('./line-webhook.js'), import('../services/line.js'), import('../services/lineRichMenus.js'),
    ]);
    await sendLineMessagePayload(lineUserId, await welcomeAfterLink(lineUserId));
    menus.forgetLineMenu(lineUserId);
    const menuDeps = menus.lineMenuDeps();
    if (menuDeps) await menus.syncLineMenuFor(lineUserId, menuDeps);
  },
};

async function sendWelcome(lineUserId: string, userId: string, recordsIn?: string | null, first?: TryDraft | null, name?: string | null): Promise<void> {
  const [{ sendLineMessagesOutcome, sendLineMessagePayload }, menus, sheets, tryCards] = await Promise.all([
    import('../services/line.js'), import('../services/lineRichMenus.js'), import('../services/lineSheetCards.js'), import('../services/lineTry.js'),
  ]);
  // The first minute's ending (owner, 2026-11-13: clean, one card at most): the tried record now saved, and what to do next.
  await sendLineMessagesOutcome(lineUserId, tryCards.buildTryWelcomeBack(first ?? null, name ?? null));
  // Where the records are kept now (question 5; owner, 2026-11-13: "เขาจะรู้ได้ไงว่ามึงมีฟีเจอร์นี้ ... มึงต้องบอกเขา"): Google
  // Sheets gets the card to connect that sheet, Excel the way to bring the file in, where the features are open.
  const open = await sheets.sheetsOpenFor(userId).catch(() => false);
  if (recordsIn === 'google_sheets' && open) await sendLineMessagePayload(lineUserId, sheets.buildLineConnectSheet(process.env.LIFF_ID));
  if (recordsIn === 'excel') {
    await sendLineMessagePayload(lineUserId, { type: 'text', text: open
      ? 'ใช้ Excel อยู่ใช่ไหมครับ ส่งไฟล์มาในแชทนี้ได้เลย เลขาอ่านแล้วเตรียมรายการให้ และกดเปิดใน Google Sheets ได้ ถ้ารายการเยอะ นำเข้าทีเดียวได้ที่ เมนู งาน › นำเข้าจาก Excel'
      : 'ใช้ Excel อยู่ใช่ไหมครับ ส่งไฟล์มาในแชทนี้ได้เลย เลขาอ่านแล้วเตรียมรายการให้ ถ้ารายการเยอะ นำเข้าทีเดียวได้ที่ เมนู งาน › นำเข้าจาก Excel' });
  }
  menus.forgetLineMenu(lineUserId);
  const menuDeps = menus.lineMenuDeps();
  if (menuDeps) await menus.syncLineMenuFor(lineUserId, menuDeps);
  void userId;
}

const defaults = (deps: LineSignupDeps = lineSignupDeps): LineSignupHandlerDeps => ({
  on: () => lineSignupOn(),
  verify: verifyLiffIdToken, limit: rateLimit,
  signup: (lineUserId, input) => signUpFromLine(lineUserId, input, deps),
  access: assertLinkedLineAccess, issue: issueLinkedLineSession, store: storeSession,
  revoke: session => revokeSession(session),
  welcome: sendWelcome,
  existing: existingDeps,
});

async function linkExisting(req: Parameters<Handler>[0], res: Parameters<Handler>[1], deps: LineSignupHandlerDeps): Promise<void> {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    throw new HttpError(400, field === 'email' ? 'กรุณาใส่อีเมลให้ถูกต้อง' : field === 'password' ? 'กรุณาใส่รหัสผ่าน'
      : field === 'agreed' ? 'กรุณากดยินยอมการเชื่อมต่อ LINE ก่อน' : 'ข้อมูลไม่ครบ กรุณาเปิดหน้านี้ใหม่จากแชท LINE');
  }
  const { email, password } = parsed.data;
  const destination = parsed.data.destination ? safeLineDestination(parsed.data.destination) : null;
  const lineId = await deps.verify(parsed.data.idToken);
  if (!lineId) throw new HttpError(401, 'ยืนยัน LINE ไม่สำเร็จ กรุณาเปิดใหม่จากแชท');
  // Password guesses are slowed per LINE chat and per address.
  await deps.limit('line-link-existing', lineId, 5, 900);
  await deps.limit('line-link-existing-email', emailKey(email), 5, 900);
  if (await deps.existing.accountOf(lineId)) throw new HttpError(409, 'LINE นี้เชื่อมกับบัญชีอยู่แล้ว กดเมนูเปิดแอปในแชทได้เลย');
  const found = await deps.existing.signIn(email, password);
  if (!found) throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  try {
    if (found.mfa) throw new HttpError(403, 'บัญชีนี้เปิดการยืนยันสองขั้นตอนไว้ กรุณาเชื่อม LINE ที่เว็บไซต์ ตั้งค่า › เชื่อมต่อ LINE');
    const other = await deps.existing.lineOf(found.userId);
    if (other && other !== lineId) throw new HttpError(409, 'บัญชีนี้เชื่อมกับ LINE อื่นอยู่แล้ว ถ้าจะย้ายมาใช้ LINE นี้ ให้ยกเลิกการเชื่อมต่อที่ ตั้งค่า › เชื่อมต่อ LINE บนเว็บก่อน');
    await deps.access(found.userId);
    await deps.existing.link(found.userId, lineId);
    await deps.existing.consent(found.userId);
  } finally {
    // The password check's own session is never kept: the account opens through LINE as every LINE sign-in does.
    await deps.revoke(found.session).catch(() => undefined);
  }
  const session = await deps.issue(found.userId);
  try {
    if (session.user.id !== found.userId) throw new HttpError(401, 'การเชื่อมบัญชีเปลี่ยนแล้ว กรุณาเปิดใหม่จากแชท');
    deps.store(res, session);
  } catch (error) { await deps.revoke(session); throw error; }
  try { await deps.existing.welcome(lineId); }
  catch { console.error('line-signup: the linked welcome card was not sent'); }
  res.json({ ok: true, created: false, linked: true, destination });
}

export function createLineSignupHandler(deps: LineSignupHandlerDeps = defaults()): Handler {
  return withGuard(async (req, res) => {
    if (!deps.on()) throw new HttpError(404, 'Not found');
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    if ((req.body as { action?: unknown } | undefined)?.action === 'link') { await linkExisting(req, res, deps); return; }
    const parsed = lineSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new HttpError(400, field === 'name' ? 'กรุณาใส่ชื่อ 2–60 ตัวอักษร'
        : field === 'workType' ? 'กรุณาเลือกประเภทงาน'
        : field === 'agreed' ? 'กรุณากดยอมรับเงื่อนไขก่อนเริ่มใช้งาน'
        : 'ข้อมูลไม่ครบ กรุณาเปิดหน้านี้ใหม่จากแชท LINE');
    }
    const destination = parsed.data.destination ? safeLineDestination(parsed.data.destination) : null;
    const lineId = await deps.verify(parsed.data.idToken);
    if (!lineId) throw new HttpError(401, 'ยืนยัน LINE ไม่สำเร็จ กรุณาเปิดใหม่จากแชท');
    await deps.limit('line-signup', lineId, 6, 3600);
    const { userId, created, first } = await deps.signup(lineId, parsed.data);
    await deps.access(userId);
    const session = await deps.issue(userId);
    try {
      if (session.user.id !== userId) throw new HttpError(401, 'การเชื่อมบัญชีเปลี่ยนแล้ว กรุณาเปิดใหม่จากแชท');
      deps.store(res, session);
    } catch (error) { await deps.revoke(session); throw error; }
    if (created) {
      try { await deps.welcome(lineId, userId, parsed.data.recordsIn ?? null, first ?? null, parsed.data.name); }
      catch { console.error('line-signup: welcome card was not sent'); }
    }
    // Navigation only: never tokens, emails or IDs.
    res.json({ ok: true, created, destination });
  }, { csrf: true });
}

export default createLineSignupHandler();
