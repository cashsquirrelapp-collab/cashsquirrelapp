import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { createMissingPrices, paymentReadiness } from '../backend/src/services/paymentReadiness';
import { PREPAID_OFFER, prepaidLookup, validPrepaidPrice } from '../backend/src/services/prepaidPlans';
import { recurringLookup, recurringProductId, validRecurringPrice } from '../backend/src/services/cardPlans';
import { PRO_MONTH_REGULAR_FROM } from '../shared/proPricing';

// The admin page's payment check (owner, 2026-10-27: card and PromptPay QR, at the new price). It must say "ready" only
// when checkout itself would sell: the same price checks, the same payment method rule, and the webhook that turns a
// card payment into Pro. A fake Stripe: no network, no key.

process.env.APP_URL = 'https://kraroktunngern.cashsquirrelapp.workers.dev';
process.env.KRAROK_PREPAID_ENABLED = 'true';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake_publishable';
delete process.env.KRAROK_PAYMENT_CONFIGURATION;

const NOW = Date.parse('2026-10-27T05:00:00Z');
const DEC = PRO_MONTH_REGULAR_FROM;
const APP_HOOK = 'https://kraroktunngern.cashsquirrelapp.workers.dev/api/stripe-webhook';

const oneTime = (amount: number, lookup = prepaidLookup('month', NOW)): Stripe.Price => ({
  id: `price_${lookup}_${amount}`, object: 'price', active: true, livemode: false, type: 'one_time', recurring: null, currency: 'thb', unit_amount: amount * 100,
  billing_scheme: 'per_unit', lookup_key: lookup, product: 'prod_prepaid', custom_unit_amount: null, transform_quantity: null, tax_behavior: 'unspecified',
  metadata: { offer_version: PREPAID_OFFER, period: 'month', months: '1' },
} as unknown as Stripe.Price);
const recurring = (amount: number, lookup = recurringLookup('month', NOW)): Stripe.Price => ({
  id: `price_${lookup}_${amount}`, object: 'price', active: true, livemode: false, type: 'recurring', currency: 'thb', unit_amount: amount * 100,
  billing_scheme: 'per_unit', lookup_key: lookup, product: recurringProductId(), custom_unit_amount: null, transform_quantity: null, tax_behavior: 'unspecified',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: null }, metadata: { offer: 'card' },
} as unknown as Stripe.Price);
const todays = () => [oneTime(177), recurring(177)];
const decembers = () => [oneTime(271, prepaidLookup('month', DEC)), recurring(271, recurringLookup('month', DEC))];

const on = { available: true, display_preference: { overridable: true, preference: 'on', value: 'on' } };
const off = { available: true, display_preference: { overridable: true, preference: 'off', value: 'off' } };
const methods = (over: Record<string, unknown> = {}) => ({ id: 'pmc_default', object: 'payment_method_configuration', active: true, is_default: true, livemode: false,
  card: on, promptpay: on, apple_pay: on, google_pay: on, link: off, alipay: off, ...over } as unknown as Stripe.PaymentMethodConfiguration);
const hook = (url = APP_HOOK, events: string[] = ['*'], status = 'enabled') => ({ id: `we_${url.length}`, object: 'webhook_endpoint', url, enabled_events: events, status, livemode: false } as unknown as Stripe.WebhookEndpoint);

type Part = 'prices' | 'create' | 'methods' | 'webhooks';
function fakeStripe({ catalog = [] as Stripe.Price[], configs = [methods()], endpoints = [hook()], deny = [] as Part[] } = {}) {
  const created: Stripe.PriceCreateParams[] = [];
  const keys: string[] = [];
  const refuse = (part: Part) => {
    if (deny.includes(part)) throw Object.assign(new Error('The provided key rk_test_abc… does not have the required permissions'), { statusCode: 403, type: 'StripePermissionError' });
  };
  const stripe = {
    prices: {
      list: async (params: Stripe.PriceListParams) => { refuse('prices'); return { data: catalog.filter(price => price.active && params.lookup_keys?.includes(price.lookup_key!)) }; },
      create: async (params: Stripe.PriceCreateParams, options: Stripe.RequestOptions) => {
        refuse('create');
        created.push(params); keys.push(options.idempotencyKey!);
        // transfer_lookup_key: the key moves to the new price.
        for (const price of catalog) if (price.lookup_key === params.lookup_key) (price as { lookup_key: string | null }).lookup_key = null;
        const price = { id: `price_new_${created.length}`, object: 'price', active: true, livemode: false, type: params.recurring ? 'recurring' : 'one_time',
          recurring: params.recurring ? { ...params.recurring, trial_period_days: null } : null, currency: params.currency, unit_amount: params.unit_amount,
          billing_scheme: 'per_unit', lookup_key: params.lookup_key, product: params.product, custom_unit_amount: null, transform_quantity: null,
          tax_behavior: 'unspecified', metadata: params.metadata } as unknown as Stripe.Price;
        catalog.push(price);
        return price;
      },
    },
    paymentMethodConfigurations: { list: async () => { refuse('methods'); return { data: configs }; } },
    webhookEndpoints: { list: async () => { refuse('webhooks'); return { data: endpoints }; } },
  } as unknown as Stripe;
  return { stripe, created, keys, catalog };
}

