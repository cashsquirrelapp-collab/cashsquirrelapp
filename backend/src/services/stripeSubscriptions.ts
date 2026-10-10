import type Stripe from 'stripe';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { required } from '../config/env.js';

export const PRO_MONTHLY_AMOUNT = 24_900;
export const PRO_INTRO_DISCOUNT = 5_000;
export const PRO_INTRO_MONTHS = 3;
export const PRO_INTRO_TOTAL = PRO_MONTHLY_AMOUNT - PRO_INTRO_DISCOUNT;
export const PRO_OFFER_VERSION = 'pro_intro_199x3_then_249_v1';
export const PRO_STANDARD_OFFER_VERSION = 'standard_249_v1';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const catalogCacheTtlMs = 5 * 60_000;

function id(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id || null;
}

function productId(value: Stripe.Price['product']): string | null {
  if (typeof value === 'string') return value;
  return value && !('deleted' in value && value.deleted) ? value.id : null;
}

export type StripeBillingCatalog = {
  priceId: string;
  couponId: string;
  productId: string;
  livemode: boolean;
};

export type StripeBillingPortalConfiguration = {
  id: string;
  livemode: boolean;
};

export type StripeSubscriptionCheckoutRequest = Stripe.Checkout.SessionCreateParams;

export function buildStripeSubscriptionCheckoutRequest(input: {
  userId: string;
  customerId: string;
  reservationId: string;
  introEligible: boolean;
  expiresAt: number;
  origin: string;
  catalog: StripeBillingCatalog;
}): StripeSubscriptionCheckoutRequest {
  const metadata = {
    app_user_id: input.userId,
    workspace_type: 'personal',
    workspace_id: input.userId,
    offer_version: input.introEligible ? PRO_OFFER_VERSION : PRO_STANDARD_OFFER_VERSION,
    checkout_reservation_id: input.reservationId,
  };
  return {
    mode: 'subscription',
    customer: input.customerId,
    line_items: [{ price: input.catalog.priceId, quantity: 1 }],
    ...(input.introEligible ? { discounts: [{ coupon: input.catalog.couponId }] } : {}),
    client_reference_id: input.userId,
    metadata,
    subscription_data: { metadata },
    expires_at: input.expiresAt,
    custom_text: {
      submit: { message: input.introEligible
        ? '3 เดือนแรก ฿199/เดือน จากนั้นต่ออายุอัตโนมัติ ฿249/เดือน ยกเลิกได้ โดยสิทธิ์ยังใช้ได้ถึงวันสิ้นรอบที่ชำระแล้ว'
        : 'ต่ออายุอัตโนมัติ ฿249/เดือน ยกเลิกได้ โดยสิทธิ์ยังใช้ได้ถึงวันสิ้นรอบที่ชำระแล้ว' },
    },
    success_url: `${input.origin}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/app?checkout=cancel`,
  };
}

export function isStripeCustomerOwnedByUser(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  userId: string,
  livemode: boolean,
): customer is Stripe.Customer {
  return !('deleted' in customer && customer.deleted)
    && customer.livemode === livemode
    && customer.metadata.app_user_id === userId
    && customer.metadata.workspace_type === 'personal'
    && customer.metadata.workspace_id === userId;
}

