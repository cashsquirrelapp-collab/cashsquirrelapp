import type { Job } from './types';

export interface JobPaymentEntry {
  id: string;
  jobId: string;
  jobName: string;
  client: string;
  label: string;
  amount: number;
  date: string | null;
  kind: 'installment' | 'single';
}

export interface JobPendingEntry extends JobPaymentEntry {
  dueDate: string | null;
}

const fallbackDate = (job: Job) => job.payDate || job.postDate || job.startDate || null;

export const getJobPaymentEntries = (job: Job): JobPaymentEntry[] => {
  if (job.installments?.length) {
    return job.installments
      .filter((row) => row.status === 'paid' && row.amount > 0)
      .map((row) => ({
        id: row.id,
        jobId: job.id,
        jobName: job.name,
        client: job.client || '',
        label: row.label,
        amount: row.amount,
        date: row.paidAt || fallbackDate(job),
        kind: 'installment' as const,
      }));
  }
  return job.received > 0 ? [{
    id: `${job.id}-received`,
    jobId: job.id,
    jobName: job.name,
    client: job.client || '',
    label: 'รับเงิน',
    amount: job.received,
    date: fallbackDate(job),
    kind: 'single',
  }] : [];
};

export const getJobPendingEntries = (job: Job): JobPendingEntry[] => {
  if (job.installments?.length) {
    return job.installments
      .filter((row) => row.status !== 'paid' && row.amount > 0)
      .map((row) => ({
        id: row.id,
        jobId: job.id,
        jobName: job.name,
        client: job.client || '',
        label: row.label,
        amount: row.amount,
        date: row.dueDate || fallbackDate(job),
        dueDate: row.dueDate || fallbackDate(job),
        kind: 'installment' as const,
      }));
  }
  return job.pending > 0 ? [{
    id: `${job.id}-pending`,
    jobId: job.id,
    jobName: job.name,
    client: job.client || '',
    label: 'ยอดค้างชำระ',
    amount: job.pending,
    date: fallbackDate(job),
    dueDate: fallbackDate(job),
    kind: 'single',
  }] : [];
};

export const getMonthKeyFromDate = (date: string | null | undefined): string => date ? date.slice(0, 7) : '';

export const getReceivedForMonth = (job: Job, monthKey: string): number =>
  getJobPaymentEntries(job).filter((entry) => getMonthKeyFromDate(entry.date) === monthKey).reduce((sum, entry) => sum + entry.amount, 0);

export const getPendingForMonth = (job: Job, monthKey: string): number =>
  getJobPendingEntries(job).filter((entry) => getMonthKeyFromDate(entry.dueDate) === monthKey).reduce((sum, entry) => sum + entry.amount, 0);
