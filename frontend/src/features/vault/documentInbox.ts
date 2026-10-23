import type { Expense, Job } from '../../../../shared/types';
import type { VaultFile } from '../../../../shared/vault';
import { wht50StatusOf } from '../../../../shared/vaultStatus';

export function isFileAssigned(file: VaultFile, jobs: Job[], expenses: Expense[]): boolean {
  const targets = file.kind === 'expense' ? expenses : jobs;
  return Boolean(file.jobId && targets.some(item => item.id === file.jobId));
}

/** Missing certificates are actionable; other empty projects are clearly optional. */
export function documentInboxGaps(jobs: Job[], files: VaultFile[]) {
  return jobs.flatMap<{ job: Job; kind: 'wht50' | 'other'; required: boolean }>(job => {
    if (wht50StatusOf(job, files) === 'waiting') return [{ job, kind: 'wht50' as const, required: true }];
    if (!files.some(file => file.kind !== 'expense' && file.jobId === job.id)) return [{ job, kind: 'other' as const, required: false }];
    return [];
  }).sort((a, b) => Number(b.required) - Number(a.required));
}
