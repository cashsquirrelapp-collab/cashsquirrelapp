import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { appOrigin } from '../config/env.js';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import {
  getStripeBillingCatalog,
  getStripeBillingPortalConfiguration,
  isStripeCustomerOwnedByUser,
  PRO_OFFER_VERSION,
  PRO_STANDARD_OFFER_VERSION,
} from '../services/stripeSubscriptions.js';

type BillingRow = {
  status: string;
  plan: string | null;
  current_period_end: string | null;
  legacy_current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_intro_redeemed_at: string | null;
  stripe_checkout_reservation_id: string | null;
  stripe_checkout_session_id: string | null;
};

type Reservation = {
  result: 'reserved' | 'pending' | 'managed' | 'legacy_active' | 'recurring_access' | 'account_closing' | 'mode_mismatch' | 'admin_grant' | 'admin_revoked';
  customer_id?: string | null;
  intro_eligible?: boolean;
  legacy_until?: string;
};

const nonterminalStripeStatuses = new Set<Stripe.Subscription.Status>([
  'incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused',
]);

function id(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id || null;
}

function assertManagedCustomer(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  userId: string,
  livemode: boolean,
): asserts customer is Stripe.Customer {
  if ('deleted' in customer && customer.deleted) throw new HttpError(409, 'บัญชีลูกค้า Stripe นี้ถูกลบแล้ว กรุณาติดต่อผู้ดูแล');
  if (!isStripeCustomerOwnedByUser(customer, userId, livemode)) {
    throw new Error('Stored Stripe Customer ownership metadata or mode is invalid');
  }
}

async function createPortal(customerId: string, userId: string): Promise<string> {
  const livemode = configuredStripeLivemode();
  const [customer, configuration] = await Promise.all([
    stripe.customers.retrieve(customerId),
    getStripeBillingPortalConfiguration(),
  ]);
  assertManagedCustomer(customer, userId, livemode);
  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    configuration: configuration.id,
    return_url: `${appOrigin()}/app`,
  });
  return portal.url;
}