export function validateStripeBillingCatalog(
  price: Stripe.Price,
  coupon: Stripe.Coupon,
  expectedLivemode: boolean,
): StripeBillingCatalog {
  const configuredPriceId = required('STRIPE_PRO_PRICE_ID');
  const configuredCouponId = required('STRIPE_PRO_INTRO_COUPON_ID');
  const configuredProductId = productId(price.product);
  const configuredProductActive = typeof price.product !== 'string'
    && !('deleted' in price.product && price.product.deleted)
    && price.product.active;
  if (
    price.id !== configuredPriceId
    || !price.active
    || price.livemode !== expectedLivemode
    || price.type !== 'recurring'
    || price.billing_scheme !== 'per_unit'
    || price.currency !== 'thb'
    || price.unit_amount !== PRO_MONTHLY_AMOUNT
    || price.recurring?.interval !== 'month'
    || price.recurring.interval_count !== 1
    || price.recurring.usage_type !== 'licensed'
    || price.recurring.trial_period_days != null
    || !configuredProductId
    || !configuredProductActive
  ) throw new Error('Configured Stripe Pro Price is not an active THB 249 monthly price in this mode');

  const scopedProducts = coupon.applies_to?.products || [];
  if (
    coupon.id !== configuredCouponId
    || coupon.livemode !== expectedLivemode
    || !coupon.valid
    || coupon.amount_off !== PRO_INTRO_DISCOUNT
    || coupon.percent_off !== null
    || coupon.currency !== 'thb'
    || coupon.duration !== 'repeating'
    || coupon.duration_in_months !== PRO_INTRO_MONTHS
    || coupon.max_redemptions != null
    || coupon.redeem_by != null
    || scopedProducts.length !== 1
    || scopedProducts[0] !== configuredProductId
  ) throw new Error('Configured Stripe intro Coupon must be THB 50 off this product for 3 months');

  return {
    priceId: price.id,
    couponId: coupon.id,
    productId: configuredProductId,
    livemode: expectedLivemode,
  };
}

let cachedCatalog: { key: string; expiresAt: number; value: StripeBillingCatalog } | undefined;
let pendingCatalog: { key: string; value: Promise<StripeBillingCatalog> } | undefined;

export async function getStripeBillingCatalog(): Promise<StripeBillingCatalog> {
  const priceId = required('STRIPE_PRO_PRICE_ID');
  const couponId = required('STRIPE_PRO_INTRO_COUPON_ID');
  const livemode = configuredStripeLivemode();
  const key = `${livemode ? 'live' : 'test'}:${priceId}:${couponId}`;
  if (cachedCatalog?.key === key && cachedCatalog.expiresAt > Date.now()) return cachedCatalog.value;
  if (pendingCatalog?.key === key) return pendingCatalog.value;

  const value = Promise.all([
    stripe.prices.retrieve(priceId, { expand: ['product'] }),
    // `applies_to` is includable in the current Stripe API and is absent unless
    // explicitly requested. Product scoping is a required part of this offer.
    stripe.coupons.retrieve(couponId, { expand: ['applies_to'] }),
  ]).then(([price, coupon]) => {
    const validated = validateStripeBillingCatalog(price, coupon, livemode);
    cachedCatalog = { key, value: validated, expiresAt: Date.now() + catalogCacheTtlMs };
    return validated;
  }).finally(() => {
    if (pendingCatalog?.key === key) pendingCatalog = undefined;
  });
  pendingCatalog = { key, value };
  return value;
}

export function clearStripeBillingCatalogCacheForTests(): void {
  cachedCatalog = undefined;
  pendingCatalog = undefined;
}

export function validateStripeBillingPortalConfiguration(
  configuration: Stripe.BillingPortal.Configuration,
  expectedLivemode: boolean,
): StripeBillingPortalConfiguration {
  const configuredId = required('STRIPE_BILLING_PORTAL_CONFIGURATION_ID');
  const cancellation = configuration.features.subscription_cancel;
  if (
    configuration.id !== configuredId
    || !configuration.active
    || configuration.livemode !== expectedLivemode
    || !cancellation.enabled
    || cancellation.mode !== 'at_period_end'
    || cancellation.proration_behavior !== 'none'
    || configuration.features.subscription_update.enabled
    || !configuration.features.payment_method_update.enabled
  ) {
    throw new Error(
      'Configured Stripe Billing Portal must support payment-method recovery, cancel at period end, and disable subscription updates',
    );
  }
  return { id: configuration.id, livemode: configuration.livemode };
}

export async function getStripeBillingPortalConfiguration(): Promise<StripeBillingPortalConfiguration> {
  const configurationId = required('STRIPE_BILLING_PORTAL_CONFIGURATION_ID');
  const livemode = configuredStripeLivemode();
  // Portal configurations are mutable. Revalidate immediately before every
  // session so a recently loosened cancellation/update policy fails closed.
  return validateStripeBillingPortalConfiguration(
    await stripe.billingPortal.configurations.retrieve(configurationId),
    livemode,
  );
}

