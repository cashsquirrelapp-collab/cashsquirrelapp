import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {
  isStripeCustomerOwnedByUser,
  paidThroughFromInvoiceLines,
  PRO_INTRO_TOTAL,
  PRO_MONTHLY_AMOUNT,
  subscriptionRecord,
  validatePaidInvoicePrice,
  validateStripeBillingCatalog,
  validateStripeBillingPortalConfiguration,
  type StripeBillingCatalog,
} from '../backend/src/services/stripeSubscriptions.js';
import { stripeLivemodeForKey } from '../backend/src/config/stripe.js';

const userId = '11111111-1111-4111-8111-111111111111';
const productId = 'prod_sandbox_pro';
const priceId = 'price_sandbox_249';
const couponId = 'coupon_sandbox_50x3';
const portalId = 'bpc_sandbox_safe';

process.env.STRIPE_PRO_PRICE_ID = priceId;
process.env.STRIPE_PRO_INTRO_COUPON_ID = couponId;
process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID = portalId;

function price(overrides: Record<string, unknown> = {}): Stripe.Price {
  return {
    id: priceId,
    object: 'price',
    active: true,
    livemode: false,
    type: 'recurring',
    billing_scheme: 'per_unit',
    currency: 'thb',
    unit_amount: PRO_MONTHLY_AMOUNT,
    product: { id: productId, object: 'product', active: true },
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    ...overrides,
  } as unknown as Stripe.Price;
}

function coupon(overrides: Record<string, unknown> = {}): Stripe.Coupon {
  return {
    id: couponId,
    object: 'coupon',
    livemode: false,
    valid: true,
    amount_off: 5_000,
    percent_off: null,
    currency: 'thb',
    duration: 'repeating',
    duration_in_months: 3,
    applies_to: { products: [productId] },
    ...overrides,
  } as unknown as Stripe.Coupon;
}

const catalog: StripeBillingCatalog = { priceId, couponId, productId, livemode: false };

function discount(id = couponId): Stripe.Discount {
  return {
    id: 'di_intro',
    object: 'discount',
    source: { type: 'coupon', coupon: { id, object: 'coupon' } },
  } as unknown as Stripe.Discount;
}

function line(overrides: Record<string, unknown> = {}): Stripe.InvoiceLineItem {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'il_pro',
    object: 'line_item',
    currency: 'thb',
    quantity: 1,
    subtotal: PRO_MONTHLY_AMOUNT,
    period: { start: now, end: now + 2_592_000 },
    parent: { type: 'subscription_item_details', subscription_item_details: { proration: false, subscription: 'sub_pro' } },
    pricing: { type: 'price_details', unit_amount_decimal: String(PRO_MONTHLY_AMOUNT), price_details: { price: priceId, product: productId } },
    ...overrides,
  } as unknown as Stripe.InvoiceLineItem;
}

function invoice(intro: boolean, overrides: Record<string, unknown> = {}): Stripe.Invoice {
  const total = intro ? PRO_INTRO_TOTAL : PRO_MONTHLY_AMOUNT;
  return {
    id: 'in_pro',
    object: 'invoice',
    status: 'paid',
    currency: 'thb',
    amount_due: total,
    amount_paid: total,
    amount_remaining: 0,
    amount_overpaid: 0,
    amount_paid_off_stripe: 0,
    amount_shipping: 0,
    collection_method: 'charge_automatically',
    billing_reason: 'subscription_cycle',
    subtotal: PRO_MONTHLY_AMOUNT,
    subtotal_excluding_tax: PRO_MONTHLY_AMOUNT,
    total,
    total_excluding_tax: total,
    total_discount_amounts: intro ? [{ amount: 5_000, discount: 'di_intro' }] : [],
    discounts: intro ? [discount()] : [],
    total_taxes: [],
    shipping_cost: null,
    post_payment_credit_notes_amount: 0,
    pre_payment_credit_notes_amount: 0,
    starting_balance: 0,
    ending_balance: 0,
    ...overrides,
  } as unknown as Stripe.Invoice;
}

