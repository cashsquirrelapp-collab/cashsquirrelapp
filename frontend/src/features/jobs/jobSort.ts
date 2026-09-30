import type { Job } from '../../../../shared/types';

export type JobSort = 'recent' | 'oldest' | 'amountDesc' | 'amountAsc';
export type JobTab = 'all' | 'working' | 'waiting_payment' | 'closed';

/** Month filter: everything, one calendar month (YYYY-MM), or an inclusive date range. */
export type JobPeriod =
  | { kind: 'all' }
  | { kind: 'month'; month: string }
  | { kind: 'range'; from: string; to: string };

// The date a row is ordered and month-filtered by. Jobs have no created-at field, so a job's own
// date is its delivery/service date, else its start date. Awaiting-payment rows use when the money
// is due (urgency), closed rows when it arrived.
export const jobSortDate = (job: Job, tab: JobTab): string =>
  tab === 'waiting_payment' ? job.payDate || job.postDate || ''
    : tab === 'closed' ? job.payDate || job.postDate || job.startDate || ''
    : job.postDate || job.startDate || '';

/** Local YYYY-MM of a date (current month by default). */
export const monthKeyOf = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** Whether a job falls in the chosen period. Undated jobs only show under "เดือนทั้งหมด". */
export function matchesPeriod(job: Job, period: JobPeriod, tab: JobTab): boolean {
  if (period.kind === 'all') return true;
  const date = jobSortDate(job, tab);
  if (!date) return false;
  if (period.kind === 'month') return date.slice(0, 7) === period.month;
  return (!period.from || date >= period.from) && (!period.to || date <= period.to);
}

/**
 * Months offered in the month filter, newest first: the months that actually have jobs, minus
 * the current month (which the menu always lists separately as "เดือนนี้").
 */
export function periodMonths(jobs: Job[], tab: JobTab, currentMonth = monthKeyOf()): string[] {
  const months = new Set<string>();
  for (const job of jobs) {
    const date = jobSortDate(job, tab);
    if (/^\d{4}-\d{2}/.test(date)) months.add(date.slice(0, 7));
  }
  months.delete(currentMonth);
  return [...months].sort().reverse();
}

// Dates are stored as YYYY-MM-DD, so plain string comparison is chronological. Ties keep list
// order, which puts the most recently added job first (new jobs are prepended).
export function sortJobs(jobs: Job[], sortBy: JobSort, tab: JobTab): Job[] {
  type Row = { job: Job; index: number; date: string };
  const rows: Row[] = jobs.map((job, index) => ({ job, index, date: jobSortDate(job, tab) }));
  const byDate = (newestFirst: boolean) => (a: Row, b: Row) => {
    if (!a.date !== !b.date) return a.date ? -1 : 1;
    if (a.date !== b.date) return (a.date < b.date ? -1 : 1) * (newestFirst ? -1 : 1);
    return a.index - b.index;
  };
  const compare =
    sortBy === 'amountDesc' ? (a: Row, b: Row) => (b.job.value || 0) - (a.job.value || 0) || a.index - b.index
    : sortBy === 'amountAsc' ? (a: Row, b: Row) => (a.job.value || 0) - (b.job.value || 0) || a.index - b.index
    // Awaiting payment: "ล่าสุด" means most urgent -- overdue, then due today, then soonest.
    : tab === 'waiting_payment' ? byDate(sortBy === 'oldest')
    : byDate(sortBy === 'recent');
  return rows.sort(compare).map(row => row.job);
}