export type StripeSubscriptionRecord = {
  userId: string;
  workspaceId: string;
  customerId: string;
  subscriptionId: string;
  subscriptionCreated: number;
  subscriptionStart: number;
  priceId: string;
  status: Stripe.Subscription.Status;
  billingPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  hasIntroCoupon: boolean;
};

function discountCouponId(discount: string | Stripe.Discount | Stripe.DeletedDiscount): string | null {
  if (typeof discount === 'string') return null;
  if ('deleted' in discount && discount.deleted) return null;
  return id(discount.source?.coupon);
}

export function subscriptionRecord(
  subscription: Stripe.Subscription,
  catalog: StripeBillingCatalog,
): StripeSubscriptionRecord | null {
  const item = subscription.items.data.find(candidate => {
    const price = candidate.price;
    return price.id === catalog.priceId
      && productId(price.product) === catalog.productId
      && price.livemode === catalog.livemode
      && price.currency === 'thb'
      && price.unit_amount === PRO_MONTHLY_AMOUNT
      && price.type === 'recurring'
      && price.recurring?.interval === 'month'
      && price.recurring.interval_count === 1
      && price.recurring.usage_type === 'licensed'
      && candidate.quantity === 1;
  });
  if (!item || subscription.items.data.length !== 1 || subscription.items.has_more
    || subscription.livemode !== catalog.livemode
    || !Number.isInteger(subscription.start_date) || subscription.start_date < 0) return null;

  const metadataUser = subscription.metadata.app_user_id;
  const userId = uuid.test(metadataUser || '') ? metadataUser : null;
  if (!userId || !uuid.test(userId)) return null;
  const workspaceType = subscription.metadata.workspace_type;
  const workspaceId = subscription.metadata.workspace_id;
  if (workspaceType !== 'personal' || workspaceId !== userId || !uuid.test(workspaceId)) return null;
  const customerId = id(subscription.customer);
  if (!customerId) return null;

  return {
    userId,
    workspaceId,
    customerId,
    subscriptionId: subscription.id,
    subscriptionCreated: subscription.created,
    subscriptionStart: subscription.start_date,
    priceId: item.price.id,
    status: subscription.status,
    billingPeriodEnd: new Date(item.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    hasIntroCoupon: subscription.discounts.some(discount => discountCouponId(discount) === catalog.couponId),
  };
}

export type InvoiceIntroDiscount = {
  applied: boolean;
  start: string | null;
  end: string | null;
};

export function invoiceIntroDiscount(
  invoice: Stripe.Invoice,
  catalog: StripeBillingCatalog,
  subscriptionId: string,
  subscriptionStart: number,
): InvoiceIntroDiscount | null {
  const discounts = invoice.discounts || [];
  if (discounts.length === 0) return { applied: false, start: null, end: null };
  if (discounts.length !== 1) return null;
  const discount = discounts[0];
  if (typeof discount === 'string' || ('deleted' in discount && discount.deleted)) return null;
  if (discountCouponId(discount) !== catalog.couponId
    || discount.promotion_code !== null
    || discount.subscription !== subscriptionId
    || discount.subscription_item !== null
    || discount.invoice !== null
    || discount.invoice_item !== null
    || discount.start !== subscriptionStart
    || discount.end === null
    || discount.end <= discount.start) return null;
  return {
    applied: true,
    start: new Date(discount.start * 1000).toISOString(),
    end: new Date(discount.end * 1000).toISOString(),
  };
}

export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  if (current) return id(current);
  return id((invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription);
}

export function paidThroughFromInvoiceLines(
  lines: Stripe.InvoiceLineItem[],
  catalog: StripeBillingCatalog,
  subscriptionId: string,
): string | null {
  return paidPeriodFromInvoiceLines(lines, catalog, subscriptionId)?.end || null;
}

export function paidPeriodFromInvoiceLines(
  lines: Stripe.InvoiceLineItem[],
  catalog: StripeBillingCatalog,
  subscriptionId: string,
): { start: string; end: string } | null {
  let paidFrom = 0;
  let paidThrough = 0;
  for (const line of lines) {
    const parent = line.parent?.subscription_item_details;
    const price = line.pricing?.price_details?.price;
    if (
      !parent
      || parent.proration
      || parent.subscription !== subscriptionId
      || id(price) !== catalog.priceId
      || line.pricing?.price_details?.product !== catalog.productId
      || line.pricing.unit_amount_decimal === null
      || String(line.pricing.unit_amount_decimal) !== String(PRO_MONTHLY_AMOUNT)
      || line.currency !== 'thb'
      || line.quantity !== 1
      || line.subtotal !== PRO_MONTHLY_AMOUNT
    ) continue;
    if (line.period.end > paidThrough) {
      paidFrom = line.period.start;
      paidThrough = line.period.end;
    }
  }
  return paidThrough > 0 ? {
    start: new Date(paidFrom * 1000).toISOString(),
    end: new Date(paidThrough * 1000).toISOString(),
  } : null;
}

export type InvoicePriceValidation = { paid: boolean; introDiscountApplied: boolean };

export function validatePaidInvoicePrice(
  invoice: Stripe.Invoice,
  lines: Stripe.InvoiceLineItem[],
  catalog: StripeBillingCatalog,
): InvoicePriceValidation {
  const discount = (invoice.total_discount_amounts || []).reduce((sum, item) => sum + item.amount, 0);
  const totalBeforeTax = invoice.total_excluding_tax ?? invoice.total;
  const couponIds = (invoice.discounts || []).map(discountCouponId).filter((value): value is string => Boolean(value));
  const introDiscountApplied = discount === PRO_INTRO_DISCOUNT
    && totalBeforeTax === PRO_INTRO_TOTAL
    && couponIds.length === 1
    && couponIds[0] === catalog.couponId;
  const standardPriceApplied = discount === 0
    && totalBeforeTax === PRO_MONTHLY_AMOUNT
    && couponIds.length === 0;
  const expectedTotal = introDiscountApplied ? PRO_INTRO_TOTAL : PRO_MONTHLY_AMOUNT;
  const nonZeroLines = lines.filter(line => line.subtotal !== 0);
  const exactCatalogLine = nonZeroLines.length === 1
    && nonZeroLines[0].currency === 'thb'
    && nonZeroLines[0].subtotal === PRO_MONTHLY_AMOUNT
    && id(nonZeroLines[0].pricing?.price_details?.price) === catalog.priceId
    && nonZeroLines[0].pricing?.price_details?.product === catalog.productId;
  return {
    paid: invoice.status === 'paid'
      && invoice.currency === 'thb'
      && invoice.amount_remaining === 0
      && invoice.amount_overpaid === 0
      // This is an includable Stripe field. Absence is not evidence of zero;
      // callers must explicitly request it when retrieving the Invoice.
      && typeof invoice.amount_paid_off_stripe === 'number'
      && invoice.amount_paid_off_stripe === 0
      && invoice.amount_shipping === 0
      && (!invoice.shipping_cost || invoice.shipping_cost.amount_total === 0)
      && invoice.post_payment_credit_notes_amount === 0
      && invoice.pre_payment_credit_notes_amount === 0
      && invoice.starting_balance === 0
      && (invoice.ending_balance ?? 0) === 0
      && (invoice.total_taxes || []).every(tax => tax.amount === 0)
      && invoice.collection_method === 'charge_automatically'
      && ['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason || '')
      && invoice.subtotal === PRO_MONTHLY_AMOUNT
      && invoice.subtotal_excluding_tax === PRO_MONTHLY_AMOUNT
      && invoice.total === expectedTotal
      && invoice.total_excluding_tax === expectedTotal
      && invoice.amount_paid === expectedTotal
      && invoice.amount_due === expectedTotal
      && lines.length <= 100
      && exactCatalogLine
      && (introDiscountApplied || standardPriceApplied),
    introDiscountApplied,
  };
}
