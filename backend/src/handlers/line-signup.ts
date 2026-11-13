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
import type { TryDraft } from '../services/lineTry.js';

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
}

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
