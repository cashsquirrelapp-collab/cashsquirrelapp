import { deliveredNotInvoiced, financialRadar } from '../../../shared/briefing.js';
import { currentCash } from '../../../shared/cashBalance.js';
import { todayInBangkok } from '../../../shared/dueJobs.js';
import { ownMonthlyExpense } from '../../../shared/monthlySummary.js';
import type { Expense, FixedExpenseItem, Invoice, Job } from '../../../shared/types.js';

// เลขา thinks ahead in the 08:00 message (owner, 2026-11-02: "เลขาคิดล่วงหน้า ... ส่งงานไป 3 วันแล้วยังไม่ออกใบแจ้งหนี้
// ออกเลยไหม ... เดือนหน้าเงินอาจไม่พอ"). Plain rules on the saved data (shared/briefing.ts, the same as the app's
// "สรุปวันนี้"), no model. Each thing is told at most once a week, so a morning message never repeats yesterday's news
// and LINE's message allowance is not spent on it.

export const INSIGHT_REPEAT_DAYS = 7;
const KEEP_DAYS = 21;
const dayMs = 86_400_000;
const BILLING_TYPES = new Set(['invoice', 'receipt', 'taxInvoice', 'receiptTaxInvoice']);
const baht = (value: number) => `${value < 0 ? '−' : ''}฿${Math.abs(Math.round(value * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const daysSince = (day: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / dayMs);

export interface MorningInsight { kind: 'not_invoiced' | 'cash_short'; title: string; lines: string[]; link: { path: string; label: string } }
export interface MorningInsights { items: MorningInsight[]; /** key → today, for the things told now (merge into the account's record). */ told: Record<string, string> }

export interface InsightInput {
  jobs: Job[]; expenses?: Expense[]; invoices?: Invoice[];
  settings?: { monthlyExpense?: number; fixedExpenseItems?: FixedExpenseItem[]; cashOpening?: { amount: number } } | null;
  /** key → the Bangkok day it was last told. */
  told?: Record<string, string> | null;
  now?: Date;
}

export function morningInsights(input: InsightInput): MorningInsights {
  const today = todayInBangkok(input.now);
  const told = input.told && typeof input.told === 'object' ? input.told : {};
  const fresh = (key: string) => { const day = told[key]; return !(typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && daysSince(day, today) < INSIGHT_REPEAT_DAYS); };
  const items: MorningInsight[] = [];
  const now: Record<string, string> = {};

  // Delivered, owed, and no bill for the client yet: only for an account that issues its bills in the app.
  if ((input.invoices ?? []).some(doc => BILLING_TYPES.has(doc.documentType))) {
    const jobs = deliveredNotInvoiced(input.jobs, input.invoices, today).filter(job => fresh(`bill:${job.id}`));
    if (jobs.length) {
      items.push({ kind: 'not_invoiced', title: `ส่งงานแล้วยังไม่ออกใบแจ้งหนี้ ${jobs.length} งาน`,
        lines: jobs.slice(0, 3).map(job => `${job.name}${job.client ? ` · ${job.client}` : ''} · ${baht(job.pending)} · ส่งงานมา ${job.days} วัน`)
          .concat(jobs.length > 3 ? [`และอีก ${jobs.length - 3} งาน`] : []),
        link: { path: '/invoice', label: 'ออกใบแจ้งหนี้' } });
      for (const job of jobs) now[`bill:${job.id}`] = today;
    }
  }

  // Cash for the next 30 days (a forecast): only with the cash the account recorded, the same rule as the overview.
  const settings = input.settings ?? {};
  if (settings.cashOpening && typeof settings.cashOpening.amount === 'number' && fresh('cash_short')) {
    const cashNow = currentCash(settings.cashOpening, input.jobs, input.expenses ?? []).balance;
    const radar = financialRadar({ jobs: input.jobs, expenses: input.expenses ?? [], invoices: input.invoices,
      monthlyExpense: ownMonthlyExpense(settings.monthlyExpense, settings.fixedExpenseItems), fixedExpenseItems: settings.fixedExpenseItems, cashNow, now: input.now });
    if (radar.risk === 'short' && radar.projected30 !== null) {
      items.push({ kind: 'cash_short', title: 'เงินอาจไม่พอใน 30 วันข้างหน้า',
        lines: [`คาดการณ์: เงินในแอป ${baht(radar.cashNow!)} + รอรับ ${baht(radar.expected30)} − รายจ่ายประจำ ${baht(radar.knownCosts30)} = ${baht(radar.projected30)}`,
          'ลองตามเงินที่ค้างอยู่ หรือเลื่อนรายจ่ายที่ยังไม่จำเป็น'],
        link: { path: '/dashboard', label: 'ดูภาพรวม' } });
      now.cash_short = today;
    }
  }
  return { items, told: now };
}

/** The record of what was told, with today's added and anything older than three weeks dropped. */
export function mergeTold(previous: Record<string, string> | null | undefined, told: Record<string, string>, now?: Date): Record<string, string> {
  const today = todayInBangkok(now);
  const kept: Record<string, string> = {};
  for (const [key, day] of Object.entries(previous && typeof previous === 'object' ? previous : {})) {
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && daysSince(day, today) < KEEP_DAYS) kept[key] = day;
  }
  return { ...kept, ...told };
}
