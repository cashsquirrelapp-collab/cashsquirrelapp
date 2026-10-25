// Which jobs need attention today: overdue, due today, or due within the next 2 days. One rule for the LINE 08:00
// reminder (backend/src/services/lineReminders.ts), the app's notifications thread and the briefing (shared/briefing.ts),
// so all three say the same thing. Moved here unchanged from lineReminders.ts (2026-10-25).

export interface JobRow {
  id: string;
  name: string;
  client: string;
  status: string;
  pending: number;
  paymentStatus?: string;
  dueDate?: string | null;
  payDate: string | null;
  followUpCount?: number;
  lastFollowUpDate?: string;
  installments?: Array<{
    id: string;
    label: string;
    amount: number;
    dueDate: string | null;
    paidAt: string | null;
    status: 'pending' | 'paid';
  }>;
}

// Bangkok is UTC+7 with no DST; a fixed offset is enough to get "today" right locally.
export function todayInBangkok(now = new Date()): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkok.toISOString().split('T')[0];
}

// How many days until (positive) or since (negative) the job's due date. 0 = due today.
function diffDaysFromToday(target: string, today: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return Number.NaN;
  const parsed = new Date(target + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== target) return Number.NaN;
  return (parsed.getTime() - Date.parse(today + 'T00:00:00Z')) / 86400000;
}

export interface JobWithDiff extends JobRow {
  diffDays: number;
}

// Overdue jobs, jobs due today, and jobs due within the next 2 days -- catching it a day or two
// early is far more useful than only finding out once it's already overdue.
//
// Trust the recorded `pending` field as-is, same as Dashboard/Summary/Timeline -- don't also gate
// on status behavior or paymentStatus, or a job whose paid flag and pending amount have drifted
// out of sync silently skips the digest instead of surfacing as money still owed.
export function findJobsNeedingAttention(jobs: JobRow[], now = new Date()): JobWithDiff[] {
  const today = todayInBangkok(now);
  return jobs
    .flatMap((j) => {
      if (j.installments?.length) {
        return j.installments.flatMap((row) => {
          if (row.status === 'paid' || row.amount <= 0 || !row.dueDate) return [];
          const diffDays = diffDaysFromToday(row.dueDate, today);
          if (!Number.isFinite(diffDays) || diffDays > 2) return [];
          return [{
            ...j,
            id: `${j.id}:${row.id}`,
            name: `${j.name} • ${row.label}`,
            pending: row.amount,
            dueDate: row.dueDate,
            payDate: row.dueDate,
            diffDays,
          }];
        });
      }
      const targetDateStr = j.dueDate || j.payDate;
      if (j.pending <= 0 || !targetDateStr) return [];

      const diffDays = diffDaysFromToday(targetDateStr, today);
      if (!Number.isFinite(diffDays) || diffDays > 2) return [];
      return [{ ...j, diffDays }];
    })
    .filter((j): j is JobWithDiff => !!j);
}