test('ready: today\'s ฿177 prices, card and PromptPay on, the webhook reaching this app; 1 Dec\'s ฿271 prices too', async () => {
  const { stripe } = fakeStripe({ catalog: [...todays(), ...decembers()] });
  const result = await paymentReadiness(stripe, false, NOW);
  assert.equal(result.status, 'ready');
  assert.equal(result.nextPriceReady, true);
  assert.equal(result.creatable, 0);
  assert.deepEqual([result.server.state, result.methods.state, result.prices.state, result.webhook.state], ['ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(result.prices.items.map(item => [item.kind, item.from, item.later, item.expected, item.current, item.state]), [
    ['one_time', '2026-11-30', false, 177, 177, 'ok'], ['recurring', '2026-11-30', false, 177, 177, 'ok'],
    ['one_time', '2026-12-01', true, 271, 271, 'ok'], ['recurring', '2026-12-01', true, 271, 271, 'ok'],
  ]);
  assert.deepEqual(result.webhook.missingEvents, []);
  // Only the periods on sale are checked: 6 months and a year are closed.
  assert.ok(result.prices.items.every(item => item.period === 'month'));
  // Nothing secret in the answer.
  assert.doesNotMatch(JSON.stringify(result), /(sk|rk|pk)_(test|live)_/);
});

test('ready today without 1 Dec\'s prices: it says so, and they can be made now', async () => {
  const { stripe } = fakeStripe({ catalog: todays() });
  const result = await paymentReadiness(stripe, false, NOW);
  assert.equal(result.status, 'ready');
  assert.equal(result.nextPriceReady, false);
  assert.equal(result.creatable, 2);
  assert.deepEqual(result.prices.items.filter(item => item.later).map(item => [item.state, item.current, item.creatable]), [['missing', null, true], ['missing', null, true]]);
});

test('the old ฿159 prices stop payment; the owner\'s button makes exactly the four prices checkout sells, once', async () => {
  const fake = fakeStripe({ catalog: [oneTime(159), recurring(159)] });
  const before = await paymentReadiness(fake.stripe, false, NOW);
  assert.equal(before.status, 'blocked');
  assert.equal(before.prices.state, 'problem');
  assert.deepEqual(before.prices.items.map(item => [item.state, item.current, item.expected, item.creatable]), [
    ['wrong', 159, 177, true], ['wrong', 159, 177, true], ['missing', null, 271, true], ['missing', null, 271, true],
  ]);
  assert.equal(before.creatable, 4);

  assert.equal(await createMissingPrices(fake.stripe, false, NOW), 4);
  assert.deepEqual(fake.created.map(params => [params.lookup_key, params.unit_amount, params.transfer_lookup_key]), [
    [prepaidLookup('month', NOW), 17700, true], [recurringLookup('month', NOW), 17700, true],
    [prepaidLookup('month', DEC), 27100, true], [recurringLookup('month', DEC), 27100, true],
  ]);
  assert.ok(fake.keys.every(key => key.startsWith('krarok-price:test:')) && new Set(fake.keys).size === 4);
  // Each new price passes checkout's own check for its day.
  const at = (lookup: string) => fake.catalog.find(price => price.lookup_key === lookup)!;
  assert.equal(validPrepaidPrice(at(prepaidLookup('month', NOW)), 'month', false, NOW), true);
  assert.equal(validRecurringPrice(at(recurringLookup('month', NOW)), 'month', false, NOW), true);
  assert.equal(validPrepaidPrice(at(prepaidLookup('month', DEC)), 'month', false, DEC), true);
  assert.equal(validRecurringPrice(at(recurringLookup('month', DEC)), 'month', false, DEC), true);

  const after = await paymentReadiness(fake.stripe, false, NOW);
  assert.equal(after.status, 'ready');
  assert.equal(after.nextPriceReady, true);
  assert.equal(await createMissingPrices(fake.stripe, false, NOW), 0, 'pressed again: nothing new');
  assert.equal(fake.created.length, 4);
});

