import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { analyticsPayments, type AnalyticsPrepaidOrderRow, type AnalyticsCardCycleRow } from '../backend/src/services/adminAnalyticsPayments.js';

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
    [account], { retrieveInvoice: async id => { reads++; assert.equal(id, invoice.id); return invoice; } },
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
    await assert.rejects(analyticsPayments([], [], [{ object_id: invoice.id, livemode: true }], [account], { retrieveInvoice: async () => ({ ...invoice, ...overrides }) as Stripe.Invoice }));
  }
});

test('a Stripe retrieval failure does not silently publish incomplete revenue', async () => {
  await assert.rejects(analyticsPayments([], [], [{ object_id: invoice.id, livemode: true }], [account], { retrieveInvoice: async () => { throw new Error('Stripe unavailable'); } }), /Stripe unavailable/);
});

const prepaid: AnalyticsPrepaidOrderRow = {
  payment_id: 'pi_direct_qr', user_id: 'owner', amount: 15900, paid_at: '2026-10-20T18:00:00Z',
  status: 'paid', livemode: true,
};

test('completed live prepaid payments appear even without legacy payment rows or invoice events', async () => {
  const payments = await analyticsPayments([], [], [], [account], {
    prepaid: [prepaid, { ...prepaid, payment_id: 'pi_year', amount: 149000 }],
    retrieveInvoice: async () => { throw new Error('Prepaid revenue must not need an invoice'); },
  });
  assert.equal(payments.length, 2);
  assert.equal(payments.reduce((sum, payment) => sum + payment.amount, 0), 164900);
  assert.deepEqual(payments[0], {
    payment_id: prepaid.payment_id, user_id: 'owner', amount: 15900,
    currency: 'thb', paid_at: prepaid.paid_at, refunded: false,
  });
});

test('prepaid excludes test/open/expired/subscribed orders and keeps refunds out of paid revenue', async () => {
  const payments = await analyticsPayments([], [], [], [], {
    prepaid: [
      ...['reserved', 'open', 'expired', 'subscribed'].map(status => ({ ...prepaid, status, payment_id: null, paid_at: null })),
      { ...prepaid, payment_id: 'pi_test', livemode: false },
      { ...prepaid, payment_id: 'pi_refunded', status: 'refunded' },
    ],
  });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].refunded, true);
  assert.equal(payments.filter(payment => !payment.refunded).length, 0);
});

test('prepaid PI deduplication preserves a refund and fails closed on conflicting ownership or amounts', async () => {
  const legacy = { payment_id: 'pi_direct_qr', user_id: 'owner', amount: 15900, currency: 'thb', paid_at: paidAt, refunded: true };
  const payments = await analyticsPayments([legacy], [], [], [], { prepaid: [prepaid, prepaid] });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].refunded, true);
  for (const change of [{ user_id: 'other' }, { amount: 14900 }]) {
    await assert.rejects(analyticsPayments([legacy], [], [], [], { prepaid: [{ ...prepaid, ...change }] }), /identity mismatch/);
  }
  for (const change of [{ payment_id: null }, { paid_at: null }, { paid_at: 'invalid' }, { amount: -15900 }, { amount: 1.5 }]) {
    await assert.rejects(analyticsPayments([], [], [], [], { prepaid: [{ ...prepaid, ...change }] }), /incomplete/);
  }
});

const cycle: AnalyticsCardCycleRow = {
  invoice_id: invoice.id, payment_id: 'pi_card_cycle', user_id: 'owner', refunded: false,
  cashflow_prepaid_orders: { livemode: true },
};

test('card cycle revenue uses actual paid invoice amount, deduplicates events and PIs, and carries refund state', async () => {
  let reads = 0;
  const payments = await analyticsPayments([
    { payment_id: cycle.payment_id, user_id: 'owner', amount: invoice.amount_paid, currency: 'thb', paid_at: paidAt, refunded: false },
  ], [], [{ object_id: invoice.id, livemode: true }], [account], {
    cardCycles: [
      { ...cycle, refunded: true },
      { ...cycle, invoice_id: 'in_test', payment_id: 'pi_test', cashflow_prepaid_orders: { livemode: false } },
    ],
    retrieveInvoice: async id => { reads++; assert.equal(id, invoice.id); return invoice; },
  });
  assert.equal(reads, 1);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].payment_id, cycle.payment_id);
  assert.equal(payments[0].amount, 24900);
  assert.equal(payments[0].refunded, true);
});

test('card cycles are included without old webhook events and reject an invoice for another account', async () => {
  const payments = await analyticsPayments([], [], [], [account], { cardCycles: [cycle], retrieveInvoice: async () => invoice });
  assert.equal(payments[0].amount, 24900);
  await assert.rejects(analyticsPayments([], [], [], [account], {
    cardCycles: [{ ...cycle, user_id: 'other' }], retrieveInvoice: async () => invoice,
  }), /ownership mismatch/);
});
