import type { Job } from '../../../../shared/types';
import type { VaultFile } from '../../../../shared/vault';
import { jobNetReceivable, jobWhtAmount } from '../../../../shared/wht';
import { nowInBangkok } from '../../../../shared/monthlySummary';

// Where a job stands on its 50 ทวิ (withholding tax certificate).
//  none     – no withholding tax on this job
//  notYet   – tax will be withheld, but no money has been received yet
//  waiting  – money received, certificate not attached yet
//  have     – at least one certificate file attached
export type Wht50Status = 'none' | 'notYet' | 'waiting' | 'have';
export type Wht50TaxYear = number | 'unknown';

const actualDateKey = (value: string | null | undefined): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || '')) return null;
  const key = value!.slice(0, 10);
  const milliseconds = Date.parse(`${key}T00:00:00Z`);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().slice(0, 10) === key ? key : null;
};

// `pending` is the source of truth for ordinary paid jobs. A 100%-withheld job has a net
// receivable of zero from the start, though, so it also needs the explicit payment event flag;
// otherwise its future due date would be mistaken for money having arrived.
const paymentHasSettled = (job: Job): boolean =>
  job.pending <= 0 && (jobNetReceivable(job) > 0 || job.paymentStatus === 'paid');

export function wht50Files(job: Pick<Job, 'id'>, files: VaultFile[]): VaultFile[] {
  return files.filter(file => file.kind === 'wht50' && file.jobId === job.id);
}

/** A certificate becomes follow-up work once withholding exists and the net payment has started or settled. */
export function isWht50Trackable(job: Job): boolean {
  return jobWhtAmount(job) > 0 && ((job.received || 0) > 0 || paymentHasSettled(job));
}

/** Slips / receipts kept with an expense. */
export function expenseFiles(expense: { id: string }, files: VaultFile[]): VaultFile[] {
  return files.filter(file => file.kind === 'expense' && file.jobId === expense.id);
}

export function wht50StatusOf(job: Job, files: VaultFile[]): Wht50Status {
  if (jobWhtAmount(job) <= 0) return 'none';
  if (wht50Files(job, files).length > 0) return 'have';
  return isWht50Trackable(job) ? 'waiting' : 'notYet';
}

/**
 * The latest date on which money was actually recorded as received for this job.
 * A partial job's payDate may still be the future due date, so prefer depositDate;
 * installment jobs only use paidAt values. We deliberately never fall back to
 * post/start/quote dates when calculating how long a certificate has been waiting.
 */
export function receivedPaymentDateOf(job: Job): string | null {
  const fullyPaid = paymentHasSettled(job);
  if (!(job.received > 0) && !fullyPaid) return null;

  if (job.installments?.length) {
    const paidDates = job.installments
      .filter(row => row.status === 'paid' && row.amount > 0)
      .map(row => actualDateKey(row.paidAt))
      .filter((date): date is string => date !== null)
      .sort();
    if (paidDates.length) return paidDates[paidDates.length - 1];
    return fullyPaid ? actualDateKey(job.payDate) : null;
  }

  const dates: string[] = [];
  const depositDate = actualDateKey(job.depositDate);
  const paidDate = fullyPaid ? actualDateKey(job.payDate) : null;
  if (depositDate) dates.push(depositDate);
  if (paidDate) dates.push(paidDate);
  dates.sort();
  return dates[dates.length - 1] || null;
}

/** Whole calendar days since the actual received-payment date, in Bangkok time. */
export function wht50WaitingDays(job: Job, todayKey?: string): number | null {
  const receivedDate = receivedPaymentDateOf(job);
  if (!receivedDate) return null;
  const bkk = nowInBangkok();
  const today = todayKey || `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
  const fromMs = Date.parse(`${receivedDate}T00:00:00Z`);
  const todayMs = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(todayMs)) return null;
  return Math.max(0, Math.floor((todayMs - fromMs) / 86_400_000));
}

/** Christian year the money actually arrived in (latest payment), for grouping by tax year. */
export function paidYearOf(job: Job): number | null {
  const date = receivedPaymentDateOf(job) || '';
  const year = Number(String(date).slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : null;
}
