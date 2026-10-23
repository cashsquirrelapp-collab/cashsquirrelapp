import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { loadAdminStripeFinance, stripeFinancePeriod, summarizeStripeTransactions } from '../backend/src/services/adminStripeFinance.js';

const now = new Date('2026-10-21T18:30:00Z');
const created = Math.floor(now.getTime() / 1000) - 1000;
const availableOn = 1793552400;
const transaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'txn_sale', object: 'balance_transaction', amount: 15900, fee: 280, net: 15620,
  currency: 'thb', type: 'payment', reporting_category: 'charge', status: 'pending',
  created, available_on: availableOn, ...overrides,
} as unknown as Stripe.BalanceTransaction);
const charge = (overrides: Record<string, unknown> = {}) => ({
  id: 'py_sale', object: 'charge', payment_intent: 'pi_sale', amount: 15900, amount_captured: 15900,
  currency: 'thb', created, livemode: true, paid: true, captured: true, status: 'succeeded',
  refunded: false, amount_refunded: 0, balance_transaction: transaction(),
  metadata: { app_user_id: '11111111-1111-4111-8111-111111111111', offer_version: 'krarok_prepaid_20261020' },
  payment_method_details: { type: 'promptpay' },
  billing_details: { email: 'must-not-leak@example.com' }, receipt_url: 'https://example.test/private-receipt',
  ...overrides,
} as unknown as Stripe.Charge);
const payout = (overrides: Record<string, unknown> = {}) => ({
  id: 'po_paid', object: 'payout', amount: 2649, currency: 'thb', created: created - 999999,
  arrival_date: created - 500000, livemode: true, status: 'paid', automatic: true, method: 'standard',
  destination: 'ba_private', statement_descriptor: 'must-not-leak', ...overrides,
} as unknown as Stripe.Payout);
const page = <T>(data: T[], has_more = false) => ({ data, has_more });
function client(overrides: Record<string, unknown> = {}) {
  return {
    balance: { retrieve: async () => ({ livemode: true, available: [{ amount: -263, currency: 'thb' }], pending: [{ amount: 15620, currency: 'thb' }] }) },
    balanceTransactions: { list: async () => page([transaction()]) },
    charges: { list: async () => page([charge()]) },
    payouts: { list: async (params: { status?: string }) => page(params.status ? [] : [payout()]) },
    ...overrides,
  } as unknown as Stripe;
}

test('financial date range starts at Bangkok midnight and ends at snapshot time', () => {
  const result = stripeFinancePeriod(30, now);
  assert.equal(result.toDate, '2026-10-22');
  assert.equal(result.fromDate, '2026-09-23');
  assert.equal(new Date(result.created.gte * 1000).toISOString(), '2026-09-22T17:00:00.000Z');
  assert.equal(result.created.lte, now.getTime() / 1000);
});

test('ledger totals retain cents, refunds and fee credits without counting payouts/transfers or duplicate rows', () => {
  const summary = summarizeStripeTransactions([
    transaction(), transaction(),
    transaction({ id: 'txn_partial_refund', type: 'payment_refund', reporting_category: 'refund', amount: -5000, fee: 0, net: -5000 }),
    transaction({ id: 'txn_fee', type: 'stripe_fee', reporting_category: 'fee', amount: -100, fee: 0, net: -100 }),
    transaction({ id: 'txn_fee_credit', type: 'adjustment', reporting_category: 'fee', amount: 20, fee: 0, net: 20 }),
    transaction({ id: 'txn_usd', currency: 'usd', amount: 1000, fee: 59, net: 941 }),
    transaction({ id: 'txn_payout', type: 'payout', reporting_category: 'payout', amount: -10000, fee: 0, net: -10000 }),
    transaction({ id: 'txn_transfer', type: 'transfer', reporting_category: 'transfer', amount: -12345, fee: 0, net: -12345 }),
  ]);
  assert.deepEqual(summary.currencies[0], { currency: 'thb', gross: 15900, refunds: 5000, fees: 360, net: 10540, paymentCount: 1, effectiveFeePercent: 360 / 15900 * 100 });
  assert.deepEqual(summary.currencies[1], { currency: 'usd', gross: 1000, refunds: 0, fees: 59, net: 941, paymentCount: 1, effectiveFeePercent: 5.8999999999999995 });
  assert.equal(summary.transactionCount, 7);
});

