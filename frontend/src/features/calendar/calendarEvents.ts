import type { Job } from '../../../../shared/types';
import { getJobPaymentEntries, getJobPendingEntries } from '../../../../shared/installmentPayments';
import { formatCurrency } from '../../utils';

export type CalendarEventKind = 'post' | 'creditTerm' | 'dueSoon' | 'paid' | 'overdue';

export interface CalendarDayEvent {
  id: string;
  date: string;
  jobId: string;
  jobName: string;
  client: string;
  amount: number;
  kind: CalendarEventKind;
  label: string;
}

const eventPriority: Record<CalendarEventKind, number> = {
  post: 0,
  creditTerm: 1,
  paid: 2,
  dueSoon: 3,
  overdue: 4,
};

const dateKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

const addDays = (key: string, days: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const paymentLabel = (label: string, kind: 'installment' | 'single', who: string, amount: number) => {
  const action = label === 'รับมัดจำ'
    ? 'รับมัดจำ'
    : kind === 'installment' && label
      ? `รับเงิน ${label}`
      : 'รับเงิน';
  return `${action} ${who} ${formatCurrency(amount)}`;
};

const dueLabel = (kind: Exclude<CalendarEventKind, 'post' | 'paid'>, jobName: string, part: string) => {
  const subject = part ? `${jobName} · ${part}` : jobName;
  if (kind === 'overdue') return `เกินกำหนดชำระ ${subject}`;
  if (kind === 'dueSoon') return `ใกล้ครบกำหนดชำระ ${subject}`;
  return `ครบกำหนดชำระ ${subject}`;
};

/**
 * Builds the date-indexed events shared by the full calendar and dashboard mini calendar.
 * Receipt events come from actual payment records (deposit/full/installment), while due events
 * come from outstanding entries. Their amounts are the net cash amounts stored on the job, not
 * the gross contract value.
 */
export function buildCalendarEvents(jobs: Job[], todayKey: string): Map<string, CalendarDayEvent[]> {
  const events = new Map<string, CalendarDayEvent[]>();
  const dueSoonCutoff = addDays(todayKey, 7);
  const push = (event: CalendarDayEvent) => {
    const list = events.get(event.date) || [];
    list.push(event);
    events.set(event.date, list);
  };

  for (const job of jobs) {
    const postDate = dateKey(job.postDate);
    if (postDate) {
      push({
        id: `post:${job.id}`,
        date: postDate,
        jobId: job.id,
        jobName: job.name,
        client: job.client || '',
        amount: job.value,
        kind: 'post',
        label: `ส่งงาน/นัดหมาย ${job.name}`,
      });
    }

    for (const entry of getJobPaymentEntries(job)) {
      const receivedDate = dateKey(entry.date);
      if (!receivedDate) continue;
      push({
        id: `paid:${job.id}:${entry.id}`,
        date: receivedDate,
        jobId: job.id,
        jobName: job.name,
        client: job.client || '',
        amount: entry.amount,
        kind: 'paid',
        label: paymentLabel(entry.label, entry.kind, entry.client || entry.jobName, entry.amount),
      });
    }

    // Work that has not been delivered yet has no collectible receivable, even if a draft due
    // date happens to be present. Its eventual receipt still appears above when money was logged.
    if (job.isPosted === false) continue;
    for (const entry of getJobPendingEntries(job)) {
      const dueDate = dateKey(entry.dueDate);
      if (!dueDate) continue;
      const kind: Exclude<CalendarEventKind, 'post' | 'paid'> = dueDate < todayKey
        ? 'overdue'
        : dueDate <= dueSoonCutoff
          ? 'dueSoon'
          : 'creditTerm';
      const part = entry.kind === 'installment' ? entry.label : '';
      push({
        id: `due:${job.id}:${entry.id}`,
        date: dueDate,
        jobId: job.id,
        jobName: job.name,
        client: job.client || '',
        amount: entry.amount,
        kind,
        label: dueLabel(kind, job.name, part),
      });
    }
  }

  return events;
}

/** One mini-calendar cell can show one color; financial urgency wins deterministically. */
export function primaryCalendarEvent(events: CalendarDayEvent[]): CalendarDayEvent | undefined {
  return events.reduce<CalendarDayEvent | undefined>((current, event) => (
    !current || eventPriority[event.kind] > eventPriority[current.kind] ? event : current
  ), undefined);
}
