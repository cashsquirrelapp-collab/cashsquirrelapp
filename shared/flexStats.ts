import { getJobPaymentEntries } from './installmentPayments.js';
import type { Invoice, Job } from './types.js';

// Flex Display and Story Flex (owner's Master Product Backlog, Part 7–8, 2026-10-25): figures to show off, worked out
// only from the account's own saved jobs and documents. Nothing is estimated or filled in: a figure the data cannot
// support is null, and the screen says so instead of showing a number.

const round = (value: number) => Math.round(value * 100) / 100;
/** "2026-10" in Bangkok for a moment. */
export const bangkokMonthKey = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
export const shiftMonthKey = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + delta, 1));
  return at.toISOString().slice(0, 7);
};

export interface MonthAmount { month: string; amount: number }
/** Money recorded as received in each of the last `months` months, oldest first (the overview's "รับเงินจริง"). */
export function receivedByMonth(jobs: Job[], months: number, now = new Date()): MonthAmount[] {
  const last = bangkokMonthKey(now);
  const keys = Array.from({ length: months }, (_, index) => shiftMonthKey(last, index - months + 1));
  const sums = new Map(keys.map(key => [key, 0]));
  for (const entry of jobs.flatMap(getJobPaymentEntries)) {
    const key = entry.date?.slice(0, 7);
    if (key && sums.has(key)) sums.set(key, sums.get(key)! + entry.amount);
  }
  return keys.map(month => ({ month, amount: round(sums.get(month)!) }));
}

export interface Growth {
  month: string;
  amount: number;
  previous: number;
  /** Whole percent against last month; null when last month had nothing to compare with. */
  percent: number | null;
  /** Months in a row (ending this month) that each received more than the one before. */
  streak: number;
  /** This month is the highest of the window (and above zero). */
  best: boolean;
  /** Months in the window that received anything. */
  monthsWithData: number;
  series: MonthAmount[];
}
export function growth(jobs: Job[], now = new Date(), months = 6): Growth {
  const series = receivedByMonth(jobs, months, now);
  const current = series[series.length - 1];
  const previous = series[series.length - 2]?.amount ?? 0;
  let streak = 0;
  for (let index = series.length - 1; index > 0 && series[index].amount > series[index - 1].amount; index--) streak++;
  const top = Math.max(...series.map(row => row.amount));
  return {
    month: current.month, amount: current.amount, previous,
    percent: previous > 0 ? Math.round(((current.amount - previous) / previous) * 100) : null,
    streak, best: current.amount > 0 && current.amount === top && series.filter(row => row.amount === top).length === 1,
    monthsWithData: series.filter(row => row.amount > 0).length, series,
  };
}

/** The date a job was paid in full: its last payment. Undefined while money is still owed. */
function paidOffOn(job: Job): string | undefined {
  if (!(job.received > 0) || job.pending > 0) return undefined;
  const dates = getJobPaymentEntries(job).map(entry => entry.date).filter((date): date is string => Boolean(date)).sort();
  return dates.at(-1);
}

export interface Wrapped {
  month: string;
  /** Jobs paid in full this month. */
  jobsDone: number;
  /** Different clients that paid this month (names are never shown). */
  clients: number;
  /** Payments recorded this month. */
  payments: number;
  received: number;
  /** Quotations created this month; null when the documents were not loaded on this device. */
  quotations: number | null;
  growthPercent: number | null;
}
export function wrapped(jobs: Job[], invoices: Invoice[] | null, now = new Date()): Wrapped {
  const month = bangkokMonthKey(now);
  const entries = jobs.flatMap(getJobPaymentEntries).filter(entry => entry.date?.startsWith(month));
  const clients = new Set(entries.map(entry => entry.client.trim().toLowerCase()).filter(Boolean));
  return {
    month,
    jobsDone: jobs.filter(job => paidOffOn(job)?.startsWith(month)).length,
    clients: clients.size,
    payments: entries.length,
    received: round(entries.reduce((sum, entry) => sum + entry.amount, 0)),
    quotations: invoices ? invoices.filter(doc => doc.documentType === 'quotation' && doc.createdDate?.startsWith(month)).length : null,
    growthPercent: growth(jobs, now).percent,
  };
}

export type AchievementKind = 'received_10k' | 'received_100k' | 'jobs_10' | 'best_month';
export interface Achievement { kind: AchievementKind; date: string; amount: number | null }
/** Milestones the data shows were reached, with the day each was reached. Never a target not yet met. */
export function achievements(jobs: Job[], now = new Date()): Achievement[] {
  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const entries = jobs.flatMap(getJobPaymentEntries).filter(entry => entry.date && entry.date <= today).sort((a, b) => a.date!.localeCompare(b.date!));
  const found: Achievement[] = [];
  let total = 0;
  for (const [goal, kind] of [[10_000, 'received_10k'], [100_000, 'received_100k']] as const) {
    total = 0;
    for (const entry of entries) {
      total += entry.amount;
      if (total >= goal) { found.push({ kind, date: entry.date!, amount: goal }); break; }
    }
  }
  const done = jobs.map(paidOffOn).filter((date): date is string => Boolean(date) && date! <= today).sort();
  if (done.length >= 10) found.push({ kind: 'jobs_10', date: done[9], amount: null });
  const months = new Map<string, number>();
  for (const entry of entries) months.set(entry.date!.slice(0, 7), (months.get(entry.date!.slice(0, 7)) ?? 0) + entry.amount);
  if (months.size >= 2) {
    const [month, amount] = [...months.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
    found.push({ kind: 'best_month', date: `${month}-01`, amount: round(amount) });
  }
  return found;
}
