import { z } from 'zod';
import { LAB_IDS, labReady, labState } from '../../../shared/labs.js';
import { HttpError, withGuard } from '../http/guard.js';
import { loadLabs, setLabFeature } from '../repositories/labs.js';
import { isOwnerAccount } from '../security/adminAnalyticsAccess.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';

// Settings › ฟีเจอร์ทดลอง (shared/labs.ts). GET: this account's state (a tester or not, and which built features it turned
// on). POST: a tester turns one built feature on or off for itself. Only the signed-in account's own record.

const actionSchema = z.object({ feature: z.enum(LAB_IDS as [string, ...string[]]), on: z.boolean() }).strict();

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  const owner = isOwnerAccount(user);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    await rateLimit('labs-read', user.id, 60, 60);
    res.json({ labs: labState(await loadLabs(user.id), owner) });
    return;
  }
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'ข้อมูลฟีเจอร์ทดลองไม่ถูกต้อง');
  const feature = parsed.data.feature as (typeof LAB_IDS)[number];
  if (!labState(await loadLabs(user.id), owner).tester) throw new HttpError(403, 'ฟีเจอร์ทดลองเปิดให้เฉพาะบัญชีทดสอบ');
  if (parsed.data.on && !labReady(feature)) throw new HttpError(409, 'ฟีเจอร์นี้ยังสร้างไม่เสร็จ');
  await rateLimit('labs-write', user.id, 30, 60);
  res.json({ labs: labState(await setLabFeature(user.id, feature, parsed.data.on), owner) });
}, { csrf: true });
