import type { Job } from './types.js';
import { getJobPaymentEntries, getJobPendingEntries, splitReceivedByDate } from './installmentPayments.js';
import { jobWhtAmount, roundMoney } from './wht.js';

export interface JobRow {
  id: string;
  name: string;
  type?: string;
  client?: string;
  value: number;
  received: number;
  pending?: number;
  status?: string;
  creditTerm?: number;
  startDate?: string;
  postDate?: string;
  payDate: string | null;
  dueDate?: string | null;
  whtRate?: number;
  whtAmount?: number;
  note?: string;
  isPosted?: boolean;
  paymentStatus?: string;
  depositDate?: string | null;
  depositAmount?: number;
  installments?: Array<{
    id: string;
    label: string;
    amount: number;
    dueDate: string | null;
    paidAt: string | null;
    status: 'pending' | 'paid';
  }>;
}

export interface ExpenseRow {
  name?: string;
  category?: string;
  amount: number;
  date: string;
  note?: string;
}

export interface GoalRow {
  allocatedPercentage?: number;
  history?: Array<{
    type: 'deposit' | 'withdraw';
    amount: number;
    date: string;
    deductedFromCash?: boolean;
  }>;
}

export interface FixedItemRow {
  name: string;
  amount: number;
}

export interface SettingsRow {
  monthlyExpense?: number;
  fixedExpenseItems?: FixedItemRow[];
  monthlyRevenueGoal?: number;
  savingsPercentage?: number;
}

export interface MonthlySummary {
  income: number;
  received: number;
  variableExpense: number;
  cashGoalDeductions: number;
  fixedExpenseCalculated: number;
  netFlow: number;
  receivedAfterVariableExpense: number;
  actualSavings: number;
}

// Bangkok is UTC+7 with no DST; a fixed offset is enough to get "today" right locally.
export function nowInBangkok(): Date {
  const now = new Date();
  return new Date(now.getTime() + 7 * 60 * 60 * 1000);
}

export function currentMonthKey(): string {
  const bkk = nowInBangkok();
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function previousMonthKey(): string {
  const bkk = nowInBangkok();
  const d = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function dateKeyInMonth(dateStr: string | undefined | null, monthKey: string): boolean {
  return !!dateStr && dateStr.substring(0, 7) === monthKey;
}

// Ticking "รายจ่ายประจำทุกเดือน" on a logged expense also adds it as a fixed item, so a dated
// expense named like a fixed item is that bill's actual payment for the month: its fixed line is
// skipped instead of counting the same bill twice.
/**
 * YYYY-MM of the account's earliest dated record (job start/delivery/payment or expense), or
 * null when there is none. Fixed monthly costs only count from this month on: months before
 * the account existed must not show rent or subscriptions as spent.
 */
export function firstActivityMonth(
  jobs: Job[],
  expenses: { date?: string | null }[],
): string | null {
  const dates = [
    ...jobs.flatMap(job => [job.startDate, job.postDate, ...getJobPaymentEntries(job).map(entry => entry.date)]),
    ...expenses.map(expense => expense.date),
  ].filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}/.test(date)).sort();
  return dates[0]?.slice(0, 7) ?? null;
}

export function fixedExpenseForMonth(
  monthlyExpense: number | undefined,
  fixedItems: FixedItemRow[] | undefined,
  monthExpenseNames: Array<string | undefined>,
): number {
  if (!fixedItems?.length) return monthlyExpense || 0;
  const logged = new Set(monthExpenseNames.map((name) => (name || '').trim().toLowerCase()).filter(Boolean));
  return fixedItems.reduce((sum, item) => (logged.has(item.name.trim().toLowerCase()) ? sum : sum + (item.amount || 0)), 0);
}

export interface WorkValueBreakdown {
  /** Net of withholding tax: what these jobs pay out, so it lines up with the received/pending cards. */
  value: number;
  /** Contract value before withholding tax. */
  grossValue: number;
  count: number;
  /** Net money received this month from these jobs -- same entries as the "รับเงินจริง" card. */
  received: number;
  /** Net money due this month -- same entries as the "รอรับเงิน" card. */
  pending: number;
  /** Withholding tax deducted automatically: grossValue - value. */
  wht: number;
  /** Rest of these jobs' value that was received earlier or falls due in another month. */
  otherMonths: number;
}

// "มูลค่างานเดือนนี้": value after withholding tax of every job that has money received or a payment
// due in the month -- the same entries the dashboard's received and pending cards count (pending
// skips not-yet-delivered WIP jobs). An installment job counts at its full value in each month it
// has a payment or due date in, not just that month's installment. value always equals
// received + pending + otherMonths so the banner can show where the number comes from.
export interface WorkValueRow {
  jobId: string;
  name: string;
  client: string;
  grossValue: number;
  wht: number;
  value: number;
  received: number;
  pending: number;
  otherMonths: number;
}

