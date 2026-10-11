import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { analyticsPayments } from '../backend/src/services/adminAnalyticsPayments.js';

const account = { user_id: 'owner', stripe_customer_id: 'cus_owner', stripe_livemode: true };
const paidAt = '2026-10-11T09:00:00Z';
const invoice = {
  id: 'in_paid', customer: 'cus_owner', status: 'paid', livemode: true,
  currency: 'thb', amount_paid: 24900, amount_paid_off_stripe: 0,
  status_transitions: { paid_at: Date.parse(paidAt) / 1000 },
  parent: { subscription_details: { metadata: { app_user_id: 'owner' } } },
} as unknown as Stripe.Invoice;

test('payment analytics combines legacy, live QR, and actual paid invoice amounts without duplicates', async () => {
  let reads = 0;
  const payments = await analyticsPayments(
    [{ payment_id: 'pi_legacy', user_id: 'owner', amount: 14900, currency: 'thb', paid_at: paidAt, refunded: false }],
    [
      { payment_intent_id: 'pi_qr', user_id: 'owner', amount: 19900, currency: 'thb', paid_at: paidAt, refunded: false, livemode: true },
      { payment_intent_id: 'pi_test', user_id: 'owner', amount: 19900, currency: 'thb', paid_at: paidAt, refunded: false, livemode: false },
    ],
    [{ object_id: 'in_paid', livemode: true }, { object_id: 'in_paid', livemode: true }, { object_id: 'in_test', livemode: false }],
    [account], async id => { reads++; assert.equal(id, invoice.id); return invoice; },
  );
  assert.equal(reads, 1);
  assert.equal(payments.length, 3);
  assert.equal(payments.reduce((sum, payment) => sum + payment.amount, 0), 59700);
  assert.equal(payments.find(payment => payment.payment_id === 'in_paid')?.paid_at, paidAt.replace('Z', '.000Z'));
  assert.equal(payments.find(payment => payment.payment_id === 'in_paid')?.amount, 24900);
  assert.equal(payments.some(payment => payment.payment_id.includes('test')), false);
});

test('invoice ownership and actual Stripe payment verification fail closed', async () => {
  for (const overrides of [
    { customer: 'cus_other' }, { parent: null }, { status: 'open' },
    { livemode: false }, { currency: 'usd' }, { amount_paid: -1 },
    { amount_paid_off_stripe: 24900 }, { amount_paid_off_stripe: undefined },
  ]) {
    await assert.rejects(analyticsPayments([], [], [{ object_id: invoice.id, livemode: true }], [account], async () => ({ ...invoice, ...overrides }) as Stripe.Invoice));
  }
});

test('a Stripe retrieval failure does not silently publish incomplete revenue', async () => {
  await assert.rejects(analyticsPayments([], [], [{ object_id: invoice.id, livemode: true }], [account], async () => { throw new Error('Stripe unavailable'); }), /Stripe unavailable/);
});
