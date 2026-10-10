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

// `dueDate` is the legacy alias for `payDate`. Workflow dates are useful only as a last-resort
// schedule for an outstanding balance; they are never evidence that cash was actually received.
const dueFallbackDate = (job: Job) => job.payDate || job.dueDate || job.postDate || job.startDate || null;
const settledReceiptDate = (job: Job) => job.pending <= 0 ? (job.payDate || job.dueDate || null) : null;

export interface ReceivedPart {
  amount: number;
  date: string | null;
  isDeposit: boolean;
}

// payDate on a single-payment job is the due date of the remaining balance, so a deposit dated
// by it would land in a future month. When the deposit date was recorded, the deposit counts on
// that date and only the remainder (if since paid) falls back to payDate.
export const splitReceivedByDate = (
  received: number,
  depositAmount: number | undefined,
  depositDate: string | null | undefined,
  fallback: string | null,
): ReceivedPart[] => {
  if (!(received > 0)) return [];
  const deposit = depositDate ? Math.min(Math.max(0, depositAmount ?? received), received) : 0;
  if (deposit <= 0) return [{ amount: received, date: fallback, isDeposit: false }];
  const remainder = received - deposit;
  const parts: ReceivedPart[] = [{ amount: deposit, date: depositDate ?? null, isDeposit: true }];
  if (remainder > 0) parts.push({ amount: remainder, date: fallback, isDeposit: false });
  return parts;
};

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
        // A paid flag without paidAt does not establish the receipt date. Keeping this null makes
        // every monthly/calendar/tax consumer omit the row instead of inventing a cash event.
        date: row.paidAt || null,
        kind: 'installment' as const,
      }));
  }
  return splitReceivedByDate(job.received, job.depositAmount, job.depositDate, settledReceiptDate(job)).map((part) => ({
    id: `${job.id}-${part.isDeposit ? 'deposit' : 'received'}`,
    jobId: job.id,
    jobName: job.name,
    client: job.client || '',
    label: part.isDeposit ? 'รับมัดจำ' : 'รับเงิน',
    amount: part.amount,
    date: part.date,
    kind: 'single' as const,
  }));
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
        date: row.dueDate || dueFallbackDate(job),
        dueDate: row.dueDate || dueFallbackDate(job),
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
    date: dueFallbackDate(job),
    dueDate: dueFallbackDate(job),
    kind: 'single',
  }] : [];
};

/** Outstanding money is financial state, so it must not depend on a workflow/status label. */
export const getOutstandingAmount = (job: Job): number =>
  getJobPendingEntries(job).reduce((sum, entry) => sum + entry.amount, 0);

export const getMonthKeyFromDate = (date: string | null | undefined): string => date ? date.slice(0, 7) : '';

export const getReceivedForMonth = (job: Job, monthKey: string): number =>
  getJobPaymentEntries(job).filter((entry) => getMonthKeyFromDate(entry.date) === monthKey).reduce((sum, entry) => sum + entry.amount, 0);

export const getPendingForMonth = (job: Job, monthKey: string): number =>
  getJobPendingEntries(job).filter((entry) => getMonthKeyFromDate(entry.dueDate) === monthKey).reduce((sum, entry) => sum + entry.amount, 0);
