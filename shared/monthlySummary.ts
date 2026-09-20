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
}

export interface SettingsRow {
  monthlyExpense?: number;
  monthlyRevenueGoal?: number;
  savingsPercentage?: number;
}

export interface MonthlySummary {
  income: number;
  received: number;
  variableExpense: number;
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

export function jobsInMonth(jobs: JobRow[], monthKey: string): JobRow[] {
  return jobs.filter((j) => dateKeyInMonth(j.payDate || j.postDate, monthKey));
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

  let income = 0;
  let received = 0;
  for (const j of jobs) {
    const dateKey = j.payDate || j.postDate;
    if (dateKeyInMonth(dateKey, monthKey)) {
      income += j.value || 0;
      received += j.received || 0;
    }
  }

  let variableExpense = 0;
  for (const e of expenses) {
    if (dateKeyInMonth(e.date, monthKey)) {
      variableExpense += e.amount || 0;
    }
  }

  const fixedExpense = settings.monthlyExpense || 0;
  const fixedExpenseCalculated = fixedExpense; // includeFullYearFixed = true (default)
  const netFlow = received - fixedExpenseCalculated - variableExpense;
  // Cash actually left in hand: money received minus money already spent on logged variable
  // expenses this month. fixedExpense is excluded here since it's a recurring budget line
  // (already reflected in netFlow's warning), not a dated transaction that's left the wallet yet.
  const receivedAfterVariableExpense = Math.max(0, received - variableExpense);
  const actualSavings = Math.round(receivedAfterVariableExpense * (savingsPct / 100));

  return { income, received, variableExpense, fixedExpenseCalculated, netFlow, receivedAfterVariableExpense, actualSavings };
}

export function formatCurrency(n: number): string {
  // The space after ฿ isn't just cosmetic -- LINE's Flex renderer visually collides the Thai
  // Baht glyph with an immediately-following digit (no space) into an overlapping mess, as seen
  // live in production notification cards. A space keeps the two glyphs apart everywhere this
  // is used (LINE messages, monthly report emails).
  return `฿ ${Math.round(n).toLocaleString('th-TH')}`;
}
