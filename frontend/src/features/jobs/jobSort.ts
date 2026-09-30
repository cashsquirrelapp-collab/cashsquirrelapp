import type { Job } from '../../../../shared/types';

export type JobSort = 'recent' | 'oldest' | 'amountDesc' | 'amountAsc';
export type JobTab = 'all' | 'working' | 'waiting_payment' | 'closed';

// The date a row is ordered by. Jobs have no created-at field, so a job's own date is its
// delivery/service date, else its start date. Awaiting-payment rows order by when the money is
// due (urgency), closed rows by when it arrived.
export const jobSortDate = (job: Job, tab: JobTab): string =>
  tab === 'waiting_payment' ? job.payDate || job.postDate || ''
    : tab === 'closed' ? job.payDate || job.postDate || job.startDate || ''
    : job.postDate || job.startDate || '';

/** Whether the current sort shows month section labels (date sorts outside the urgency tab). */
export const groupsByMonth = (sortBy: JobSort, tab: JobTab) =>
  (sortBy === 'recent' || sortBy === 'oldest') && tab !== 'waiting_payment';

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
