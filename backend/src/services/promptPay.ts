import type Stripe from 'stripe';
import {
  PROMPTPAY_OFFER_VERSION,
  PRO_INTRO_MONTHS,
  PRO_INTRO_TOTAL,
  PRO_MONTHLY_AMOUNT,
} from './stripeSubscriptions.js';

function id(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id || null;
}

export type PromptPayCheckoutRecord = {
  userId: string;
  customerId: string;
  reservationId: string;
  sessionId: string;
  paymentIntentId: string;
  amount: number;
  currency: 'thb';
  introCycle: number;
  paidAt: string;
};

export function promptPayCheckoutRecord(
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent,
  expectedLivemode: boolean,
): PromptPayCheckoutRecord | null {
  const userId = session.metadata?.app_user_id;
  const customerId = id(session.customer);
  const reservationId = session.metadata?.checkout_reservation_id;
  const introCycle = Number(session.metadata?.intro_cycle);
  const amount = introCycle <= PRO_INTRO_MONTHS ? PRO_INTRO_TOTAL : PRO_MONTHLY_AMOUNT;
  const paymentMethod = paymentIntent.payment_method;
  const paymentMethodType = paymentMethod && typeof paymentMethod !== 'string'
    ? paymentMethod.type : null;
  const latestCharge = paymentIntent.latest_charge;
  if (!userId || !customerId || !reservationId
    || !Number.isInteger(introCycle) || introCycle < 1 || introCycle > 4
    || session.livemode !== expectedLivemode || paymentIntent.livemode !== expectedLivemode
    || session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid'
    || session.client_reference_id !== userId
    || session.metadata?.workspace_type !== 'personal'
    || session.metadata?.workspace_id !== userId
    || session.metadata?.offer_version !== PROMPTPAY_OFFER_VERSION
    || session.metadata?.billing_method !== 'promptpay'
    || session.currency !== 'thb' || session.amount_total !== amount
    || id(session.payment_intent) !== paymentIntent.id
    || paymentIntent.status !== 'succeeded'
    || id(paymentIntent.customer) !== customerId
    || paymentIntent.currency !== 'thb'
    || paymentIntent.amount !== amount || paymentIntent.amount_received !== amount
    || paymentIntent.amount_capturable !== 0
    || paymentIntent.metadata.app_user_id !== userId
    || paymentIntent.metadata.workspace_type !== 'personal'
    || paymentIntent.metadata.workspace_id !== userId
    || paymentIntent.metadata.checkout_reservation_id !== reservationId
    || paymentIntent.metadata.offer_version !== PROMPTPAY_OFFER_VERSION
    || paymentIntent.metadata.billing_method !== 'promptpay'
    || paymentIntent.metadata.intro_cycle !== String(introCycle)
    || paymentIntent.payment_method_types.length !== 1
    || paymentIntent.payment_method_types[0] !== 'promptpay'
    || paymentMethodType !== 'promptpay'
    || !latestCharge || typeof latestCharge === 'string'
    || latestCharge.status !== 'succeeded' || latestCharge.paid !== true
    || latestCharge.refunded || latestCharge.amount_refunded !== 0
    || latestCharge.amount !== amount || latestCharge.currency !== 'thb'
    || id(latestCharge.customer) !== customerId
    || id(latestCharge.payment_intent) !== paymentIntent.id) return null;
  return {
    userId,
    customerId,
    reservationId,
    sessionId: session.id,
    paymentIntentId: paymentIntent.id,
    amount,
    currency: 'thb',
    introCycle,
    paidAt: new Date(latestCharge.created * 1000).toISOString(),
  };
}

export function validatePromptPayLineItems(
  session: Stripe.Checkout.Session,
  lines: Stripe.LineItem[],
): boolean {
  const cycle = Number(session.metadata?.intro_cycle);
  const expected = cycle <= PRO_INTRO_MONTHS ? PRO_INTRO_TOTAL : PRO_MONTHLY_AMOUNT;
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > 4
    || session.line_items?.has_more || lines.length !== 1) return false;
  const line = lines[0];
  return line.quantity === 1
    && line.currency === 'thb'
    && line.amount_subtotal === expected
    && line.amount_total === expected
    && line.price?.active === true
    && line.price.type === 'one_time'
    && line.price.currency === 'thb'
    && line.price.unit_amount === expected
    && line.price.recurring === null;
}
