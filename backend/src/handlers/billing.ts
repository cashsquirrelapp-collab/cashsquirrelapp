import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type Stripe from 'stripe';
import { appOrigin } from '../config/env.js';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import {
  buildPromptPayCheckoutRequest,
  buildStripeSubscriptionCheckoutRequest,
  getStripeBillingCatalog,
  getStripeBillingPortalConfiguration,
  getStripeIntroCoupon,
  isStripeCustomerOwnedByUser,
  PRO_INTRO_MONTHS,
  PRO_INTRO_TOTAL,
  PRO_MONTHLY_AMOUNT,
  PRO_OFFER_VERSION,
  PRO_STANDARD_OFFER_VERSION,
  PROMPTPAY_OFFER_VERSION,
  subscriptionRecord,
} from '../services/stripeSubscriptions.js';

type BillingRow = {
  status: string;
  plan: string | null;
  current_period_end: string | null;
  legacy_current_period_end: string | null;
  manual_current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_intro_paid_cycles: number;
  stripe_checkout_reservation_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_checkout_expires_at: string | null;
  stripe_checkout_pending_until: string | null;
  stripe_checkout_method: 'card' | 'promptpay' | null;
  stripe_checkout_url: string | null;
  stripe_checkout_intro_cycles_remaining: number | null;
};

type Reservation = {
  result: 'reserved' | 'resumed' | 'pending' | 'managed' | 'legacy_active' | 'recurring_access' | 'account_closing' | 'mode_mismatch' | 'admin_grant' | 'admin_revoked';
  customer_id?: string | null;
  intro_eligible?: boolean;
  intro_cycles_remaining?: number;
  method?: 'card' | 'promptpay' | null;
  url?: string | null;
  legacy_until?: string;
  reservation_id?: string;
  session_id?: string | null;
  expires_at?: string;
  pending_until?: string;
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

function unixSeconds(value: string | undefined, field: string): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`Checkout reservation has an invalid ${field}`);
  return Math.floor(parsed / 1000);
}

function assertPreparedCheckoutRequest(
  request: unknown,
  expected: Stripe.Checkout.SessionCreateParams,
): asserts request is Stripe.Checkout.SessionCreateParams {
  if (!request || typeof request !== 'object' || !isDeepStrictEqual(request, expected)) {
    throw new Error('Prepared Stripe Checkout request does not exactly match its reservation');
  }
}

