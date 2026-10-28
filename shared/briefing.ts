import { findJobsNeedingAttention, todayInBangkok, type JobRow } from './dueJobs.js';
import { getJobPaymentEntries, getJobScheduledPendingEntries } from './installmentPayments.js';
import { fixedExpenseForMonth } from './monthlySummary.js';
import type { Expense, FixedExpenseItem, Invoice, Job } from './types.js';

// Krarok Intelligence Briefing (owner's Master Product Backlog, Part 6, 2026-10-25): the 1–3 things worth doing now,
// worked out from the account's own saved data with rules anyone can check. No AI picks or writes them, and nothing
// here is stored or sent. Money due uses the same rule as the LINE 08:00 reminder (dueJobs.ts), so the briefing, the
// overview and LINE never disagree. A forecast is always marked as one and is never shown as money that exists.

export type BriefingKind = 'overdue' | 'due_today' | 'due_soon' | 'cash_short' | 'cash_watch' | 'quote_waiting';
/** Where the button goes: a page key the app already has (navigation.ts), never a URL from data. */
export type BriefingPage = 'receivables' | 'incomeExpense' | 'quotation' | 'dashboard';
export interface BriefingItem {
  /** Same key on the same day = the same news (used to show it once a day). */
  key: string;
  kind: BriefingKind;
  tone: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  amount: number | null;
  count: number;
  /** Urgency + money + something to do + new today; higher first. */
  score: number;
  action: { label: string; page: BriefingPage };
  forecast?: true;
  /** The figures behind the words, so a screen can say them in its own language. */
  parts: { name?: string; days?: number; cashNow?: number; expected?: number; costs?: number; projected?: number };
}
export interface FinancialRadar {
  /** Money recorded as received this month (the overview's "รับเงินจริง"). */
  receivedThisMonth: number;
  /** Money past its due date, not yet received. */
  overdue: number;
  /** Money due from today to 29 days ahead (a forecast: the client may pay late). */
  expected30: number;
  /** Recurring costs still to come in the same 30 days: this month's not yet recorded, plus next month's if the window reaches it. */
  knownCosts30: number;
  /** Cash recorded in the app now, when the caller knows it. */
  cashNow: number | null;
  /** cashNow + expected30 − knownCosts30; a forecast, null without cashNow. */
  projected30: number | null;
  risk: 'ok' | 'watch' | 'short' | 'unknown';
  forecast: true;
}
export interface BriefingInput {
  jobs: Job[];
  expenses: Expense[];
  invoices?: Invoice[];
  monthlyExpense?: number;
  fixedExpenseItems?: FixedExpenseItem[];
  cashNow?: number | null;
  now?: Date;
  /** key → the Bangkok day it was last shown. */
  seen?: Record<string, string>;
}
export interface Briefing { day: string; items: BriefingItem[]; radar: FinancialRadar }

