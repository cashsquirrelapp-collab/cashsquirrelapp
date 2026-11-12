import type { Session } from '@supabase/supabase-js';
import type { Handler } from '../http/types.js';
import { HttpError, withGuard } from '../http/guard.js';
import { verifyLiffIdToken } from '../security/lineIdentity.js';
import { rateLimit } from '../security/rateLimit.js';
import { revokeSession, storeSession } from '../security/session.js';
import { safeLineDestination } from '../../../shared/lineDestination.js';
import { lineSignupOn } from '../services/lineFirst.js';
import { lineSignupDeps, lineSignupSchema, signUpFromLine, type LineSignupDeps } from '../services/lineSignup.js';
import { assertLinkedLineAccess, issueLinkedLineSession } from '../services/lineSession.js';

// POST /api/line-signup — the เริ่มใช้งาน page inside LINE (liff-add.js signup view). The LINE identity comes only from
// LINE's own ID-token check, never from the request. Off unless LINE_SIGNUP=enabled (services/lineFirst.ts).

export interface LineSignupHandlerDeps {
  on: () => boolean;
  verify: typeof verifyLiffIdToken;
  limit: typeof rateLimit;
  signup: (lineUserId: string, input: Parameters<typeof signUpFromLine>[1]) => Promise<{ userId: string; created: boolean }>;
  access: typeof assertLinkedLineAccess;
  issue: typeof issueLinkedLineSession;
  store: typeof storeSession;
  revoke: (session: Session) => Promise<void>;
  /** The welcome card in the chat and the account's LINE menu; best effort, never fails the sign-up. */
  welcome: (lineUserId: string, userId: string, recordsIn?: string | null) => Promise<void>;
}

async function sendWelcome(lineUserId: string, userId: string, recordsIn?: string | null): Promise<void> {
  const [{ welcomeAfterLink }, { sendLineMessagePayload }, menus, sheets] = await Promise.all([
    import('./line-webhook.js'), import('../services/line.js'), import('../services/lineRichMenus.js'), import('../services/lineSheetCards.js'),
  ]);
  await sendLineMessagePayload(lineUserId, await welcomeAfterLink(lineUserId));
  // Records kept in Google Sheets (question 5): the card to connect that sheet, where the feature is open to the account.
  if (recordsIn === 'google_sheets' && await sheets.sheetsOpenFor(userId)) await sendLineMessagePayload(lineUserId, sheets.buildLineConnectSheet(process.env.LIFF_ID));
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
});

export function createLineSignupHandler(deps: LineSignupHandlerDeps = defaults()): Handler {
  return withGuard(async (req, res) => {
    if (!deps.on()) throw new HttpError(404, 'Not found');
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
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
    const { userId, created } = await deps.signup(lineId, parsed.data);
    await deps.access(userId);
    const session = await deps.issue(userId);
    try {
      if (session.user.id !== userId) throw new HttpError(401, 'การเชื่อมบัญชีเปลี่ยนแล้ว กรุณาเปิดใหม่จากแชท');
      deps.store(res, session);
    } catch (error) { await deps.revoke(session); throw error; }
    if (created) {
      try { await deps.welcome(lineId, userId, parsed.data.recordsIn ?? null); }
      catch { console.error('line-signup: welcome card was not sent'); }
    }
    // Navigation only: never tokens, emails or IDs.
    res.json({ ok: true, created, destination });
  }, { csrf: true });
}

export default createLineSignupHandler();
