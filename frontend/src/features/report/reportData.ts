import type { Job } from '../../../../shared/types';
import { getJobPaymentEntries, getJobPendingEntries } from '../../../../shared/installmentPayments';

// Everything the รายงาน page shows, computed from jobs only. Income means money actually received
// (payment entries), counted in the month it arrived -- the same rule the in-depth analysis used.

export type ReportPeriod = '3' | '6' | '12' | 'all';

export interface Bucket {
  key: string;
  received: number;
  count: number;
}

export interface MonthRow {
  monthKey: string;
  received: number;
  /** Jobs that received at least one payment that month. */
  paidJobs: number;
}

export interface Report {
  totalReceived: number;
  jobCount: number;
  clientCount: number;
  avgPerJob: number;
  avgPerClient: number;
  byClient: Bucket[];
  byType: Bucket[];
  months: MonthRow[];
  /** Share of income from the top client, 0-1 (0 when nothing was received). */
  concentration: number;
  /** null for "ทั้งหมด" -- there is no earlier period to call a client "new" against. */
  retention: { newClients: number; newRevenue: number; repeatClients: number; repeatRevenue: number } | null;
  unnamedClientJobs: number;
}

export const UNNAMED_CLIENT = 'ไม่ระบุลูกค้า';
export const UNTYPED = 'ยังไม่ระบุ';
export const clientKey = (job: Job) => (job.client || '').trim() || UNNAMED_CLIENT;
export const typeKey = (job: Job) => (job.type || '').trim() || UNTYPED;

const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const toDate = (key: string) => new Date(`${key}T00:00:00`);

/** Start of the period (inclusive), or null for all time. "3 เดือน" = this month and the two before. */
export function periodStart(period: ReportPeriod, now = new Date()): string | null {
  if (period === 'all') return null;
  const d = new Date(now.getFullYear(), now.getMonth() - (Number(period) - 1), 1);
  return `${monthKeyOf(d)}-01`;
}

export function buildReport(jobs: Job[], period: ReportPeriod, now = new Date()): Report {
  const start = periodStart(period, now);
  const inPeriod = (date: string | null | undefined) => Boolean(date) && (!start || (date as string) >= start);
  const receivedIn = (job: Job) => getJobPaymentEntries(job).filter(e => inPeriod(e.date)).reduce((s, e) => s + e.amount, 0);

  // A job belongs to the period when anything about it happened then: delivered, paid or due.
  const periodJobs = jobs.filter(job => {
    const dates = [job.postDate || job.payDate, ...getJobPaymentEntries(job).map(e => e.date), ...getJobPendingEntries(job).map(e => e.dueDate)]
      .filter(Boolean) as string[];
    return !start || dates.some(d => d >= start);
  });

  const group = (keyFn: (job: Job) => string) => {
    const map = new Map<string, Bucket>();
    for (const job of periodJobs) {
      const key = keyFn(job);
      const b = map.get(key) || { key, received: 0, count: 0 };
      b.received += receivedIn(job);
      b.count += 1;
      map.set(key, b);
    }
    return [...map.values()].sort((a, b) => b.received - a.received || b.count - a.count || a.key.localeCompare(b.key, 'th'));
  };
  const byClient = group(clientKey);
  const byType = group(typeKey);
  const totalReceived = byClient.reduce((s, b) => s + b.received, 0);

  // Months: every month of a fixed period (gaps show as ฿0); for all time, first to last payment.
  const monthMap = new Map<string, MonthRow>();
  for (const job of periodJobs) {
    const paidMonths = new Set<string>();
    for (const e of getJobPaymentEntries(job)) {
      if (!inPeriod(e.date)) continue;
      const key = (e.date as string).slice(0, 7);
      const row = monthMap.get(key) || { monthKey: key, received: 0, paidJobs: 0 };
      row.received += e.amount;
      if (!paidMonths.has(key)) { row.paidJobs += 1; paidMonths.add(key); }
      monthMap.set(key, row);
    }
  }
  const keys = [...monthMap.keys()].sort();
  const first = start ? start.slice(0, 7) : keys[0];
  const last = start ? monthKeyOf(now) : keys[keys.length - 1];
  const months: MonthRow[] = [];
  if (first && last) {
    for (let d = toDate(`${first}-01`); monthKeyOf(d) <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const key = monthKeyOf(d);
      months.push(monthMap.get(key) || { monthKey: key, received: 0, paidJobs: 0 });
    }
  }

  let retention: Report['retention'] = null;
  if (start) {
    const firstSeen = new Map<string, string>();
    for (const job of jobs) {
      const date = job.postDate || job.payDate;
      if (!date) continue;
      const key = clientKey(job);
      if (!firstSeen.has(key) || date < (firstSeen.get(key) as string)) firstSeen.set(key, date);
    }
    const counted = new Set<string>();
    retention = { newClients: 0, newRevenue: 0, repeatClients: 0, repeatRevenue: 0 };
    for (const job of periodJobs) {
      const key = clientKey(job);
      const seen = firstSeen.get(key);
      const isNew = !seen || seen >= start;
      if (isNew) retention.newRevenue += receivedIn(job); else retention.repeatRevenue += receivedIn(job);
      if (!counted.has(key)) {
        counted.add(key);
        if (isNew) retention.newClients += 1; else retention.repeatClients += 1;
      }
    }
  }

  const topNamed = byClient.find(b => b.key !== UNNAMED_CLIENT);
  return {
    totalReceived,
    jobCount: periodJobs.length,
    clientCount: byClient.length,
    avgPerJob: periodJobs.length ? totalReceived / periodJobs.length : 0,
    avgPerClient: byClient.length ? totalReceived / byClient.length : 0,
    byClient,
    byType,
    months,
    concentration: topNamed && totalReceived > 0 ? topNamed.received / totalReceived : 0,
    retention,
    unnamedClientJobs: periodJobs.filter(job => !(job.client || '').trim()).length,
  };
}

