import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import {
  getJobPaymentEntries,
  getJobPendingEntries,
  getOutstandingAmount,
  getReceivedForMonth,
  getPendingForMonth,
} from '../shared/installmentPayments';
import { computeMonthlySummary, fixedExpenseForMonth, jobsInMonth, workValueForMonth } from '../shared/monthlySummary';

const installmentJob: Job = {
  id: 'job-1',
  name: 'สนามแข่ง',
  type: 'บริการ',
  client: 'ทีมตัวอย่าง',
  value: 500_000,
  received: 300_000,
  pending: 200_000,
  status: 'installment',
  creditTerm: 30,
  postDate: '2026-08-01',
  payDate: '2026-10-15',
  note: '',
  installments: [
    { id: 'i1', label: 'งวดแรก', amount: 300_000, dueDate: '2026-09-15', paidAt: '2026-09-14', status: 'paid' },
    { id: 'i2', label: 'งวดที่ 2', amount: 100_000, dueDate: '2026-10-15', paidAt: null, status: 'pending' },
    { id: 'i3', label: 'งวดที่ 3', amount: 100_000, dueDate: '2026-11-15', paidAt: null, status: 'pending' },
  ],
};

test('installment payments stay separate with their real labels and dates', () => {
  assert.deepEqual(getJobPaymentEntries(installmentJob).map(({ label, amount, date }) => ({ label, amount, date })), [
    { label: 'งวดแรก', amount: 300_000, date: '2026-09-14' },
  ]);
  assert.equal(getReceivedForMonth(installmentJob, '2026-09'), 300_000);
  assert.equal(getReceivedForMonth(installmentJob, '2026-10'), 0);
});

test('pending installments are attributed to their own due month', () => {
  assert.equal(getJobPendingEntries(installmentJob).length, 2);
  assert.equal(getPendingForMonth(installmentJob, '2026-10'), 100_000);
  assert.equal(getPendingForMonth(installmentJob, '2026-11'), 100_000);
});

test('quick-pay outstanding amount ignores workflow labels and includes every unpaid installment', () => {
  const misleadingStatus: Job = { ...installmentJob, status: 'done', paymentStatus: 'paid' };
  assert.equal(getOutstandingAmount(misleadingStatus), 200_000);

  const fullyPaid: Job = {
    ...installmentJob,
    installments: installmentJob.installments?.map((row) => ({ ...row, status: 'paid' as const })),
  };
  assert.equal(getOutstandingAmount(fullyPaid), 0);
});

test('legacy one-time jobs keep the balance due while an undated partial receipt stays out of monthly cash', () => {
  const legacy: Job = { ...installmentJob, id: 'job-2', installments: undefined, received: 20_000, pending: 5_000, payDate: '2026-09-20' };
  assert.equal(getReceivedForMonth(legacy, '2026-09'), 0);
  assert.equal(getPendingForMonth(legacy, '2026-09'), 5_000);
});

test('monthly notification summary counts only installments actually paid in that month', () => {
  const summary = computeMonthlySummary([installmentJob], [], [], { monthlyExpense: 0 }, '2026-09');
  assert.equal(summary.received, 300_000);
  assert.equal(jobsInMonth([installmentJob], '2026-10').length, 1);
  assert.equal(computeMonthlySummary([installmentJob], [], [], { monthlyExpense: 0 }, '2026-10').received, 0);
});

test('monthly notification summary matches dashboard cash totals', () => {
  const job: Job = {
    ...installmentJob,
    value: 10_000,
    received: 4_000,
    pending: 6_000,
    isPosted: true,
    installments: [
      { id: 'paid', label: 'งวดแรก', amount: 4_000, dueDate: '2026-09-10', paidAt: '2026-09-12', status: 'paid' },
      { id: 'due', label: 'งวดสอง', amount: 6_000, dueDate: '2026-09-30', paidAt: null, status: 'pending' },
    ],
  };
  const summary = computeMonthlySummary(
    [job],
    [{ name: 'ค่าเดินทาง', amount: 500, date: '2026-09-20' }],
    [{ allocatedPercentage: 20, history: [{ type: 'deposit', amount: 1_000, date: '2026-09-25', deductedFromCash: true }] }],
    { monthlyExpense: 300 },
    '2026-09',
  );

  assert.equal(summary.received, 4_000);
  assert.equal(summary.income, 10_000);
  assert.equal(summary.cashGoalDeductions, 1_000);
  assert.equal(summary.netFlow, 2_200);
  assert.equal(summary.receivedAfterVariableExpense, 2_500);
});