const MAX_ITEMS = 3;
const QUOTE_WAIT_DAYS = 7;
const round = (value: number) => Math.round(value * 100) / 100;
const baht = (value: number) => `${value < 0 ? '−' : ''}฿${Math.abs(round(value)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const dayMs = 86_400_000;
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
/** 0–20: more money, more weight, without one large job drowning everything else. */
const impact = (amount: number) => Math.min(20, Math.round(Math.log10(Math.max(1, amount)) * 4));

/** Recurring costs for a month not covered by a dated expense of the same name (the overview's own rule). */
function fixedLeft(input: BriefingInput, month: string): { amount: number; items: number } {
  const names = input.expenses.filter(expense => expense.date?.startsWith(month)).map(expense => expense.name);
  const amount = fixedExpenseForMonth(input.monthlyExpense, input.fixedExpenseItems, names);
  const logged = new Set(names.map(name => (name || '').trim().toLowerCase()).filter(Boolean));
  const items = input.fixedExpenseItems?.length ? input.fixedExpenseItems.filter(item => !logged.has(item.name.trim().toLowerCase()) && item.amount > 0).length : amount > 0 ? 1 : 0;
  return { amount: round(amount), items };
}

export function financialRadar(input: BriefingInput): FinancialRadar {
  const today = todayInBangkok(input.now);
  const month = today.slice(0, 7);
  const end = addDays(today, 29);
  const receivedThisMonth = round(input.jobs.flatMap(getJobPaymentEntries).reduce((sum, entry) => (entry.date?.startsWith(month) ? sum + entry.amount : sum), 0));
  const pending = input.jobs.flatMap(getJobScheduledPendingEntries);
  const overdue = round(pending.reduce((sum, entry) => (entry.dueDate && entry.dueDate < today ? sum + entry.amount : sum), 0));
  const expected30 = round(pending.reduce((sum, entry) => (entry.dueDate && entry.dueDate >= today && entry.dueDate <= end ? sum + entry.amount : sum), 0));
  const nextMonth = end.slice(0, 7) !== month ? end.slice(0, 7) : null;
  const knownCosts30 = round(fixedLeft(input, month).amount + (nextMonth ? fixedLeft(input, nextMonth).amount : 0));
  const cashNow = typeof input.cashNow === 'number' && Number.isFinite(input.cashNow) ? round(input.cashNow) : null;
  const projected30 = cashNow === null ? null : round(cashNow + expected30 - knownCosts30);
  const risk = cashNow === null ? 'unknown' : projected30! < 0 ? 'short' : cashNow < knownCosts30 ? 'watch' : 'ok';
  return { receivedThisMonth, overdue, expected30, knownCosts30, cashNow, projected30, risk, forecast: true };
}

/** The briefing for now: at most three items, the most important first. */
export function buildBriefing(input: BriefingInput): Briefing {
  const day = todayInBangkok(input.now);
  const radar = financialRadar(input);
  const items: BriefingItem[] = [];
  const add = (item: Omit<BriefingItem, 'score'>, urgency: number) => {
    const seenToday = input.seen?.[item.key] === day;
    items.push({ ...item, score: urgency + impact(item.amount ?? 0) + 10 + (seenToday ? -60 : 0) });
  };

  // ---- money due: the LINE 08:00 rule ----
  const due = findJobsNeedingAttention(input.jobs as unknown as JobRow[], input.now);
  const groups = [
    { kind: 'overdue' as const, rows: due.filter(job => job.diffDays < 0) },
    { kind: 'due_today' as const, rows: due.filter(job => job.diffDays === 0) },
    { kind: 'due_soon' as const, rows: due.filter(job => job.diffDays > 0) },
  ];
  for (const group of groups) {
    if (!group.rows.length) continue;
    const total = round(group.rows.reduce((sum, job) => sum + (job.pending || 0), 0));
    const first = [...group.rows].sort((a, b) => a.diffDays - b.diffDays || b.pending - a.pending)[0];
    const n = group.rows.length;
    const oldest = Math.max(...group.rows.map(job => -job.diffDays));
    if (group.kind === 'overdue') {
      add({ key: `overdue:${n}:${total}`, kind: 'overdue', tone: 'critical', title: `เลยกำหนดรับเงิน ${n} รายการ`,
        detail: `รวม ${baht(total)} · นานสุด ${oldest} วัน (${first.name})`, amount: total, count: n, parts: { name: first.name, days: oldest },
        action: { label: 'ดูรายการรอรับเงิน', page: 'receivables' } }, 100 + Math.min(30, oldest));
    } else if (group.kind === 'due_today') {
      add({ key: `due_today:${n}:${total}`, kind: 'due_today', tone: 'warning', title: `ครบกำหนดรับเงินวันนี้ ${n} รายการ`,
        detail: `รวม ${baht(total)} (${first.name})`, amount: total, count: n, parts: { name: first.name }, action: { label: 'ดูรายการรอรับเงิน', page: 'receivables' } }, 90);
    } else {
      add({ key: `due_soon:${n}:${total}`, kind: 'due_soon', tone: 'info', title: `ใกล้ครบกำหนดรับเงิน ${n} รายการ`,
        detail: `ภายใน 2 วัน · รวม ${baht(total)}`, amount: total, count: n, parts: {}, action: { label: 'ดูรายการรอรับเงิน', page: 'receivables' } }, 60);
    }
  }

  // ---- cash in the next 30 days (a forecast) ----
  if (radar.risk === 'short' || radar.risk === 'watch') {
    const short = radar.risk === 'short';
    add({ key: `cash:${radar.risk}:${radar.projected30}`, kind: short ? 'cash_short' : 'cash_watch', tone: short ? 'critical' : 'warning',
      title: short ? 'เงินอาจไม่พอใน 30 วันข้างหน้า' : 'รายจ่ายประจำ 30 วันข้างหน้าต้องใช้เงินที่รอรับ',
      detail: `คาดการณ์: เงินในแอป ${baht(radar.cashNow!)} + รอรับ ${baht(radar.expected30)} − รายจ่ายประจำ ${baht(radar.knownCosts30)} = ${baht(radar.projected30!)}`,
      amount: Math.abs(radar.projected30!), count: 1, action: { label: 'ดูภาพรวม', page: 'dashboard' }, forecast: true,
      parts: { cashNow: radar.cashNow!, expected: radar.expected30, costs: radar.knownCosts30, projected: radar.projected30! } }, short ? 95 : 70);
  }

  // No "recurring costs not recorded yet" item (owner, 2026-10-28: "รายจ่ายคือถ้ากูกรอกไปคือกูบันทึกแล้ว"): the fixed
  // monthly costs from Settings already count in the month's expenses and profit (fixedExpenseForMonth, the same rule as
  // the overview and the รายจ่าย page), so asking to record them again was wrong. They stay in the 30-day cash forecast.

  // ---- quotations waiting for the client ----
  const followed = new Set((input.invoices ?? []).map(doc => doc.linkedFromId).filter(Boolean));
  const waiting = (input.invoices ?? []).filter(doc => doc.documentType === 'quotation' && !doc.responseDate && !followed.has(doc.id)
    && /^\d{4}-\d{2}-\d{2}$/.test(doc.createdDate) && daysBetween(doc.createdDate, day) >= QUOTE_WAIT_DAYS && daysBetween(doc.createdDate, day) <= 90);
  if (waiting.length) {
    const oldest = Math.max(...waiting.map(doc => daysBetween(doc.createdDate, day)));
    add({ key: `quote:${waiting.length}:${oldest}`, kind: 'quote_waiting', tone: 'info', title: `ใบเสนอราคารอลูกค้าตอบ ${waiting.length} ฉบับ`,
      detail: `ฉบับที่รอนานสุด ${oldest} วัน`, amount: null, count: waiting.length, parts: { days: oldest }, action: { label: 'เปิดใบเสนอราคา', page: 'quotation' } }, 35);
  }

  items.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return { day, items: items.slice(0, MAX_ITEMS), radar };
}

/** The keys to remember as shown today (the caller keeps them per account on this device). */
export function markSeen(seen: Record<string, string> | undefined, briefing: Briefing): Record<string, string> {
  const next: Record<string, string> = {};
  // Only today's keys are kept, so the store never grows.
  for (const [key, day] of Object.entries(seen ?? {})) if (day === briefing.day) next[key] = day;
  for (const item of briefing.items) next[item.key] = briefing.day;
  return next;
}
