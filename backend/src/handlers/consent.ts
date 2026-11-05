import { z } from 'zod';
import { CONSENT_KEYS, CONSENT_VERSIONS } from '../../../shared/consents.js';
import { HttpError, withGuard } from '../http/guard.js';
import { readConsentsOrThrow, saveConsent } from '../repositories/consents.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';

// GET: what this account has agreed to. POST: agree (to the version on screen, which must be the current one) or
// withdraw. Only the signed-in account's own records; the record keeps the version and the time (shared/consents.ts).

const actionSchema = z.object({ key: z.enum(CONSENT_KEYS), accepted: z.boolean(), version: z.string().max(20).optional() }).strict();

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  if (req.method === 'GET') {
    await rateLimit('consent-read', user.id, 60, 60);
    let consents;
    try { consents = await readConsentsOrThrow(user.id); }
    catch { throw new HttpError(503, 'อ่านข้อมูลความยินยอมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'consent_unavailable'); }
    res.json({ consents, versions: CONSENT_VERSIONS });
    return;
  }
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'ข้อมูลความยินยอมไม่ถูกต้อง');
  const { key, accepted, version } = parsed.data;
  // Agreeing counts only for the words the person saw: an old page must load the new words first.
  if (accepted && version !== CONSENT_VERSIONS[key]) throw new HttpError(409, 'ข้อความมีการปรับปรุง กรุณาโหลดหน้าใหม่แล้วอ่านอีกครั้ง', 'consent_outdated');
  // The terms are the agreement to use the service (closing the account ends it); LINE is withdrawn by disconnecting it,
  // which also stops its notifications (line-link-code.ts). Only เลขากระรอก is withdrawn here.
  if (!accepted && key !== 'ai') throw new HttpError(400, key === 'line' ? 'ยกเลิกการเชื่อมต่อ LINE ได้ที่ ตั้งค่า › LINE' : 'ยกเลิกข้อกำหนดการใช้งานได้ด้วยการลบบัญชี');
  await rateLimit('consent-write', user.id, 20, 60);
  res.json({ consents: await saveConsent(user.id, key, accepted), versions: CONSENT_VERSIONS });
}, { csrf: true });
