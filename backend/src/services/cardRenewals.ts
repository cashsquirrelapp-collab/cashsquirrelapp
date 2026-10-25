import type Stripe from 'stripe';
import { stripe, configuredStripeLivemode } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import { assertPrepaidSession, prepaidMetadata, stripeId, type PrepaidOrder } from './prepaidPlans.js';
import { isAutoOrder, renewalStepOf, validReservedRecurringPrice } from './cardPlans.js';
import { orderById, rpc } from './prepaidBilling.js';
import { ACCEPTED_CARD_CONSENT_VERSIONS } from '../../../shared/cardConsent.js';

export function assertAutoSubscription(sub: Stripe.Subscription, order: PrepaidOrder) {
  const item = sub.items.data[0];
  const consent = order.request?.metadata ?? {};
  if (!isAutoOrder(order) || order.method !== 'card' || !ACCEPTED_CARD_CONSENT_VERSIONS.includes(String(consent.consent_version ?? ''))
    || sub.livemode !== order.livemode || sub.livemode !== configuredStripeLivemode()
    || stripeId(sub.customer) !== order.customer_id || sub.collection_method !== 'charge_automatically'
    || sub.items.has_more || sub.items.data.length !== 1 || !item || item.quantity !== 1
    || !validReservedRecurringPrice(item.price, order)
    || sub.discounts.length || sub.trial_start || sub.trial_end
    || Object.entries(prepaidMetadata(order)).some(([key, value]) => sub.metadata[key] !== value)
    || sub.metadata.auto_renew !== 'true' || sub.metadata.consent_version !== consent.consent_version
    || sub.metadata.consent_at !== consent.consent_at)
    throw new Error('Recurring subscription does not match explicit consent and reserved price');
}
async function autoOrder(sub: Stripe.Subscription) {
  if (sub.metadata?.payment_flow !== 'custom_card' || sub.metadata.auto_renew !== 'true') return null;
  const order = await orderById(sub.metadata.checkout_reservation_id || '');
  assertAutoSubscription(sub, order);
  const sessions = order.session_id ? null : await stripe.checkout.sessions.list({ subscription: sub.id, limit: 2 });
  const session = order.session_id ? await stripe.checkout.sessions.retrieve(order.session_id) : sessions?.data[0];
  if (!session || sessions?.has_more || (sessions && sessions.data.length !== 1)
    || stripeId(session.subscription) !== sub.id || session.status !== 'complete')
    throw new Error('Subscription is not bound to a completed app Checkout');
  assertPrepaidSession(session, order);
  if (!order.session_id) {
    await rpc('cashflow_attach_prepaid_checkout', { p_order_id: order.id, p_user_id: order.user_id,
      p_session_id: session.id, p_url: null, p_expires_at: new Date(session.expires_at * 1000).toISOString() });
  }
  return order;
}
async function recordState(sub: Stripe.Subscription, order: PrepaidOrder) {
  await rpc('cashflow_sync_card_subscription', { p_order_id: order.id, p_user_id: order.user_id,
    p_subscription_id: sub.id, p_customer_id: order.customer_id, p_livemode: sub.livemode,
    p_status: sub.status, p_created: sub.created, p_cancel: sub.cancel_at_period_end,
    p_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString() });
}
/** Never grants access from a subscription's `active` status alone. */
export async function syncAutoSubscription(subscriptionId: string): Promise<boolean> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const order = await autoOrder(sub);
  if (!order) return false;
  await recordState(sub, order);
  return true;
}
export async function applyAutoSession(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.metadata?.payment_flow !== 'custom_card' || session.metadata.auto_renew !== 'true') return false;
  const order = await orderById(session.metadata.checkout_reservation_id || '');
  assertPrepaidSession(session, order);
  if (!isAutoOrder(order)) throw new Error('Missing recurring consent');
  if (session.status === 'expired') {
    await rpc('cashflow_finish_prepaid_checkout', { p_order_id: order.id, p_user_id: order.user_id,
      p_session_id: session.id, p_state: 'expired' });
  } else if (session.status === 'complete') {
    const subId = stripeId(session.subscription);
    if (!subId) throw new Error('Missing recurring subscription');
    await syncAutoSubscription(subId);
    const invoiceId = stripeId(session.invoice);
    if (invoiceId) await applyAutoInvoice(invoiceId);
  }
  return true;
}
/**
 * What a renewal invoice may charge: the order's own price and amount; and, for a promotion-month renewal that agreed
 * to the step, the regular monthly price for a period from 1 Dec 2569 on (once the app moved the subscription to it).
 * If the move did not happen in time, the old amount is still accepted: the customer is never refused for paying less.
 */
