// Which imports can still be undone: every imported row carries the batch it came in with, and a row
// an import updated carries that batch and what it was before.
import type { Expense, Job } from '../../../../shared/types';
import { currentLanguage } from '../../i18n/currentLanguage';

export interface ImportBatch { id: string; at: string; jobs: number; expenses: number; updates: number }

/** What an import changed in a row already in the app, kept on that row so the import can be undone. */
export interface ImportUpdateMark { batchId: string; at: string; before: Record<string, unknown> }

type Tagged = { importBatchId?: unknown; importedAt?: unknown; importUpdate?: ImportUpdateMark };

/** Imports saved in the last 7 days, from the batch tag each imported or updated row carries. */
export function recentImports(jobs: Job[], expenses: Expense[], now = Date.now()): ImportBatch[] {
  const batches = new Map<string, ImportBatch>();
  const batch = (id: string, at: string) => batches.get(id) ?? batches.set(id, { id, at, jobs: 0, expenses: 0, updates: 0 }).get(id)!;
  const fresh = (at: string) => now - Date.parse(at) <= 7 * 86400000;
  const add = (row: Tagged, kind: 'jobs' | 'expenses') => {
    if (typeof row.importBatchId === 'string' && typeof row.importedAt === 'string' && fresh(row.importedAt)) batch(row.importBatchId, row.importedAt)[kind]++;
    const update = row.importUpdate;
    if (update && typeof update.batchId === 'string' && typeof update.at === 'string' && fresh(update.at)) batch(update.batchId, update.at).updates++;
  };
  for (const job of jobs) add(job as Job & Tagged, 'jobs');
  for (const expense of expenses) add(expense as Expense & Tagged, 'expenses');
  return [...batches.values()].sort((a, b) => b.at.localeCompare(a.at));
}

// Fields that may be null on a saved row; any other field given as null is removed instead.
const NULLABLE = new Set(['payDate', 'depositDate', 'remindAt']);

/** A row with fields set from an import update (or set back on undo). */
export function applyFields<T extends object>(row: T, fields: Record<string, unknown>): T {
  const next = { ...row } as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    if ((value === null || value === undefined) && !NULLABLE.has(key)) delete next[key];
    else next[key] = value ?? null;
  }
  return next as T;
}

/** The row as the import found it, when that import is undone. */
export function undoUpdate<T extends object>(row: T, batchId: string): T {
  const mark = (row as Tagged).importUpdate;
  if (!mark || mark.batchId !== batchId) return row;
  const restored = applyFields(row, mark.before) as T & Tagged;
  delete restored.importUpdate;
  return restored;
}

export const importedLabel = (iso: string) => new Date(iso).toLocaleString(currentLanguage === 'en' ? 'en-US' : 'th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Whether a save carries rows of this import (new or updated). */
export const carriesBatch = (payload: { jobs?: object[]; expenses?: object[] }, batchId: string) =>
  [...(payload.jobs || []), ...(payload.expenses || [])].some(row => (row as Tagged).importBatchId === batchId || (row as Tagged).importUpdate?.batchId === batchId);
