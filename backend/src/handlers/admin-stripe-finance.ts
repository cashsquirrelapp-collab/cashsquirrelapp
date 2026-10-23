import { z } from 'zod';
import { configuredStripeLivemode, getStripe } from '../config/stripe.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { canViewAdminAnalytics } from '../security/adminAnalyticsAccess.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { loadAdminStripeFinance } from '../services/adminStripeFinance.js';

const querySchema = z.object({ range: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30) });

export default withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  if (!canViewAdminAnalytics(user, await systemRole(user.id))) {
    throw new HttpError(403, 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น');
  }
  await rateLimit('admin-stripe-finance', user.id, 20, 60);
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'ช่วงเวลาสถิติไม่ถูกต้อง');
  // Authenticate and verify the current owner role before initializing Stripe or
  // reading account-wide finance. This endpoint never changes billing state.
  const result = await loadAdminStripeFinance(getStripe(), parsed.data.range, { livemode: configuredStripeLivemode() });
  res.status(200).json(result);
});
