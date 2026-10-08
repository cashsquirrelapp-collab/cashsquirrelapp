import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentCash, openingForCurrent, saveOpening } from '../shared/cashBalance';
import { validateChanges } from '../shared/validation';

const jobs = [{ received: 10180 }, { received: 0 }]; // pending money and job value never count
const expenses = [{ amount: 12000 }, { amount: 600 }, { amount: 730 }];

test('current cash = opening + everything received - every expense, and goals only split it', () => {
  assert.deepEqual(currentCash({ amount: 8580 }, jobs, expenses), { opening: 8580, received: 10180, spent: 13330, balance: 5430, inGoals: 0, readyToSpend: 5430 });
  // ฿3,000 put into a goal: the total stays ฿5,430
  const withGoal = currentCash({ amount: 8580 }, jobs, expenses, [{ current: 3000 }, { current: 0 }]);
  assert.equal(withGoal.balance, 5430);
  assert.equal(withGoal.inGoals, 3000);
  assert.equal(withGoal.readyToSpend, 2430);
  // a payment arrives, an expense is added, another deleted
  const later = currentCash({ amount: 8580 }, [{ received: 10180 }, { received: 1455 }], [{ amount: 12000 }, { amount: 730 }, { amount: 250 }]);
  assert.equal(later.balance, 8580 + 11635 - 12980);
  // opening 0 is a real value
  assert.equal(currentCash({ amount: 0 }, [], []).balance, 0);
});

test('typing what you hold today gives the matching opening balance', () => {
  const opening = openingForCurrent(5430, jobs, expenses);
  assert.equal(opening, 8580);
  assert.equal(currentCash({ amount: opening }, jobs, expenses).balance, 5430);
});

test('editing keeps when the opening balance was first set', () => {
  const first = saveOpening(8580, null, new Date('2026-10-01T00:00:00Z'));
  const edited = saveOpening(9000, first, new Date('2026-10-09T00:00:00Z'));
  assert.equal(edited.createdAt, '2026-10-01T00:00:00.000Z');
  assert.equal(edited.updatedAt, '2026-10-09T00:00:00.000Z');
});

test('the opening balance passes the settings validation and junk does not', () => {
  const settings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, cashOpening: saveOpening(8580) };
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1, data: settings }]));
  assert.throws(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1, data: { ...settings, cashOpening: { amount: 'lots' } } }]));
});