function allowedCharges(order: PrepaidOrder, sub: Stripe.Subscription, periodStart: number): { amount: number; price: string }[] {
  const charges = [{ amount: order.amount, price: order.price_id }];
  const step = renewalStepOf(order);
  const item = sub.items.data[0];
  if (step && periodStart * 1000 >= step.from && item && item.price.id !== order.price_id && validReservedRecurringPrice(item.price, order)) {
    charges.push({ amount: step.total * 100, price: item.price.id });
  }
  return charges;
}
/** The invoice's period and the amount it rightly charges, or an error when it is not this order's renewal. */
export function validateAutoInvoiceCharge(invoice: Stripe.Invoice, sub: Stripe.Subscription, order: PrepaidOrder, now: number = Date.now()): { period: { start: number; end: number }; amount: number } {
  const line = invoice.lines.data[0];
  const charge = line && Number.isSafeInteger(line.period?.start)
    ? allowedCharges(order, sub, line.period.start).find(item => item.price === stripeId(line.pricing?.price_details?.price)
      && item.amount === line.amount && item.amount === invoice.total && item.amount === invoice.amount_due) : undefined;
  if (invoice.livemode !== order.livemode || stripeId(invoice.customer) !== order.customer_id
    || stripeId(invoice.parent?.subscription_details?.subscription) !== sub.id
    || invoice.parent?.subscription_details?.metadata?.checkout_reservation_id !== order.id
    || invoice.currency !== 'thb' || !['subscription_create','subscription_cycle'].includes(invoice.billing_reason || '')
    || invoice.collection_method !== 'charge_automatically'
    || invoice.lines.has_more || invoice.lines.data.length !== 1 || !line
    || line.quantity !== 1 || !charge || line.currency !== 'thb'
    || line.parent?.subscription_item_details?.subscription !== sub.id
    || line.parent.subscription_item_details.proration
    || invoice.discounts.length || invoice.total_discount_amounts?.some(d => d.amount !== 0)
    || invoice.total_taxes?.some(t => t.amount !== 0)
    || !Number.isSafeInteger(line.period.start) || !Number.isSafeInteger(line.period.end)
    || line.period.start > now/1000 + 300
    || line.period.end - line.period.start < order.months * 28 * 86400
    || line.period.end - line.period.start > order.months * 31 * 86400)
    throw new Error('Recurring invoice does not match the paid package');
  return { period: line.period, amount: charge.amount };
}
export function validateAutoInvoice(invoice: Stripe.Invoice, sub: Stripe.Subscription, order: PrepaidOrder) {
  return validateAutoInvoiceCharge(invoice, sub, order).period;
}
export async function applyAutoInvoice(invoiceId: string): Promise<boolean> {
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['amount_paid_off_stripe'] });
  const subId = stripeId(invoice.parent?.subscription_details?.subscription);
  if (!subId) return false;
  const sub = await stripe.subscriptions.retrieve(subId);
  const order = await autoOrder(sub);
  if (!order) return false;
  await recordState(sub, order);
  const { period, amount } = validateAutoInvoiceCharge(invoice, sub, order);
  if (invoice.status !== 'paid') return true; // Failed/SCA-required renewal never extends paid access.
  if (invoice.amount_paid !== amount || invoice.amount_remaining !== 0 || invoice.amount_paid_off_stripe !== 0)
    throw new Error('Invoice has not been fully paid through Stripe');
  const payments = await stripe.invoicePayments.list({ invoice: invoice.id, status: 'paid', limit: 2 });
  const payment = payments.data[0];
  if (payments.has_more || payments.data.length !== 1 || !payment
    || payment.livemode !== order.livemode || payment.currency !== 'thb' || payment.amount_paid !== amount
    || stripeId(payment.invoice) !== invoice.id || payment.payment.type !== 'payment_intent')
    throw new Error('Invalid recurring invoice payment');
  const piId = stripeId(payment.payment.payment_intent);
  if (!piId) throw new Error('Missing invoice PaymentIntent');
  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge','payment_method'] });
  const charge = pi.latest_charge;
  if (pi.status !== 'succeeded' || pi.livemode !== order.livemode || pi.amount !== amount
    || pi.amount_received !== amount || pi.amount_capturable !== 0 || pi.currency !== 'thb' || stripeId(pi.customer) !== order.customer_id
    || !pi.payment_method || typeof pi.payment_method === 'string' || pi.payment_method.type !== 'card'
    || !charge || typeof charge === 'string' || !charge.paid || charge.status !== 'succeeded'
    || charge.livemode !== order.livemode || charge.amount !== amount || charge.currency !== 'thb'
    || stripeId(charge.customer) !== order.customer_id || stripeId(charge.payment_intent) !== pi.id
    || charge.payment_method_details?.type !== 'card')
    throw new Error('Recurring card payment is not confirmed');
  await rpc('cashflow_record_card_cycle', { p_order_id: order.id, p_user_id: order.user_id,
    p_subscription_id: sub.id, p_invoice_id: invoice.id, p_payment_id: pi.id,
    p_amount: amount, p_currency: 'thb', p_livemode: order.livemode,
    p_start: new Date(period.start * 1000).toISOString(), p_end: new Date(period.end * 1000).toISOString(),
    p_refunded: charge.refunded || charge.amount_refunded > 0 || charge.disputed });
  return true;
}
/** InvoicePayment lookup also handles refund-before-invoice-webhook races. */
export async function applyAutoPayment(paymentIntentId: string): Promise<boolean> {
  const payments = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntentId }, limit: 2,
  });
  if (payments.has_more) throw new Error('Unexpected multiple invoices for card payment');
  for (const payment of payments.data) {
    const invoiceId = stripeId(payment.invoice);
    if (invoiceId && await applyAutoInvoice(invoiceId)) return true;
  }
  return false;
}
export async function stopAutoRenewal(userId: string) {
  const result = await getSupabaseAdmin().from('cashflow_card_subscriptions').select('*')
    .eq('user_id', userId).not('status', 'in', '(canceled,incomplete_expired)').maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(409, 'ไม่มีการต่ออายุอัตโนมัติที่เปิดอยู่');
  const sub = await stripe.subscriptions.retrieve(result.data.subscription_id);
  const order = await autoOrder(sub);
  if (!order || order.user_id !== userId) throw new Error('Subscription ownership mismatch');
  if (!['canceled','incomplete_expired'].includes(sub.status)) {
    if (['past_due','unpaid','incomplete','paused'].includes(sub.status)) {
      // Stop retries of an unpaid renewal too. Paid invoice periods remain in our ledger.
      await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
    } else {
      // Setting a boolean is naturally idempotent. Do not reuse a 24h key across
      // cancel -> customer Portal resume -> cancel, which could return an old response.
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    }
  }
  await syncAutoSubscription(sub.id);
  return { canceled: true };
}