export function workValueRowsForMonth(jobs: Job[], monthKey: string): WorkValueRow[] {
  const rows: WorkValueRow[] = [];
  for (const job of jobs) {
    const paidThisMonth = getJobPaymentEntries(job).filter((entry) => dateKeyInMonth(entry.date, monthKey));
    const dueThisMonth = job.isPosted === false
      ? []
      : getJobPendingEntries(job).filter((entry) => dateKeyInMonth(entry.dueDate, monthKey));
    if (paidThisMonth.length === 0 && dueThisMonth.length === 0) continue;
    const grossValue = job.value || 0;
    const wht = jobWhtAmount(job);
    const value = roundMoney(grossValue - wht);
    const received = paidThisMonth.reduce((sum, entry) => sum + entry.amount, 0);
    const pending = dueThisMonth.reduce((sum, entry) => sum + entry.amount, 0);
    rows.push({ jobId: job.id, name: job.name, client: job.client || '', grossValue, wht, value, received, pending, otherMonths: value - received - pending });
  }
  return rows;
}

export function workValueForMonth(jobs: Job[], monthKey: string): WorkValueBreakdown {
  return workValueRowsForMonth(jobs, monthKey).reduce<WorkValueBreakdown>((acc, row) => ({
    value: acc.value + row.value,
    grossValue: acc.grossValue + row.grossValue,
    count: acc.count + 1,
    received: acc.received + row.received,
    pending: acc.pending + row.pending,
    wht: acc.wht + row.wht,
    otherMonths: acc.otherMonths + row.otherMonths,
  }), { value: 0, grossValue: 0, count: 0, received: 0, pending: 0, wht: 0, otherMonths: 0 });
}

export function jobsInMonth(jobs: JobRow[], monthKey: string): JobRow[] {
  return jobs.filter((j) =>
    dateKeyInMonth(j.payDate || j.postDate, monthKey)
    || (!j.installments?.length && dateKeyInMonth(j.depositDate, monthKey))
    || (j.installments || []).some((row) => dateKeyInMonth(row.paidAt || row.dueDate, monthKey))
  );
}

export function expensesInMonth(expenses: ExpenseRow[], monthKey: string): ExpenseRow[] {
  return expenses.filter((e) => dateKeyInMonth(e.date, monthKey));
}

// Mirrors MonthlyReportTab.tsx's monthlyData useMemo exactly, for one target month, with
// includeFullYearFixed hardcoded to true (its default in the UI). Single source of truth for
// this formula -- api/ imports this via api/_monthlySummary.ts (a thin re-export) and src/App.tsx
// imports it directly, so both sides can never silently drift from the app's real numbers.
export function computeMonthlySummary(
  jobs: JobRow[],
  expenses: ExpenseRow[],
  goals: GoalRow[],
  settings: SettingsRow,
  monthKey: string
): MonthlySummary {
  const totalAllocatedPct = goals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);
  const savingsPct = totalAllocatedPct > 0 ? totalAllocatedPct : (settings.savingsPercentage || 40);

  let received = 0;
  let pending = 0;
  for (const j of jobs) {
    const dateKey = j.payDate || j.postDate;
    if (j.installments?.length) {
      received += j.installments.reduce((sum, row) => (
        row.status === 'paid' && dateKeyInMonth(row.paidAt || dateKey, monthKey)
          ? sum + (row.amount || 0)
          : sum
      ), 0);
      if (j.isPosted !== false) {
        pending += j.installments.reduce((sum, row) => (
          row.status !== 'paid' && dateKeyInMonth(row.dueDate || dateKey, monthKey)
            ? sum + (row.amount || 0)
            : sum
        ), 0);
      }
    } else {
      received += splitReceivedByDate(j.received || 0, j.depositAmount, j.depositDate, dateKey || null)
        .reduce((sum, part) => (dateKeyInMonth(part.date, monthKey) ? sum + part.amount : sum), 0);
      if (j.isPosted !== false && dateKeyInMonth(dateKey, monthKey)) pending += j.pending || 0;
    }
  }
  // This is the Dashboard's contract-value definition for the selected month. Using the gross
  // job value here drifted as soon as installment due/paid dates crossed month boundaries.
  const income = received + pending;

  const monthExpenses = expenses.filter((e) => dateKeyInMonth(e.date, monthKey));
  const variableExpense = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const cashGoalDeductions = goals.reduce((sum, goal) => sum + (goal.history || []).reduce((goalSum, tx) => (
    tx.type === 'deposit' && tx.deductedFromCash && dateKeyInMonth(tx.date, monthKey)
      ? goalSum + (tx.amount || 0)
      : goalSum
  ), 0), 0);

  const fixedExpenseCalculated = fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, monthExpenses.map((e) => e.name));
  const netFlow = received - fixedExpenseCalculated - variableExpense - cashGoalDeductions;
  // Cash actually left in hand: money received minus money already spent on logged variable
  // expenses this month. fixedExpense is excluded here since it's a recurring budget line
  // (already reflected in netFlow's warning), not a dated transaction that's left the wallet yet.
  const receivedAfterVariableExpense = Math.max(0, received - variableExpense - cashGoalDeductions);
  const actualSavings = Math.round(receivedAfterVariableExpense * (savingsPct / 100));

  return { income, received, variableExpense, cashGoalDeductions, fixedExpenseCalculated, netFlow, receivedAfterVariableExpense, actualSavings };
}

export function formatCurrency(n: number): string {
  // The space after ฿ isn't just cosmetic -- LINE's Flex renderer visually collides the Thai
  // Baht glyph with an immediately-following digit (no space) into an overlapping mess, as seen
  // live in production notification cards. A space keeps the two glyphs apart everywhere this
  // is used (LINE messages, monthly report emails).
  return `฿ ${Math.round(n).toLocaleString('th-TH')}`;
}
