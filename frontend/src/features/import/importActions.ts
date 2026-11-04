import React from 'react';
import type { Expense, Job, StatusOption } from '../../../../shared/types';
import type { ImportCommit, ImportResult, SaveOutcome } from './importShared';

// The app's data and import actions, for the file review in the เลขากระรอก chat (owner, 2026-11-04: "ถ้าเขาอยากทำในนี้ก็ให้
// เขาทำในนี้"): the same rows, statuses and save the import window gets from App.tsx, so a file reviewed in the chat is
// checked against what is already in the app (nothing saved twice) and saved, and undone, the same way.

export interface ImportActions {
  jobs: Job[]; expenses: Expense[]; statuses: StatusOption[]; jobTypes: string[];
  onImport: (commit: ImportCommit) => ImportResult;
  onRetrySave: (batchId: string) => Promise<SaveOutcome>;
  onUndo: (batchId: string) => void;
  onViewJobs: () => void;
}

let read: (() => ImportActions | null) | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach(listener => listener()); };

/** App.tsx: how to read its current data and actions (always the latest), and null when it unmounts. */
export function registerImportActions(get: (() => ImportActions | null) | null): void { read = get; emit(); }
/** App.tsx: its rows, statuses or job types changed. */
export function importActionsChanged(): void { emit(); }

export function useImportActions(): ImportActions | null {
  React.useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version, () => 0);
  return read?.() ?? null;
}