test('a deposit counts in the month it was received, not the remaining balance due month', () => {
  const partial: Job = {
    ...installmentJob, id: 'job-3', installments: undefined, value: 8_000, received: 4_000, pending: 4_000,
    status: 'partial', payDate: '2026-10-10', depositDate: '2026-09-25', depositAmount: 4_000,
  };
  assert.equal(getReceivedForMonth(partial, '2026-09'), 4_000);
  assert.equal(getReceivedForMonth(partial, '2026-10'), 0);
  assert.equal(getPendingForMonth(partial, '2026-10'), 4_000);
  const summarySep = computeMonthlySummary([partial], [], [], {}, '2026-09');
  const summaryOct = computeMonthlySummary([partial], [], [], {}, '2026-10');
  assert.equal(summarySep.received, 4_000);
  assert.equal(summaryOct.received, 0);
  assert.equal(summaryOct.income, 4_000);
  assert.ok(jobsInMonth([partial], '2026-09').length === 1);

  const paidLater: Job = { ...partial, received: 8_000, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2026-10-08' };
  assert.deepEqual(getJobPaymentEntries(paidLater).map(({ label, amount, date }) => ({ label, amount, date })), [
    { label: 'รับมัดจำ', amount: 4_000, date: '2026-09-25' },
    { label: 'รับเงิน', amount: 4_000, date: '2026-10-08' },
  ]);
  assert.equal(computeMonthlySummary([paidLater], [], [], {}, '2026-09').received, 4_000);
  assert.equal(computeMonthlySummary([paidLater], [], [], {}, '2026-10').received, 4_000);
});

test('a partial receipt without a recorded deposit date is not invented on the balance due date', () => {
  const legacyPartial: Job = { ...installmentJob, id: 'job-4', installments: undefined, received: 3_000, pending: 2_000, payDate: '2026-10-01' };
  assert.equal(getReceivedForMonth(legacyPartial, '2026-10'), 0);
  assert.equal(computeMonthlySummary([legacyPartial], [], [], {}, '2026-10').received, 0);
  assert.equal(getJobPaymentEntries(legacyPartial)[0].date, null);
});

test('a paid installment without paidAt stays undated instead of falling back to the job due date', () => {
  const undatedPaid: Job = {
    ...installmentJob,
    installments: [{ id: 'legacy-paid', label: 'งวดเก่า', amount: 3_000, dueDate: '2026-09-01', paidAt: null, status: 'paid' }],
    received: 3_000,
    pending: 0,
  };
  assert.equal(getJobPaymentEntries(undatedPaid)[0].date, null);
  assert.equal(getReceivedForMonth(undatedPaid, '2026-09'), 0);
});

test('a logged bill that is also a fixed item counts once in its month', () => {
  const settings = { monthlyExpense: 17_000, fixedExpenseItems: [{ name: 'ค่าห้อง', amount: 12_000 }, { name: 'ค่าเน็ต', amount: 5_000 }] };
  const expenses = [
    { name: ' ค่าห้อง ', amount: 12_500, date: '2026-09-01' },
    { name: 'ค่าเดินทาง', amount: 300, date: '2026-09-03' },
  ];
  assert.equal(fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, expenses.map((e) => e.name)), 5_000);
  const sep = computeMonthlySummary([], expenses, [], settings, '2026-09');
  assert.equal(sep.fixedExpenseCalculated + sep.variableExpense, 17_800);
  const oct = computeMonthlySummary([], expenses, [], settings, '2026-10');
  assert.equal(oct.fixedExpenseCalculated, 17_000);
  assert.equal(fixedExpenseForMonth(9_000, undefined, ['ค่าห้อง']), 9_000);
});

test('monthly work value is the after-WHT value of jobs with money in or due that month', () => {
  const base = { ...installmentJob, installments: undefined, received: 0, pending: 0, payDate: null, postDate: '2026-08-01' };
  const jobs: Job[] = [
    // deposit this month, rest due next month: counted at full value in both months
    { ...base, id: 'w1', value: 10_000, received: 3_000, pending: 7_000, payDate: '2026-10-10', depositDate: '2026-09-02', depositAmount: 3_000 },
    // installment: first installment paid in Sep, others due Oct/Nov -> full 500k where it touches
    { ...installmentJob, id: 'w2' },
    // WHT job fully paid in Sep: gross value, not net received
    { ...base, id: 'w3', value: 10_000, whtRate: 3, whtAmount: 300, received: 9_700, payDate: '2026-09-20' },
    // taken in Aug, paid in Sep
    { ...base, id: 'w4', value: 5_000, startDate: '2026-08-30', payDate: '2026-09-29', received: 5_000 },
    // WIP job not delivered yet: its pending amount is not counted as due
    { ...base, id: 'w5', value: 8_000, pending: 8_000, isPosted: false, payDate: '2026-09-25' },
  ];
  const sep = workValueForMonth(jobs, '2026-09');
  assert.equal(sep.grossValue, 525_000);
  assert.equal(sep.value, 525_000 - 300);
  assert.equal(sep.count, 4);
  assert.equal(sep.received, 3_000 + 300_000 + 9_700 + 5_000);
  assert.equal(sep.pending, 0);
  assert.equal(sep.wht, 300);
  assert.equal(sep.value, sep.received + sep.pending + sep.otherMonths);
  assert.equal(sep.grossValue - sep.value, sep.wht);
  assert.equal(sep.otherMonths, 7_000 + 200_000);
  const oct = workValueForMonth(jobs, '2026-10');
  assert.equal(oct.value, 510_000);
  assert.equal(oct.wht, 0);
  assert.equal(oct.count, 2);
  assert.equal(oct.pending, 7_000 + 100_000);
  assert.equal(oct.value, oct.received + oct.pending + oct.otherMonths);
  assert.equal(workValueForMonth(jobs, '2026-07').value, 0);
  const paidLater = jobs.map((j) => (j.id === 'w1' ? { ...j, received: 10_000, pending: 0, payDate: '2026-10-05' } : j));
  assert.equal(workValueForMonth(paidLater, '2026-09').value, 525_000 - 300);
});
