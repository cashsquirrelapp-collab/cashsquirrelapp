import { isPhaseOneFeatureAvailable } from '../shared/featureAvailability';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINANCIAL_TOOLS, executeFinancialTool, isFinancialTool } from '../backend/src/ai/financialQueries';
import { currentCash } from '../shared/cashBalance';
import type { AppSettings, Expense, Goal, Job } from '../shared/types';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Pure snapshot fixtures only: importing the query module must not load providers or a database.
const NOW = new Date('2026-10-24T06:00:00Z');
const job = (id: string, over: Partial<Job> = {}): Job => ({
  id, name: `งาน ${id}`, client: 'บริษัท ก', type: 'Design', value: 1000,
  received: 1000, pending: 0, status: 'done', paymentStatus: 'paid',
  creditTerm: 0, payDate: '2026-01-15', note: 'private job note', ...over,
});
const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id, name: `รายจ่าย ${id}`, category: 'Equipment', amount: 100,
  date: '2026-01-15', note: 'private expense note', ...over,
});
const account = (over: Partial<UserRow> = {}): UserRow => ({
  user_id: 'account-a', jobs: [], expenses: [], goals: [], settings: {}, ...over,
});
const settings = (over: Partial<AppSettings>) => over as UserRow['settings'];
const run = (name: string, args: Record<string, unknown>, user = account(), now = NOW): any =>
  executeFinancialTool(name, args, user, now).result;

test('financial queries expose only read tools and require one explicit valid period', () => {
  assert.deepEqual(FINANCIAL_TOOLS.map(tool => tool.name), [
    'financial_summary', 'search_receipts', 'search_expenses', 'get_expense', 'cash_position', 'tax_year_summary',
  ]);
  assert.equal(isFinancialTool('financial_summary'), true);
  assert.equal(isFinancialTool('propose_add_job'), false);
  for (const args of [
    {}, { year: 'last year' }, { year: 2569.5 }, { month: '2026-13' }, { month: '2026-1' },
    { period: 'yesterday' }, { year: 2026, month: '2026-01' },
    { start_date: '2026-01-01' }, { end_date: '2026-01-01' },
    { start_date: '2026-02-30', end_date: '2026-03-01' },
    { start_date: '2026-01-02', end_date: '2026-01-01' },
    { start_date: '2020-01-01', end_date: '2025-01-01' },
    { year: 1899 }, { year: 2201 },
  ]) {
    assert.equal(run('financial_summary', args).code, 'invalid_period', JSON.stringify(args));
  }
  assert.equal(run('financial_summary', { start_date: '2020-01-01', end_date: '2024-12-31' }).ok, true);
  assert.equal(run('unknown', {}).code, 'unknown_tool');
  assert.equal(run('tax_year_summary', { month: '2026-01' }).code, 'invalid_arguments');
});

test('CE and BE annual periods use actual calendar receipts, twelve buckets, and exclude future cash', () => {
  const user = account({ jobs: [
    job('previous', { payDate: '2025-12-31', received: 20, value: 20 }),
    job('jan', { payDate: '2026-01-01', received: 970, value: 1000, whtRate: 3, whtAmount: 30 }),
    job('oct', { payDate: '2026-10-24', received: 2000, value: 2000 }),
    job('future', { payDate: '2026-12-01', received: 400, value: 400 }),
    job('next', { payDate: '2027-01-01', received: 500, value: 500 }),
  ], expenses: [expense('paid', { amount: 120 }), expense('future', { date: '2026-12-02', amount: 30 })] });
  const result = run('financial_summary', { year: 2026 }, user);
  assert.deepEqual(result, run('financial_summary', { year: 2569 }, user));
  assert.deepEqual(result.totals, {
    gross: 3000, wht: 30, received: 2970, actual_expenses: 120, net_cash_flow: 2850,
    receipt_count: 2, unique_jobs: 2, expense_count: 1,
  });
  assert.equal(result.period.year_ce, 2026);
  assert.equal(result.period.year_be, 2569);
  assert.equal(result.period.included_through, '2026-10-24');
  assert.equal(result.monthly.rows.length, 12);
  assert.equal(result.monthly.rows[0].month, '2026-01');
  assert.equal(result.monthly.rows[11].month, '2026-12');
  assert.equal(result.monthly.rows[11].future_month, true);
  assert.equal(result.monthly.rows[11].received, 0);
  assert.deepEqual(result.future_records_excluded, {
    receipts: { count: 1, gross: 400, wht: 0, received: 400 }, expenses: { count: 1, amount: 30 },
  });
  assert.deepEqual(run('financial_summary', { month: '2569-01' }, user), run('financial_summary', { month: '2026-01' }, user));
});

