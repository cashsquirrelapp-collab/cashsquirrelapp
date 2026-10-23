import { customCardCheckout, isAutoOrder, recurringLookup, validRecurringPrice } from './cardPlans.js';
import { applyAutoSession } from './cardRenewals.js';
import { CARD_CONSENT_VERSION, CARD_SAVE_DISCLOSURE_VERSION, type CardOptions } from '../../../shared/cardConsent.js';
import { isDirectQr, startDirectQr, cancelDirectQr } from './directPromptPay.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { User } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { appOrigin } from '../config/env.js';
import { stripe, configuredStripeLivemode } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import { isStripeCustomerOwnedByUser } from './stripeSubscriptions.js';
import { PRO_PRICING, type ProPeriod } from '../../../shared/proPricing.js';
import { assertPrepaidSession, buildPrepaidCheckout, isProPeriod, prepaidLookup, PREPAID_OFFER,
  stripeId, validatedPrepaidPayment, validPrepaidPrice, type PaymentMethod, type PrepaidOrder } from './prepaidPlans.js';

/** Fixed stage names and durations only: never log customers, sessions, keys or card data. */
export function billingTimings() {
  const start = performance.now();
  const stages: Record<string, number> = {};
  return {
    async measure<T>(name: string, run: () => PromiseLike<T>): Promise<T> {
      const before = performance.now();
      try { return await run(); }
      finally { stages[name] = (stages[name] || 0) + Math.round(performance.now() - before); }
    },
    finish() { console.info('billing_checkout_timing', JSON.stringify({ total_ms: Math.round(performance.now() - start), stages })); },
  };
}
type BillingTimings = ReturnType<typeof billingTimings>;
export const prepaidEnabled = () => process.env.KRAROK_PREPAID_ENABLED === 'true';
export async function rpc(name: string, args: Record<string, unknown>) {
  const result = await getSupabaseAdmin().rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}
