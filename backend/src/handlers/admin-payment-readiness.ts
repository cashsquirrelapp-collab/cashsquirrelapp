import { configuredStripeLivemode, getStripe } from '../config/stripe.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { canViewAdminAnalytics } from '../security/adminAnalyticsAccess.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { createMissingPrices, paymentReadiness } from '../services/paymentReadiness.js';

// The admin page's payment check (owner, 2026-10-27): owner only, like the Stripe money view. GET reads Stripe and changes
// nothing; POST { action: 'create_prices' } is the owner's button that creates the missing Pro prices, then reads again.
export default withGuard(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  if (!canViewAdminAnalytics(user, await systemRole(user.id))) throw new HttpError(403, 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น');
  if (req.method === 'POST') {
    if (req.body?.action !== 'create_prices' || Object.keys(req.body).length !== 1) throw new HttpError(400, 'Invalid action');
    await rateLimit('admin-payment-prices', user.id, 3, 600);
  } else await rateLimit('admin-payment-readiness', user.id, 20, 60);
  // Authenticate and verify the owner before initializing Stripe.
  const stripe = getStripe();
  const livemode = configuredStripeLivemode();
  const created = req.method === 'POST' ? await createMissingPrices(stripe, livemode) : undefined;
  res.status(200).json({ ...await paymentReadiness(stripe, livemode), ...(created === undefined ? {} : { created }) });
});
