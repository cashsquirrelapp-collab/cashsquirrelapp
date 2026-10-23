import type { Session } from '@supabase/supabase-js';
import type { Handler, VercelRequest, VercelResponse } from '../http/types.js';
import { HttpError, withGuard } from '../http/guard.js';
import { verifyLiffIdToken } from '../security/lineIdentity.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser, revokeSession, storeSession } from '../security/session.js';
import { linkedLineAccount, issueLinkedLineSession, assertLinkedLineAccess } from '../services/lineSession.js';
import { safeLineDestination } from '../../../shared/lineDestination.js';

export interface LineSessionDependencies {
  verify: typeof verifyLiffIdToken;
  lookup: typeof linkedLineAccount;
  access: typeof assertLinkedLineAccess;
  limit: typeof rateLimit;
  existing: (req: VercelRequest, res: VercelResponse) => Promise<string | null>;
  issue: typeof issueLinkedLineSession;
  store: typeof storeSession;
  revoke: (session: Session) => Promise<void>;
}
const defaults: LineSessionDependencies = {
  verify: verifyLiffIdToken, lookup: linkedLineAccount, access: assertLinkedLineAccess, limit: rateLimit,
  async existing(req, res) {
    try { return (await requireUser(req, res, false, true)).id; }
    catch (error) { if (error instanceof HttpError && error.status === 401) return null; throw error; }
  },
  issue: issueLinkedLineSession, store: storeSession,
  revoke: session => revokeSession(session),
};
export function createLineSessionHandler(deps: LineSessionDependencies = defaults): Handler {
  return withGuard(async (req, res) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const idToken = req.body?.idToken;
    const destination = safeLineDestination(req.body?.destination);
    if (typeof idToken !== 'string' || !idToken || idToken.length > 8192 || !destination) throw new HttpError(400, 'ลิงก์เปิดแอปไม่ถูกต้อง กรุณาเปิดใหม่จาก LINE');
    const lineId = await deps.verify(idToken);
    if (!lineId) throw new HttpError(401, 'ยืนยัน LINE ไม่สำเร็จ กรุณาเปิดใหม่จากแชท');
    await deps.limit('line-session', lineId, 15, 60);
    const userId = await deps.lookup(lineId);
    if (!userId) throw new HttpError(403, 'LINE นี้ยังไม่ได้ผูกกับบัญชี กรุณาเชื่อมในตั้งค่าเว็บไซต์ครั้งแรก', 'line_not_linked');
    await deps.access(userId);
    if (await deps.existing(req, res) === userId) { res.json({ ok: true, destination }); return; }
    const session = await deps.issue(userId);
    try {
      if (session.user.id !== userId || await deps.lookup(lineId) !== userId) throw new HttpError(401, 'การเชื่อมบัญชีเปลี่ยนแล้ว กรุณาเปิดใหม่จาก LINE');
      await deps.access(userId);
      deps.store(res, session);
    } catch (error) { await deps.revoke(session); throw error; }
    // The response contains navigation only, never access/refresh tokens, emails or user IDs.
    res.json({ ok: true, destination });
  }, { csrf: true });
}
export default createLineSessionHandler();