test('installment receipt dates cross years without adding the aggregate job received twice', () => {
  const user = account({ jobs: [job('split', {
    value: 10000, received: 9700, whtRate: 3, whtAmount: 300, payDate: '2026-08-01',
    installments: [
      { id: 'p1', label: 'งวดแรก', amount: 4850, status: 'paid', dueDate: '2025-11-01', paidAt: '2025-12-31' },
      { id: 'p2', label: 'งวดสอง', amount: 4850, status: 'paid', dueDate: '2025-12-01', paidAt: '2026-01-02' },
      { id: 'not-paid', label: 'ไม่รับจริง', amount: 9999, status: 'pending', dueDate: '2026-01-01', paidAt: null },
    ],
  })] });
  assert.deepEqual(run('search_receipts', { year: 2569 }, user).totals, { gross: 5000, wht: 150, received: 4850, unique_jobs: 1 });
  const all = run('search_receipts', { period: 'all_time' }, user);
  assert.equal(all.total, 2);
  assert.deepEqual(all.totals, { gross: 10000, wht: 300, received: 9700, unique_jobs: 1 });
  assert.equal(all.rows[0].label, 'งวดสอง');
  assert.equal(all.rows[0].date, '2026-01-02');
});

test('deposits use their actual dates; unknown partial dates never use an outstanding due date', () => {
  const user = account({ jobs: [
    job('settled', { value: 10000, received: 9700, whtRate: 3, whtAmount: 300,
      depositAmount: 3880, depositDate: '2025-12-30', payDate: '2026-02-01' }),
    job('partial-known', { value: 1000, received: 200, pending: 800, paymentStatus: 'partial',
      depositAmount: 200, depositDate: '2026-01-10', payDate: '2027-01-01' }),
    job('partial-unknown', { value: 1000, received: 300, pending: 700, paymentStatus: 'partial',
      postDate: '2026-01-01', startDate: '2026-01-01', payDate: '2026-02-01' }),
    job('missing-installment', { value: 500, received: 500, installments: [
      { id: 'p3', label: 'ชำระแล้วไร้วันที่', amount: 500, status: 'paid', dueDate: '2026-01-02', paidAt: null },
    ] }),
    job('bad-date', { received: 90, value: 90, payDate: '2026-02-30' }),
  ] });
  const result = run('search_receipts', { year: 2026 }, user);
  assert.deepEqual(result.totals, { gross: 6200, wht: 180, received: 6020, unique_jobs: 2 });
  assert.equal(result.total, 2);
  assert.equal(result.undated_receipts.count, 3);
  assert.equal(result.undated_receipts.net_received, 890);
  assert.equal(result.undated_receipts.period_attribution, 'unknown');
});

test('fully withheld income and satang WHT allocation survive aggregation', () => {
  const user = account({ jobs: [
    job('withheld', { value: 1000, received: 0, pending: 0, whtRate: 100, whtAmount: 1000 }),
    job('satang', { value: 1, received: 0.97, whtRate: 3, whtAmount: 0.03, installments: [
      { id: 's1', label: '1', amount: 0.32, status: 'paid', dueDate: null, paidAt: '2026-01-01' },
      { id: 's2', label: '2', amount: 0.32, status: 'paid', dueDate: null, paidAt: '2026-01-02' },
      { id: 's3', label: '3', amount: 0.33, status: 'paid', dueDate: null, paidAt: '2026-01-03' },
    ] }),
  ] });
  const result = run('search_receipts', { year: 2026 }, user);
  assert.equal(result.total, 4);
  assert.deepEqual(result.totals, { gross: 1001, wht: 1000.03, received: 0.97, unique_jobs: 2 });
});

