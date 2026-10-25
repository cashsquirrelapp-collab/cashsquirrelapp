import { z } from 'zod';

// Money over several months as a chart card (owner, 2026-10-25: "2 เดือนที่ผ่านมารายได้กูเป็นไงบ้าง" came back as
// ASCII bars and a Markdown table). The card is built here from financial_summary's own figures, never by the
// model, so the chart, the card's totals and the model's text all use the same numbers. Gemini and Sonnet get the
// same card: it comes from the tool, not from either model.

import { formatTHB } from '../../../shared/thb.js';
export { formatTHB };
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** The chart shows at most a year; the card's totals still cover the whole period asked for. */
export const CHART_MONTHS = 12;

const money = z.number().finite().min(-1e12).max(1e12);
export const moneyChartSchema = z.object({
  kind: z.literal('money_chart'),
  title: z.string().min(1).max(60),
  period: z.string().min(1).max(60),
  months: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/), label: z.string().min(1).max(20),
    income: money, expense: money, net: money, partial: z.boolean(),
  }).strict()).max(CHART_MONTHS),
  totals: z.object({ income: money, expense: money, net: money }).strict(),
  omitted: z.number().int().min(0).max(1000),
}).strict();
export type MoneyChartCard = z.infer<typeof moneyChartSchema>;

const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${Number(month.slice(0, 4)) + 543}`;
function periodLabel(first: string, last: string): string {
  if (first === last) return monthLabel(first);
  const [fy, ly] = [first.slice(0, 4), last.slice(0, 4)];
  return fy === ly ? `${MONTHS[Number(first.slice(5, 7)) - 1]}–${MONTHS[Number(last.slice(5, 7)) - 1]} ${Number(ly) + 543}` : `${monthLabel(first)} – ${monthLabel(last)}`;
}

interface SummaryResult {
  ok?: boolean; as_of?: string;
  totals?: { received?: number; actual_expenses?: number; net_cash_flow?: number };
  monthly?: { rows?: { month: string; received: number; actual_expenses: number; net_cash_flow: number; future_month?: boolean }[] };
}
/** The chart card for a financial_summary result, or null when it has no months to show (the text answers alone). */
export function moneyChartFrom(raw: unknown): MoneyChartCard | null {
  const result = raw as SummaryResult;
  if (!result?.ok || !result.totals || !Array.isArray(result.monthly?.rows)) return null;
  const today = String(result.as_of || '').slice(0, 7);
  // Months that have not started are not drawn; the month in progress is marked.
  const rows = result.monthly!.rows!.filter(row => !row.future_month);
  if (!rows.length) return null;
  const shown = rows.slice(-CHART_MONTHS);
  const card = {
    kind: 'money_chart' as const,
    title: 'รายรับ–รายจ่าย',
    period: periodLabel(rows[0].month, rows.at(-1)!.month),
    months: shown.map(row => ({ month: row.month, label: monthLabel(row.month), income: row.received, expense: row.actual_expenses, net: row.net_cash_flow, partial: row.month === today })),
    totals: { income: result.totals.received ?? 0, expense: result.totals.actual_expenses ?? 0, net: result.totals.net_cash_flow ?? 0 },
    omitted: rows.length - shown.length,
  };
  const checked = moneyChartSchema.safeParse(card);
  return checked.success ? checked.data : null;
}

/** The card's figures as the model may quote them: the same numbers, written the same way as the card. */
export function moneyChartDisplay(card: MoneyChartCard) {
  return {
    totals: { income: formatTHB(card.totals.income), expense: formatTHB(card.totals.expense), net: formatTHB(card.totals.net) },
    months: card.months.map(month => ({ month: month.label, income: formatTHB(month.income), expense: formatTHB(month.expense), net: formatTHB(month.net), ...(month.partial ? { in_progress: true } : {}) })),
  };
}

// Characters models use to draw bars: blocks, shades and squares.
const BAR_CHARS = /[▀-▟■-▣▪▫◻-◾⬛⬜]{2,}/;
const MONEY_TABLE_HEAD = /รายรับ|รายจ่าย|รายได้|กำไร|คงเหลือ|เงินเข้า|เงินออก|income|expense|revenue|profit/i;
/**
 * The answer's text, without character-drawn charts, and without a Markdown table of money figures when a money
 * card already shows them. Other tables (a list of jobs, clients) stay.
 */
export function cleanAnswerText(text: string, cards: { kind: string }[]): string {
  const hasMoneyCard = cards.some(card => card.kind === 'money_chart' || card.kind === 'summary');
  const lines = text.split('\n');
  const out: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (BAR_CHARS.test(line)) continue;
    if (hasMoneyCard && /^\s*\|/.test(line)) {
      let end = index;
      while (end + 1 < lines.length && /^\s*\|/.test(lines[end + 1])) end++;
      if (MONEY_TABLE_HEAD.test(line)) { index = end; continue; }
    }
    out.push(line);
  }
  // A fenced block left empty by the removal, and runs of blank lines.
  return out.join('\n').replace(/```[a-z]*\n\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
