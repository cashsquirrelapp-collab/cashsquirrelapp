import type Stripe from 'stripe';
import { PRO_PRICING, type ProPeriod } from '../../../shared/proPricing.js';
import { CARD_CONSENT_VERSION, CARD_SAVE_DISCLOSURE, CARD_SAVE_DISCLOSURE_VERSION, renewalConsentText, type CardOptions } from '../../../shared/cardConsent.js';
import { prepaidMetadata, type PrepaidOrder } from './prepaidPlans.js';

export const recurringProductId = () => process.env.KRAROK_PRO_PRODUCT_ID || 'prod_VTbexQEI6jrH8r';
export const RECURRING_OFFER = 'krarok_card_20261021';
export const recurringLookup = (period: ProPeriod) => `${RECURRING_OFFER}_${period}`;
export const isAutoOrder = (order: PrepaidOrder) => order.request?.metadata?.auto_renew === 'true';
export function validRecurringPrice(price: Stripe.Price, period: ProPeriod, livemode: boolean): boolean {
  const plan = PRO_PRICING[period];
  return price.active && price.livemode === livemode && price.currency === 'thb'
    && price.unit_amount === plan.total * 100 && price.type === 'recurring'
    && price.billing_scheme === 'per_unit' && !price.transform_quantity && !price.custom_unit_amount
    && ((price.recurring?.interval === 'month' && price.recurring.interval_count === plan.months)
      || (plan.months === 12 && price.recurring?.interval === 'year' && price.recurring.interval_count === 1))
    && price.recurring.usage_type === 'licensed' && price.recurring.trial_period_days == null
    && price.lookup_key === recurringLookup(period)
    && (typeof price.product === 'string' ? price.product : price.product.id) === recurringProductId();
}
export function customCardCheckout(order: PrepaidOrder, base: Stripe.Checkout.SessionCreateParams, options: CardOptions) {
  if (options.consentVersion !== CARD_CONSENT_VERSION || (options.autoRenew && !options.saveCard))
    throw new Error('Invalid card consent');
  const metadata = { ...prepaidMetadata(order), payment_flow: 'custom_card',
    auto_renew: String(options.autoRenew), save_card: String(options.saveCard),
    consent_version: CARD_CONSENT_VERSION, consent_at: new Date().toISOString(),
    ...(options.saveCard ? { save_disclosure_version: CARD_SAVE_DISCLOSURE_VERSION, save_disclosure_text: CARD_SAVE_DISCLOSURE } : {}),
    ...(options.autoRenew ? { consent_text: renewalConsentText(order.period) } : {}) };
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