export async function orderById(id: string): Promise<PrepaidOrder> {
  const result = await getSupabaseAdmin().from('cashflow_prepaid_orders').select('*').eq('id', id).single();
  if (result.error) throw result.error;
  return result.data as PrepaidOrder;
}
async function checkoutConfiguration(livemode: boolean): Promise<string> {
  const configurations = await stripe.paymentMethodConfigurations.list({ limit: 100 });
  const configuration = configurations.data.find(c => c.id === process.env.KRAROK_PAYMENT_CONFIGURATION)
    || configurations.data.find(c => !process.env.KRAROK_PAYMENT_CONFIGURATION && c.is_default);
  if (!configuration?.active || configuration.livemode !== livemode
    || !configuration.card?.available || configuration.card.display_preference.value !== 'on'
    || !configuration.promptpay?.available || configuration.promptpay.display_preference.value !== 'on') {
    throw new HttpError(503, 'ยังไม่ได้เปิดช่องทางบัตรและ PromptPay ใน Stripe');
  }
  // Do not silently accept a newly enabled payment type without a fulfillment validator.
  for (const [key, value] of Object.entries(configuration)) {
    if (value && typeof value === 'object' && 'display_preference' in value
      && !['card', 'promptpay', 'apple_pay', 'google_pay'].includes(key)
      && (value as {display_preference?: {value?: string}}).display_preference?.value === 'on') {
      throw new HttpError(503, 'กรุณาตรวจการตั้งค่าช่องทางชำระเงิน');
    }
  }
  return configuration.id;
}
async function ensureCustomer(user: User, order: PrepaidOrder): Promise<PrepaidOrder> {
  const customer = order.customer_id ? await stripe.customers.retrieve(order.customer_id)
    : await stripe.customers.create({ email: user.email,
      metadata: { app_user_id: user.id, workspace_type: 'personal', workspace_id: user.id } },
      { idempotencyKey: `cash-squirrel-customer:${order.livemode ? 'live' : 'test'}:${user.id}` });
  if ('deleted' in customer && customer.deleted || !isStripeCustomerOwnedByUser(customer, user.id, order.livemode)) {
    throw new Error('Invalid Stripe Customer ownership');
  }
  if (order.request) return order;
  await rpc('cashflow_bind_stripe_customer', { p_user_id: user.id, p_reservation_id: order.id,
    p_customer_id: customer.id, p_livemode: order.livemode });
  return { ...order, customer_id: customer.id };
}
const expanded = ['payment_intent.payment_method', 'payment_intent.latest_charge', 'line_items'];
/** Handles new payments first; legacy subscriptions retain their existing webhook pipeline. */
export async function applyPrepaidSession(session: Stripe.Checkout.Session, eventType?: string): Promise<boolean> {
  if (await applyAutoSession(session)) return true;
  if (session.metadata?.offer_version !== PREPAID_OFFER) return false;
  const order = await orderById(session.metadata.checkout_reservation_id || '');
  if (order.livemode !== configuredStripeLivemode()) throw new Error('Prepaid mode mismatch');
  // A webhook can arrive before the create response was attached. The persisted request
  // and server-owned reservation already bind the customer, price and duration.
  assertPrepaidSession(session, order);
  if (session.status === 'expired' || (eventType === 'checkout.session.async_payment_failed' && session.status === 'complete' && session.payment_status === 'unpaid')) {
    await rpc('cashflow_finish_prepaid_checkout', { p_order_id: order.id, p_user_id: order.user_id,
      p_session_id: session.id, p_state: 'expired' });
    return true;
  }
  if (session.payment_status !== 'paid') return true;
  const payment = validatedPrepaidPayment(session, order);
  await rpc('cashflow_fulfill_prepaid', { p_order_id: order.id, p_user_id: order.user_id,
    p_session_id: session.id, p_customer_id: order.customer_id, p_payment_id: payment.paymentIntentId,
    p_livemode: session.livemode, p_amount: session.amount_total, p_currency: session.currency,
    p_period: order.period, p_months: order.months, p_paid_at: payment.paidAt, p_refunded: payment.refunded });
  return true;
}
export async function retrieveAndApplyPrepaid(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: expanded });
  await applyPrepaidSession(session);
  return session;
}
/** Expire only this owner's exact unpaid session; a racing payment must still be fulfilled. */
export async function cancelPrepaidCheckout(userId: string, orderId: string) {
  const result = await getSupabaseAdmin().from('cashflow_prepaid_orders').select('*')
    .eq('id', orderId).eq('user_id', userId).maybeSingle();
  if (result.error) throw result.error;
  const order = result.data as PrepaidOrder | null;
  if (!order || order.user_id !== userId) throw new HttpError(404, 'ไม่พบรายการชำระเงิน');
  return cancelOwnedCheckout(order);
}
/** The caller has already loaded and checked this owner's order. */
async function cancelOwnedCheckout(order: PrepaidOrder) {
  if (isDirectQr(order)) return cancelDirectQr(order);
  if (!order.session_id) throw new HttpError(409, 'รายการกำลังสร้าง กรุณาลองใหม่อีกครั้ง');
  if (order.livemode !== configuredStripeLivemode()) throw new Error('Prepaid mode mismatch');
  let session = await stripe.checkout.sessions.retrieve(order.session_id, { expand: expanded });
  assertPrepaidSession(session, order);
  if (session.status === 'open' && session.payment_status === 'unpaid') {
    try {
      session = await stripe.checkout.sessions.expire(session.id);
    } catch {
      // Only an unknown/failed expiration needs another read. A successful Stripe
      // expiration response is canonical; paid races still use full payment evidence.
      session = await stripe.checkout.sessions.retrieve(order.session_id, { expand: expanded });
    }
    assertPrepaidSession(session, order);
  }
  if (session.status === 'expired') {
    await rpc('cashflow_finish_prepaid_checkout', { p_order_id: order.id, p_user_id: order.user_id,
      p_session_id: session.id, p_state: 'expired' });
  } else await applyPrepaidSession(session);
  if (session.status !== 'expired') throw new HttpError(409, 'รายการนี้ชำระแล้วหรือกำลังยืนยัน จึงยกเลิกไม่ได้');
  return { canceled: true };
}
export async function startPrepaidCheckout(user: User, periodValue: unknown, method: PaymentMethod, cardOptions?: CardOptions, timing: BillingTimings = billingTimings()) {
  if (!prepaidEnabled()) throw new HttpError(503, 'ระบบชำระเงินกำลังเตรียมเปิดให้บริการ');
  if (!isProPeriod(periodValue)) throw new HttpError(400, 'กรุณาเลือกแพ็กเกจ 1 เดือน, 6 เดือน หรือ 1 ปี');
  const period: ProPeriod = periodValue;
  const customCard = method === 'card' && process.env.KRAROK_CUSTOM_CARD_ENABLED === 'true';
  const autoRenew = customCard && cardOptions?.autoRenew === true;
  if (cardOptions && !customCard) throw new HttpError(503, 'หน้าบัตรใหม่ยังไม่พร้อม');
  const directQr = method === 'promptpay' && process.env.KRAROK_DIRECT_QR_ENABLED === 'true';
  const livemode = configuredStripeLivemode();
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  if (!publishableKey.startsWith(livemode ? 'pk_live_' : 'pk_test_')) throw new HttpError(503, 'หน้าชำระเงินยังไม่พร้อม กรุณาลองใหม่ภายหลัง');
  const [prices, configuration, pending] = await Promise.all([
    timing.measure('prices', () => stripe.prices.list({ lookup_keys: [autoRenew ? recurringLookup(period) : prepaidLookup(period)], active: true, limit: 2 })),
    timing.measure('configuration', () => checkoutConfiguration(livemode)),
    timing.measure('pending', () => getSupabaseAdmin().from('cashflow_prepaid_orders').select('*')
      .eq('user_id', user.id).in('status', ['reserved','open'])),
  ]);
  const price = prices.data[0];
  if (prices.data.length !== 1 || !(autoRenew ? validRecurringPrice(price, period, livemode) : validPrepaidPrice(price, period, livemode))) {
    throw new HttpError(503, 'ราคายังไม่พร้อมรับชำระ กรุณาลองใหม่ภายหลัง');
  }
  // Abandoned attempts are managed here, never as a task for the customer. Preserve
  // the same session on retries; expire a different/legacy session before replacement.
  if (pending.error) throw pending.error;
  for (const old of (pending.data || []) as PrepaidOrder[]) {
    if (old.user_id !== user.id || old.livemode !== livemode) throw new Error('Invalid pending checkout owner');
    const replace = old.period !== period || old.method !== method
      || (old.request && (isDirectQr(old) !== directQr || (!isDirectQr(old) && (old.request as Stripe.Checkout.SessionCreateParams).ui_mode !== (customCard ? 'elements' : 'embedded_page'))))
      || (old.request && (isAutoOrder(old) !== autoRenew || (customCard && old.request.metadata?.save_card !== String(cardOptions?.saveCard === true))))
      || (old.request && customCard && cardOptions?.saveCard === true && old.request.metadata?.save_disclosure_version !== CARD_SAVE_DISCLOSURE_VERSION)
      // An open renewal prepared under an earlier consent wording is replaced, so payment always follows the wording on screen.
      || (old.request && customCard && autoRenew && old.request.metadata?.consent_version !== CARD_CONSENT_VERSION)
      || Date.parse(old.expires_at) <= Date.now();
    if (!replace) continue;
    if (isDirectQr(old)) { await cancelDirectQr(old); continue; }
    if (!old.session_id && old.request) {
      // Recover an unknown create outcome with its original body/key before expiring.
      if (Date.now() - Date.parse(old.expires_at) > 22 * 60 * 60 * 1000)
        throw new HttpError(409, 'กำลังตรวจสอบรายการก่อนหน้า กรุณาติดต่อผู้ดูแล');
      const recovered = await stripe.checkout.sessions.create(old.request as Stripe.Checkout.SessionCreateParams,
        { idempotencyKey: `krarok-prepaid:${old.id}` });
      assertPrepaidSession(recovered, old);
      await rpc('cashflow_attach_prepaid_checkout', { p_order_id: old.id, p_user_id: user.id,
        p_session_id: recovered.id, p_url: recovered.url, p_expires_at: new Date(recovered.expires_at * 1000).toISOString() });
      old.session_id = recovered.id;
    }
    if (old.session_id) await timing.measure('replace', () => cancelOwnedCheckout(old));
    else await rpc('cashflow_release_billing_checkout', { p_user_id: user.id, p_reservation_id: old.id });
  }
  const reservation = await timing.measure('reserve', () => rpc('cashflow_reserve_prepaid_checkout', {
    p_user_id: user.id, p_order_id: randomUUID(), p_period: period, p_method: method,
    p_price_id: price.id, p_livemode: livemode,
  }));
  if (!['reserved', 'resumed'].includes(reservation.result)) {
    const messages: Record<string, string> = {
      period_mismatch: 'กำลังเปลี่ยนแพ็กเกจ กรุณาลองอีกครั้ง',
      prepaid_active: 'สิทธิ์ Pro ที่ชำระแล้วยังใช้งานได้ กรุณาต่ออายุเมื่อสิทธิ์หมด',
      managed: 'มีการสมัครสมาชิกอยู่แล้ว กรุณาเปิดจัดการการสมัครสมาชิก',
      admin_revoked: 'บัญชีนี้ถูกแบน Pro กรุณาติดต่อแอดมินเพื่อปลดแบน',
      pending: 'มีรายการชำระเงินค้างอยู่ กรุณารอการยืนยันก่อนสร้างรายการใหม่',
    };
    throw new HttpError(409, messages[reservation.result] || 'บัญชีนี้ยังไม่สามารถเริ่มรายการชำระเงินใหม่ได้');
  }
  let order = await timing.measure('order', () => orderById(reservation.order_id));
  if (order.user_id !== user.id || order.period !== period || order.method !== method || order.price_id !== price.id) throw new Error('Invalid checkout reservation');
  const response = (session: Stripe.Checkout.Session) => {
    if (session.status === 'open' && (!['embedded_page','elements'].includes(session.ui_mode || '') || !session.client_secret))
      throw new Error('Invalid embedded checkout response');
    return { clientSecret: session.status === 'open' ? session.client_secret : null, publishableKey,
      orderId: order.id, destination: session.status === 'complete' ? 'paid_pending' : 'embedded',
      method: order.method, amount: order.amount, months: order.months, period: order.period,
      customCard: session.ui_mode === 'elements', autoRenew: isAutoOrder(order), saveCard: order.request?.metadata?.save_card === 'true',
      expiresAt: new Date(session.expires_at * 1000).toISOString() };
  };
  if (isDirectQr(order)) return startDirectQr(user, order);
  if (order.session_id) {
    const session = await timing.measure('resume', () => stripe.checkout.sessions.retrieve(order.session_id!, { expand: expanded }));
    assertPrepaidSession(session, order);
    // An open, unpaid session cannot fulfill anything. Avoid reloading the same
    // order; terminal/paid sessions still run the canonical fulfillment validators.
    if (session.status !== 'open' || session.payment_status !== 'unpaid') await applyPrepaidSession(session);
    if (session.status === 'expired') throw new HttpError(409, 'รายการเดิมหมดอายุแล้ว กดชำระอีกครั้งเพื่อสร้างรายการใหม่');
    return response(session);
  }
  if (Date.parse(order.expires_at) <= Date.now() + 30 * 60 * 1000 && !order.request) {
    // No external call has been prepared, so releasing cannot orphan a payment.
    await rpc('cashflow_release_billing_checkout', { p_user_id: user.id, p_reservation_id: order.id });
    throw new HttpError(409, 'กรุณาลองสร้างรายการใหม่');
  }
  const readSubscriptions = (customer: string) => timing.measure('subscriptions', () =>
    stripe.subscriptions.list({ customer, status: 'all', limit: 100 }).autoPagingToArray({ limit: 101 }));
  const [ownedOrder, subscriptions] = order.customer_id
    ? await Promise.all([timing.measure('customer', () => ensureCustomer(user, order)), readSubscriptions(order.customer_id)])
    : await (async () => {
      const owned = await timing.measure('customer', () => ensureCustomer(user, order));
      return [owned, await readSubscriptions(owned.customer_id!)] as const;
    })();
  order = ownedOrder;
  if (subscriptions.length > 100 || subscriptions.some(s => !['canceled', 'incomplete_expired'].includes(s.status))) {
    throw new HttpError(409, 'มีการสมัครสมาชิกอยู่แล้ว กรุณาจัดการการสมัครเดิมก่อน');
  }
  if (directQr) return startDirectQr(user, order);
  let request = order.request as Stripe.Checkout.SessionCreateParams | null;
  if (!request) {
    request = buildPrepaidCheckout(order, appOrigin(), configuration);
    if (customCard && cardOptions) request = customCardCheckout(order, request, cardOptions);
    const stored = await timing.measure('prepare', () => rpc('cashflow_prepare_prepaid_checkout', { p_order_id: order.id,
      p_user_id: user.id, p_customer_id: order.customer_id, p_request: request }));
    if (!isDeepStrictEqual(stored, request)) throw new Error('Prepared checkout changed');
    order = { ...order, request };
  }
  // Never release an unknown-outcome request after a timeout: replay the same body/key.
  // Stripe retains keys for >=24h; the session is at most 45m. Do not replay after 23h.
  if (Date.now() - Date.parse(order.expires_at) > 22 * 60 * 60 * 1000) {
    throw new HttpError(409, 'รายการเก่าต้องตรวจสอบกับผู้ดูแลก่อนเริ่มใหม่');
  }
  const session = await timing.measure('create', () => stripe.checkout.sessions.create(request!, { idempotencyKey: `krarok-prepaid:${order.id}` }));
  assertPrepaidSession(session, order);
  await timing.measure('attach', () => rpc('cashflow_attach_prepaid_checkout', { p_order_id: order.id, p_user_id: user.id,
    p_session_id: session.id, p_url: session.url, p_expires_at: new Date(session.expires_at * 1000).toISOString() }));
  if (session.status !== 'open') await retrieveAndApplyPrepaid(session.id);
  return response(session);
}
