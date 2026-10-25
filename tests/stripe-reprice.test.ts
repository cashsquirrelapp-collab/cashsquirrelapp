import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { planReprice, PRICE_MOMENTS } from '../scripts/stripe-reprice';
import { PREPAID_OFFER, prepaidLookup, validPrepaidPrice } from '../backend/src/services/prepaidPlans';
import { recurringLookup, recurringProductId, validRecurringPrice } from '../backend/src/services/cardPlans';
import { PRO_MONTH_REGULAR_FROM, proPricing } from '../shared/proPricing';

// The owner's repricing (2026-10-25: the card fee on the customer; ฿271 a month from 1 Dec 2569): the script plans the
// prices both dates sell, and each one it would create passes checkout's own checks for its date. A fake catalog: no
// network, no key.

const PROMO = PRO_MONTH_REGULAR_FROM - 1;
const DEC = PRO_MONTH_REGULAR_FROM;
const oneTime = (period: 'month' | 'halfYear' | 'year', amount: number, months: number, lookup = prepaidLookup(period, PROMO)): Stripe.Price => ({
  id: `price_${lookup}`, object: 'price', active: true, livemode: false, type: 'one_time', recurring: null, currency: 'thb', unit_amount: amount * 100,
  billing_scheme: 'per_unit', lookup_key: lookup, product: 'prod_prepaid', custom_unit_amount: null, transform_quantity: null, tax_behavior: 'unspecified',
  metadata: { offer_version: PREPAID_OFFER, period, months: String(months) },
} as unknown as Stripe.Price);
const recurring = (period: 'month' | 'halfYear' | 'year', amount: number, months: number, lookup = recurringLookup(period, PROMO)): Stripe.Price => ({
  id: `price_${lookup}`, object: 'price', active: true, livemode: false, type: 'recurring', currency: 'thb', unit_amount: amount * 100,
  billing_scheme: 'per_unit', lookup_key: lookup, product: recurringProductId(), custom_unit_amount: null, transform_quantity: null, tax_behavior: 'unspecified',
  recurring: months === 12 ? { interval: 'year', interval_count: 1, usage_type: 'licensed', trial_period_days: null } : { interval: 'month', interval_count: months, usage_type: 'licensed', trial_period_days: null },
  metadata: { offer: 'card' },
} as unknown as Stripe.Price);
const reader = (catalog: Stripe.Price[]) => ({ prices: { list: async (params: Stripe.PriceListParams) => ({ data: catalog.filter(price => params.lookup_keys?.includes(price.lookup_key!)) }) } });
const created = (row: Awaited<ReturnType<typeof planReprice>>[number]) => ({ ...row.params, id: 'price_new', active: true, livemode: false, type: row.kind, billing_scheme: 'per_unit',
  custom_unit_amount: null, transform_quantity: null, recurring: row.params!.recurring ? { ...row.params!.recurring, trial_period_days: null } : null } as unknown as Stripe.Price);

test('the plan: today\'s keys at the fee prices, and new keys for ฿271 a month from 1 Dec, each passing checkout\'s own checks', async () => {
  // A catalog still at the 20 Oct prices.
  const catalog = [oneTime('month', 159, 1), oneTime('halfYear', 849, 6), oneTime('year', 1490, 12), recurring('month', 159, 1), recurring('year', 1490, 12)];
  const plan = await planReprice(reader(catalog), false);
  assert.deepEqual(plan.map(row => [row.lookupKey, row.from, row.action, row.currentAmount, row.newAmount]), [
    [prepaidLookup('month', PROMO), '2026-11-30', 'create', 159, 177], [recurringLookup('month', PROMO), '2026-11-30', 'create', 159, 177],
    [prepaidLookup('halfYear', PROMO), '2026-11-30', 'create', 849, 895], [recurringLookup('halfYear', PROMO), '2026-11-30', 'missing', null, 895],
    [prepaidLookup('year', PROMO), '2026-11-30', 'create', 1490, 1562], [recurringLookup('year', PROMO), '2026-11-30', 'create', 1490, 1562],
    [prepaidLookup('month', DEC), '2026-12-01', 'create', null, 271], [recurringLookup('month', DEC), '2026-12-01', 'create', null, 271],
  ]);
  assert.notEqual(prepaidLookup('month', DEC), prepaidLookup('month', PROMO), 'both monthly prices exist side by side');
  for (const row of plan.filter(item => item.action === 'create')) {
    const at = row.from === '2026-12-01' ? DEC : PROMO;
    const price = created(row);
    assert.equal(row.kind === 'one_time' ? validPrepaidPrice(price, row.period, false, at) : validRecurringPrice(price, row.period, false, at), true, row.lookupKey);
    assert.equal(price.unit_amount, proPricing(at)[row.period].total * 100);
  }
  // Already at today's prices (the owner ran it on 25 Oct): only the two December prices are new.
  const today = [oneTime('month', 177, 1), oneTime('halfYear', 895, 6), oneTime('year', 1562, 12), recurring('month', 177, 1), recurring('year', 1562, 12)];
  const again = await planReprice(reader(today), false);
  assert.deepEqual(again.filter(row => row.action === 'create').map(row => [row.lookupKey, row.newAmount]), [[prepaidLookup('month', DEC), 271], [recurringLookup('month', DEC), 271]]);
  // And once those exist: nothing to do.
  const done = [...today, oneTime('month', 271, 1, prepaidLookup('month', DEC)), recurring('month', 271, 1, recurringLookup('month', DEC))];
  assert.equal((await planReprice(reader(done), false)).filter(row => row.action === 'create').length, 0);
  assert.deepEqual([...PRICE_MOMENTS], [PROMO, DEC]);
});