test('receipt search totals all matches before pagination and includes only requested filters', () => {
  const user = account({ jobs: Array.from({ length: 32 }, (_, i) => job(`row-${String(i).padStart(2, '0')}`, {
    value: 100 + i, received: 100 + i, name: `Campaign ${i}`, client: i < 30 ? 'Client Alpha' : 'Other', type: i < 30 ? 'VIDEO' : 'Design',
  })) });
  const args = { year: 2026, query: 'CAMPAIGN', client: 'alpha', job_type: 'video', limit: 25 };
  const first = run('search_receipts', args, user);
  const second = run('search_receipts', { ...args, offset: first.next_offset }, user);
  assert.equal(first.total, 30);
  assert.equal(first.shown, 25);
  assert.equal(first.next_offset, 25);
  assert.equal(second.shown, 5);
  assert.equal(second.next_offset, null);
  assert.deepEqual(first.totals, second.totals);
  assert.equal(first.totals.received, 3435);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.job_id)).size, 30);
  for (const patch of [{ limit: 26 }, { limit: 0 }, { offset: -1 }, { offset: 0.5 }, { offset: 100001 }, { query: 5 }]) {
    assert.equal(run('search_receipts', { ...args, ...patch }, user).code, 'invalid_arguments');
  }
});

test('actual expenses are paginated after totals and never include recurring budgets or goal transfers', () => {
  const user = account({ expenses: [
    ...Array.from({ length: 12 }, (_, i) => expense(`e${i}`, { name: `Camera ${i}`, amount: 25 })),
    expense('other', { category: 'Travel', amount: 40 }),
    expense('future', { date: '2026-11-01', amount: 500 }),
    expense('invalid', { date: '2026-02-30', amount: 70 }),
  ], settings: settings({ monthlyExpense: 999, fixedExpenseItems: [{ id: 'f1', name: 'Rent', amount: 2000 }] }),
  goals: [{ current: 1000, history: [{ type: 'deposit', amount: 1000, date: '2026-01-15', deductedFromCash: true }] } as Goal] });
  const result = run('search_expenses', { year: 2026, query: 'camera', category: 'equipment', limit: 5 }, user);
  assert.equal(result.total, 12);
  assert.equal(result.rows.length, 5);
  assert.ok(result.rows.every((row: any) => typeof row.expense_id === 'string'));
  assert.equal(result.totals.actual_expenses, 300);
  assert.deepEqual(result.by_category.rows, [{ label: 'Equipment', count: 12, amount: 300 }]);
  assert.equal(result.recurring_budget.monthly_configured, 2000);
  assert.equal(result.recurring_budget.included_in_actual_expenses, false);
  const summary = run('financial_summary', { year: 2026 }, user);
  assert.equal(summary.totals.actual_expenses, 340);
  assert.equal(summary.totals.net_cash_flow, -340);
  assert.equal(summary.invalid_or_undated_expenses.count, 1);
  assert.equal(summary.future_records_excluded.expenses.amount, 500);
});

test('expense details stay in the caller account and explicitly label future or undated records', () => {
  const user = account({ expenses: [
    expense('past', { note: 'Paid for the camera' }),
    expense('future', { date: '2027-01-01', note: 'x'.repeat(2001) }),
    expense('undated', { date: '' }),
    expense('invalid', { date: '2026-02-30' }),
  ] });
  const past = run('get_expense', { id: 'past' }, user);
  assert.equal(past.expense.note, 'Paid for the camera');
  assert.equal(past.expense.date_status, 'dated');
  assert.equal(past.expense.counted_in_actual_dated_expenses, true);
  const future = run('get_expense', { id: 'future' }, user);
  assert.equal(future.expense.date_status, 'future');
  assert.equal(future.expense.counted_in_actual_dated_expenses, false);
  assert.equal(future.expense.note.length, 2000);
  assert.equal(future.expense.note_truncated, true);
  for (const id of ['undated', 'invalid']) {
    const result = run('get_expense', { id }, user);
    assert.equal(result.expense.date_status, id);
    assert.equal(result.expense.date, null);
    assert.equal(result.expense.counted_in_actual_dated_expenses, false);
  }
  assert.equal(run('get_expense', { id: 'past' }, account({ user_id: 'account-b' })).code, 'not_found');
  assert.equal(run('get_expense', {}, user).code, 'invalid_arguments');
  assert.equal(run('get_expense', { id: 'past', user_id: 'account-b' }, user).code, 'invalid_arguments');
  const legacy = account({ expenses: [{ name: 'Old expense', category: 'Other', amount: 20, date: '2026-01-01' }] });
  const legacySearch = run('search_expenses', { year: 2026 }, legacy);
  assert.equal(legacySearch.totals.actual_expenses, 20);
  assert.equal(legacySearch.rows[0].expense_id, null, 'never invent an identifier for a legacy row');
});

