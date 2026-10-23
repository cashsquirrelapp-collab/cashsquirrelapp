import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStripeBillingClosed,
  stripeBillingClosureBlock,
} from '../backend/src/services/subscriptionClosure.js';

const now = Date.parse('2026-10-10T12:00:00.000Z');

test('legacy one-time Pro entitlement does not block account closure', () => {
  assert.equal(stripeBillingClosureBlock({
    stripe_subscription_id: null,
    status: 'active',
  }, now), null);
});

test('every nonterminal managed Stripe subscription blocks closure', () => {
  for (const status of ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'unexpected']) {
    assert.equal(stripeBillingClosureBlock({
      stripe_subscription_id: 'sub_managed',
      stripe_subscription_status: status,
    }, now), 'subscription_open', status);
  }
});

test('scheduled end-of-period cancellation stays blocked until Stripe confirms a terminal state', () => {
  const scheduled = {
    stripe_subscription_id: 'sub_scheduled',
    stripe_subscription_status: 'active',
    cancel_at_period_end: true,
  };
  assert.equal(stripeBillingClosureBlock(scheduled, now), 'subscription_open');
  assert.throws(
    () => assertStripeBillingClosed(scheduled, 'account-closure', now),
    (error: any) => error?.status === 409 && error?.code === 'STRIPE_BILLING_OPEN',
  );
});

test('terminal Stripe subscription states allow closure', () => {
  for (const status of ['canceled', 'incomplete_expired']) {
    assert.equal(stripeBillingClosureBlock({
      stripe_subscription_id: 'sub_terminal',
      stripe_subscription_status: status,
      status: 'active', // a separate legacy entitlement can keep effective Pro active
    }, now), null, status);
  }
});

test('a stored subscription ID with missing actual Stripe status blocks fail closed', () => {
  assert.equal(stripeBillingClosureBlock({
    stripe_subscription_id: 'sub_unknown',
    stripe_subscription_status: null,
    status: 'canceled',
  }, now), 'subscription_open');
});

test('an unexpired or malformed Checkout reservation blocks closure, but an expired reservation does not', () => {
  assert.equal(stripeBillingClosureBlock({
    stripe_checkout_pending_until: '2026-10-10T12:30:00.000Z',
  }, now), 'checkout_pending');
  assert.equal(stripeBillingClosureBlock({
    stripe_checkout_pending_until: 'not-a-timestamp',
  }, now), 'checkout_pending');
  assert.equal(stripeBillingClosureBlock({
    stripe_checkout_pending_until: '2026-10-10T11:59:59.000Z',
  }, now), null);
});

test('admin override receives a blocking conflict while managed billing is open', () => {
  assert.throws(
    () => assertStripeBillingClosed({
      stripe_subscription_id: 'sub_managed',
      stripe_subscription_status: 'past_due',
    }, 'admin-override', now),
    (error: any) => error?.status === 409
      && error?.code === 'STRIPE_BILLING_OPEN'
      && /Customer Portal/.test(error.message),
  );
});
