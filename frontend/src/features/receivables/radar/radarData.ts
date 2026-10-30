import type { Job } from '../../../../../shared/types';

// What the Credit Radar shows (owner's brief "KRAROK — FULLSCREEN HOLOGRAPHIC CREDIT RADAR", 2026-10-30), worked out from
// the jobs as they are saved, with the receivables page's own rules: a job is owed while it has money pending and has
// been sent (isPosted is not false); its due day is payDate (or the delivery day when none was set); "due soon" is
// within 7 days, as on that page. Green is only for jobs marked paid in full, paid in the last 7 days. Days are counted
// on the Bangkok calendar.

export type RadarStatus = 'overdue' | 'soon' | 'received' | 'later';

export interface RadarItem {
  id: string;
  name: string;
  client: string;
  /** Overdue / soon / later: what is still owed. Received: what came in. */
  amount: number;
  status: RadarStatus;
  sentOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  /** Overdue: days late. Soon / later: days left (0 = due today). Received: days since it was paid. */
  days: number;
}

export interface CreditRadarData {
  today: string;
  overdue: RadarItem[];
  soon: RadarItem[];
  received: RadarItem[];
  later: RadarItem[];
  totals: {
    /** Everything still owed (overdue + soon + later). Money already received is never in it. */
    outstanding: number;
    overdue: number;
    soon: number;
    received: number;
    /** Overdue and due soon: what to follow up. */
    followUp: number;
  };
}

export const SOON_DAYS = 7;
export const RECEIVED_DAYS = 7;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const dateOnly = (value: string | null | undefined) => (value && ISO.test(value.slice(0, 10)) ? value.slice(0, 10) : null);

/** Today on the Bangkok calendar, YYYY-MM-DD. */
export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function buildCreditRadar(jobs: Job[], today: string): CreditRadarData {
  const overdue: RadarItem[] = [], soon: RadarItem[] = [], received: RadarItem[] = [], later: RadarItem[] = [];
  const now = day(today);
  for (const job of jobs) {
    const base = { id: job.id, name: job.name || '', client: job.client || '', sentOn: dateOnly(job.postDate) };
    const owed = (job.pending || 0) > 0 && job.isPosted !== false;
    if (owed) {
      const dueOn = dateOnly(job.payDate) ?? dateOnly(job.dueDate) ?? dateOnly(job.postDate);
      if (!dueOn) { later.push({ ...base, amount: job.pending, status: 'later', dueOn: null, paidOn: null, days: Number.POSITIVE_INFINITY }); continue; }
      const left = day(dueOn) - now;
      const item = { ...base, amount: job.pending, dueOn, paidOn: null };
      if (left < 0) overdue.push({ ...item, status: 'overdue', days: -left });
      else if (left <= SOON_DAYS) soon.push({ ...item, status: 'soon', days: left });
      else later.push({ ...item, status: 'later', days: left });
      continue;
    }
    // Paid in full: the receivables page records the day the money came in as payDate.
    const paidOn = job.paymentStatus === 'paid' && (job.pending || 0) <= 0 ? dateOnly(job.payDate) : null;
    if (!paidOn) continue;
    const since = now - day(paidOn);
    if (since >= 0 && since <= RECEIVED_DAYS) {
      received.push({ ...base, amount: job.received || job.value || 0, status: 'received', dueOn: dateOnly(job.dueDate), paidOn, days: since });
    }
  }
  overdue.sort((a, b) => b.days - a.days || b.amount - a.amount);
  soon.sort((a, b) => a.days - b.days || b.amount - a.amount);
  received.sort((a, b) => a.days - b.days || b.amount - a.amount);
  later.sort((a, b) => a.days - b.days || b.amount - a.amount);
  const sum = (list: RadarItem[]) => Math.round(list.reduce((total, item) => total + item.amount, 0) * 100) / 100;
  return {
    today, overdue, soon, received, later,
    totals: {
      outstanding: sum([...overdue, ...soon, ...later]),
      overdue: sum(overdue),
      soon: sum(soon),
      received: sum(received),
      followUp: overdue.length + soon.length,
    },
  };
}

/** The cards in order of what needs a look first: overdue, then due soon, then just received, then the rest. */
export function radarCards(data: CreditRadarData, room: number): RadarItem[] {
  return [...data.overdue, ...data.soon, ...data.received, ...data.later].slice(0, Math.max(0, room));
}