test('inclusive date ranges do not round out to entire months; relative dates use Bangkok', () => {
  const user = account({ jobs: [
    job('before', { payDate: '2026-01-09' }), job('start', { payDate: '2026-01-10' }),
    job('end', { payDate: '2026-01-20' }), job('after', { payDate: '2026-01-21' }),
    job('february', { payDate: '2026-02-01' }),
  ] });
  const range = run('financial_summary', { start_date: '2026-01-10', end_date: '2026-01-20' }, user);
  assert.equal(range.totals.received, 2000);
  assert.equal(range.monthly.rows[0].received, 2000);
  const boundary = new Date('2026-01-31T18:00:00Z'); // 1 February 01:00 Bangkok
  const current = run('financial_summary', { period: 'this_month' }, user, boundary);
  const previous = run('financial_summary', { period: 'last_month' }, user, boundary);
  assert.equal(current.period.start_date, '2026-02-01');
  assert.equal(current.totals.received, 1000);
  assert.equal(previous.period.start_date, '2026-01-01');
  assert.equal(previous.totals.received, 4000);
});

test('all-time totals retain old income while returned month and breakdown rows stay capped', () => {
  const user = account({ jobs: [job('old', { payDate: '2010-01-01', received: 1234, value: 1234 }),
    ...Array.from({ length: 21 }, (_, i) => job(`client-${i}`, { client: `Client ${i}`, received: 10, value: 10 })),
  ] });
  const result = run('financial_summary', { period: 'all_time' }, user);
  assert.equal(result.totals.received, 1444);
  assert.equal(result.monthly.shown, 60);
  assert.equal(result.monthly.total_months, 193);
  assert.equal(result.monthly.omitted_months, 133);
  assert.equal(result.by_client.total_groups, 22);
  assert.equal(result.by_client.shown, 20);
  assert.equal(result.by_client.omitted_amount, 20);
});

test('cash position exactly matches app helper and separately discloses missing opening/undated receipts', () => {
  const user = account({ jobs: [job('paid', { received: 300, value: 300 }), job('undated', { received: 200, value: 400, pending: 200, payDate: null })],
    expenses: [expense('paid', { amount: 60 })], goals: [{ current: 40 } as Goal],
    settings: settings({ cashOpening: { amount: 1000, createdAt: '2026-01-01', updatedAt: '2026-01-01' }, monthlyExpense: 9000 }) });
  const result = run('cash_position', {}, user);
  // Goal money counts only once goals are open to every account (owner, 2026-10-24: only open areas).
  const goalsOpen = isPhaseOneFeatureAvailable('split', false);
  const expected = currentCash({ amount: 1000 }, user.jobs!, user.expenses!, goalsOpen ? user.goals : []);
  for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value, key);
  assert.equal(result.balance, 1440);
  assert.equal(result.readyToSpend, goalsOpen ? 1400 : 1440);
  assert.equal(result.has_opening_balance, true);
  assert.equal(result.undated_receipts.net_received, 200);
  assert.equal(run('cash_position', {}, account()).has_opening_balance, false);
  assert.equal(run('cash_position', { year: 2026 }, user).code, 'invalid_arguments');
});

