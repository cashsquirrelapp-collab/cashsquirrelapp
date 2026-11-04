import type { Expense, Job } from '../../../../shared/types';
import type { ImportRow, ImportSource } from './sheetImport';
import { sourceLink, type ImportCommit } from './importShared';

// What an import saves, from the rows chosen: new jobs and expenses (an expense needs its date), and the rows already in
// the app that the file changes, each with what it was before so the whole import can be undone. Shared by the import
// window (ImportChat.tsx) and the file review in the เลขากระรอก chat (owner, 2026-11-04: "ถ้าเขาอยากทำในนี้ก็ให้เขาทำในนี้").

/** Rows the import starts with: ready and to-check rows, personal spending too unless the person leaves it out. */
export const startsIncluded = (row: ImportRow, includePersonal = true) => row.kind !== 'skip'
  && (row.state === 'ready' || row.state === 'check') && (includePersonal || row.use !== 'personal');

export function buildCommit(chosen: ImportRow[], newJobTypes: string[], existing: (Job | Expense)[]): ImportCommit {
  const fresh = chosen.filter(row => !row.update);
  const jobs = fresh.filter(row => row.job).map(row => ({ ...row.job!, ...(sourceLink(row) ? { importSource: sourceLink(row) } : {}) }));
  const expenses = fresh.filter(row => row.expense && row.expense.date).map(row => ({ ...row.expense!, ...(sourceLink(row) ? { importSource: sourceLink(row) } : {}) }));
  const updates = chosen.filter(row => row.update).map(row => {
    const before = existing.find(item => item.id === row.update!.id) as { importSource?: ImportSource } | undefined;
    return {
      table: row.job ? 'jobs' as const : 'expenses' as const, id: row.update!.id,
      before: { ...row.update!.before, importSource: before?.importSource ?? null },
      after: { ...row.update!.after, ...(sourceLink(row) ? { importSource: sourceLink(row) } : {}) },
    };
  });
  const usedTypes = new Set(jobs.map(job => job.type));
  return { jobs, expenses, newJobTypes: newJobTypes.filter(type => usedTypes.has(type)), updates };
}
