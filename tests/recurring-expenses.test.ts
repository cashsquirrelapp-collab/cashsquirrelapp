import test from 'node:test';
import assert from 'node:assert/strict';
import { recurringExpensesDue } from '../shared/recurringExpenses';
import type { Expense } from '../shared/types';

// Owner, 2026-11-18: "ทำให้รายจ่ายประจำลงชีตทุกเดือนด้วย".
const items = [{ id: 'rent', name: 'ค่าห้อง', amount: 6500 }, { id: 'net', name: 'ค่าเน็ต', amount: 599 }, { id: 'zero', name: 'ค่าฟิตเนส', amount: 0 }];
const expense = (over: Partial<Expense>): Expense => ({ id: 'e', name: 'กาแฟ', category: 'อื่นๆ', amount: 65, date: '2026-11-16', ...over });

test('each month\'s fixed items become that month\'s expenses on the 1st, once; ones recorded by hand are left as they are', () => {
  const first = recurringExpensesDue({ items, expenses: [expense({})], month: '2026-11' });
  assert.deepEqual(first.create.map(item => [item.name, item.amount, item.date, item.note, item.recurringId]), [
    ['ค่าห้อง', 6500, '2026-11-01', 'รายจ่ายประจำ', 'rent'], ['ค่าเน็ต', 599, '2026-11-01', 'รายจ่ายประจำ', 'net'],
  ]);
  assert.notEqual(first.create[1].category, 'อื่นๆ', 'ค่าเน็ต is read as a service, like any expense name');
  assert.deepEqual(first.made, { month: '2026-11', ids: ['rent', 'net'] });
  // Made already (even if deleted since, in the app or the sheet): not again this month.
  assert.deepEqual(recurringExpensesDue({ items, expenses: [], month: '2026-11', made: first.made }).create, []);
  // Recorded by hand this month under the same name: not made, but counted as done.
  const byHand = recurringExpensesDue({ items, expenses: [expense({ name: 'ค่าห้อง ', amount: 6500, date: '2026-11-03' })], month: '2026-11' });
  assert.deepEqual(byHand.create.map(item => item.recurringId), ['net']);
  assert.deepEqual(byHand.made.ids, ['rent', 'net']);
  // A new month starts afresh.
  assert.deepEqual(recurringExpensesDue({ items, expenses: [], month: '2026-12', made: first.made }).create.map(item => item.date), ['2026-12-01', '2026-12-01']);
  // No fixed items: nothing.
  assert.deepEqual(recurringExpensesDue({ items: [], expenses: [], month: '2026-11' }).create, []);
});