function promptPaySessionAmount(session: Stripe.Checkout.Session): number {
  const cycle = Number(session.metadata?.intro_cycle);
  const amount = cycle <= PRO_INTRO_MONTHS ? PRO_INTRO_TOTAL : PRO_MONTHLY_AMOUNT;
  const paymentMethods = session.payment_method_types || [];
  if (session.metadata?.offer_version !== PROMPTPAY_OFFER_VERSION
    || session.metadata?.billing_method !== 'promptpay'
    || !Number.isInteger(cycle) || cycle < 1 || cycle > PRO_INTRO_MONTHS + 1
    || session.currency !== 'thb'
    || session.amount_total !== amount
    || paymentMethods.length !== 1 || paymentMethods[0] !== 'promptpay'
    || !Number.isInteger(session.expires_at) || session.expires_at <= 0) {
    throw new Error('PromptPay Checkout amount, method, or offer metadata is invalid');
  }
  return amount;
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

async function hasNonterminalStripeSubscription(customerId: string): Promise<boolean> {
  let found = false;
  await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
    .autoPagingEach(item => {
      if (!nonterminalStripeStatuses.has(item.status)) return true;
      found = true;
      return false;
    });
  return found;
}

export default withGuard(async (req, res) => {
  const user = await requireUser(req, res);
  await rateLimit('billing', user.id, req.method === 'POST' ? 12 : 60, 60);
  const admin = getSupabaseAdmin();
  const subscription = await admin
    .from('subscriptions')
    .select('status,plan,current_period_end,legacy_current_period_end,manual_current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_intro_paid_cycles,stripe_checkout_reservation_id,stripe_checkout_session_id,stripe_checkout_expires_at,stripe_checkout_pending_until,stripe_checkout_method,stripe_checkout_url,stripe_checkout_intro_cycles_remaining')
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
      intro_eligible: row.stripe_intro_paid_cycles < PRO_INTRO_MONTHS,
      intro_paid_cycles: row.stripe_intro_paid_cycles,
      managed: Boolean(row.stripe_customer_id),
      promptpay_checkout: row.stripe_checkout_method === 'promptpay'
        && row.stripe_checkout_session_id && row.stripe_checkout_url && row.stripe_checkout_expires_at
        ? {
          url: row.stripe_checkout_url,
          expires_at: row.stripe_checkout_expires_at,
          amount: (row.stripe_checkout_intro_cycles_remaining || 0) > 0 ? PRO_INTRO_TOTAL : PRO_MONTHLY_AMOUNT,
          status: Date.parse(row.stripe_checkout_expires_at) > Date.now() ? 'open' : 'expired',
        } : null,
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
  if (!['checkout', 'promptpay_checkout'].includes(action)) throw new HttpError(400, 'Invalid billing action');
  const checkoutMethod: 'card' | 'promptpay' = action === 'promptpay_checkout' ? 'promptpay' : 'card';
  if (row?.plan === 'admin_revoked') throw new HttpError(403, 'บัญชีนี้ถูกระงับสิทธิ์ Pro กรุณาติดต่อผู้ดูแล');
  if (row?.plan === 'admin_grant') throw new HttpError(409, 'บัญชีนี้ได้รับสิทธิ์ Pro จากผู้ดูแลอยู่แล้ว');
  if ([row?.legacy_current_period_end, row?.manual_current_period_end]
    .some(end => end && new Date(end).getTime() > Date.now())) {
    throw new HttpError(409, 'สิทธิ์ Pro แบบเดิมยังใช้งานได้ กรุณาสมัครรายเดือนหลังสิทธิ์เดิมหมดอายุ');
  }

  const catalog = await getStripeBillingCatalog();
  const recoverCompletedCheckout = async (
    session: Stripe.Checkout.Session,
    checkoutReservationId: string,
    checkoutCustomerId: string,
  ): Promise<void> => {
    const subscriptionId = id(session.subscription);
    if (!subscriptionId) throw new Error('Completed Stripe Checkout is missing its Subscription');
    const canonicalSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['discounts.source.coupon'],
    });
    const record = subscriptionRecord(canonicalSubscription, catalog);
    const offerVersion = session.metadata?.offer_version;
    const introCycles = Number(session.metadata?.intro_cycles_remaining || '0');
    if (!record
      || record.userId !== user.id
      || record.workspaceId !== user.id
      || record.customerId !== checkoutCustomerId
      || session.metadata?.workspace_type !== 'personal'
      || ![PRO_OFFER_VERSION, PRO_STANDARD_OFFER_VERSION].includes(offerVersion || '')
      || !Number.isInteger(introCycles) || introCycles < 0 || introCycles > PRO_INTRO_MONTHS
      || (offerVersion === PRO_OFFER_VERSION) !== (introCycles > 0)
      || record.introCouponMonths !== (introCycles || null)) {
      throw new Error('Completed Stripe Checkout Subscription failed canonical validation');
    }
    const recovered = await admin.rpc('cashflow_recover_completed_subscription_checkout', {
      p_user_id: user.id,
      p_reservation_id: checkoutReservationId,
      p_session_id: session.id,
      p_customer_id: record.customerId,
      p_subscription_id: record.subscriptionId,
      p_subscription_created: record.subscriptionCreated,
      p_price_id: record.priceId,
      p_livemode: catalog.livemode,
      p_status: record.status,
      p_billing_period_end: record.billingPeriodEnd,
      p_cancel_at_period_end: record.cancelAtPeriodEnd,
    });
    if (recovered.error) throw recovered.error;
    if (recovered.data !== true) throw new Error('Completed Checkout reservation changed during recovery');
  };
  if (row?.stripe_checkout_session_id && row.stripe_checkout_reservation_id) {
    const existing = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
    const storedMethod = row.stripe_checkout_method || 'card';
    const expectedMode = storedMethod === 'promptpay' ? 'payment' : 'subscription';
    if (existing.livemode !== configuredStripeLivemode()
      || existing.mode !== expectedMode
      || existing.client_reference_id !== user.id
      || existing.metadata?.app_user_id !== user.id
      || existing.metadata?.workspace_type !== 'personal'
      || existing.metadata?.workspace_id !== user.id
      || existing.metadata?.checkout_reservation_id !== row.stripe_checkout_reservation_id
      || id(existing.customer) !== customerId) {
      throw new Error('Stored Stripe Checkout ownership or mode is invalid');
    }
    if (existing.status === 'open' && existing.url) {
      if (!customerId) throw new Error('Stored Stripe Checkout is missing its Customer');
      const customer = await stripe.customers.retrieve(customerId);
      assertManagedCustomer(customer, user.id, catalog.livemode);
      const locallyExpired = Boolean(row.stripe_checkout_expires_at
        && Date.parse(row.stripe_checkout_expires_at) <= Date.now());
      if (locallyExpired || await hasNonterminalStripeSubscription(customerId)) {
        const expired = await stripe.checkout.sessions.expire(existing.id);
        if (expired.status !== 'expired') throw new Error('Could not expire overlapping Stripe Checkout');
        const released = await admin.rpc('cashflow_release_billing_checkout', {
          p_user_id: user.id,
          p_reservation_id: row.stripe_checkout_reservation_id,
        });
        if (released.error) throw released.error;
        if (!locallyExpired) {
          res.json({ url: await createPortal(customerId, user.id), destination: 'portal' });
          return;
        }
      } else if (storedMethod === 'promptpay') {
        res.json({
          url: existing.url,
          destination: 'promptpay',
          expiresAt: new Date(existing.expires_at * 1000).toISOString(),
          amount: promptPaySessionAmount(existing),
        });
        return;
      } else {
        res.json({ url: existing.url, destination: 'checkout' });
        return;
      }
    }
    if (existing.status === 'complete') {
      if (!customerId) throw new Error('Completed Stripe Checkout is missing its Customer');
      if (storedMethod === 'promptpay') {
        const hostedUrl = existing.url || row.stripe_checkout_url;
        if (!hostedUrl) throw new Error('Completed PromptPay Checkout is missing its hosted URL');
        res.json({
          url: hostedUrl,
          destination: 'promptpay_pending',
          expiresAt: new Date(existing.expires_at * 1000).toISOString(),
          amount: promptPaySessionAmount(existing),
        });
        return;
      }
      await recoverCompletedCheckout(existing, row.stripe_checkout_reservation_id, customerId);
      res.json({ url: await createPortal(customerId, user.id), destination: 'portal' });
      return;
    }
    if (existing.status === 'expired') {
      const released = await admin.rpc('cashflow_release_billing_checkout', {
        p_user_id: user.id,
        p_reservation_id: row.stripe_checkout_reservation_id,
      });
      if (released.error) throw released.error;
    }
  }

  let reservationId: string = randomUUID();
  // PromptPay uses the Stripe minimum plus a small network allowance so the
  // request still has a full 30 minutes when Stripe evaluates it. The visible
  // countdown always uses Stripe's returned authoritative expires_at.
  let checkoutExpiresAt = Math.floor(Date.now() / 1000)
    + (checkoutMethod === 'promptpay' ? 30 * 60 + 30 : 45 * 60);
  let pendingUntil = new Date((checkoutExpiresAt + 5 * 60) * 1000).toISOString();
  const reserved = await admin.rpc('cashflow_reserve_billing_checkout', {
    p_user_id: user.id,
    p_reservation_id: reservationId,
    p_method: checkoutMethod,
    p_expires_at: new Date(checkoutExpiresAt * 1000).toISOString(),
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
  let reservedMethod: 'card' | 'promptpay' = reservation.method || checkoutMethod;
  if (reservation.result === 'resumed') {
    if (!reservation.reservation_id || !reservation.expires_at || !reservation.pending_until) {
      throw new Error('Resumed Checkout reservation is incomplete');
    }
    reservationId = reservation.reservation_id;
    reservedMethod = reservation.method || checkoutMethod;
    checkoutExpiresAt = unixSeconds(reservation.expires_at, 'expiry');
    pendingUntil = new Date(unixSeconds(reservation.pending_until, 'pending deadline') * 1000).toISOString();
    if (reservation.session_id) {
      const existing = await stripe.checkout.sessions.retrieve(reservation.session_id);
      const expectedMode = reservedMethod === 'promptpay' ? 'payment' : 'subscription';
      if (existing.livemode !== catalog.livemode
        || existing.mode !== expectedMode
        || existing.client_reference_id !== user.id
        || existing.metadata?.app_user_id !== user.id
        || existing.metadata?.workspace_type !== 'personal'
        || existing.metadata?.workspace_id !== user.id
        || existing.metadata?.checkout_reservation_id !== reservationId
        || id(existing.customer) !== reservation.customer_id) {
        throw new Error('Resumed Stripe Checkout ownership or mode is invalid');
      }
      if (existing.status === 'open' && existing.url) {
        if (!reservation.customer_id) throw new Error('Resumed Stripe Checkout is missing its Customer');
        const customer = await stripe.customers.retrieve(reservation.customer_id);
        assertManagedCustomer(customer, user.id, catalog.livemode);
        if (await hasNonterminalStripeSubscription(reservation.customer_id)) {
          const expired = await stripe.checkout.sessions.expire(existing.id);
          if (expired.status !== 'expired') throw new Error('Could not expire overlapping Stripe Checkout');
          const released = await admin.rpc('cashflow_release_billing_checkout', {
            p_user_id: user.id,
            p_reservation_id: reservationId,
          });
          if (released.error) throw released.error;
          res.json({ url: await createPortal(reservation.customer_id, user.id), destination: 'portal' });
          return;
        }
        if (reservedMethod === 'promptpay') {
          res.json({
            url: existing.url,
            destination: 'promptpay',
            expiresAt: new Date(existing.expires_at * 1000).toISOString(),
            amount: promptPaySessionAmount(existing),
          });
        } else res.json({ url: existing.url, destination: 'checkout' });
        return;
      }
      if (existing.status === 'complete') {
        if (!reservation.customer_id) throw new Error('Completed Stripe Checkout is missing its Customer');
        if (reservedMethod === 'promptpay') {
          const hostedUrl = existing.url || reservation.url;
          if (!hostedUrl) throw new Error('Completed PromptPay Checkout is missing its hosted URL');
          res.json({
            url: hostedUrl,
            destination: 'promptpay_pending',
            expiresAt: new Date(existing.expires_at * 1000).toISOString(),
            amount: promptPaySessionAmount(existing),
          });
          return;
        }
        await recoverCompletedCheckout(existing, reservationId, reservation.customer_id);
        res.json({ url: await createPortal(reservation.customer_id, user.id), destination: 'portal' });
        return;
      }
      if (existing.status === 'expired') {
        const released = await admin.rpc('cashflow_release_billing_checkout', {
          p_user_id: user.id,
          p_reservation_id: reservationId,
        });
        if (released.error) throw released.error;
        throw new HttpError(409, 'หน้าชำระเงินหมดอายุแล้ว กรุณาลองใหม่');
      }
    }
  } else if (reservation.result !== 'reserved') {
    throw new Error('Unexpected checkout reservation result');
  }

  let checkout: Stripe.Checkout.Session | undefined;
  let checkoutCreateAttempted = false;
  let checkoutConfirmedExpired = false;
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
    const hasNonterminalSubscription = await hasNonterminalStripeSubscription(stableCustomerId);
    if (hasNonterminalSubscription) {
      const released = await admin.rpc('cashflow_release_billing_checkout', {
        p_user_id: user.id,
        p_reservation_id: reservationId,
      });
      if (released.error) throw released.error;
      res.json({ url: await createPortal(stableCustomerId, user.id), destination: 'portal' });
      return;
    }

    const introCyclesRemaining = reservation.intro_cycles_remaining
      ?? (reservation.intro_eligible ? PRO_INTRO_MONTHS : 0);
    const introCycle = Math.min(PRO_INTRO_MONTHS + 1, PRO_INTRO_MONTHS - introCyclesRemaining + 1);
    const introCouponId = reservedMethod === 'card'
      ? await getStripeIntroCoupon({
        userId: user.id,
        reservationId,
        months: introCyclesRemaining,
        catalog,
      }) : null;
    const candidateRequest = reservedMethod === 'promptpay'
      ? buildPromptPayCheckoutRequest({
        userId: user.id,
        customerId: stableCustomerId,
        reservationId,
        introCycle,
        expiresAt: checkoutExpiresAt,
        origin: appOrigin(),
      })
      : buildStripeSubscriptionCheckoutRequest({
        userId: user.id,
        customerId: stableCustomerId,
        reservationId,
        introCyclesRemaining,
        introCouponId,
        expiresAt: checkoutExpiresAt,
        origin: appOrigin(),
        catalog,
      });
    const prepared = await admin.rpc('cashflow_prepare_subscription_checkout', {
      p_user_id: user.id,
      p_reservation_id: reservationId,
      p_request: candidateRequest,
    });
    if (prepared.error) throw prepared.error;
    assertPreparedCheckoutRequest(prepared.data, candidateRequest);
    checkoutCreateAttempted = true;
    checkout = await stripe.checkout.sessions.create(
      prepared.data,
      { idempotencyKey: reservedMethod === 'card'
        ? `cash-squirrel-pro-checkout:${reservationId}`
        : `cash-squirrel-promptpay-checkout:${reservationId}` },
    );
    if (checkout.status === 'expired') {
      checkoutConfirmedExpired = true;
      throw new HttpError(409, 'หน้าชำระเงินหมดอายุแล้ว กรุณาลองใหม่');
    }
    if (checkout.status === 'complete') {
      if (!checkout.url) throw new Error('Completed Stripe Checkout is missing its hosted URL');
      const attachedComplete = await admin.rpc('cashflow_attach_billing_checkout', {
        p_user_id: user.id,
        p_reservation_id: reservationId,
        p_session_id: checkout.id,
        p_url: checkout.url,
      });
      if (attachedComplete.error) throw attachedComplete.error;
      if (attachedComplete.data !== true) {
        throw new Error('Completed Checkout reservation changed before recovery');
      }
      if (reservedMethod === 'promptpay') {
        res.json({
          url: checkout.url,
          destination: 'promptpay_pending',
          expiresAt: new Date(checkout.expires_at * 1000).toISOString(),
          amount: promptPaySessionAmount(checkout),
        });
      } else {
        await recoverCompletedCheckout(checkout, reservationId, stableCustomerId);
        res.json({ url: await createPortal(stableCustomerId, user.id), destination: 'portal' });
      }
      return;
    }
    if (checkout.status !== 'open' || !checkout.url) {
      throw new Error('Stripe Checkout did not return an open hosted Session');
    }

    const attached = await admin.rpc('cashflow_attach_billing_checkout', {
      p_user_id: user.id,
      p_reservation_id: reservationId,
      p_session_id: checkout.id,
      p_url: checkout.url,
    });
    if (attached.error) throw attached.error;
    if (attached.data !== true) {
      const expired = await stripe.checkout.sessions.expire(checkout.id);
      checkoutConfirmedExpired = expired.status === 'expired';
      throw new Error('Checkout reservation expired before the session was attached');
    }
    if (reservedMethod === 'promptpay') {
      res.json({
        url: checkout.url,
        destination: 'promptpay',
        expiresAt: new Date(checkout.expires_at * 1000).toISOString(),
        amount: promptPaySessionAmount(checkout),
      });
    } else res.json({ url: checkout.url, destination: 'checkout' });
  } catch (error) {
    // A network timeout can happen after Stripe committed the Session but
    // before this process received it. Never release that reservation: retry
    // must replay the persisted request with the same idempotency key.
    let safeToRelease = checkoutConfirmedExpired
      || (!checkoutCreateAttempted && reservation.result === 'reserved');
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
      const released = await admin.rpc('cashflow_release_billing_checkout', {
        p_user_id: user.id,
        p_reservation_id: reservationId,
      });
      if (released.error) throw released.error;
    }
    throw error;
  }
}, { csrf: true });
