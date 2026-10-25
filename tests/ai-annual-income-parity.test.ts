import assert from 'node:assert/strict';
import test from 'node:test';
import { executeFinancialTool } from '../backend/src/ai/financialQueries';
import type { UserRow } from '../backend/src/services/lineAssistant';
import { buildReport, periodStart } from '../frontend/src/features/report/reportData';
import { incomeRowsForYear, sumIncome } from '../shared/incomeExport';
import { taxReceiptSummaryForYear } from '../shared/tax';
import type { AppSettings, Job } from '../shared/types';

// Cross-surface regression fixtures: the assistant, the website's annual Excel source, and the
// report screen's rolling period. No provider, browser, database or account data is accessed.
const job = (id: string, extra: Partial<Job> = {}): Job => ({
  id, name: id, client: 'Fixture client', type: 'Design', value: 1000, received: 1000,
  pending: 0, status: 'done', paymentStatus: 'paid', creditTerm: 0, note: '',
  payDate: '2026-01-01', ...extra,
});
const account = (jobs: Job[], extra: Partial<UserRow> = {}): UserRow => ({
  user_id: 'annual-fixture-only', jobs, expenses: [], settings: {}, goals: [], ...extra,
});
const query = (args: Record<string, unknown>, user: UserRow, now: Date): any =>
  executeFinancialTool('financial_summary', args, user, now).result;

test('completed BE year reconciles to annual Excel and tax receipt sources, including both year boundaries', () => {
  const jobs = [
    job('before', { value: 200, received: 200, payDate: '2025-12-31' }),
    job('jan-1', { value: 1000, received: 970, whtRate: 3, whtAmount: 30, payDate: '2026-01-01' }),
    job('dec-31', { value: 2000, received: 1940, whtRate: 3, whtAmount: 60, payDate: '2026-12-31' }),
    job('after', { value: 400, received: 400, payDate: '2027-01-01' }),
    job('deposit-only', {
      value: 10000, received: 4850, pending: 4850, paymentStatus: 'partial',
      whtRate: 3, whtAmount: 300, depositAmount: 4850, depositDate: '2026-06-15', payDate: '2027-01-31',
    }),
    job('installments', {
      value: 10000, received: 9700, whtRate: 3, whtAmount: 300, payDate: '2027-01-10',
      installments: [
        { id: 'i-before', label: 'Before year', amount: 1940, status: 'paid', paidAt: '2025-12-30', dueDate: '2025-12-01' },
        { id: 'i-within', label: 'Within year', amount: 2910, status: 'paid', paidAt: '2026-07-01', dueDate: '2025-12-01' },
        { id: 'i-after', label: 'After year', amount: 4850, status: 'paid', paidAt: '2027-01-10', dueDate: '2026-12-01' },
      ],
    }),
    job('fully-withheld', { value: 1000, received: 0, whtRate: 100, whtAmount: 1000, payDate: '2026-08-01' }),
    job('unpaid', { value: 99999, received: 0, pending: 99999, paymentStatus: 'pending', payDate: '2026-09-01' }),
    job('undated-partial', { received: 300, pending: 700, paymentStatus: 'partial', payDate: '2026-10-01', postDate: '2026-09-01' }),
    job('invalid-date', { value: 500, received: 500, payDate: '2026-02-30' }),
  ];
  const user = account(jobs, {
    expenses: [{ name: 'Recorded cost', category: 'Work', amount: 650, date: '2026-07-01' }],
    settings: { monthlyExpense: 9999, cashOpening: { amount: 100000, createdAt: '2026-01-01', updatedAt: '2026-01-01' } } as AppSettings,
  });
  const now = new Date('2027-02-01T06:00:00Z');
  const annual = query({ year: 2569 }, user, now);
  assert.deepEqual(annual, query({ year: 2026 }, user, now));
  assert.deepEqual(annual.period, {
    kind: 'year', start_date: '2026-01-01', end_date: '2026-12-31',
    year_ce: 2026, year_be: 2569, included_through: '2026-12-31',
  });
  const expectedIncome = { gross: 12000, wht: 1330, received: 10670 };
  const websiteRows = incomeRowsForYear(jobs, 2026);
  assert.deepEqual(sumIncome(websiteRows), expectedIncome);
  assert.deepEqual(taxReceiptSummaryForYear(jobs, 2026).fullYear, expectedIncome);
  assert.deepEqual(annual.totals, {
    ...expectedIncome, actual_expenses: 650, net_cash_flow: 10020,
    receipt_count: 5, unique_jobs: 5, expense_count: 1,
  });
  assert.equal(annual.monthly.total_months, 12);
  assert.deepEqual(annual.monthly.rows.map((row: any) => row.month), Array.from({ length: 12 }, (_, i) => '2026-' + String(i + 1).padStart(2, '0')));
  assert.equal(annual.undated_receipts.count, 2);
  assert.equal(annual.undated_receipts.net_received, 800);
  assert.equal(query({ period: 'this_month' }, user, now).totals.received, 0, 'current-month income cannot replace an explicitly requested past year');
});

