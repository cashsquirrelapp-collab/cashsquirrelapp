import type { AppSettings, Expense, Job } from '../../../../shared/types';
import { getJobPaymentEntries, getJobPendingEntries } from '../../../../shared/installmentPayments';
import { firstActivityMonth, fixedExpenseForMonth, workValueRowsForMonth } from '../../../../shared/monthlySummary';

// One month of the การเงิน statement, built only from the two things users enter: jobs and
// expenses. Money from jobs counts when it was actually received (same payment entries as the
// dashboard); expenses are the recorded ones plus the fixed monthly lines from Settings that no
// recorded payment covers yet (same rule as the dashboard's รายจ่ายเดือนนี้).

export type JobPayState = 'paid' | 'partial' | 'installment' | 'unpaid';

export interface FinanceJobRow {
  jobId: string;
  name: string;
  client: string;
  /** Job value after WHT. */
  value: number;
  /** Received during the month. */
  received: number;
  /** Still outstanding today from payments due in the month. */
  pending: number;
  /** Latest payment date in the month, else the earliest due date in the month. */
  date: string | null;
  state: JobPayState;
  hasInstallments: boolean;
}

export interface FinanceExpenseRow {
  id: string;
  name: string;
  amount: number;
  /** null for a fixed line from Settings (a monthly budget item, not a dated record). */
  date: string | null;
  category: string;
  note?: string;
  recurring: boolean;
  /** A fixed monthly line from Settings rather than a recorded expense. */
  fromSettings: boolean;
}

export interface FinanceMonth {
  monthKey: string;
  jobRows: FinanceJobRow[];
  received: number;
  pending: number;
  workValue: number;
  expenseRows: FinanceExpenseRow[];
  recurringTotal: number;
  generalTotal: number;
  expenseTotal: number;
  /** received - expenses */
  remainder: number;
}

const inMonth = (date: string | null | undefined, monthKey: string) => Boolean(date && date.slice(0, 7) === monthKey);

export const jobPayState = (job: Job): JobPayState =>
  job.installments?.length && job.pending > 0 ? 'installment'
    : job.pending <= 0 && (job.received > 0 || job.status === 'done') ? 'paid'
    : job.received > 0 ? 'partial'
    : 'unpaid';

export function buildFinanceMonth(
  jobs: Job[],
  expenses: Expense[],
  settings: Pick<AppSettings, 'monthlyExpense' | 'fixedExpenseItems'>,
  monthKey: string,
  currentMonth: string,
): FinanceMonth {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const jobRows: FinanceJobRow[] = workValueRowsForMonth(jobs, monthKey).map(row => {
    const job = byId.get(row.jobId)!;
    const paidDates = getJobPaymentEntries(job).map(e => e.date).filter(d => inMonth(d, monthKey)).sort();
    const dueDates = getJobPendingEntries(job).map(e => e.dueDate).filter(d => inMonth(d, monthKey)).sort();
    return {
      jobId: row.jobId,
      name: row.name,
      client: row.client,
      value: row.value,
      received: row.received,
      pending: row.pending,
      date: (row.received > 0 ? paidDates.at(-1) : dueDates[0]) ?? paidDates.at(-1) ?? dueDates[0] ?? null,
      state: jobPayState(job),
      hasInstallments: Boolean(job.installments?.length),
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const fixedItems = settings.fixedExpenseItems || [];
  const isRecurringName = (name: string) => fixedItems.some(item => item.name.trim().toLowerCase() === name.trim().toLowerCase());
  const recorded = expenses.filter(e => inMonth(e.date, monthKey));
  const recordedRows: FinanceExpenseRow[] = recorded.map(e => ({
    id: e.id, name: e.name, amount: e.amount, date: e.date, category: e.category, note: e.note,
    recurring: isRecurringName(e.name), fromSettings: false,
  }));

  // Fixed lines no recorded expense covers this month, from the account's first month on.
  const fixedFrom = firstActivityMonth(jobs, expenses) ?? currentMonth;
  const coveredNames = new Set(recorded.map(e => e.name.trim().toLowerCase()));
  const legacyLump = fixedItems.length === 0 && (settings.monthlyExpense || 0) > 0;
  const settingsRows: FinanceExpenseRow[] = monthKey < fixedFrom ? [] : legacyLump
    ? [{ id: 'fixed-legacy', name: 'ค่าใช้จ่ายคงที่รายเดือน', amount: settings.monthlyExpense, date: null, category: '', recurring: true, fromSettings: true }]
    : fixedItems
        .filter(item => item.amount > 0 && !coveredNames.has(item.name.trim().toLowerCase()))
        .map(item => ({ id: `fixed-${item.id}`, name: item.name, amount: item.amount, date: null, category: '', recurring: true, fromSettings: true }));

  // The shared dashboard rule decides the fixed total; the rows above must add up to it.
  const fixedTotal = monthKey < fixedFrom ? 0 : fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, recorded.map(e => e.name));
  const expenseRows = [...settingsRows, ...recordedRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))];
  const recurringTotal = fixedTotal + recordedRows.filter(r => r.recurring).reduce((sum, r) => sum + r.amount, 0);
  const generalTotal = recordedRows.filter(r => !r.recurring).reduce((sum, r) => sum + r.amount, 0);
  const received = jobRows.reduce((sum, r) => sum + r.received, 0);
  const pending = jobRows.reduce((sum, r) => sum + r.pending, 0);
  const expenseTotal = recurringTotal + generalTotal;

  return {
    monthKey, jobRows, received, pending,
    workValue: jobRows.reduce((sum, r) => sum + r.value, 0),
    expenseRows, recurringTotal, generalTotal, expenseTotal,
    remainder: received - expenseTotal,
  };
}