test('PromptPay off, or another payment type on, stops payment as checkout would', async () => {
  const promptpayOff = await paymentReadiness(fakeStripe({ catalog: todays(), configs: [methods({ promptpay: off })] }).stripe, false, NOW);
  assert.equal(promptpayOff.status, 'blocked');
  assert.deepEqual([promptpayOff.methods.state, promptpayOff.methods.card, promptpayOff.methods.promptpay], ['problem', true, false]);
  const extra = await paymentReadiness(fakeStripe({ catalog: todays(), configs: [methods({ link: on })] }).stripe, false, NOW);
  assert.equal(extra.status, 'blocked');
  assert.deepEqual(extra.methods.extra, ['link']);
  const none = await paymentReadiness(fakeStripe({ catalog: todays(), configs: [] }).stripe, false, NOW);
  assert.equal(none.methods.state, 'problem');
});

test('a webhook only at the old address: a card payment would never turn into Pro', async () => {
  const old = await paymentReadiness(fakeStripe({ catalog: todays(), endpoints: [hook('https://cash-squirrel.vercel.app/api/stripe-webhook')] }).stripe, false, NOW);
  assert.equal(old.status, 'blocked');
  assert.equal(old.webhook.state, 'problem');
  assert.deepEqual(old.webhook.otherHosts, ['cash-squirrel.vercel.app']);
  const few = await paymentReadiness(fakeStripe({ catalog: todays(), endpoints: [hook(APP_HOOK, ['payment_intent.succeeded'])] }).stripe, false, NOW);
  assert.equal(few.webhook.state, 'problem');
  assert.ok(few.webhook.missingEvents.includes('checkout.session.completed'));
  const disabled = await paymentReadiness(fakeStripe({ catalog: todays(), endpoints: [hook(APP_HOOK, ['*'], 'disabled')] }).stripe, false, NOW);
  assert.equal(disabled.webhook.state, 'problem');
  // Every payment event sent, a refund event not: payment works, the missing event is still listed.
  const noRefunds = await paymentReadiness(fakeStripe({ catalog: todays(), endpoints: [hook(APP_HOOK, ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded', 'invoice.paid'])] }).stripe, false, NOW);
  assert.equal(noRefunds.webhook.state, 'ok');
  assert.ok(noRefunds.webhook.missingEvents.includes('charge.refunded'));
});

test('a key that may not read a part: that part is unknown, with the permission to add, never a guess', async () => {
  const hooks = await paymentReadiness(fakeStripe({ catalog: todays(), deny: ['webhooks'] }).stripe, false, NOW);
  assert.equal(hooks.status, 'unknown');
  assert.deepEqual([hooks.webhook.state, hooks.webhook.permission], ['unknown', 'Webhook Endpoints: Read']);
  const prices = await paymentReadiness(fakeStripe({ deny: ['prices'] }).stripe, false, NOW);
  assert.deepEqual([prices.prices.state, prices.prices.permission, prices.nextPriceReady], ['unknown', 'Prices: Read', false]);
  const configs = await paymentReadiness(fakeStripe({ catalog: todays(), deny: ['methods'] }).stripe, false, NOW);
  assert.deepEqual([configs.methods.state, configs.methods.permission], ['unknown', 'Payment Method Configurations: Read']);
  // A known problem outweighs an unknown part.
  const both = await paymentReadiness(fakeStripe({ catalog: [oneTime(159)], deny: ['webhooks'] }).stripe, false, NOW);
  assert.equal(both.status, 'blocked');
  // The button without Prices: Write says so instead of failing silently.
  await assert.rejects(createMissingPrices(fakeStripe({ catalog: [oneTime(159), recurring(159)], deny: ['create'] }).stripe, false, NOW),
    (error: { status?: number; code?: string }) => error.status === 403 && error.code === 'stripe_permission');
});

test('the server switch and the publishable key are part of it', async () => {
  try {
    process.env.KRAROK_PREPAID_ENABLED = 'false';
    const off = await paymentReadiness(fakeStripe({ catalog: todays() }).stripe, false, NOW);
    assert.deepEqual([off.status, off.server.state, off.server.prepaid], ['blocked', 'problem', false]);
    process.env.KRAROK_PREPAID_ENABLED = 'true';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_wrong_mode';
    const mode = await paymentReadiness(fakeStripe({ catalog: todays() }).stripe, false, NOW);
    assert.deepEqual([mode.status, mode.server.publishableKey], ['blocked', false]);
  } finally {
    process.env.KRAROK_PREPAID_ENABLED = 'true';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake_publishable';
  }
});

test('from 1 Dec 2569 only the regular price matters', async () => {
  const later = DEC + 3600_000;
  const result = await paymentReadiness(fakeStripe({ catalog: decembers() }).stripe, false, later);
  assert.equal(result.status, 'ready');
  assert.equal(result.nextPriceReady, null);
  assert.deepEqual(result.prices.items.map(item => [item.from, item.later, item.expected]), [['2026-12-01', false, 271], ['2026-12-01', false, 271]]);
  const missing = await paymentReadiness(fakeStripe({ catalog: todays() }).stripe, false, later);
  assert.equal(missing.status, 'blocked');
});
