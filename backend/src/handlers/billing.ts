import { CARD_CONSENT_VERSION } from '../../../shared/cardConsent.js';
import { stopAutoRenewal } from '../services/cardRenewals.js';
import { directQrStatus } from '../services/directPromptPay.js';
import { appOrigin } from '../config/env.js';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { getStripeBillingPortalConfiguration, isStripeCustomerOwnedByUser } from '../services/stripeSubscriptions.js';
import { billingTimings, cancelPrepaidCheckout, prepaidEnabled, startPrepaidCheckout } from '../services/prepaidBilling.js';

export default withGuard(async (req, res) => {
  const timing = billingTimings();
  try {
    const user = await timing.measure('auth', () => requireUser(req, res));
    // Status polling must not exhaust the separate mutation budget.
    const limit = () => timing.measure('rate_limit', () => rateLimit(req.method === 'POST' ? 'billing-write' : 'billing-read', user.id, req.method === 'POST' ? 12 : 60, 60));
    if (req.method === 'GET' && req.query.order_id !== undefined) {
      await limit();
      if (typeof req.query.order_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(req.query.order_id)) throw new HttpError(400, 'Invalid order');
      res.json(await directQrStatus(user.id, req.query.order_id)); return;
    }
    const admin = getSupabaseAdmin();
    const [, result] = await Promise.all([limit(), timing.measure('eligibility', () =>
      admin.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle())]);
    if (result.error) throw result.error;
    const row = result.data;
    if (req.method === 'GET') {
      // Read only authoritative database state; a success query string never grants access.
      res.json({ checkout_ready: prepaidEnabled() && row?.plan !== 'admin_revoked', subscription: row ? {
        status: row.status, plan: row.plan, current_period_end: row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end, stripe_status: row.stripe_subscription_status,
        has_subscription: Boolean(row.stripe_subscription_id), managed: Boolean(row.stripe_customer_id),
        intro_eligible: false, intro_paid_cycles: row.stripe_intro_paid_cycles || 0,
        promptpay_checkout: null,
        custom_card_subscription: row.card_subscription_id != null,
      } : null });
      return;
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    if (req.body?.action === 'cancel_checkout') {
      if (typeof req.body.order_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(req.body.order_id)
        || Object.keys(req.body).some(key => !['action','order_id'].includes(key))) {
        throw new HttpError(400, 'Invalid cancellation fields');
      }
      res.json(await cancelPrepaidCheckout(user.id, req.body.order_id));
      return;
    }
    if (req.body?.action === 'stop_auto_renewal') {
      if (Object.keys(req.body).some(key => key !== 'action')) throw new HttpError(400, 'Invalid fields');
      res.json(await stopAutoRenewal(user.id)); return;
    }
    if (req.body?.action === 'portal') {
      if (!row?.stripe_customer_id) throw new HttpError(409, 'ยังไม่มีบัญชีลูกค้า Stripe');
      const [customer, configuration] = await Promise.all([
        stripe.customers.retrieve(row.stripe_customer_id), getStripeBillingPortalConfiguration(),
      ]);
      if (!isStripeCustomerOwnedByUser(customer, user.id, configuredStripeLivemode())) throw new Error('Invalid Stripe Customer');
      const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, configuration: configuration.id,
        return_url: `${appOrigin()}/app` });
      res.json({ url: portal.url, destination: 'portal' });
      return;
    }
    if (!['checkout','promptpay_checkout'].includes(req.body?.action)) throw new HttpError(400, 'Invalid billing action');
    // No client-supplied amount, duration, Stripe Price, account or URL is trusted.
    const allowed = new Set(['action','period','autoRenew','saveCard','consentVersion']);
    if (Object.keys(req.body).some(key => !allowed.has(key))) throw new HttpError(400, 'Invalid checkout fields');
    if (row?.plan === 'admin_revoked') throw new HttpError(403, 'บัญชีนี้ถูกแบน Pro กรุณาติดต่อแอดมินเพื่อปลดแบน', 'PRO_BANNED');
    const customCard = req.body.action === 'checkout' && process.env.KRAROK_CUSTOM_CARD_ENABLED === 'true';
    if (req.body.action === 'promptpay_checkout' && ['autoRenew','saveCard','consentVersion'].some(key => key in req.body)) throw new HttpError(400, 'Invalid QR options');
    if (customCard && (typeof req.body.autoRenew !== 'boolean' || typeof req.body.saveCard !== 'boolean'
      || req.body.consentVersion !== CARD_CONSENT_VERSION || (req.body.autoRenew && !req.body.saveCard))) throw new HttpError(400, 'กรุณายืนยันตัวเลือกบัตรอีกครั้ง');
    res.json(await startPrepaidCheckout(user, req.body.period, req.body.action === 'promptpay_checkout' ? 'promptpay' : 'card', customCard ? { autoRenew: req.body.autoRenew, saveCard: req.body.saveCard, consentVersion: req.body.consentVersion } : undefined, timing));
  } finally {
    if (req.method === 'POST' && ['checkout', 'promptpay_checkout'].includes(req.body?.action)) timing.finish();
  }
}, { csrf: true });
