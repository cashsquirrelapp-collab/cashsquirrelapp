import { appOrigin, required } from '../config/env.js';
import { stripe } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';

const managedStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']);

export default withGuard(async (req, res) => {
  const user = await requireUser(req, res);
  await rateLimit('billing', user.id, req.method === 'POST' ? 12 : 60, 60);
  const admin = getSupabaseAdmin();
  const subscription = await admin
    .from('subscriptions')
    .select('status,plan,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (subscription.error) throw subscription.error;

  if (req.method === 'GET') {
    const row = subscription.data;
    res.json({ subscription: row ? {
      status: row.status,
      plan: row.plan,
      current_period_end: row.current_period_end,
      cancel_at_period_end: row.cancel_at_period_end,
      managed: Boolean(row.stripe_customer_id && row.stripe_subscription_id),
    } : null });
    return;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  if (subscription.data?.plan === 'admin_revoked') throw new HttpError(403, 'บัญชีนี้ถูกระงับสิทธิ์ Pro กรุณาติดต่อผู้ดูแล');
  if (subscription.data?.plan === 'admin_grant') throw new HttpError(409, 'บัญชีนี้ได้รับสิทธิ์ Pro จากผู้ดูแลอยู่แล้ว');

  const action = req.body?.action;
  const customerId = subscription.data?.stripe_customer_id || null;
  const hasManagedSubscription = Boolean(
    customerId
    && subscription.data?.stripe_subscription_id
    && managedStatuses.has(subscription.data.status),
  );
  if (action === 'portal' || (action === 'checkout' && hasManagedSubscription)) {
    if (!customerId) throw new HttpError(409, 'ยังไม่มีการสมัครสมาชิก Stripe สำหรับบัญชีนี้');
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appOrigin()}/app`,
    });
    res.json({ url: portal.url, destination: 'portal' });
    return;
  }
  if (action !== 'checkout') throw new HttpError(400, 'Invalid billing action');

  const metadata = {
    app_user_id: user.id,
    workspace_type: 'personal',
    workspace_id: user.id,
  };
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: required('STRIPE_PRO_PRICE_ID'), quantity: 1 }],
    ...(customerId ? { customer: customerId } : { customer_email: user.email }),
    client_reference_id: user.id,
    metadata,
    subscription_data: { metadata },
    success_url: `${appOrigin()}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin()}/app?checkout=cancel`,
  }, {
    idempotencyKey: `pro-checkout:${user.id}:${Math.floor(Date.now() / 300000)}`,
  });
  if (!checkout.url) throw new Error('Stripe Checkout did not return a URL');
  res.json({ url: checkout.url, destination: 'checkout' });
}, { csrf: true });
