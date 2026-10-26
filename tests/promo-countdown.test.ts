import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRO_MONTH_REGULAR_FROM, proMonthPromoRunning } from '../shared/proPricing.js';
import { monthPromoCountdown } from '../frontend/src/features/billing/promoNotice.js';

test('countdown uses the existing midnight Bangkok price boundary', () => {
  assert.equal(new Date(PRO_MONTH_REGULAR_FROM).toISOString(), '2026-11-30T17:00:00.000Z');
  const seconds = 86400 + 2 * 3600 + 3 * 60 + 4;
  assert.deepEqual(monthPromoCountdown(PRO_MONTH_REGULAR_FROM - seconds * 1000), {
    totalSeconds: seconds, days: 1, hours: 2, minutes: 3, seconds: 4,
  });
});

test('last fractional second remains visible until the exact pricing boundary, then clamps to zero', () => {
  for (const offset of [-1001, -1000, -1, 0, 1, 86400000]) {
    const at = PRO_MONTH_REGULAR_FROM + offset;
    assert.equal(monthPromoCountdown(at).totalSeconds, Math.max(0, Math.ceil(-offset / 1000)));
    assert.equal(monthPromoCountdown(at).totalSeconds > 0, proMonthPromoRunning(at));
  }
  assert.deepEqual(monthPromoCountdown(PRO_MONTH_REGULAR_FROM + 86400000), {
    totalSeconds: 0, days: 0, hours: 0, minutes: 0, seconds: 0,
  });
});

test('elapsed time is calculated from the deadline, independent of skipped ticks or reloading', () => {
  const start = PRO_MONTH_REGULAR_FROM - 3 * 86400000;
  assert.equal(monthPromoCountdown(start).totalSeconds, 259200);
  const resumed = start + 86400000 + 3123;
  assert.equal(monthPromoCountdown(resumed).totalSeconds, 172797);
});
