import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {
  buildPromptPayCheckoutRequest,
  buildStripeSubscriptionCheckoutRequest,
  clearStripeBillingCatalogCacheForTests,
  getStripeBillingCatalog,
  introCouponMonths,
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
import { promptPayCheckoutRecord, validatePromptPayLineItems } from '../backend/src/services/promptPay.js';
import { stripe, stripeLivemodeForKey } from '../backend/src/config/stripe.js';

const userId = '11111111-1111-4111-8111-111111111111';
const productId = 'prod_sandbox_pro';
const priceId = 'price_sandbox_249';
const couponId = 'coupon_sandbox_50x3';
const portalId = 'bpc_sandbox_safe';

process.env.STRIPE_PRO_PRICE_ID = priceId;
process.env.STRIPE_PRO_INTRO_COUPON_ID = couponId;
process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID = portalId;
process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
process.env.STRIPE_MODE = 'test';

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
    source: { type: 'coupon', coupon: coupon({ id }) },
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
      payment_method_update: { enabled: true, payment_method_configuration: null },
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
  assert.throws(() => validateStripeBillingPortalConfiguration({ ...configuration, features: {
    ...configuration.features,
    payment_method_update: { enabled: false, payment_method_configuration: null },
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
    id: 'sub_pro', object: 'subscription', created: now - 10, start_date: now - 10, livemode: false,
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
  assert.equal(validatePaidInvoicePrice(invoice(true, { amount_paid_off_stripe: undefined }), [recurringLine], catalog).paid, false);
  assert.equal(validatePaidInvoicePrice(invoice(true, { amount_paid_off_stripe: 1 }), [recurringLine], catalog).paid, false);
  assert.equal(validatePaidInvoicePrice(invoice(true), [recurringLine, ...Array.from({ length: 100 }, (_, index) => line({ id: `il_zero_${index}`, subtotal: 0 }))], catalog).paid, false);
  assert.ok(paidThroughFromInvoiceLines([recurringLine], catalog, 'sub_pro'));
  assert.equal(paidThroughFromInvoiceLines([line({ parent: { type: 'subscription_item_details', subscription_item_details: { proration: true, subscription: 'sub_pro' } } })], catalog, 'sub_pro'), null);
});

test('an unrelated 39 THB subscription is not adopted into the 249 THB catalog', () => {
  const now = Math.floor(Date.now() / 1000);
  const unrelated = {
    id: 'sub_unrelated_39', object: 'subscription', created: now - 10, start_date: now - 10,
    livemode: false, customer: 'cus_unrelated', status: 'past_due', cancel_at_period_end: false,
    metadata: {}, discounts: [],
    items: { data: [{ quantity: 1, current_period_end: now + 2_592_000,
      price: price({ id: 'price_unrelated_39', unit_amount: 3_900 }) }], has_more: false },
  } as unknown as Stripe.Subscription;
  const before = structuredClone(unrelated);
  assert.equal(subscriptionRecord(unrelated, catalog), null);
  assert.deepEqual(unrelated, before);
  // Even app-like metadata must not make an unrelated price valid.
  assert.equal(subscriptionRecord({ ...unrelated,
    metadata: { app_user_id: userId, workspace_type: 'personal', workspace_id: userId },
  } as Stripe.Subscription, catalog), null);
});

test('catalog retrieval explicitly includes product scope and rejects hidden offer limits or trials', async () => {
  const prices = stripe.prices;
  const coupons = stripe.coupons;
  const originalPriceRetrieve = prices.retrieve;
  const originalCouponRetrieve = coupons.retrieve;
  let couponParams: unknown;
  prices.retrieve = (async () => price()) as unknown as typeof prices.retrieve;
  coupons.retrieve = (async (_id: string, params?: unknown) => {
    couponParams = params;
    return coupon();
  }) as unknown as typeof coupons.retrieve;
  clearStripeBillingCatalogCacheForTests();
  try {
    assert.deepEqual(await getStripeBillingCatalog(), catalog);
    assert.deepEqual(couponParams, { expand: ['applies_to'] });
    assert.throws(() => validateStripeBillingCatalog(price({ recurring: {
      interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: 7,
    } }), coupon(), false));
    assert.throws(() => validateStripeBillingCatalog(price(), coupon({ max_redemptions: 100 }), false));
    assert.throws(() => validateStripeBillingCatalog(price(), coupon({ redeem_by: 2_000_000_000 }), false));
  } finally {
    prices.retrieve = originalPriceRetrieve;
    coupons.retrieve = originalCouponRetrieve;
    clearStripeBillingCatalogCacheForTests();
  }
});

test('Checkout retry after a lost response reuses byte-equivalent parameters and one idempotency key', async () => {
  const input = {
    userId,
    customerId: 'cus_stable',
    reservationId: 'reservation-stable',
    introEligible: true,
    expiresAt: 2_000_002_700,
    origin: 'https://cash-squirrel.example',
    catalog,
  };
  const first = buildStripeSubscriptionCheckoutRequest(input);
  // Model the normalized JSONB request returned by the prepare RPC on every
  // attempt, including one that follows a server-side create + client timeout.
  const persisted = JSON.parse(JSON.stringify(first)) as Stripe.Checkout.SessionCreateParams;
  const remoteSessions = new Map<string, { fingerprint: string; session: { id: string } }>();
  let loseFirstResponse = true;
  const create = async (params: Stripe.Checkout.SessionCreateParams, idempotencyKey: string) => {
    const fingerprint = JSON.stringify(params);
    const existing = remoteSessions.get(idempotencyKey);
    if (existing) {
      assert.equal(existing.fingerprint, fingerprint);
      return existing.session;
    }
    const session = { id: 'cs_one_remote_session' };
    remoteSessions.set(idempotencyKey, { fingerprint, session });
    if (loseFirstResponse) {
      loseFirstResponse = false;
      throw new Error('simulated timeout after Stripe committed');
    }
    return session;
  };
  const key = `cash-squirrel-pro-checkout:${input.reservationId}`;
  await assert.rejects(create(persisted, key), /simulated timeout/);
  const retriedCandidate = buildStripeSubscriptionCheckoutRequest(input);
  assert.deepEqual(retriedCandidate, persisted);
  const recovered = await create(persisted, key);
  assert.equal(recovered.id, 'cs_one_remote_session');
  assert.equal(remoteSessions.size, 1);
});

test('remaining card promo cycles use a validated account-bound dynamic coupon', () => {
  const twoMonth = coupon({
    id: 'coupon_dynamic_2',
    duration_in_months: 2,
    max_redemptions: 1,
    metadata: {
      cash_squirrel_offer: 'pro_intro_199x3_then_249_v1',
      cash_squirrel_intro_months: '2',
      app_user_id: userId,
    },
  });
  assert.equal(introCouponMonths(twoMonth, catalog, userId), 2);
  assert.equal(introCouponMonths({ ...twoMonth, metadata: { ...twoMonth.metadata, app_user_id: '22222222-2222-4222-8222-222222222222' } } as Stripe.Coupon, catalog, userId), null);
  const request = buildStripeSubscriptionCheckoutRequest({
    userId,
    customerId: 'cus_dynamic',
    reservationId: 'reservation-dynamic',
    introCyclesRemaining: 2,
    introCouponId: twoMonth.id,
    expiresAt: 2_000_002_700,
    origin: 'https://cash-squirrel.example',
    catalog,
  });
  assert.deepEqual(request.discounts, [{ coupon: twoMonth.id }]);
  assert.equal(request.metadata?.intro_cycles_remaining, '2');
});

test('PromptPay Checkout is one-time, exact-price, calendar-month access metadata with canonical payment validation', () => {
  const created = 2_000_000_000;
  const request = buildPromptPayCheckoutRequest({
    userId,
    customerId: 'cus_promptpay',
    reservationId: 'reservation-promptpay',
    introCycle: 2,
    expiresAt: created + 1_830,
    origin: 'https://cash-squirrel.example',
  });
  assert.equal(request.mode, 'payment');
  assert.deepEqual(request.excluded_payment_method_types, ['card']);
  assert.equal(request.line_items?.[0].price_data?.unit_amount, PRO_INTRO_TOTAL);
  assert.equal(request.metadata?.intro_cycle, '2');
  const charge = {
    id: 'ch_promptpay', object: 'charge', status: 'succeeded', paid: true, refunded: false,
    amount_refunded: 0, amount: PRO_INTRO_TOTAL, currency: 'thb', customer: 'cus_promptpay',
    payment_intent: 'pi_promptpay', created,
  } as unknown as Stripe.Charge;
  const paymentMethod = { id: 'pm_promptpay', object: 'payment_method', type: 'promptpay' } as Stripe.PaymentMethod;
  const paymentIntent = {
    id: 'pi_promptpay', object: 'payment_intent', livemode: false, status: 'succeeded',
    customer: 'cus_promptpay', currency: 'thb', amount: PRO_INTRO_TOTAL,
    amount_received: PRO_INTRO_TOTAL, amount_capturable: 0,
    payment_method_types: ['promptpay'], payment_method: paymentMethod, latest_charge: charge,
    metadata: request.payment_intent_data?.metadata,
  } as unknown as Stripe.PaymentIntent;
  const session = {
    id: 'cs_promptpay', object: 'checkout.session', created, livemode: false, mode: 'payment',
    status: 'complete', payment_status: 'paid', client_reference_id: userId,
    customer: 'cus_promptpay', currency: 'thb', amount_total: PRO_INTRO_TOTAL,
    payment_intent: paymentIntent, metadata: request.metadata,
  } as unknown as Stripe.Checkout.Session;
  const lineItem = {
    id: 'li_promptpay', object: 'item', quantity: 1, currency: 'thb',
    amount_subtotal: PRO_INTRO_TOTAL, amount_total: PRO_INTRO_TOTAL,
    price: { active: true, type: 'one_time', currency: 'thb', unit_amount: PRO_INTRO_TOTAL, recurring: null },
  } as unknown as Stripe.LineItem;
  assert.equal(promptPayCheckoutRecord(session, paymentIntent, false)?.introCycle, 2);
  assert.equal(validatePromptPayLineItems(session, [lineItem]), true);
  assert.equal(promptPayCheckoutRecord({ ...session, amount_total: PRO_MONTHLY_AMOUNT } as Stripe.Checkout.Session, paymentIntent, false), null);
});
