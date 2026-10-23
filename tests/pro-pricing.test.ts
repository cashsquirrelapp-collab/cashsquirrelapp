import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRO_CHECKOUT_OPEN, PRO_PRICING, PRO_REGULAR_MONTHLY, formatBaht, proPriceDetails } from '../shared/proPricing.js';
import { PRO_MONTHLY_AMOUNT } from '../backend/src/services/stripeSubscriptions.js';

// The owner's prices of 2026-10-20: ฿159 a month, ฿849 for 6 months, ฿1,490 for a year, each a
// promotion against the regular ฿249 a month.
test('Pro prices, regular prices, averages and savings match the owner', () => {
  assert.equal(PRO_REGULAR_MONTHLY, 249);
  assert.deepEqual(Object.fromEntries(Object.entries(PRO_PRICING).map(([key, value]) => [key, value.total])), { month: 159, halfYear: 849, year: 1490 });
  const month = proPriceDetails('month');
  assert.deepEqual([month.regular, month.saving, month.savingPct, month.bestValue], [249, 90, 36, false]);
  const half = proPriceDetails('halfYear');
  assert.deepEqual([half.regular, half.saving, half.savingPct, half.bestValue], [1494, 645, 43, false]);
  assert.equal(formatBaht(half.average, 2), '฿141.50');
  const year = proPriceDetails('year');
  assert.deepEqual([year.regular, year.saving, year.savingPct, year.bestValue], [2988, 1498, 50, true]);
  assert.equal(formatBaht(year.average, 2), '฿124.17');
  assert.equal(formatBaht(year.total), '฿1,490');
});

test('all supported periods use the same server and display amounts', () => {
  assert.deepEqual(PRO_CHECKOUT_OPEN, {month:true,halfYear:true,year:true});
  assert.deepEqual(Object.values(PRO_PRICING).map(p=>[p.months,p.total*100]), [[1,15900],[6,84900],[12,149000]]);
});
