import type { AppSettings, Expense, Job } from '../../../../shared/types';
import { firstActivityMonth, fixedExpenseForMonth } from '../../../../shared/monthlySummary';

// One month of the รายจ่าย page: recorded expenses plus the fixed monthly lines from Settings that
// no recorded payment covers yet -- the same rule as the dashboard's รายจ่ายเดือนนี้, so both pages
// always show the same total. A recorded expense is "ประจำ" when its name matches a fixed line
// (that is how the existing recurring behaviour links the two); everything else is "ทั่วไป".

export interface ExpenseRow {
  id: string;
  name: string;
  amount: number;
  /** null for a fixed line from Settings (a monthly budget item, not a dated record). */
  date: string | null;
  category: string;
  note?: string;
  recurring: boolean;
  /** A fixed monthly line from Settings, not yet recorded as paid this month. */
  fromSettings: boolean;
}

export interface ExpenseMonth {
  monthKey: string;
  rows: ExpenseRow[];
  recurringTotal: number;
  generalTotal: number;
  total: number;
}

export type ExpenseSort = 'recent' | 'oldest' | 'amountDesc' | 'amountAsc';

/** Name the old single lump-sum fixed cost takes once it becomes an item (same as Settings). */
export const LEGACY_FIXED_NAME = 'ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)';

const inMonth = (date: string | null | undefined, monthKey: string) => Boolean(date && date.slice(0, 7) === monthKey);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function buildExpenseMonth(
  jobs: Job[],
  expenses: Expense[],
  settings: Pick<AppSettings, 'monthlyExpense' | 'fixedExpenseItems'>,
  monthKey: string,
  currentMonth: string,
): ExpenseMonth {
  const fixedItems = settings.fixedExpenseItems || [];
  const recorded = expenses.filter(e => inMonth(e.date, monthKey));
  const recordedRows: ExpenseRow[] = recorded.map(e => ({
    id: e.id, name: e.name, amount: e.amount, date: e.date, category: e.category, note: e.note,
    recurring: fixedItems.some(item => sameName(item.name, e.name)), fromSettings: false,
  }));

  // Fixed lines count from the account's first recorded month on (never before it existed).
  const counts = monthKey >= (firstActivityMonth(jobs, expenses) ?? currentMonth);
  const legacyLump = fixedItems.length === 0 && (settings.monthlyExpense || 0) > 0;
  const settingsRows: ExpenseRow[] = !counts ? [] : legacyLump
    ? [{ id: 'fixed-legacy', name: LEGACY_FIXED_NAME, amount: settings.monthlyExpense, date: null, category: '', recurring: true, fromSettings: true }]
    : fixedItems
        .filter(item => item.amount > 0 && !recorded.some(e => sameName(e.name, item.name)))
        .map(item => ({ id: `fixed-${item.id}`, name: item.name, amount: item.amount, date: null, category: '', recurring: true, fromSettings: true }));

  // The shared dashboard rule decides the fixed total; the rows above add up to it.
  const fixedTotal = counts ? fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, recorded.map(e => e.name)) : 0;
  const recurringTotal = fixedTotal + recordedRows.filter(r => r.recurring).reduce((sum, r) => sum + r.amount, 0);
  const generalTotal = recordedRows.filter(r => !r.recurring).reduce((sum, r) => sum + r.amount, 0);
  return {
    monthKey,
    rows: sortExpenseRows([...settingsRows, ...recordedRows], 'recent'),
    recurringTotal,
    generalTotal,
    total: recurringTotal + generalTotal,
  };
}

// Dates are YYYY-MM-DD, so string order is chronological. Fixed lines (no date) apply to the whole
// month and lead the date sorts; ties keep the larger amount first.
export function sortExpenseRows(rows: ExpenseRow[], sort: ExpenseSort): ExpenseRow[] {
  const byDate = (newestFirst: boolean) => (a: ExpenseRow, b: ExpenseRow) => {
    if (!a.date !== !b.date) return a.date ? 1 : -1;
    if (a.date && b.date && a.date !== b.date) return (a.date < b.date ? -1 : 1) * (newestFirst ? -1 : 1);
    return b.amount - a.amount;
  };
  const compare = sort === 'amountDesc' ? (a: ExpenseRow, b: ExpenseRow) => b.amount - a.amount
    : sort === 'amountAsc' ? (a: ExpenseRow, b: ExpenseRow) => a.amount - b.amount
    : byDate(sort === 'recent');
  return [...rows].sort(compare);
}