test('tax summary uses only the selected year and safe saved inputs, with confirmed settlements', () => {
  const stored = {
    taxInputsByYear: {
      '2025': { fullYearAssessedTaxOverride: 99999 },
      '2026': { firstHalfOtherRevenue: 500, firstHalfAssessedTaxOverride: 200,
        fullYearAssessedTaxOverride: 500, pnd94Paid: 50, pnd93Paid: 10, otherTaxCredits: 20,
        deductionMethod: 'ตามจริง', fullYearWhtCreditOverride: 120,
        secondHalfActualExpenseOverride: -5, checklist: { sensitive_file: true, wht50: true, incomeSummary: false, idCard: 'invalid string' },
        fileData: 'secret-file-data', allowances: [{ key: 'child', value: 30000, quantity: 1, fileData: 'private' }, { key: 'unknown', value: 999 }],
      },
    }, taxEvidences: [{ fileData: 'secret-evidence' }], whtDocuments: [{ fileData: 'secret-wht-document' }],
  };
  const user = account({ settings: stored as unknown as UserRow['settings'], jobs: [
    job('first', { value: 1000, received: 970, whtRate: 3, whtAmount: 30, payDate: '2026-06-30' }),
    job('second', { value: 2000, received: 1940, whtRate: 3, whtAmount: 60, payDate: '2026-07-01' }),
  ], expenses: [expense('first', { date: '2026-06-30', amount: 25 }), expense('second', { date: '2026-07-01', amount: 35 })] });
  const result = run('tax_year_summary', { year: 2569 }, user);
  assert.deepEqual(result.receipts.first_half, { gross: 1000, wht: 30, received: 970 });
  assert.deepEqual(result.receipts.second_half, { gross: 2000, wht: 60, received: 1940 });
  assert.deepEqual(result.expense_reference, { first_half: 25, second_half: 35, full_year: 60, automatically_tax_deductible: false });
  assert.deepEqual(result.settlement.first_half, { assessedTax: 200, totalCredits: 30, due: 170, overpayment: 0 });
  assert.deepEqual(result.settlement.full_year, { assessedTax: 500, totalCredits: 200, due: 300, overpayment: 0 });
  assert.deepEqual(result.saved_inputs.allowances, [{ key: 'child', value: 30000, quantity: 1 }]);
  assert.deepEqual(result.saved_inputs.checklist, { wht50: true, incomeSummary: false });
  assert.equal(result.saved_fields_projection.omitted_allowances, 1);
  assert.equal(result.saved_fields_projection.file_contents_included, false);
  assert.equal(result.saved_inputs.secondHalfActualExpenseOverride, undefined);
  assert.doesNotMatch(JSON.stringify(result), /secret|fileData|sensitive|99999|invalid string/);
  const unknown = run('tax_year_summary', { year: 2024 }, user);
  assert.deepEqual(unknown.saved_inputs, {});
  assert.deepEqual(unknown.settlement, { first_half: null, full_year: null });
});

test('queries remain in caller snapshot, reject account selectors, and never mutate or expose private fields', () => {
  const a = account({ email: 'private@example.test', jobs: [job('account-a-job')],
    expenses: [expense('a')], settings: settings({ monthlyExpense: 10 }) });
  const b = account({ user_id: 'account-b', jobs: [job('account-b-job', { received: 9999, value: 9999 })] });
  const before = structuredClone(a);
  assert.equal(run('financial_summary', { year: 2026 }, a).totals.received, 1000);
  assert.equal(run('financial_summary', { year: 2026 }, b).totals.received, 9999);
  for (const key of ['user_id', 'account_id', 'finance_group_id']) {
    const result = run('financial_summary', { year: 2026, [key]: 'account-b' }, a);
    assert.equal(result.code, 'invalid_arguments');
  }
  for (const tool of FINANCIAL_TOOLS) {
    const result = run(tool.name, tool.name === 'cash_position' ? {} : tool.name === 'get_expense' ? { id: 'a' } : { year: 2026 }, a);
    assert.equal(result.ok, true);
    assert.doesNotMatch(JSON.stringify(result), /private@example|private job note|account-b/);
    if (tool.name !== 'get_expense') assert.doesNotMatch(JSON.stringify(result), /private expense note/);
  }
  assert.deepEqual(a, before);
  assert.equal(run('financial_summary', { year: 2026 }, account({ user_id: '' })).code, 'account_required');
});