test('Stripe mode, 249 THB catalog and product-scoped 50 THB x3 coupon fail closed', () => {
  assert.equal(stripeLivemodeForKey('sk_test_example'), false);
  assert.equal(stripeLivemodeForKey('rk_live_example'), true);
  assert.throws(() => stripeLivemodeForKey('pk_test_public'));
  assert.deepEqual(validateStripeBillingCatalog(price(), coupon(), false), catalog);
  assert.throws(() => validateStripeBillingCatalog(price({ unit_amount: 19_900 }), coupon(), false));
  assert.throws(() => validateStripeBillingCatalog(price(), coupon({ applies_to: { products: ['prod_other'] } }), false));
  assert.throws(() => validateStripeBillingCatalog(price(), coupon({ duration_in_months: 4 }), false));
  assert.throws(() => validateStripeBillingCatalog(price(), coupon(), true));
});

test('Billing Portal is pinned to end-of-period cancellation with plan changes disabled', () => {
  const configuration = {
    id: portalId,
    active: true,
    livemode: false,
    features: {
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
      subscription_update: { enabled: false },
    },
  } as unknown as Stripe.BillingPortal.Configuration;
  assert.deepEqual(validateStripeBillingPortalConfiguration(configuration, false), { id: portalId, livemode: false });
  assert.throws(() => validateStripeBillingPortalConfiguration({ ...configuration, active: false }, false));
  assert.throws(() => validateStripeBillingPortalConfiguration({ ...configuration, features: {
    ...configuration.features,
    subscription_cancel: { ...configuration.features.subscription_cancel, mode: 'immediately' },
  } }, false));
  assert.throws(() => validateStripeBillingPortalConfiguration({ ...configuration, features: {
    ...configuration.features,
    subscription_update: { ...configuration.features.subscription_update, enabled: true },
  } }, false));
});

test('stable Stripe Customer ownership requires exact mode and personal workspace metadata', () => {
  const customer = {
    id: 'cus_pro', object: 'customer', livemode: false,
    metadata: { app_user_id: userId, workspace_type: 'personal', workspace_id: userId },
  } as unknown as Stripe.Customer;
  assert.equal(isStripeCustomerOwnedByUser(customer, userId, false), true);
  assert.equal(isStripeCustomerOwnedByUser({ ...customer, metadata: {} } as Stripe.Customer, userId, false), false);
  assert.equal(isStripeCustomerOwnedByUser(customer, userId, true), false);
  assert.equal(isStripeCustomerOwnedByUser({ id: customer.id, object: 'customer', deleted: true } as Stripe.DeletedCustomer, userId, false), false);
});

test('subscription and paid invoices require the exact recurring catalog and configured intro coupon', () => {
  const now = Math.floor(Date.now() / 1000);
  const subscription = {
    id: 'sub_pro', object: 'subscription', created: now - 10, livemode: false,
    customer: 'cus_pro', status: 'active', cancel_at_period_end: false,
    metadata: { app_user_id: userId, workspace_type: 'personal', workspace_id: userId },
    items: { data: [{ quantity: 1, current_period_end: now + 2_592_000, price: price() }], has_more: false },
    discounts: [discount()],
  } as unknown as Stripe.Subscription;
  const record = subscriptionRecord(subscription, catalog);
  assert.equal(record?.hasIntroCoupon, true);
  assert.equal(record?.userId, userId);
  assert.equal(subscriptionRecord({ ...subscription, livemode: true } as Stripe.Subscription, catalog), null);
  assert.equal(subscriptionRecord({ ...subscription, metadata: {} } as Stripe.Subscription, catalog), null);

  const recurringLine = line();
  assert.equal(validatePaidInvoicePrice(invoice(true), [recurringLine], catalog).paid, true);
  assert.equal(validatePaidInvoicePrice(invoice(false), [recurringLine], catalog).paid, true);
  assert.equal(validatePaidInvoicePrice(invoice(true, { discounts: [discount('coupon_other')] }), [recurringLine], catalog).paid, false);
  assert.equal(validatePaidInvoicePrice(invoice(true), [recurringLine, line({ id: 'il_extra', subtotal: 1 })], catalog).paid, false);
  assert.equal(validatePaidInvoicePrice(invoice(true, { amount_shipping: 1 }), [recurringLine], catalog).paid, false);
  assert.equal(validatePaidInvoicePrice(invoice(true, { collection_method: 'send_invoice' }), [recurringLine], catalog).paid, false);
  assert.ok(paidThroughFromInvoiceLines([recurringLine], catalog, 'sub_pro'));
  assert.equal(paidThroughFromInvoiceLines([line({ parent: { type: 'subscription_item_details', subscription_item_details: { proration: true, subscription: 'sub_pro' } } })], catalog, 'sub_pro'), null);
});
