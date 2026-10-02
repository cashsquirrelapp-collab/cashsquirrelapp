import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expense, Job } from '../shared/types';
import { buildExpenseMonth, sortExpenseRows } from '../frontend/src/features/incomeExpense/expenseMonth';

const job = (fields: Partial<Job>): Job => ({
  id: 'j', name: 'งาน', type: 'ยังไม่ระบุ', client: '', value: 1000, received: 0, pending: 1000,
  status: 'pending', creditTerm: 0, payDate: null, note: '', startDate: '2026-08-01', ...fields,
});
const exp = (id: string, name: string, amount: number, date: string, category = 'อื่นๆ'): Expense => ({ id, name, amount, date, category });
const settings = { monthlyExpense: 5590, fixedExpenseItems: [{ id: 'rent', name: 'ค่าเช่าห้อง', amount: 5000 }, { id: 'net', name: 'อินเทอร์เน็ต', amount: 590 }] };
const jobs = [job({})];

test('recurring = fixed lines not yet recorded + records matching a fixed line; the rest is general', () => {
  const m = buildExpenseMonth(jobs, [
    exp('e1', 'ค่าเช่าห้อง', 5000, '2026-10-01'),
    exp('e2', 'ค่าอาหาร', 1200, '2026-10-08', 'อาหาร/รับรองลูกค้า'),
  ], settings, '2026-10', '2026-10');
  assert.deepEqual(m.rows.map(r => [r.name, r.recurring, r.fromSettings]), [
    ['อินเทอร์เน็ต', true, true], ['ค่าอาหาร', false, false], ['ค่าเช่าห้อง', true, false],
  ]);
  assert.deepEqual([m.recurringTotal, m.generalTotal, m.total], [5590, 1200, 6790]);
});

test('a recorded fixed bill is not counted twice with its fixed line', () => {
  const m = buildExpenseMonth(jobs, [exp('e1', ' อินเทอร์เน็ต ', 590, '2026-10-03')], settings, '2026-10', '2026-10');
  assert.equal(m.total, 5590);
  assert.equal(m.rows.filter(r => r.name.trim() === 'อินเทอร์เน็ต').length, 1);
});

test('old lump-sum fixed expense shows as one recurring line', () => {
  const m = buildExpenseMonth(jobs, [], { monthlyExpense: 12000, fixedExpenseItems: [] }, '2026-10', '2026-10');
  assert.deepEqual(m.rows.map(r => [r.name, r.amount, r.recurring]), [['ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)', 12000, true]]);
  // Recording it as paid that month replaces the line rather than adding to it.
  const paid = buildExpenseMonth(jobs, [exp('x', 'ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)', 12000, '2026-10-01')], { monthlyExpense: 12000, fixedExpenseItems: [{ id: 'l', name: 'ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)', amount: 12000 }] }, '2026-10', '2026-10');
  assert.equal(paid.total, 12000);
});

test('fixed costs do not appear in months before the account had any record', () => {
  const m = buildExpenseMonth(jobs, [], settings, '2025-12', '2026-10');
  assert.deepEqual([m.rows.length, m.total], [0, 0]);
});

test('only the selected month is included', () => {
  const m = buildExpenseMonth(jobs, [exp('a', 'ค่าเดินทาง', 480, '2026-09-30'), exp('b', 'ค่าเดินทาง', 300, '2026-10-01')], { monthlyExpense: 0 }, '2026-10', '2026-10');
  assert.deepEqual(m.rows.map(r => r.id), ['b']);
});

test('sorting uses real dates and amounts; fixed lines lead date sorts', () => {
  const m = buildExpenseMonth(jobs, [
    exp('a', 'A', 100, '2026-10-02'), exp('b', 'B', 900, '2026-10-20'), exp('c', 'C', 50, '2026-10-11'),
  ], settings, '2026-10', '2026-10');
  assert.deepEqual(sortExpenseRows(m.rows, 'recent').map(r => r.name), ['ค่าเช่าห้อง', 'อินเทอร์เน็ต', 'B', 'C', 'A']);
  assert.deepEqual(sortExpenseRows(m.rows, 'oldest').map(r => r.name), ['ค่าเช่าห้อง', 'อินเทอร์เน็ต', 'A', 'C', 'B']);
  assert.deepEqual(sortExpenseRows(m.rows, 'amountDesc').map(r => r.amount), [5000, 900, 590, 100, 50]);
  assert.deepEqual(sortExpenseRows(m.rows, 'amountAsc').map(r => r.amount), [50, 100, 590, 900, 5000]);
});
