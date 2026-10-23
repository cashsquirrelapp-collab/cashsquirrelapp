import { currentCash, type CashOpening } from '../../../shared/cashBalance.js';
import type { MonthlySummary, JobRow, ExpenseRow } from './monthlySummary.js';
import { monthlyProfitSummary } from '../../../shared/monthlySummary.js';
import { roundMoney } from '../../../shared/wht.js';
import type { Goal } from '../../../shared/types.js';
import type { LineMessage } from './line.js';
import { lineCard, lineValueRow, LINE_CARD_COLORS as C } from './lineCards.js';

export type LineCashPosition = ReturnType<typeof currentCash> & { hasOpening: boolean };

/** Same shared balance calculation as the app's cash model. No budgets or pending receipts. */
export function lineCashPosition(user: {
  jobs?: Pick<JobRow, 'received'>[];
  expenses?: Pick<ExpenseRow, 'amount'>[];
  goals?: Pick<Goal, 'current'>[];
  settings?: { cashOpening?: CashOpening };
}): LineCashPosition {
  const opening = user.settings?.cashOpening;
  return {
    ...currentCash({ amount: opening?.amount ?? 0 }, user.jobs ?? [], user.expenses ?? [], user.goals ?? []),
    hasOpening: opening !== undefined,
  };
}

export function formatMonthlyMoney(amount: number): string {
  const rounded = roundMoney(amount);
  return `${rounded < 0 ? '−' : ''}฿ ${Math.abs(rounded).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
}

export function buildLineCashSummary(options: {
  title: string;
  monthLabel: string;
  summary: MonthlySummary;
  footer?: { label: string; uri: string };
}): LineMessage {
  const { summary: s, monthLabel } = options;
  const monthly = monthlyProfitSummary(s);
  const body = [
    lineValueRow('รายรับ', formatMonthlyMoney(s.received), { color: C.positive, size: 'md' }),
    lineValueRow('รายจ่ายรวม', formatMonthlyMoney(monthly.totalExpense), { color: C.negative, size: 'md', caption: 'ประจำ + ทั่วไป' }),
  ];
  return lineCard({
    title: options.title, subtitle: monthLabel, compact: true, character: 'report',
    // Net profit is the headline, on the coloured band; income and expenses are the rows under it.
    metric: { label: 'กำไรสุทธิ', value: formatMonthlyMoney(monthly.netProfit), note: 'รายรับ − รายจ่าย' },
    body,
    note: 'กำไรของเดือนนี้ ก่อนแบ่งออมเข้าเป้าหมาย',
    footer: options.footer,
    altText: `${options.title} (${monthLabel}) · รายรับ ${formatMonthlyMoney(monthly.received)} · รายจ่ายรวม ${formatMonthlyMoney(monthly.totalExpense)} · กำไรสุทธิ ${formatMonthlyMoney(monthly.netProfit)}`,
  });
}
