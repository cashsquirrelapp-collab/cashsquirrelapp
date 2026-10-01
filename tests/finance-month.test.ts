import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expense, Job } from '../shared/types';
import { buildFinanceMonth } from '../frontend/src/features/incomeExpense/financeMonth';

const job = (id: string, fields: Partial<Job>): Job => ({
  id, name: id, type: 'ยังไม่ระบุ', client: 'c', value: 10000, received: 0, pending: 10000,
  status: 'pending', creditTerm: 0, payDate: null, note: '', isPosted: true, startDate: '2026-08-01', ...fields,
});
const exp = (id: string, name: string, amount: number, date: string, category = 'อื่นๆ'): Expense => ({ id, name, amount, date, category });
const settings = { monthlyExpense: 5590, fixedExpenseItems: [{ id: 'rent', name: 'ค่าเช่าห้อง', amount: 5000 }, { id: 'net', name: 'อินเทอร์เน็ต', amount: 590 }] };

test('an unpaid job is never money received; only what was paid in the month counts', () => {
  const m = buildFinanceMonth([
    job('unpaid', { payDate: '2026-10-20' }),
    job('paid', { status: 'done', received: 1500, pending: 0, value: 1500, payDate: '2026-10-01' }),
  ], [], settings, '2026-10', '2026-10');
  assert.equal(m.received, 1500);
  assert.equal(m.pending, 10000);
  assert.equal(m.workValue, 11500);
});

test('partial payment: deposit received, remainder outstanding, no double count', () => {
  const m = buildFinanceMonth([
    job('p', { status: 'partial', received: 3000, pending: 7000, depositAmount: 3000, depositDate: '2026-10-05', payDate: '2026-10-31' }),
  ], [], settings, '2026-10', '2026-10');
  assert.deepEqual([m.received, m.pending, m.jobRows[0].state], [3000, 7000, 'partial']);
});

test('installments: only the installment paid this month counts as received', () => {
  const rows = [
    { id: 'i1', label: 'งวดที่ 1', amount: 10000, dueDate: '2026-10-10', paidAt: '2026-10-10', status: 'paid' as const },
    { id: 'i2', label: 'งวดที่ 2', amount: 10000, dueDate: '2026-11-10', paidAt: null, status: 'pending' as const },
  ];
  const j = job('web', { status: 'installment', value: 20000, received: 10000, pending: 10000, installments: rows });
  assert.equal(buildFinanceMonth([j], [], settings, '2026-10', '2026-10').received, 10000);
  const nov = buildFinanceMonth([j], [], settings, '2026-11', '2026-10');
  assert.deepEqual([nov.received, nov.pending, nov.jobRows[0].state], [0, 10000, 'installment']);
});

test('expenses split into recurring (fixed lines + matching records) and general', () => {
  const m = buildFinanceMonth([job('a', { payDate: '2026-10-20' })], [
    exp('e1', 'ค่าเช่าห้อง', 5000, '2026-10-01'),
    exp('e2', 'ค่าอาหาร', 1200, '2026-10-08', 'อาหาร/รับรองลูกค้า'),
  ], settings, '2026-10', '2026-10');
  // rent recorded (covers its fixed line), internet still a fixed line from Settings
  assert.deepEqual(m.expenseRows.map(r => [r.name, r.recurring, r.fromSettings]), [
    ['อินเทอร์เน็ต', true, true], ['ค่าอาหาร', false, false], ['ค่าเช่าห้อง', true, false],
  ]);
  assert.deepEqual([m.recurringTotal, m.generalTotal, m.expenseTotal], [5590, 1200, 6790]);
  assert.equal(m.remainder, -6790);
});

test('fixed costs do not appear in months before the account had any record', () => {
  const m = buildFinanceMonth([job('a', { startDate: '2026-08-01', payDate: '2026-10-20' })], [], settings, '2025-12', '2026-10');
  assert.deepEqual([m.expenseRows.length, m.expenseTotal], [0, 0]);
});

test('remainder is money received minus all expenses', () => {
  const m = buildFinanceMonth([job('paid', { status: 'done', received: 9700, pending: 0, payDate: '2026-10-03' })],
    [exp('e', 'ค่าเดินทาง', 480, '2026-10-07')], settings, '2026-10', '2026-10');
  assert.equal(m.remainder, 9700 - (5590 + 480));
});
