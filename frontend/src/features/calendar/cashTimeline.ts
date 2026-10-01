import type { Job } from '../../../../shared/types';
import { getJobPaymentEntries } from '../../../../shared/installmentPayments';

// Cash timeline: when money from jobs is expected to arrive, month by month. Built on the same
// payment entries as the dashboard (installments split per row, deposits split from the
// remainder, amounts net of WHT), so a baht is never counted twice: received money appears once
// on the date it arrived, outstanding money once on its expected date.

export type TimelineStatus = 'received' | 'overdue' | 'dueSoon' | 'expected';

export interface TimelineItem {
  id: string;
  jobId: string;
  jobName: string;
  client: string;
  /** Installment label ("งวดที่ 2"), deposit, or empty for a whole-job payment. */
  part: string;
  amount: number;
  /** YYYY-MM-DD: expected date for outstanding money, arrival date for received money. */
  date: string;
  status: TimelineStatus;
  /** Days from today to `date` (negative = past). */
  days: number;
  creditTerm: number;
  /** Outstanding money due before the current month, shown in the current month. */
  carriedOver: boolean;
}

export interface TimelineMonth {
  monthKey: string;
  items: TimelineItem[];
  received: number;
  expected: number;
  /** received + expected: all job money landing in this month. */
  total: number;
}

export interface CashTimeline {
  months: TimelineMonth[];
  /** Outstanding money with no expected date yet (e.g. work not scheduled for delivery). */
  undated: { count: number; amount: number };
}

const DUE_SOON_DAYS = 7; // same window as the calendar's "ใกล้ครบกำหนด"

const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const isDateKey = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

export const shiftMonthKey = (monthKey: string, delta: number) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Outstanding entries with an honest expected date. Unlike the shared pending entries, this
// never falls back to a job's start date: in-progress work without a delivery date has no
// expected payment date yet.
function outstandingEntries(job: Job): { id: string; part: string; amount: number; date: string | null }[] {
  const jobDate = job.isPosted === false && !job.postDate ? null : (job.payDate || job.postDate || null);
  if (job.installments?.length) {
    return job.installments
      .filter(row => row.status !== 'paid' && row.amount > 0)
      .map(row => ({ id: row.id, part: row.label, amount: row.amount, date: row.dueDate || jobDate }));
  }
  return job.pending > 0 ? [{ id: `${job.id}-pending`, part: '', amount: job.pending, date: jobDate }] : [];
}

export function buildCashTimeline(jobs: Job[], opts: { todayKey: string; fromMonth: string; months: number }): CashTimeline {
  const { todayKey, fromMonth, months } = opts;
  const currentMonth = todayKey.slice(0, 7);
  const today = dayNumber(todayKey);
  const monthKeys = Array.from({ length: months }, (_, i) => shiftMonthKey(fromMonth, i));
  const buckets = new Map(monthKeys.map(key => [key, [] as TimelineItem[]]));
  const undated = { count: 0, amount: 0 };

  for (const job of jobs) {
    const base = { jobId: job.id, jobName: job.name, client: job.client || '', creditTerm: job.creditTerm || 0 };

    for (const entry of outstandingEntries(job)) {
      if (!isDateKey(entry.date)) { undated.count += 1; undated.amount += entry.amount; continue; }
      const date = entry.date.slice(0, 10);
      const days = dayNumber(date) - today;
      const carriedOver = date.slice(0, 7) < currentMonth;
      const bucket = buckets.get(carriedOver ? currentMonth : date.slice(0, 7));
      if (!bucket) continue;
      bucket.push({
        ...base, id: entry.id, part: entry.part, amount: entry.amount, date, days, carriedOver,
        status: days < 0 ? 'overdue' : days <= DUE_SOON_DAYS ? 'dueSoon' : 'expected',
      });
    }

    for (const entry of getJobPaymentEntries(job)) {
      if (!isDateKey(entry.date)) continue;
      const date = entry.date.slice(0, 10);
      const bucket = buckets.get(date.slice(0, 7));
      if (!bucket) continue;
      bucket.push({
        ...base, id: `${entry.id}-received`, part: entry.kind === 'installment' ? entry.label : entry.label === 'รับมัดจำ' ? 'มัดจำ' : '',
        amount: entry.amount, date, days: dayNumber(date) - today, carriedOver: false, status: 'received',
      });
    }
  }

  const order: Record<TimelineStatus, number> = { overdue: 0, dueSoon: 1, expected: 2, received: 3 };
  return {
    undated,
    months: monthKeys.map(monthKey => {
      const items = buckets.get(monthKey)!.sort((a, b) =>
        order[a.status] - order[b.status] || a.date.localeCompare(b.date) || a.jobName.localeCompare(b.jobName, 'th'));
      const received = items.filter(i => i.status === 'received').reduce((sum, i) => sum + i.amount, 0);
      const expected = items.filter(i => i.status !== 'received').reduce((sum, i) => sum + i.amount, 0);
      return { monthKey, items, received, expected, total: received + expected };
    }),
  };
}