export default withGuard(async (req, res) => {
  const user = await requireUser(req, res);
  await rateLimit('billing', user.id, req.method === 'POST' ? 12 : 60, 60);
  const admin = getSupabaseAdmin();
  const subscription = await admin
    .from('subscriptions')
    .select('status,plan,current_period_end,legacy_current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_intro_redeemed_at,stripe_checkout_reservation_id,stripe_checkout_session_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (subscription.error) throw subscription.error;
  const row = subscription.data as BillingRow | null;

  if (req.method === 'GET') {
    res.json({ subscription: row ? {
      status: row.status,
      plan: row.plan,
      current_period_end: row.current_period_end,
      cancel_at_period_end: row.cancel_at_period_end,
      stripe_status: row.stripe_subscription_status,
      has_subscription: Boolean(row.stripe_subscription_id),
      intro_eligible: row.stripe_intro_redeemed_at === null,
      managed: Boolean(row.stripe_customer_id),
    } : null });
    return;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const action = req.body?.action;
  const customerId = row?.stripe_customer_id || null;
  // A Stripe Customer can still need invoice/payment-method access while an
  // administrator grant or revocation controls app entitlement.
  if (action === 'portal') {
    if (!customerId) throw new HttpError(409, 'ยังไม่มีบัญชีลูกค้า Stripe สำหรับบัญชีนี้');
    res.json({ url: await createPortal(customerId, user.id), destination: 'portal' });
    return;
  }
  if (action !== 'checkout') throw new HttpError(400, 'Invalid billing action');
  if (row?.plan === 'admin_revoked') throw new HttpError(403, 'บัญชีนี้ถูกระงับสิทธิ์ Pro กรุณาติดต่อผู้ดูแล');
  if (row?.plan === 'admin_grant') throw new HttpError(409, 'บัญชีนี้ได้รับสิทธิ์ Pro จากผู้ดูแลอยู่แล้ว');
  if (row?.legacy_current_period_end && new Date(row.legacy_current_period_end).getTime() > Date.now()) {
    throw new HttpError(409, 'สิทธิ์ Pro แบบเดิมยังใช้งานได้ กรุณาสมัครรายเดือนหลังสิทธิ์เดิมหมดอายุ');
  }

  if (row?.stripe_checkout_session_id && row.stripe_checkout_reservation_id) {
    const existing = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
    if (existing.livemode !== configuredStripeLivemode()
      || existing.mode !== 'subscription'
      || existing.client_reference_id !== user.id
      || existing.metadata?.app_user_id !== user.id
      || existing.metadata?.workspace_type !== 'personal'
      || existing.metadata?.workspace_id !== user.id
      || id(existing.customer) !== customerId) {
      throw new Error('Stored Stripe Checkout ownership or mode is invalid');
    }
    if (existing.status === 'open' && existing.url) {
      res.json({ url: existing.url, destination: 'checkout' });
      return;
    }
    if (existing.status === 'complete') {
      if (!customerId) throw new Error('Completed Stripe Checkout is missing its Customer');
      res.json({ url: await createPortal(customerId, user.id), destination: 'portal' });
      return;
    }
    if (existing.status === 'expired') {
      const released = await admin.rpc('cashflow_release_subscription_checkout', {
        p_user_id: user.id,
        p_reservation_id: row.stripe_checkout_reservation_id,
      });
      if (released.error) throw released.error;
    }
  }

  const catalog = await getStripeBillingCatalog();
  const reservationId = randomUUID();
  const checkoutExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
  const pendingUntil = new Date((checkoutExpiresAt + 5 * 60) * 1000).toISOString();
  const reserved = await admin.rpc('cashflow_reserve_subscription_checkout', {
    p_user_id: user.id,
    p_reservation_id: reservationId,
    p_pending_until: pendingUntil,
    p_livemode: catalog.livemode,
  });
  if (reserved.error) throw reserved.error;
  const reservation = reserved.data as Reservation;
  if (reservation.result === 'managed') {
    if (!reservation.customer_id) throw new Error('Managed subscription is missing its Stripe Customer');
    res.json({ url: await createPortal(reservation.customer_id, user.id), destination: 'portal' });
    return;
  }
  if (reservation.result === 'legacy_active') throw new HttpError(409, 'สิทธิ์ Pro แบบเดิมยังใช้งานได้ กรุณาสมัครรายเดือนหลังสิทธิ์เดิมหมดอายุ');
  if (reservation.result === 'recurring_access') throw new HttpError(409, 'สิทธิ์รายเดือนที่ชำระแล้วยังใช้งานได้ กรุณาสมัครใหม่หลังสิทธิ์หมดอายุ');
  if (reservation.result === 'pending') throw new HttpError(409, 'มีหน้าชำระเงินที่กำลังใช้งานอยู่ กรุณาดำเนินการหรือรอให้หมดอายุ');
  if (reservation.result === 'account_closing') throw new HttpError(409, 'ไม่สามารถเริ่มสมัครสมาชิกระหว่างพักหรือปิดบัญชี');
  if (reservation.result === 'mode_mismatch') throw new Error('Stripe mode does not match the stored billing account');
  if (reservation.result === 'admin_revoked') throw new HttpError(403, 'บัญชีนี้ถูกระงับสิทธิ์ Pro กรุณาติดต่อผู้ดูแล');
  if (reservation.result === 'admin_grant') throw new HttpError(409, 'บัญชีนี้ได้รับสิทธิ์ Pro จากผู้ดูแลอยู่แล้ว');
  if (reservation.result !== 'reserved') throw new Error('Unexpected checkout reservation result');

  let checkout: Stripe.Checkout.Session | undefined;
  try {
    let stableCustomerId = reservation.customer_id || null;
    if (stableCustomerId) {
      const customer = await stripe.customers.retrieve(stableCustomerId);
      assertManagedCustomer(customer, user.id, catalog.livemode);
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { app_user_id: user.id, workspace_type: 'personal', workspace_id: user.id },
      }, { idempotencyKey: `cash-squirrel-customer:${catalog.livemode ? 'live' : 'test'}:${user.id}` });
      const bound = await admin.rpc('cashflow_bind_stripe_customer', {
        p_user_id: user.id,
        p_reservation_id: reservationId,
        p_customer_id: customer.id,
        p_livemode: catalog.livemode,
      });
      if (bound.error) throw bound.error;
      stableCustomerId = bound.data as string;
    }

    // The database reservation serializes app requests, while this Stripe-side
    // check catches a delayed/missed webhook or an externally-created managed
    // subscription before a second recurring charge can be started.
    const stripeSubscriptions = await stripe.subscriptions
      .list({ customer: stableCustomerId, status: 'all', limit: 100 })
      .autoPagingToArray({ limit: 101 });
    if (stripeSubscriptions.some(item => nonterminalStripeStatuses.has(item.status))) {
      const released = await admin.rpc('cashflow_release_subscription_checkout', {
        p_user_id: user.id,
        p_reservation_id: reservationId,
      });
      if (released.error) throw released.error;
      res.json({ url: await createPortal(stableCustomerId, user.id), destination: 'portal' });
      return;
    }

    const introEligible = reservation.intro_eligible === true;
    const metadata = {
      app_user_id: user.id,
      workspace_type: 'personal',
      workspace_id: user.id,
      offer_version: introEligible ? PRO_OFFER_VERSION : PRO_STANDARD_OFFER_VERSION,
      checkout_reservation_id: reservationId,
    };
    checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stableCustomerId,
      line_items: [{ price: catalog.priceId, quantity: 1 }],
      ...(introEligible ? { discounts: [{ coupon: catalog.couponId }] } : {}),
      client_reference_id: user.id,
      metadata,
      subscription_data: { metadata },
      expires_at: checkoutExpiresAt,
      custom_text: {
        submit: { message: introEligible
          ? '3 เดือนแรก ฿199/เดือน จากนั้นต่ออายุอัตโนมัติ ฿249/เดือน ยกเลิกได้ โดยสิทธิ์ยังใช้ได้ถึงวันสิ้นรอบที่ชำระแล้ว'
          : 'ต่ออายุอัตโนมัติ ฿249/เดือน ยกเลิกได้ โดยสิทธิ์ยังใช้ได้ถึงวันสิ้นรอบที่ชำระแล้ว' },
      },
      success_url: `${appOrigin()}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin()}/app?checkout=cancel`,
    }, { idempotencyKey: `cash-squirrel-pro-checkout:${reservationId}` });
    if (!checkout.url) throw new Error('Stripe Checkout did not return a URL');

    const attached = await admin.rpc('cashflow_attach_subscription_checkout', {
      p_user_id: user.id,
      p_reservation_id: reservationId,
      p_session_id: checkout.id,
      p_pending_until: pendingUntil,
    });
    if (attached.error) throw attached.error;
    if (attached.data !== true) {
      await stripe.checkout.sessions.expire(checkout.id);
      throw new Error('Checkout reservation expired before the session was attached');
    }
    res.json({ url: checkout.url, destination: 'checkout' });
  } catch (error) {
    let safeToRelease = !checkout;
    if (checkout?.id && checkout.status === 'open') {
      try {
        const expired = await stripe.checkout.sessions.expire(checkout.id);
        safeToRelease = expired.status === 'expired';
      } catch {
        // Keep the reservation when Stripe did not confirm expiration: an open
        // hosted session must never become an untracked second subscription.
        safeToRelease = false;
      }
    }
    if (safeToRelease) {
      const released = await admin.rpc('cashflow_release_subscription_checkout', {
        p_user_id: user.id,
        p_reservation_id: reservationId,
      });
      if (released.error) throw released.error;
    }
    throw error;
  }
}, { csrf: true });
