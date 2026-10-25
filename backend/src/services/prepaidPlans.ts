import type Stripe from 'stripe';
import { PRO_MONTH_REGULAR_FROM, PRO_PERIODS, proPricing, type ProPeriod } from '../../../shared/proPricing.js';

export const PREPAID_OFFER = 'krarok_prepaid_20261020';
export type PaymentMethod = 'card' | 'promptpay';
export type PrepaidOrder = {
  id: string; user_id: string; period: ProPeriod; months: number; amount: number;
  method: PaymentMethod; price_id: string; livemode: boolean; expires_at: string;
  customer_id: string | null; session_id: string | null; checkout_url: string | null;
  intent_id?: string | null;
  request: Stripe.Checkout.SessionCreateParams | Stripe.PaymentIntentCreateParams | null; status: string;
};
export const stripeId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : value?.id || null;
export const isProPeriod = (value: unknown): value is ProPeriod => typeof value === 'string' && PRO_PERIODS.includes(value as ProPeriod);
/** The lookup key of the one-time price sold at that time: the regular monthly price (from 1 Dec 2569) has its own. */
export const prepaidLookup = (period: ProPeriod, now: Date | number = Date.now()) =>
  (period === 'month' && +now >= PRO_MONTH_REGULAR_FROM ? `${PREPAID_OFFER}_${period}_20261201` : `${PREPAID_OFFER}_${period}`);
/** The database reserves an order for 45 minutes at that moment's price (cashflow_reserve_prepaid_checkout). */
export const orderReservedAt = (order: Pick<PrepaidOrder, 'expires_at'>) => Date.parse(order.expires_at) - 45 * 60_000;
/** An order's amount is the price at the moment it was reserved, or now (an order made just before 1 Dec keeps its own). */
export function orderPriceAllowed(order: Pick<PrepaidOrder, 'period' | 'months' | 'amount' | 'expires_at'>, now: Date | number = Date.now()): boolean {
  return [orderReservedAt(order), +now].some(at => { const plan = proPricing(at)[order.period]; return plan.total * 100 === order.amount && plan.months === order.months; });
}
export function validPrepaidPrice(price: Stripe.Price, period: ProPeriod, livemode: boolean, now: Date | number = Date.now()): boolean {
  const plan = proPricing(now)[period];
  return price.active && price.livemode === livemode && price.type === 'one_time'
    && price.recurring === null && price.currency === 'thb' && price.unit_amount === plan.total * 100
    && !price.custom_unit_amount && !price.transform_quantity && price.billing_scheme === 'per_unit'
    && price.lookup_key === prepaidLookup(period, now) && price.metadata.offer_version === PREPAID_OFFER
    && price.metadata.period === period && price.metadata.months === String(plan.months);
}
export function prepaidMetadata(order: PrepaidOrder): Record<string, string> {
  return { app_user_id: order.user_id, workspace_type: 'personal', workspace_id: order.user_id,
    checkout_reservation_id: order.id, offer_version: PREPAID_OFFER,
    billing_method: order.method, period: order.period, months: String(order.months) };
}
export function buildPrepaidCheckout(order: PrepaidOrder, origin: string, configuration: string): Stripe.Checkout.SessionCreateParams {
  if (!order.customer_id || !orderPriceAllowed(order) || !configuration.startsWith('pmc_')) throw new Error('Invalid prepaid checkout configuration');
  const total = order.amount / 100;
  return {
    mode: 'payment', customer: order.customer_id, client_reference_id: order.user_id,
    payment_method_configuration: configuration,
    excluded_payment_method_types: [order.method === 'card' ? 'promptpay' : 'card'],
    line_items: [{ price: order.price_id, quantity: 1 }],
    allow_promotion_codes: false,
    metadata: prepaidMetadata(order), payment_intent_data: { metadata: prepaidMetadata(order) },
    expires_at: Math.floor(Date.parse(order.expires_at) / 1000),
    ui_mode: 'embedded_page',
    redirect_on_completion: 'if_required',
    return_url: `${origin}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    custom_text: { submit: { message: `Pro ${order.months} เดือน • ฿${total.toLocaleString('en-US')} จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ` } },
    // Stable per integration; persisted request + reservation id provide retry safety.
    integration_identifier: 'krarok-prepaid-qnvxkzpa',
  };
}
export function assertPrepaidSession(session: Stripe.Checkout.Session, order: PrepaidOrder): void {
  if (session.mode !== (order.request?.metadata?.auto_renew === 'true' ? 'subscription' : 'payment') || session.livemode !== order.livemode
    || session.client_reference_id !== order.user_id || stripeId(session.customer) !== order.customer_id
    || (order.session_id && order.session_id !== session.id)
    || session.currency !== 'thb' || session.amount_total !== order.amount
    || session.amount_subtotal !== order.amount
    || Object.entries(prepaidMetadata(order)).some(([k,v]) => session.metadata?.[k] !== v)) {
    throw new Error('Checkout does not match the reserved account, price and duration');
  }
}
/** Canonical Stripe retrieval, never the redirect query, authorizes fulfillment. */
export function validatedPrepaidPayment(session: Stripe.Checkout.Session, order: PrepaidOrder) {
  assertPrepaidSession(session, order);
  if (session.mode !== 'payment') throw new Error('Recurring payment requires invoice validation');
  const pi = session.payment_intent;
  if (session.status !== 'complete' || session.payment_status !== 'paid' || !pi || typeof pi === 'string') throw new Error('Payment not confirmed');
  const charge = pi.latest_charge;
  const method = pi.payment_method;
  const lines = session.line_items;
  if (pi.status !== 'succeeded' || pi.livemode !== order.livemode || pi.amount !== order.amount
    || pi.amount_received !== order.amount || pi.amount_capturable !== 0 || pi.currency !== 'thb'
    || stripeId(pi.customer) !== order.customer_id
    || Object.entries(prepaidMetadata(order)).some(([k,v]) => pi.metadata[k] !== v)
    || !method || typeof method === 'string' || method.type !== order.method
    || !charge || typeof charge === 'string' || charge.status !== 'succeeded' || !charge.paid
    || charge.livemode !== order.livemode || charge.amount !== order.amount || charge.currency !== 'thb'
    || stripeId(charge.customer) !== order.customer_id || stripeId(charge.payment_intent) !== pi.id
    || charge.payment_method_details?.type !== order.method
    || !Number.isSafeInteger(charge.created) || charge.created <= 0
    || !lines || lines.has_more || lines.data.length !== 1) throw new Error('Invalid prepaid payment evidence');
  const line = lines.data[0];
  if (line.quantity !== 1 || line.price?.id !== order.price_id || line.price.unit_amount !== order.amount
    || line.price.currency !== 'thb' || line.price.type !== 'one_time' || line.price.recurring !== null
    || line.amount_total !== order.amount || line.amount_subtotal !== order.amount
    || line.currency !== 'thb' || (session.total_details?.amount_discount || 0) !== 0
    || (session.total_details?.amount_tax || 0) !== 0 || (session.total_details?.amount_shipping || 0) !== 0) {
    throw new Error('Paid line items do not match the locked plan');
  }
  return { paymentIntentId: pi.id, paidAt: new Date(charge.created * 1000).toISOString(),
    // Any refund/dispute suspends this purchase for review, preserving other paid rights.
    refunded: charge.amount_refunded > 0 || charge.refunded || charge.disputed };
}