test('failed refunds offset refunds while partial captures and failed charges reduce gross, not refund totals', () => {
  const summary = summarizeStripeTransactions([
    transaction({ amount: 20000, fee: 300, net: 19700 }),
    transaction({ id: 'txn_capture', reporting_category: 'partial_capture_reversal', type: 'refund', amount: -4100, fee: 0, net: -4100 }),
    transaction({ id: 'txn_refund', reporting_category: 'refund', type: 'refund', amount: -5000, fee: 0, net: -5000 }),
    transaction({ id: 'txn_refund_failure', reporting_category: 'refund_failure', type: 'adjustment', amount: 5000, fee: 0, net: 5000 }),
    transaction({ id: 'txn_reversed', amount: 1000, fee: 0, net: 1000 }),
    transaction({ id: 'txn_charge_failure', reporting_category: 'charge_failure', type: 'payment_failure_refund', amount: -1000, fee: 0, net: -1000 }),
  ]).currencies[0];
  assert.equal(summary.gross, 15900);
  assert.equal(summary.refunds, 0);
  assert.equal(summary.fees, 300);
  assert.equal(summary.net, 15600);
  assert.equal(summary.paymentCount, 1);
});

test('snapshot keeps pending settlement separate from scheduled bank arrivals and only includes successful captured live payments', async () => {
  const result = await loadAdminStripeFinance(client({ charges: { list: async () => page([
    charge(), charge({ id: 'py_failed', paid: false, status: 'failed' }),
    charge({ id: 'ch_uncaptured', captured: false }),
    charge({ id: 'py_partial', amount_refunded: 5000 }),
  ]) } }), 30, { now });
  assert.deepEqual(result.balance.data?.currencies, [{ currency: 'thb', available: -263, pending: 15620 }]);
  const payment = result.payments.data!.items.find(row => row.id === 'py_sale')!;
  assert.equal(payment.settlement?.fee, 280);
  assert.equal(payment.settlement?.net, 15620);
  assert.equal(payment.settlement?.effectiveFeePercent, 280 / 15900 * 100);
  assert.equal(payment.settlement?.availableOn, new Date(availableOn * 1000).toISOString());
  assert.equal(payment.appPayment, true);
  assert.equal(result.payments.data?.items.length, 2);
  assert.equal(result.payments.data?.items.find(row => row.id === 'py_partial')?.status, 'partially_refunded');
  assert.equal(result.payments.data?.items.find(row => row.id === 'py_partial')?.amountRefunded, 5000);
  assert.deepEqual(result.payouts.data?.nextPayouts, []);
  assert.equal(result.payouts.data?.nextPayoutsComplete, true);
  assert.equal(result.payouts.data?.items[0].status, 'paid');
  for (const secret of ['must-not-leak', 'ba_private', 'private-receipt', 'billing_details', 'app_user_id']) assert.equal(JSON.stringify(result).includes(secret), false);
});

