import type { Session } from '@supabase/supabase-js';
import type { Handler } from '../http/types.js';
import { HttpError, withGuard } from '../http/guard.js';
import { appOrigin } from '../config/env.js';
import { labState } from '../../../shared/labs.js';
import { loadLabs } from '../repositories/labs.js';
import { isOwnerUserId } from '../repositories/roles.js';
import { verifyLiffIdToken } from '../security/lineIdentity.js';
import { rateLimit } from '../security/rateLimit.js';
import { revokeSession, storeSession } from '../security/session.js';
import { assertLinkedLineAccess, issueLinkedLineSession, linkedLineAccount } from '../services/lineSession.js';
import { consumeHandoff, createHandoff } from '../services/webHandoff.js';

// /api/line-handoff — เชื่อมชีตจาก LINE (owner, 2026-11-13). POST, from the LINE page: a LINE-verified, linked account with
// the Sheets feature gets a one-use link for the phone's own browser (services/webHandoff.ts). GET, that link opened in
// Safari or Chrome: the account is signed in there and lands on /connect-sheets, where Google's sign-in works.

export interface LineHandoffDeps {
  verify: typeof verifyLiffIdToken;
  linked: typeof linkedLineAccount;
  sheetsOn: (userId: string) => Promise<boolean>;
  limit: typeof rateLimit;
  create: typeof createHandoff;
  consume: typeof consumeHandoff;
  access: typeof assertLinkedLineAccess;
  issue: typeof issueLinkedLineSession;
  store: typeof storeSession;
  revoke: (session: Session) => Promise<void>;
  origin: () => string;
}

const defaults: LineHandoffDeps = {
  verify: verifyLiffIdToken, linked: linkedLineAccount,
  sheetsOn: async userId => {
    const [record, owner] = await Promise.all([loadLabs(userId), isOwnerUserId(userId)]);
    return labState(record, owner).on.includes('sheets');
  },
  limit: rateLimit, create: createHandoff, consume: consumeHandoff,
  access: assertLinkedLineAccess, issue: issueLinkedLineSession, store: storeSession,
  revoke: session => revokeSession(session), origin: appOrigin,
};

export function createLineHandoffHandler(deps: LineHandoffDeps = defaults): Handler {
  return withGuard(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') {
      // The link from the LINE page, opened in the phone's own browser.
      res.setHeader('Referrer-Policy', 'no-referrer');
      const go = (path: string) => { res.status(302); res.setHeader('Location', `${deps.origin()}${path}`); res.end(); };
      const userId = await deps.consume((req.query as Record<string, unknown>)?.t, 'sheets');
      if (!userId) { go('/connect-sheets?handoff=expired'); return; }
      try { await deps.access(userId); } catch { go('/connect-sheets?handoff=closed'); return; }
      const session = await deps.issue(userId);
      try {
        if (session.user.id !== userId) throw new HttpError(401, 'Session mismatch');
        deps.store(res, session);
      } catch (error) { await deps.revoke(session); throw error; }
      // สร้างชีตใหม่ให้ on the sheet offer card: the page makes the new sheet instead of picking one.
      go((req.query as Record<string, unknown>)?.new === '1' ? '/connect-sheets?new=1' : '/connect-sheets');
      return;
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const { idToken, purpose, mode } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof idToken !== 'string' || !idToken || idToken.length > 8192 || purpose !== 'sheets') throw new HttpError(400, 'ลิงก์ไม่ถูกต้อง กรุณาเปิดใหม่จากแชท LINE');
    const lineId = await deps.verify(idToken);
    if (!lineId) throw new HttpError(401, 'ยืนยัน LINE ไม่สำเร็จ กรุณาเปิดใหม่จากแชท');
    await deps.limit('line-handoff', lineId, 10, 600);
    const userId = await deps.linked(lineId);
    if (!userId) throw new HttpError(403, 'LINE นี้ยังไม่มีบัญชี กดเริ่มใช้งานในแชทก่อน', 'line_not_linked');
    await deps.access(userId);
    // A test feature for now: only accounts it is open to (customers never see unreleased features).
    if (!(await deps.sheetsOn(userId))) throw new HttpError(403, 'การเชื่อมชีตยังไม่เปิดให้บัญชีนี้', 'feature_closed');
    const token = await deps.create(userId, 'sheets');
    // openExternalBrowser=1: LINE opens it in Safari or Chrome even if it is tapped inside LINE.
    res.json({ url: `${deps.origin()}/api/line-handoff?t=${encodeURIComponent(token)}${mode === 'new' ? '&new=1' : ''}&openExternalBrowser=1` });
  }, { csrf: true });
}

export default createLineHandoffHandler();
