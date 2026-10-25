import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRO_CHECKOUT_OPEN, PRO_MONTH_REGULAR_FROM, PRO_MONTH_RENEWAL_STEP, PRO_REGULAR_MONTHLY, PRO_SOLD_AT, formatBaht, netAfterCardFee, proMonthPromoRunning,
  proNetTarget, proPriceDetails, proPriceParts, proPricePartsForCharge, proPricing, PRO_PERIODS_ON_SALE,
} from '../shared/proPricing.js';
import { PRO_MONTHLY_AMOUNT } from '../backend/src/services/stripeSubscriptions.js';

// The owner's prices of 2026-10-20 were ฿159 a month, ฿849 for 6 months and ฿1,490 for a year. Since 2026-10-25 the
// customer pays Stripe's card fee on top, so the owner keeps exactly those amounts: ฿177, ฿895 and ฿1,562, each a
// promotion against the regular ฿249 a month. From 1 Dec 2569 a month is the regular ฿249 shown and ฿271 charged.
const PROMO = Date.parse('2026-10-26T05:00:00Z');
const LAST_MOMENT = PRO_MONTH_REGULAR_FROM - 1; // 30 Nov 2569 23:59:59.999 Bangkok
const DECEMBER = Date.parse('2026-12-02T05:00:00Z');

test('Pro prices, regular prices, averages and savings match the owner, until 30 Nov 2569', () => {
  assert.equal(PRO_REGULAR_MONTHLY, 249);
  for (const at of [PROMO, LAST_MOMENT]) {
    assert.deepEqual(proNetTarget(at), { month: 159, halfYear: 849, year: 1490 });
    assert.deepEqual(Object.fromEntries(Object.entries(proPricing(at)).map(([key, value]) => [key, value.total])), { month: 177, halfYear: 895, year: 1562 });
    assert.equal(proMonthPromoRunning(at), true);
  }
  // Shown: the price and its saving against the regular price; the payment fee is added at checkout and shown with it
  // (owner, 2026-10-25: "ราคาตั้ง 159 แต่จ่ายจริงแค่บอกค่าธรรมเนียม").
  const month = proPriceDetails('month', PROMO);
  assert.deepEqual([month.price, month.fee, month.total, month.regular, month.saving, month.savingPct, month.bestValue], [159, 18, 177, 249, 90, 36, false]);
  const half = proPriceDetails('halfYear', PROMO);
  assert.deepEqual([half.price, half.fee, half.total, half.regular, half.saving, half.savingPct, half.bestValue], [849, 46, 895, 1494, 645, 43, false]);
  assert.equal(formatBaht(half.average, 2), '฿141.50');
  const year = proPriceDetails('year', PROMO);
  assert.deepEqual([year.price, year.fee, year.total, year.regular, year.saving, year.savingPct, year.bestValue], [1490, 72, 1562, 2988, 1498, 50, true]);
  assert.equal(formatBaht(year.average, 2), '฿124.17');
  assert.equal(formatBaht(year.total), '฿1,562');
});

test('from 1 Dec 2569 00:00 Bangkok: a month shows ฿249 and charges ฿271 (฿22 fee); 6 months and a year stay', () => {
  for (const at of [PRO_MONTH_REGULAR_FROM, DECEMBER]) {
    assert.equal(proMonthPromoRunning(at), false);
    assert.deepEqual(proNetTarget(at), { month: 249, halfYear: 849, year: 1490 });
    assert.deepEqual(Object.fromEntries(Object.entries(proPricing(at)).map(([key, value]) => [key, value.total])), { month: 271, halfYear: 895, year: 1562 });
  }
  assert.equal(new Date(PRO_MONTH_REGULAR_FROM).toISOString(), '2026-11-30T17:00:00.000Z');
  const month = proPriceDetails('month', DECEMBER);
  // No promotion: no saving to show, no struck price (the plans page hides both when the saving is 0).
  assert.deepEqual([month.price, month.fee, month.total, month.regular, month.saving, month.savingPct], [249, 22, 271, 249, 0, 0]);
  assert.deepEqual(proPriceDetails('year', DECEMBER), proPriceDetails('year', PROMO));
  assert.deepEqual(PRO_MONTH_RENEWAL_STEP, { fromDay: '2026-12-01', from: PRO_MONTH_REGULAR_FROM, fromTotal: 177, price: 249, fee: 22, total: 271 });
});

test('a charge is broken down when it is a Pro price of either date for its months', () => {
  assert.deepEqual(proPricePartsForCharge(1, 177), proPriceParts('month', PROMO));
  assert.deepEqual(proPricePartsForCharge(1, 271), proPriceParts('month', DECEMBER));
  assert.deepEqual(proPricePartsForCharge(12, 1562), { price: 1490, fee: 72, total: 1562 });
  assert.equal(proPricePartsForCharge(1, 159), undefined);
  assert.equal(proPricePartsForCharge(3, 177), undefined);
  assert.deepEqual(PRO_SOLD_AT, { month: [159, 177, 271], halfYear: [849, 895], year: [1490, 1562] });
});

test('each price is the lowest whole baht that leaves the owner the net target after a Thai card\'s Stripe fee', () => {
  // 3.65% + ฿10 with 7% VAT on the fee (stripe.com/en-th/pricing and Stripe's Thailand tax page, 2026-10-25).
  for (const at of [PROMO, DECEMBER]) {
    const target = proNetTarget(at);
    for (const [period, plan] of Object.entries(proPricing(at)) as [keyof typeof target, { total: number }][]) {
      assert.ok(netAfterCardFee(plan.total) >= target[period], `${period}: ${netAfterCardFee(plan.total)}`);
      assert.ok(netAfterCardFee(plan.total - 1) < target[period], `${period}: one baht less would already do`);
    }
  }
  assert.equal(netAfterCardFee(177).toFixed(2), '159.39');
  assert.equal(netAfterCardFee(271).toFixed(2), '249.72');
});

test('all supported periods use the same server and display amounts', () => {
  // Owner, 2026-10-25: monthly only on sale for now; 6 months and a year keep their prices for when they reopen.
  assert.deepEqual(PRO_CHECKOUT_OPEN, {month:true,halfYear:false,year:false});
  assert.deepEqual(PRO_PERIODS_ON_SALE, ['month']);
  assert.deepEqual(Object.values(proPricing(PROMO)).map(p=>[p.months,p.total*100]), [[1,17700],[6,89500],[12,156200]]);
  assert.deepEqual(Object.values(proPricing(DECEMBER)).map(p=>[p.months,p.total*100]), [[1,27100],[6,89500],[12,156200]]);
  assert.ok(PRO_MONTHLY_AMOUNT > 0);
});
