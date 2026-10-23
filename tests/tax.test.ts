import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppSettings, Expense, Job } from '../shared/types';
import {
  settleConfirmedTax,
  settleTax,
  taxExportRowsForYear,
  taxInputsForYear,
  taxReceiptSummaryForYear,
  withTaxInputsForYear,
} from '../shared/tax';
import { validateChanges } from '../shared/validation';

const baseJob = {
  type: 'Sponsored Post',
  status: 'done',
  paymentStatus: 'paid',
  creditTerm: 0,
  note: '',
  isPosted: true,
} as const;

const settings: AppSettings = {
  monthlyExpense: 0,
  monthlyRevenueGoal: 0,
  savingsPercentage: 40,
};

test('cash-basis tax receipts exclude unpaid and undated jobs', () => {
  const jobs = [
    { ...baseJob, id: 'unpaid', name: 'Unpaid', client: 'A', value: 5000, received: 0, pending: 5000, status: 'pending', paymentStatus: 'unpaid', payDate: '2026-03-15' },
    { ...baseJob, id: 'undated', name: 'Undated receipt', client: 'B', value: 1000, received: 1000, pending: 0, payDate: null, postDate: '2026-02-01', startDate: '2026-01-15' },
    {
      ...baseJob, id: 'undated-installment', name: 'Undated installment', client: 'C', value: 1000,
      received: 1000, pending: 0, status: 'installment', payDate: '2026-05-01',
      installments: [{ id: 'legacy-paid', label: 'งวดที่ 1', amount: 1000, dueDate: '2026-04-01', status: 'paid', paidAt: null }],
    },
  ] as Job[];

  const summary = taxReceiptSummaryForYear(jobs, 2026);
  assert.deepEqual(summary.rows, []);
  assert.deepEqual(summary.firstHalf, { gross: 0, wht: 0, received: 0 });
  assert.deepEqual(summary.fullYear, { gross: 0, wht: 0, received: 0 });
});

test('deposit and final payment are assigned to the tax years in which cash arrived', () => {
  const job = {
    ...baseJob,
    id: 'deposit', name: 'Cross-year deposit', client: 'A', value: 20000,
    whtRate: 3, whtAmount: 600, received: 19400, pending: 0,
    depositAmount: 9700, depositDate: '2025-12-20', payDate: '2026-01-10',
  } as Job;

  const y2025 = taxReceiptSummaryForYear([job], 2025);
  const y2026 = taxReceiptSummaryForYear([job], 2026);
  assert.deepEqual(y2025.secondHalf, { gross: 10000, wht: 300, received: 9700 });
  assert.deepEqual(y2025.rows.map(row => [row.date, row.label]), [['2025-12-20', 'รับมัดจำ']]);
  assert.deepEqual(y2026.firstHalf, { gross: 10000, wht: 300, received: 9700 });
  assert.deepEqual(y2026.rows.map(row => [row.date, row.label]), [['2026-01-10', 'รับเงิน']]);
});

test('a legacy partial receipt without depositDate is not assigned to the remaining balance payDate', () => {
  const job = {
    ...baseJob,
    id: 'legacy-undated-deposit', name: 'Unknown deposit date', client: 'A', value: 10_000,
    received: 4_000, pending: 6_000, status: 'partial', paymentStatus: 'partial',
    payDate: '2026-01-15', postDate: '2025-12-20',
  } as Job;

  assert.deepEqual(taxReceiptSummaryForYear([job], 2025).rows, []);
  assert.deepEqual(taxReceiptSummaryForYear([job], 2026).rows, []);
});

test('paid installments use paidAt while pending installments stay out of tax receipts', () => {
  const job = {
    ...baseJob,
    id: 'installments', name: 'Cross-year installments', client: 'B', value: 30000,
    whtRate: 3, whtAmount: 900, received: 19400, pending: 9700, status: 'installment',
    payDate: '2026-08-10',
    installments: [
      { id: 'i1', label: 'งวดที่ 1', amount: 9700, dueDate: '2025-12-01', status: 'paid', paidAt: '2025-12-03' },
      { id: 'i2', label: 'งวดที่ 2', amount: 9700, dueDate: '2026-07-01', status: 'paid', paidAt: '2026-07-02' },
      { id: 'i3', label: 'งวดที่ 3', amount: 9700, dueDate: '2026-08-01', status: 'pending', paidAt: null },
    ],
  } as Job;

  const summary = taxReceiptSummaryForYear([job], 2026);
  assert.deepEqual(summary.firstHalf, { gross: 0, wht: 0, received: 0 });
  assert.deepEqual(summary.secondHalf, { gross: 10000, wht: 300, received: 9700 });
  assert.deepEqual(summary.rows.map(row => [row.date, row.label]), [['2026-07-02', 'งวดที่ 2']]);
});

test('taxable receipt is gross income and withholding is a separate credit', () => {
  const job = {
    ...baseJob,
    id: 'wht', name: 'WHT job', client: 'C', value: 10000,
    whtRate: 3, whtAmount: 300, received: 9700, pending: 0, payDate: '2026-02-01',
  } as Job;
  const summary = taxReceiptSummaryForYear([job], 2026);
  assert.deepEqual(summary.fullYear, { gross: 10000, wht: 300, received: 9700 });
});

test('a fully withheld settled job is gross income even when no bank cash arrives', () => {
  const job = {
    ...baseJob,
    id: 'fully-withheld', name: 'Fully withheld', client: 'C', value: 1000,
    whtRate: 100, whtAmount: 1000, received: 0, pending: 0, paymentStatus: 'paid', payDate: '2026-02-02',
  } as Job;
  const summary = taxReceiptSummaryForYear([job], 2026);
  assert.deepEqual(summary.fullYear, { gross: 1000, wht: 1000, received: 0 });
});

