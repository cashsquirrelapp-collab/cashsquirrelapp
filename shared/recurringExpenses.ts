import { guessExpenseCategory } from './expenseCategory.js';
import type { Expense, FixedExpenseItem } from './types.js';

// รายจ่ายประจำลงชีตทุกเดือน (owner, 2026-11-18: "ทำให้รายจ่ายประจำลงชีตทุกเดือนด้วย"). The monthly fixed costs set in the app
// (settings.fixedExpenseItems: ค่าห้อง, ค่าเน็ต …) were only a sum the app adds each month, never records, so the connected
// sheet never had them. For an account with a sheet, each month's fixed items become that month's expenses, dated the 1st,
// note รายจ่ายประจำ: the sheet gets them as rows like any expense. The app's totals do not change: a recorded expense with
// a fixed item's name already takes that item's place in its month (incomeExpense buildExpenseMonth, fixedExpenseForMonth).
// Each item is made once a month (settings.recurringMade): one deleted afterwards, in the app or the sheet, is not made
// again that month; one already recorded by hand (same name, same month) is not made at all.

export interface RecurringMade { month: string; ids: string[] }
export type RecurringExpense = Omit<Expense, 'id'> & { recurringId: string };

const sameName = (a: string, b: string) => a.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase() === b.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/** The expenses to make for `month` (YYYY-MM), and the item ids that count as made for it afterwards. */
export function recurringExpensesDue(input: { items: readonly FixedExpenseItem[] | undefined; expenses: readonly Expense[]; month: string; made?: RecurringMade | null }): { create: RecurringExpense[]; made: RecurringMade } {
  const already = new Set(input.made?.month === input.month ? input.made.ids : []);
  const inMonth = input.expenses.filter(expense => typeof expense.date === 'string' && expense.date.startsWith(input.month));
  const create: RecurringExpense[] = [];
  const ids = new Set(already);
  for (const item of input.items ?? []) {
    if (!item?.id || !item.name?.trim() || !(Number(item.amount) > 0) || already.has(item.id)) continue;
    ids.add(item.id);
    const recorded = inMonth.some(expense => (expense as { recurringId?: string }).recurringId === item.id || sameName(expense.name, item.name));
    if (recorded) continue;
    create.push({ name: item.name.trim().slice(0, 500), amount: Number(item.amount), category: guessExpenseCategory(item.name) ?? 'อื่นๆ', date: `${input.month}-01`, note: 'รายจ่ายประจำ', recurringId: item.id });
  }
  return { create, made: { month: input.month, ids: [...ids].slice(0, 200) } };
}
