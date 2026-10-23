import { isDeepStrictEqual } from 'node:util';
import type { User } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { stripe, configuredStripeLivemode } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import { prepaidMetadata, PREPAID_OFFER, stripeId, type PrepaidOrder } from './prepaidPlans.js';
import { rpc, orderById } from './prepaidBilling.js';
import { PRO_PRICING } from '../../../shared/proPricing.js';

const FLOW = 'direct_promptpay';
export const isDirectQr = (order: PrepaidOrder) => order.request?.metadata?.payment_flow === FLOW;
const metadata = (order: PrepaidOrder) => ({ ...prepaidMetadata(order), payment_flow: FLOW, price_id: order.price_id });
const expand = ['latest_charge', 'payment_method'];
export function buildDirectQr(order: PrepaidOrder, email: string): Stripe.PaymentIntentCreateParams {
  const plan = PRO_PRICING[order.period];
  if (!order.customer_id || order.method !== 'promptpay' || order.amount !== plan.total * 100
    || order.months !== plan.months || !email) throw new Error('Invalid QR reservation');
  return { amount: order.amount, currency: 'thb', customer: order.customer_id,
    allowed_payment_method_types: ['promptpay'],
    payment_method_data: { type: 'promptpay', billing_details: { email } },
    confirm: true, metadata: metadata(order),
    description: `krarok.com Pro ${order.months} months · one-time`, expand };
}
export function assertDirectQr(pi: Stripe.PaymentIntent, order: PrepaidOrder) {
  if (!isDirectQr(order) || order.method !== 'promptpay' || order.session_id
    || pi.livemode !== order.livemode || pi.amount !== order.amount || pi.currency !== 'thb'
    || stripeId(pi.customer) !== order.customer_id || (order.intent_id && pi.id !== order.intent_id)
    || Object.entries(metadata(order)).some(([k,v]) => pi.metadata[k] !== v))
    throw new Error('QR payment does not match the reserved owner, amount and duration');
}
export function validatedDirectQr(pi: Stripe.PaymentIntent, order: PrepaidOrder) {
  assertDirectQr(pi, order);
  const c = pi.latest_charge, m = pi.payment_method;
  if (pi.status !== 'succeeded' || pi.amount_received !== order.amount || pi.amount_capturable !== 0
    || !m || typeof m === 'string' || m.type !== 'promptpay'
    || !c || typeof c === 'string' || c.status !== 'succeeded' || !c.paid
    || c.livemode !== order.livemode || c.amount !== order.amount || c.currency !== 'thb'
    || stripeId(c.customer) !== order.customer_id || stripeId(c.payment_intent) !== pi.id
    || c.payment_method_details?.type !== 'promptpay' || !Number.isSafeInteger(c.created) || c.created <= 0)
    throw new Error('QR payment is not verified');
  return { paidAt: new Date(c.created * 1000).toISOString(), refunded: c.refunded || c.disputed || c.amount_refunded > 0 };
}
async function apply(pi: Stripe.PaymentIntent, order: PrepaidOrder) {
  if (order.livemode !== configuredStripeLivemode()) throw new Error('QR mode mismatch');
  assertDirectQr(pi, order);
  // A signed webhook can race the create response. Bind the canonical ID first.
  await rpc('cashflow_attach_direct_qr', { p_order_id: order.id, p_user_id: order.user_id, p_intent_id: pi.id });
  if (pi.status === 'canceled') {
    await rpc('cashflow_finish_direct_qr', { p_order_id: order.id, p_user_id: order.user_id, p_intent_id: pi.id });
  } else if (pi.status === 'succeeded') {
    const payment = validatedDirectQr(pi, order);
    await rpc('cashflow_fulfill_prepaid', { p_order_id: order.id, p_user_id: order.user_id,
      p_session_id: null, p_customer_id: order.customer_id, p_payment_id: pi.id,
      p_livemode: pi.livemode, p_amount: pi.amount, p_currency: pi.currency,
      p_period: order.period, p_months: order.months, p_paid_at: payment.paidAt, p_refunded: payment.refunded });
  }
}
export async function retrieveAndApplyDirectQr(intentId: string): Promise<boolean> {
  const pi = await stripe.paymentIntents.retrieve(intentId, { expand });
  if (pi.metadata.offer_version !== PREPAID_OFFER || pi.metadata.payment_flow !== FLOW) return false;
  const order = await orderById(pi.metadata.checkout_reservation_id || '');
  await apply(pi, order);
  return true;
}
async function recover(order: PrepaidOrder): Promise<Stripe.PaymentIntent> {
  if (order.intent_id) return stripe.paymentIntents.retrieve(order.intent_id, { expand });
  if (!isDirectQr(order) || !order.request) throw new Error('Missing prepared QR request');
  // Do not risk re-creating after Stripe can prune the idempotency key.
  if (Date.now() - Date.parse(order.expires_at) > 22 * 60 * 60_000)
    throw new HttpError(409, 'กำลังตรวจสอบรายการก่อนหน้า กรุณาติดต่อผู้ดูแล');
  return stripe.paymentIntents.create(order.request as Stripe.PaymentIntentCreateParams,
    { idempotencyKey: `krarok-qr:${order.id}` });
}
export async function cancelDirectQr(order: PrepaidOrder) {
  let pi = await recover(order);
  assertDirectQr(pi, order);
  // Only canonical cancellation releases the order. A racing success is fulfilled.
  if (['requires_action','requires_payment_method','requires_confirmation'].includes(pi.status)) {
    try { await stripe.paymentIntents.cancel(pi.id); } catch { /* retrieve decides */ }
    pi = await stripe.paymentIntents.retrieve(pi.id, { expand });
  }
  await apply(pi, order);
  if (pi.status !== 'canceled') throw new HttpError(409, 'กำลังยืนยันยอดชำระ กรุณารอสักครู่');
  return { canceled: true };
}
export async function startDirectQr(user: User, order: PrepaidOrder) {
  if (!order.request) {
    if (!user.email) throw new HttpError(400, 'บัญชีต้องมีอีเมลสำหรับรับข้อมูลการชำระเงิน');
    const request = buildDirectQr(order, user.email);
    const stored = await rpc('cashflow_prepare_direct_qr', { p_order_id: order.id, p_user_id: user.id,
      p_customer_id: order.customer_id, p_request: request });
    if (!isDeepStrictEqual(stored, request)) throw new Error('Prepared QR changed');
    order = { ...order, request };
  }
  const pi = await recover(order);
  if (pi.status === 'requires_payment_method' || pi.status === 'canceled') {
    await cancelDirectQr(order);
    throw new HttpError(409, 'รายการเดิมสิ้นสุดแล้ว กดสร้าง QR ใหม่ได้เลย');
  }
  await apply(pi, order);
  const common = { orderId: order.id, method: 'promptpay', amount: order.amount, months: order.months,
    period: order.period, expiresAt: order.expires_at };
  if (['succeeded','processing'].includes(pi.status)) return { ...common, destination: 'paid_pending' };
  const qr = pi.next_action?.promptpay_display_qr_code;
  if (pi.status !== 'requires_action' || pi.next_action?.type !== 'promptpay_display_qr_code' || !qr?.image_url_png)
    throw new HttpError(409, 'ยังสร้าง QR ไม่สำเร็จ กรุณาลองใหม่');
  const image = new URL(qr.image_url_png);
  if (image.protocol !== 'https:' || !image.hostname.endsWith('.stripe.com')) throw new Error('Invalid QR image host');
  return { ...common, destination: 'qr', qrImage: qr.image_url_png };
}
/** Authenticated owner-only status. Also repairs a delayed webhook using identical evidence. */
export async function directQrStatus(userId: string, orderId: string) {
  const found = await getSupabaseAdmin().from('cashflow_prepaid_orders').select('*').eq('id', orderId).eq('user_id', userId).maybeSingle();
  if (found.error) throw found.error;
  const order = found.data as PrepaidOrder | null;
  if (!order || order.user_id !== userId || !isDirectQr(order)) throw new HttpError(404, 'ไม่พบรายการชำระเงิน');
  if (!order.intent_id) return { paymentStatus: 'pending' };
  const pi = await stripe.paymentIntents.retrieve(order.intent_id, { expand });
  await apply(pi, order);
  const charge = pi.latest_charge;
  const revoked = charge && typeof charge !== 'string' && (charge.refunded || charge.disputed || charge.amount_refunded > 0);
  return { paymentStatus: revoked || ['canceled','requires_payment_method'].includes(pi.status) ? 'expired' : pi.status === 'succeeded' ? 'paid' : 'pending' };
}
