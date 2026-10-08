import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cashOnHand, makeCashAnchor } from '../shared/cashBalance';
import { validateChanges } from '../shared/validation';

test('money on hand starts from the balance the user set and follows what is recorded afterwards', () => {
  const jobs = [{ received: 10180 }, { received: 0 }];
  const expenses = [{ amount: 12000 }, { amount: 600 }, { amount: 730 }];
  const anchor = makeCashAnchor(5200, jobs, expenses, new Date('2026-10-09T03:00:00Z'));
  assert.deepEqual(cashOnHand(anchor, jobs, expenses), { balance: 5200, receivedSince: 0, spentSince: 0 });
  // later: a client pays 1,455 (any date), a 250 expense is recorded, an old expense is deleted
  const laterJobs = [{ received: 10180 }, { received: 1455 }];
  const laterExpenses = [{ amount: 12000 }, { amount: 600 }, { amount: 250 }];
  assert.deepEqual(cashOnHand(anchor, laterJobs, laterExpenses), { balance: 5200 + 1455 - (250 - 730), receivedSince: 1455, spentSince: -480 });
});

test('the saved balance passes the settings validation and junk does not', () => {
  const settings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, cashAnchor: makeCashAnchor(5200, [], []) };
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1, data: settings }]));
  assert.throws(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1, data: { ...settings, cashAnchor: { amount: 'lots' } } }]));
});
