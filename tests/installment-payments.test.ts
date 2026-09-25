import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import {
  getJobPaymentEntries,
  getJobPendingEntries,
  getReceivedForMonth,
  getPendingForMonth,
} from '../shared/installmentPayments';
import { computeMonthlySummary, jobsInMonth } from '../shared/monthlySummary';

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

test('legacy one-time jobs keep their aggregate behavior', () => {
  const legacy: Job = { ...installmentJob, id: 'job-2', installments: undefined, received: 20_000, pending: 5_000, payDate: '2026-09-20' };
  assert.equal(getReceivedForMonth(legacy, '2026-09'), 20_000);
  assert.equal(getPendingForMonth(legacy, '2026-09'), 5_000);
});

test('monthly notification summary counts only installments actually paid in that month', () => {
  const summary = computeMonthlySummary([installmentJob], [], [], { monthlyExpense: 0 }, '2026-09');
  assert.equal(summary.received, 300_000);
  assert.equal(jobsInMonth([installmentJob], '2026-10').length, 1);
  assert.equal(computeMonthlySummary([installmentJob], [], [], { monthlyExpense: 0 }, '2026-10').received, 0);
});
