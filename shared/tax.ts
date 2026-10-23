import { incomeRowsForYear, isValidDateKey, sumIncome, type IncomeRow } from './incomeExport';
import type { AppSettings, Expense, Job, TaxYearInputs } from './types';
import { roundMoney } from './wht';

export interface TaxReceiptSummary {
  rows: IncomeRow[];
  firstHalfRows: IncomeRow[];
  secondHalfRows: IncomeRow[];
  firstHalf: ReturnType<typeof sumIncome>;
  secondHalf: ReturnType<typeof sumIncome>;
  fullYear: ReturnType<typeof sumIncome>;
}

const isFirstHalf = (date: string): boolean => {
  const month = Number(date.slice(5, 7));
  return month >= 1 && month <= 6;
};

/** Cash-basis receipts for one tax year, split using the date each payment actually arrived. */
export function taxReceiptSummaryForYear(jobs: Job[], year: number): TaxReceiptSummary {
  const rows = incomeRowsForYear(jobs, year);
  const firstHalfRows = rows.filter(row => isFirstHalf(row.date));
  const secondHalfRows = rows.filter(row => !isFirstHalf(row.date));
  return {
    rows,
    firstHalfRows,
    secondHalfRows,
    firstHalf: sumIncome(firstHalfRows),
    secondHalf: sumIncome(secondHalfRows),
    fullYear: sumIncome(rows),
  };
}

export function taxExpensesForYear(expenses: Expense[], year: number): Expense[] {
  const prefix = `${year}-`;
  return expenses
    .filter(expense => {
      const date = (expense.date || '').slice(0, 10);
      return isValidDateKey(date) && date.slice(0, 5) === prefix;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'th'));
}

export function taxExpenseSummaryForYear(expenses: Expense[], year: number) {
  const rows = taxExpensesForYear(expenses, year);
  let firstHalf = 0;
  let secondHalf = 0;
  for (const expense of rows) {
    if (isFirstHalf(expense.date)) firstHalf += expense.amount || 0;
    else secondHalf += expense.amount || 0;
  }
  return { rows, firstHalf: roundMoney(firstHalf), secondHalf: roundMoney(secondHalf), fullYear: roundMoney(firstHalf + secondHalf) };
}

/** Rows safe to put in a selected-year tax export: received income only and same-year expenses. */
export function taxExportRowsForYear(jobs: Job[], expenses: Expense[], year: number) {
  return {
    incomeRows: incomeRowsForYear(jobs, year),
    expenseRows: taxExpensesForYear(expenses, year),
  };
}

export interface TaxCredits {
  whtCredit: number;
  pnd93Paid?: number;
  pnd94Paid?: number;
  otherTaxCredits?: number;
}

export interface TaxSettlement {
  assessedTax: number;
  totalCredits: number;
  due: number;
  overpayment: number;
}

const nonNegativeMoney = (value: number | undefined): number =>
  Number.isFinite(value) ? Math.max(0, value as number) : 0;

/** Separates tax still due from tax paid in excess instead of hiding a negative result at zero. */
export function settleTax(assessedTax: number, credits: TaxCredits): TaxSettlement {
  const assessed = roundMoney(nonNegativeMoney(assessedTax));
  const totalCredits = roundMoney(
    nonNegativeMoney(credits.whtCredit)
      + nonNegativeMoney(credits.pnd93Paid)
      + nonNegativeMoney(credits.pnd94Paid)
      + nonNegativeMoney(credits.otherTaxCredits),
  );
  const difference = roundMoney(assessed - totalCredits);
  return {
    assessedTax: assessed,
    totalCredits,
    due: Math.max(0, difference),
    overpayment: Math.max(0, roundMoney(-difference)),
  };
}

/**
 * Never turn an unknown assessment into a zero-tax result. The caller must supply
 * an amount confirmed from the current official form (or by a tax adviser) before
 * we compare it with credits. This deliberately keeps category-specific expense
 * rules and the statutory alternative-minimum calculation out of app guesses.
 */
export function settleConfirmedTax(assessedTax: number | undefined, credits: TaxCredits): TaxSettlement | null {
  if (assessedTax === undefined || !Number.isFinite(assessedTax) || assessedTax < 0) return null;
  return settleTax(assessedTax, credits);
}

export function taxInputsForYear(settings: AppSettings, year: number): TaxYearInputs {
  return settings.taxInputsByYear?.[String(year)] ?? {};
}

/** Immutable settings update that cannot overwrite another tax year's inputs. */
export function withTaxInputsForYear(settings: AppSettings, year: number, patch: Partial<TaxYearInputs>): AppSettings {
  const key = String(year);
  return {
    ...settings,
    taxInputsByYear: {
      ...settings.taxInputsByYear,
      [key]: { ...settings.taxInputsByYear?.[key], ...patch },
    },
  };
}