/** Jobs behind one client or job-type bucket for the selected period. */
export function jobsInBucket(jobs: Job[], period: ReportPeriod, dimension: 'client' | 'type', key: string, now = new Date()): Job[] {
  const start = periodStart(period, now);
  const keyFn = dimension === 'client' ? clientKey : typeKey;
  return jobs.filter(job => keyFn(job) === key && (!start || [job.postDate || job.payDate, ...getJobPaymentEntries(job).map(e => e.date), ...getJobPendingEntries(job).map(e => e.dueDate)]
    .some(d => d && d >= start)));
}

// ---- Credit term: when the money still owed is due ----

export type AgingKey = 'overdue' | 'today' | 'within7' | 'within14' | 'within30' | 'later' | 'undated';

export const AGING_LABELS: Record<AgingKey, string> = {
  overdue: 'เกินกำหนด',
  today: 'ครบกำหนดวันนี้',
  within7: 'ภายใน 7 วัน',
  within14: 'ภายใน 14 วัน',
  within30: 'ภายใน 30 วัน',
  later: 'มากกว่า 30 วัน',
  undated: 'ยังไม่ระบุวันรับเงิน',
};

export interface AgingBucket { key: AgingKey; amount: number; count: number }

/**
 * Outstanding money (delivered jobs with something unpaid -- the same set as เงินที่ยังไม่ได้รับ)
 * by due date. Each unpaid installment counts on its own due date. The five main buckets always
 * show; "later" and "undated" only when they hold money, so every baht owed is accounted for.
 */
export function creditAging(jobs: Job[], today: string): { buckets: AgingBucket[]; total: number; count: number } {
  const order: AgingKey[] = ['overdue', 'today', 'within7', 'within14', 'within30', 'later', 'undated'];
  const map = new Map<AgingKey, AgingBucket>(order.map(key => [key, { key, amount: 0, count: 0 }]));
  const dayMs = 86_400_000;
  let count = 0;
  for (const job of jobs) {
    if (!(job.pending > 0) || job.isPosted === false) continue;
    count += 1;
    for (const entry of getJobPendingEntries(job)) {
      const due = entry.dueDate || job.payDate || job.postDate || null;
      let key: AgingKey = 'undated';
      if (due) {
        const days = Math.round((toDate(due).getTime() - toDate(today).getTime()) / dayMs);
        key = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'within7' : days <= 14 ? 'within14' : days <= 30 ? 'within30' : 'later';
      }
      const b = map.get(key) as AgingBucket;
      b.amount += entry.amount;
      b.count += 1;
    }
  }
  const buckets = order.map(key => map.get(key) as AgingBucket).filter(b => (b.key !== 'later' && b.key !== 'undated') || b.amount > 0);
  return { buckets, total: buckets.reduce((s, b) => s + b.amount, 0), count };
}
