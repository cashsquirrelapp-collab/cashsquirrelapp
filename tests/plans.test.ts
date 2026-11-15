import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, isPaidTier, paidTierOfPlan, planTierOf, tierAtLeast } from '../shared/plans.js';
import { PLUS_PRICE, netAfterCardFee } from '../shared/proPricing.js';
import { VAULT_FREE_FILES } from '../shared/vault.js';

// Free / Plus / Pro (owner, 2026-11-15): what each plan gives, and which plan an account has, decided in one place.
const NOW = Date.parse('2026-11-20T05:00:00Z');
const later = new Date(NOW + 10 * 86400_000).toISOString();
const earlier = new Date(NOW - 86400_000).toISOString();

test('what each plan gives is what the owner agreed', () => {
  assert.deepEqual(PLAN_LIMITS.free, { tokens: null, documentsPerMonth: 10, vaultFiles: VAULT_FREE_FILES, dailyReminders: false, proReminders: false, proPages: false });
  assert.deepEqual(PLAN_LIMITS.plus, { tokens: 650, documentsPerMonth: 30, vaultFiles: 50, dailyReminders: true, proReminders: false, proPages: false });
  assert.equal(PLAN_LIMITS.pro.tokens, 1650);
  assert.equal(PLAN_LIMITS.pro.documentsPerMonth, null);
  assert.ok(PLAN_LIMITS.pro.vaultFiles > PLAN_LIMITS.plus.vaultFiles);
  assert.ok(PLAN_LIMITS.pro.dailyReminders && PLAN_LIMITS.pro.proReminders && PLAN_LIMITS.pro.proPages);
  // ฿99 a month for the owner after the card fee: ฿115 charged.
  assert.deepEqual(PLUS_PRICE, { price: 99, fee: 16, total: 115, months: 1 });
  assert.ok(netAfterCardFee(PLUS_PRICE.total) >= PLUS_PRICE.price);
});

test('the subscription row names the plan: plus_* is Plus, every other paid plan is Pro', () => {
  assert.equal(paidTierOfPlan('plus_prepaid'), 'plus');
  assert.equal(paidTierOfPlan('plus_monthly'), 'plus');
  for (const plan of ['pro_prepaid', 'pro_monthly', 'admin_grant', 'manual', null, undefined]) assert.equal(paidTierOfPlan(plan), 'pro', String(plan));
  assert.ok(isPaidTier('plus') && isPaidTier('pro') && !isPaidTier('free') && !isPaidTier('PLUS'));
});

test('which plan an account has now', () => {
  assert.equal(planTierOf({ sub: null, now: NOW }), 'free');
  assert.equal(planTierOf({ sub: { status: 'active', plan: 'plus_prepaid', current_period_end: later }, now: NOW }), 'plus');
  assert.equal(planTierOf({ sub: { status: 'active', plan: 'plus_monthly', current_period_end: later }, now: NOW }), 'plus');
  assert.equal(planTierOf({ sub: { status: 'active', plan: 'pro_prepaid', current_period_end: later }, now: NOW }), 'pro');
  // Ended, unpaid or taken away: Free.
  assert.equal(planTierOf({ sub: { status: 'active', plan: 'plus_prepaid', current_period_end: earlier }, now: NOW }), 'free');
  assert.equal(planTierOf({ sub: { status: 'past_due', plan: 'plus_monthly', current_period_end: later }, now: NOW }), 'free');
  assert.equal(planTierOf({ sub: { status: 'canceled', plan: 'admin_revoked', current_period_end: later }, trial: true, now: NOW }), 'free');
  // An owner's grant needs no end date; a trial and the staging owner are Pro, as before.
  assert.equal(planTierOf({ sub: { status: 'active', plan: 'admin_grant', current_period_end: null }, now: NOW }), 'pro');
  assert.equal(planTierOf({ sub: { status: 'active', plan: 'plus_prepaid', current_period_end: later }, trial: true, now: NOW }), 'pro');
  assert.equal(planTierOf({ sub: null, owner: true, now: NOW }), 'pro');
});

test('Pro reaches everything Plus has; Plus does not reach Pro', () => {
  assert.ok(tierAtLeast('pro', 'plus') && tierAtLeast('pro', 'pro') && tierAtLeast('plus', 'plus'));
  assert.ok(!tierAtLeast('plus', 'pro') && !tierAtLeast('free', 'plus'));
});