test('current-year assistant totals reconcile to annual export after its disclosed future receipts are removed', () => {
  const jobs = [
    job('received', { value: 10000, received: 9700, whtRate: 3, whtAmount: 300, payDate: '2026-02-01' }),
    job('future-marked-paid', { value: 2000, received: 1940, whtRate: 3, whtAmount: 60, payDate: '2026-12-31' }),
    job('still-pending', { value: 5000, received: 0, pending: 5000, paymentStatus: 'pending', payDate: '2026-10-24' }),
  ];
  const annual = query({ year: 2569 }, account(jobs), new Date('2026-10-24T06:00:00Z'));
  const exportTotal = sumIncome(incomeRowsForYear(jobs, 2026));
  assert.deepEqual(exportTotal, { gross: 12000, wht: 360, received: 11640 });
  assert.equal(annual.as_of, '2026-10-24');
  assert.equal(annual.period.end_date, '2026-12-31');
  assert.equal(annual.period.included_through, '2026-10-24');
  assert.equal(annual.totals.received, 9700);
  assert.deepEqual(annual.future_records_excluded.receipts, { count: 1, gross: 2000, wht: 60, received: 1940 });
  for (const key of ['gross', 'wht', 'received'] as const) {
    assert.equal(annual.totals[key] + annual.future_records_excluded.receipts[key], exportTotal[key], key);
  }
  assert.equal(annual.monthly.rows[11].received, 0);
  // The date-only receipt becomes eligible at midnight Bangkok, without changing the requested year.
  const atBangkokDate = query({ year: 2569 }, account(jobs), new Date('2026-12-30T17:00:00Z'));
  assert.equal(atBangkokDate.as_of, '2026-12-31');
  assert.equal(atBangkokDate.totals.received, exportTotal.received);
});

test('calendar-year income differs from the website rolling 12-month report, without being profit or contract value', () => {
  const jobs = [
    job('previous-november', { value: 3000, received: 3000, payDate: '2025-11-01' }),
    job('january', { value: 10000, received: 9700, whtRate: 3, whtAmount: 300, payDate: '2026-01-01' }),
    job('october', { value: 2000, received: 2000, payDate: '2026-10-01' }),
    job('unpaid-contract', { value: 50000, received: 0, pending: 50000, paymentStatus: 'pending', payDate: '2026-09-01' }),
  ];
  const localReportNow = new Date(2026, 9, 24, 12);
  const report = buildReport(jobs, '12', localReportNow);
  const user = account(jobs, {
    expenses: [{ name: 'Annual actual cost', category: 'Work', amount: 700, date: '2026-03-01' }],
    settings: { monthlyExpense: 9000 } as AppSettings,
  });
  const annual = query({ year: 2569 }, user, new Date('2026-10-24T06:00:00Z'));
  assert.equal(periodStart('12', localReportNow), '2025-11-01');
  assert.equal(report.totalReceived, 14700);
  assert.equal(annual.totals.received, 11700);
  assert.equal(annual.totals.gross, 12000);
  assert.equal(annual.totals.wht, 300);
  assert.equal(annual.totals.net_cash_flow, 11000);
  assert.equal(annual.recurring_budget.monthly_configured, 9000);
  assert.equal(annual.recurring_budget.included_in_actual_expenses, false);
  assert.equal(annual.totals.unique_jobs, 2);
  assert.equal(report.jobCount, 4, 'report job count also includes period jobs still awaiting payment');
});