test('each permission/provider failure is unavailable, not zero, and does not hide independent successful sections', async () => {
  const deny = async () => { throw { statusCode: 403, message: 'private-secret-provider-message', requestId: 'req_private' }; };
  const result = await loadAdminStripeFinance(client({ balance: { retrieve: deny }, payouts: { list: deny } }), 30, { now });
  assert.equal(result.balance.status, 'unavailable');
  assert.equal(result.balance.data, null);
  assert.equal(result.balance.error?.code, 'permission_missing');
  assert.equal(result.balance.error?.permission, 'Balance (Read)');
  assert.equal(result.payouts.error?.permission, 'Payouts (Read)');
  assert.equal(result.summary.status, 'ready');
  assert.equal(result.summary.data?.currencies[0].gross, 15900);
  assert.equal(result.payments.status, 'ready');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('bounded or inconsistent pagination never produces a misleading partial total', async () => {
  let reads = 0;
  // Count the period ledger scan only; bank-date matching reads payouts separately.
  const result = await loadAdminStripeFinance(client({ balanceTransactions: { list: async (params: { payout?: string }) => { if (!params.payout) reads++; return page([transaction()], true); } } }), 30, { now, maxPages: 1 });
  assert.equal(reads, 1);
  assert.equal(result.summary.status, 'unavailable');
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.data, null);
  assert.equal(result.summary.error?.code, 'incomplete');
  assert.equal(result.balance.status, 'ready');
  const repeatedCursor = await loadAdminStripeFinance(client({ balanceTransactions: { list: async () => page([transaction()], true) } }), 30, { now });
  assert.equal(repeatedCursor.summary.error?.code, 'incomplete');
});

test('ledger pagination follows cursors and deduplicates overlapping pages', async () => {
  const cursors: (string | undefined)[] = [];
  const result = await loadAdminStripeFinance(client({ balanceTransactions: { list: async (params: { starting_after?: string; payout?: string; created: { gte: number; lte: number } }) => {
    if (params.payout) return page([]); // bank-date matching, checked in its own test
    cursors.push(params.starting_after);
    assert.deepEqual(params.created, stripeFinancePeriod(7, now).created);
    return params.starting_after ? page([transaction(), transaction({ id: 'txn_second' })]) : page([transaction()], true);
  } } }), 7, { now });
  assert.deepEqual(cursors, [undefined, 'txn_sale']);
  assert.equal(result.summary.data?.currencies[0].gross, 31800);
  assert.equal(result.summary.data?.currencies[0].fees, 560);
  assert.equal(result.summary.complete, true);
});

test('readable charges remain visible when expanded settlement is forbidden, with unknown settlement rather than fabricated zero', async () => {
  let calls = 0;
  const result = await loadAdminStripeFinance(client({ charges: { list: async (params: { expand?: string[] }) => {
    calls++;
    if (params.expand) throw { type: 'StripePermissionError' };
    return page([charge({ balance_transaction: 'txn_sale' })]);
  } } }), 30, { now });
  assert.equal(calls, 2);
  assert.equal(result.payments.status, 'ready');
  assert.equal(result.payments.data?.items[0].amount, 15900);
  assert.equal(result.payments.data?.items[0].settlement, null);
});

test('upcoming payouts are queried independently of the recent history and include in-transit status', async () => {
  const filters: (string | undefined)[] = [];
  const result = await loadAdminStripeFinance(client({ payouts: { list: async (params: { status?: string }) => {
    filters.push(params.status);
    if (params.status === 'pending') return page([payout({ id: 'po_pending', status: 'pending', arrival_date: availableOn + 86400 })]);
    if (params.status === 'in_transit') return page([payout({ id: 'po_transit', status: 'in_transit', arrival_date: availableOn })]);
    return page([payout()], true);
  } } }), 30, { now });
  assert.deepEqual(filters, [undefined, 'pending', 'in_transit']);
  assert.equal(result.payouts.data?.hasMore, true);
  assert.equal(result.payouts.data?.nextPayoutsComplete, true);
  assert.deepEqual(result.payouts.data?.nextPayouts.map(row => row.id), ['po_transit', 'po_pending']);
  assert.equal(result.payouts.data?.nextPayouts[0].arrivalDate, new Date(availableOn * 1000).toISOString());
});

test('test mode performs no financial reads and inconsistent provider money fails closed', async () => {
  const forbidden = new Proxy({}, { get: () => { throw new Error('Unexpected provider read'); } }) as Stripe;
  const result = await loadAdminStripeFinance(forbidden, 30, { now, livemode: false });
  for (const value of [result.balance, result.summary, result.payments, result.payouts]) {
    assert.equal(value.status, 'unavailable');
    assert.equal(value.error?.code, 'not_live');
    assert.equal(value.data, null);
  }
  const invalid = await loadAdminStripeFinance(client({ balanceTransactions: { list: async () => page([transaction({ net: 15900 })]) } }), 30, { now });
  assert.equal(invalid.summary.status, 'unavailable');
  assert.equal(invalid.summary.error?.code, 'provider_unavailable');
});

test('each payment shows the bank date of the payout that carried it, and none when Stripe does not confirm one', async () => {
  const carriedBy: Record<string, string[]> = { po_transit: ['txn_sale', 'txn_payout_self'], po_paid: ['txn_older'] };
  const asked: string[] = [];
  const result = await loadAdminStripeFinance(client({
    charges: { list: async () => page([charge(), charge({ id: 'py_new', balance_transaction: transaction({ id: 'txn_new' }) })]) },
    balanceTransactions: { list: async (params: { payout?: string }) => {
      if (!params.payout) return page([transaction()]);
      asked.push(params.payout);
      return page((carriedBy[params.payout] || []).map(id => transaction({ id })));
    } },
    payouts: { list: async (params: { status?: string }) => {
      const transit = payout({ id: 'po_transit', status: 'in_transit', created: created - 100, arrival_date: availableOn });
      if (params.status === 'in_transit') return page([transit]);
      if (params.status === 'pending') return page([]);
      return page([transit, payout(), payout({ id: 'po_manual', automatic: false }), payout({ id: 'po_failed', status: 'failed' })]);
    } },
  }), 30, { now });
  assert.deepEqual(asked.sort(), ['po_paid', 'po_transit']); // automatic, not failed, each once
  const sale = result.payments.data!.items.find(row => row.id === 'py_sale')!;
  assert.deepEqual(sale.payout, { id: 'po_transit', arrivalDate: new Date(availableOn * 1000).toISOString(), status: 'in_transit' });
  assert.equal(result.payments.data!.items.find(row => row.id === 'py_new')!.payout, null);
  assert.equal(JSON.stringify(result).includes('ba_private'), false);

  // Without Balance read access the payments still show, just without bank dates.
  const denied = await loadAdminStripeFinance(client({ balanceTransactions: { list: async (params: { payout?: string }) => {
    if (params.payout) throw { statusCode: 403 };
    return page([transaction()]);
  } } }), 30, { now });
  assert.equal(denied.payments.status, 'ready');
  assert.equal(denied.payments.data!.items[0].payout, undefined);
});
