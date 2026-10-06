import type { Job } from '../../../../shared/types';
import type { VaultFile } from '../../../../shared/vault';
import { jobWhtAmount } from '../../../../shared/wht';
import { getJobPaymentEntries } from '../../../../shared/installmentPayments';

// Where a job stands on its 50 ทวิ (withholding tax certificate).
//  none     – no withholding tax on this job
//  notYet   – tax will be withheld, but no money has been received yet
//  waiting  – money received, certificate not attached yet
//  have     – at least one certificate file attached
export type Wht50Status = 'none' | 'notYet' | 'waiting' | 'have';

export function wht50Files(job: Pick<Job, 'id'>, files: VaultFile[]): VaultFile[] {
  return files.filter(file => file.kind === 'wht50' && file.jobId === job.id);
}

export function wht50StatusOf(job: Job, files: VaultFile[]): Wht50Status {
  if (jobWhtAmount(job) <= 0) return 'none';
  if (wht50Files(job, files).length > 0) return 'have';
  return (job.received || 0) > 0 ? 'waiting' : 'notYet';
}

/** Christian year the money arrived in (latest payment), for grouping by tax year. */
export function paidYearOf(job: Job): number | null {
  const dates = getJobPaymentEntries(job).map(entry => entry.date).filter(Boolean).sort();
  const date = dates[dates.length - 1] || job.payDate || job.postDate || '';
  const year = Number(String(date).slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : null;
}
