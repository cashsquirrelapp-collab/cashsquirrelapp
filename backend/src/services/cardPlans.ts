import type Stripe from 'stripe';
import { PLUS_SOLD_AT, PRO_MONTH_REGULAR_FROM, PRO_MONTH_RENEWAL_STEP, PRO_SOLD_AT, proMonthPromoRunning, type ProPeriod } from '../../../shared/proPricing.js';
import { CARD_CONSENT_VERSION, CARD_SAVE_DISCLOSURE, CARD_SAVE_DISCLOSURE_VERSION, renewalConsentText, type CardOptions } from '../../../shared/cardConsent.js';
import type { PaidTier } from '../../../shared/plans.js';
import { orderTier, planPriceAt, plusProductId, prepaidMetadata, type PrepaidOrder } from './prepaidPlans.js';

/** Each plan's Stripe product: Pro's (as ever) and Plus's own (prepaidPlans.PLUS_PRODUCT_ID). */
export const recurringProductId = (tier: PaidTier = 'pro') => (tier === 'plus' ? plusProductId() : process.env.KRAROK_PRO_PRODUCT_ID || 'prod_VTbexQEI6jrH8r');
export const RECURRING_OFFER = 'krarok_card_20261021';
/** The lookup key of the recurring price sold at that time: the regular monthly price (from 1 Dec 2569) has its own, and Plus its own. */
export const recurringLookup = (period: ProPeriod, now: Date | number = Date.now(), tier: PaidTier = 'pro') =>
  (tier === 'plus' ? `${RECURRING_OFFER}_plus_${period}`
    : period === 'month' && +now >= PRO_MONTH_REGULAR_FROM ? `${RECURRING_OFFER}_${period}_20261201` : `${RECURRING_OFFER}_${period}`);
export const isAutoOrder = (order: PrepaidOrder) => order.request?.metadata?.auto_renew === 'true';
export function validRecurringPrice(price: Stripe.Price, period: ProPeriod, livemode: boolean, now: Date | number = Date.now(), tier: PaidTier = 'pro'): boolean {
  const plan = planPriceAt(tier, period, now);
  if (!plan) return false;
  return price.active && price.livemode === livemode && price.currency === 'thb'
    && price.unit_amount === plan.total * 100 && price.type === 'recurring'
    && price.billing_scheme === 'per_unit' && !price.transform_quantity && !price.custom_unit_amount
    && ((price.recurring?.interval === 'month' && price.recurring.interval_count === plan.months)
      || (plan.months === 12 && price.recurring?.interval === 'year' && price.recurring.interval_count === 1))
    && price.recurring.usage_type === 'licensed' && price.recurring.trial_period_days == null
    && price.lookup_key === recurringLookup(period, now, tier)
    && (typeof price.product === 'string' ? price.product : price.product.id) === recurringProductId(tier);
}
/**
 * A Pro monthly auto-renewal bought during the promotion that agreed to the regular price from 1 Dec 2569 (consent v4 and
 * v5 record the step on the order: ฿271 under v4, ฿188 under v5). Either moves to today's regular price, ฿188 (less than
 * v4 agreed). Others keep the amount on their order.
 */
export function renewalStepOf(order: PrepaidOrder): typeof PRO_MONTH_RENEWAL_STEP | null {
  const metadata = order.request?.metadata as Record<string, string | undefined> | undefined;
  return orderTier(order) === 'pro' && order.period === 'month' && order.amount === PRO_MONTH_RENEWAL_STEP.fromTotal * 100
    && metadata?.renewal_step_from === PRO_MONTH_RENEWAL_STEP.fromDay
    && PRO_MONTH_RENEWAL_STEP.agreed.some(baht => metadata?.renewal_step_amount === String(baht * 100))
    ? PRO_MONTH_RENEWAL_STEP : null;
}
/**
 * The price an existing auto-renewal runs on: the one reserved on its order, at the amount the customer agreed to, or,
 * for one that agreed to the step, the regular monthly price the app moved it to. New checkouts must sell today's price
 * (validRecurringPrice); a subscription bought at ฿159 before the prices with the payment fee keeps renewing at ฿159.
 */
export function validReservedRecurringPrice(price: Stripe.Price, order: PrepaidOrder): boolean {
  const step = renewalStepOf(order);
  if (step && price.id !== order.price_id) {
    return price.unit_amount === step.total * 100 && validRecurringPrice({ ...price, active: true }, 'month', order.livemode, step.from);
  }
  const tier = orderTier(order);
  const plan = planPriceAt(tier, order.period);
  const soldAt = tier === 'plus' ? PLUS_SOLD_AT : PRO_SOLD_AT[order.period];
  return Boolean(plan) && !!plan && price.id === order.price_id && price.livemode === order.livemode && price.currency === 'thb'
    && price.unit_amount === order.amount && soldAt.some(baht => baht * 100 === order.amount)
    && price.type === 'recurring' && price.billing_scheme === 'per_unit' && !price.transform_quantity && !price.custom_unit_amount
    && ((price.recurring?.interval === 'month' && price.recurring.interval_count === plan.months)
      || (plan.months === 12 && price.recurring?.interval === 'year' && price.recurring.interval_count === 1))
    && price.recurring.usage_type === 'licensed' && price.recurring.trial_period_days == null
    && (typeof price.product === 'string' ? price.product : price.product.id) === recurringProductId(tier);
}
export function customCardCheckout(order: PrepaidOrder, base: Stripe.Checkout.SessionCreateParams, options: CardOptions, now: Date | number = Date.now()) {
  if (options.consentVersion !== CARD_CONSENT_VERSION || (options.autoRenew && !options.saveCard))
    throw new Error('Invalid card consent');
  const metadata = { ...prepaidMetadata(order), payment_flow: 'custom_card',
    auto_renew: String(options.autoRenew), save_card: String(options.saveCard),
    consent_version: CARD_CONSENT_VERSION, consent_at: new Date().toISOString(),
    ...(options.saveCard ? { save_disclosure_version: CARD_SAVE_DISCLOSURE_VERSION, save_disclosure_text: CARD_SAVE_DISCLOSURE } : {}),
    ...(options.autoRenew ? { consent_text: renewalConsentText(order.period, now, orderTier(order)) } : {}),
    // The promotion's monthly renewal steps up to the regular price on 1 Dec 2569; the order keeps what was agreed.
    ...(options.autoRenew && orderTier(order) === 'pro' && order.period === 'month' && order.amount === PRO_MONTH_RENEWAL_STEP.fromTotal * 100 && proMonthPromoRunning(now)
      ? { renewal_step_from: PRO_MONTH_RENEWAL_STEP.fromDay, renewal_step_amount: String(PRO_MONTH_RENEWAL_STEP.total * 100) } : {}) };
  const request: Stripe.Checkout.SessionCreateParams = {
    ...base, ui_mode: 'elements', mode: options.autoRenew ? 'subscription' : 'payment',
    metadata, adaptive_pricing: { enabled: false }, saved_payment_method_options: { payment_method_save: 'enabled' },
  };
  delete request.custom_text;
  delete request.redirect_on_completion;
  if (options.autoRenew) {
    delete request.payment_intent_data;
    request.subscription_data = { metadata };
  } else {
    request.payment_intent_data = { metadata };
  }
  return request;
}