test('selected-year export contains received rows and same-year expenses only', () => {
  const jobs = [
    { ...baseJob, id: 'prior', name: 'Prior', client: 'A', value: 1000, received: 1000, pending: 0, payDate: '2025-12-31' },
    { ...baseJob, id: 'current', name: 'Current', client: 'B', value: 2000, received: 2000, pending: 0, payDate: '2026-01-01' },
    { ...baseJob, id: 'unpaid', name: 'Unpaid', client: 'C', value: 3000, received: 0, pending: 3000, status: 'pending', paymentStatus: 'unpaid', payDate: '2026-02-01' },
    {
      ...baseJob, id: 'installment', name: 'Installment', client: 'D', value: 2000, received: 1000, pending: 1000, status: 'installment', payDate: '2026-08-01',
      installments: [
        { id: 'paid', label: 'จ่ายแล้ว', amount: 1000, dueDate: '2026-07-01', status: 'paid', paidAt: '2026-07-02' },
        { id: 'pending', label: 'รอชำระ', amount: 1000, dueDate: '2026-08-01', status: 'pending', paidAt: null },
      ],
    },
  ] as Job[];
  const expenses = [
    { id: 'old-expense', name: 'Old', category: 'Other', amount: 10, date: '2025-12-31' },
    { id: 'current-expense', name: 'Current', category: 'Other', amount: 20, date: '2026-01-01' },
    { id: 'invalid-expense', name: 'Invalid date', category: 'Other', amount: 30, date: '2026-99-99' },
  ] as Expense[];

  const rows = taxExportRowsForYear(jobs, expenses, 2026);
  assert.deepEqual(rows.incomeRows.map(row => [row.jobName, row.date, row.received]), [
    ['Current', '2026-01-01', 2000],
    ['Installment', '2026-07-02', 1000],
  ]);
  assert.deepEqual(rows.expenseRows.map(row => row.id), ['current-expense']);
});

test('tax settlement separates credits, amount due, and overpayment', () => {
  assert.deepEqual(
    settleTax(15000, { whtCredit: 3000, pnd93Paid: 500, pnd94Paid: 2000 }),
    { assessedTax: 15000, totalCredits: 5500, due: 9500, overpayment: 0 },
  );
  assert.deepEqual(
    settleTax(4000, { whtCredit: 3000, pnd94Paid: 2000, otherTaxCredits: 1000 }),
    { assessedTax: 4000, totalCredits: 6000, due: 0, overpayment: 2000 },
  );
});

test('tax settlement stays unavailable until assessed tax is explicitly confirmed', () => {
  assert.equal(settleConfirmedTax(undefined, { whtCredit: 3000 }), null);
  assert.equal(settleConfirmedTax(Number.NaN, { whtCredit: 3000 }), null);
  assert.equal(settleConfirmedTax(-1, { whtCredit: 3000 }), null);
  assert.deepEqual(
    settleConfirmedTax(4000, { whtCredit: 3000, pnd94Paid: 2000 }),
    { assessedTax: 4000, totalCredits: 5000, due: 0, overpayment: 1000 },
  );
});

test('tax inputs persist by Gregorian year without mutating another year', () => {
  const original: AppSettings = {
    ...settings,
    taxInputsByYear: {
      '2025': { firstHalfOtherRevenue: 111 },
      '2026': { firstHalfOtherRevenue: 222, fullYearWhtCreditOverride: 300 },
    },
  };
  const updated = withTaxInputsForYear(original, 2026, { fullYearWhtCreditOverride: 450, fullYearAssessedTaxOverride: 2000, pnd93Paid: 50, pnd94Paid: 500, otherTaxCredits: 25 });

  assert.deepEqual(taxInputsForYear(updated, 2025), { firstHalfOtherRevenue: 111 });
  assert.deepEqual(taxInputsForYear(updated, 2026), {
    firstHalfOtherRevenue: 222,
    fullYearWhtCreditOverride: 450,
    fullYearAssessedTaxOverride: 2000,
    pnd93Paid: 50,
    pnd94Paid: 500,
    otherTaxCredits: 25,
  });
  assert.deepEqual(taxInputsForYear(original, 2026), { firstHalfOtherRevenue: 222, fullYearWhtCreditOverride: 300 });
  assert.deepEqual(taxInputsForYear(updated, 2024), {});

  const saved = taxInputsForYear(updated, 2026);
  assert.deepEqual(
    settleConfirmedTax(saved.fullYearAssessedTaxOverride, {
      whtCredit: saved.fullYearWhtCreditOverride ?? 0,
      pnd93Paid: saved.pnd93Paid,
      pnd94Paid: saved.pnd94Paid,
      otherTaxCredits: saved.otherTaxCredits,
    }),
    { assessedTax: 2000, totalCredits: 1025, due: 975, overpayment: 0 },
  );
});

test('settings validation preserves year-scoped tax inputs without a migration', () => {
  const [change] = validateChanges([{
    table: 'cashflow_documents', id: 'settings', op: 'set', version: null,
    data: {
      ...settings,
      taxInputsByYear: {
        '2025': { firstHalfOtherRevenue: 10 },
        '2026': { fullYearWhtCreditOverride: 20, pnd94Paid: 30 },
      },
    },
  }]);
  assert.deepEqual((change.data as AppSettings).taxInputsByYear, {
    '2025': { firstHalfOtherRevenue: 10 },
    '2026': { fullYearWhtCreditOverride: 20, pnd94Paid: 30 },
  });
});
