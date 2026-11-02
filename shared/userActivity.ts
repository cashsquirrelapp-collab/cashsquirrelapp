import type { AccountPlanStatus, AnalyticsRange } from './adminAnalytics.js';

// When each account uses the app (owner, 2026-11-03: "อยากเห็นว่าคนนึงเขาไม่ active นานแค่ไหน ... คนมา on กี่ช่วงไหนบ้าง").
// The app's presence heartbeat (every 20 seconds while a tab is visible, and only when the browser allows usage
// statistics) also keeps a short list of visits in the account's private state: when each visit started and how long
// it lasted, in whole minutes, for 90 days. Nothing about what was done or seen is kept.

/** A break longer than this starts a new visit. */
export const VISIT_GAP_MINUTES = 15;
/** A visit's length is written at most once in this many minutes (so a long visit costs a few writes, not one a beat). */
export const VISIT_STEP_MINUTES = 3;
/** One visit is never longer than this; a tab left open all day starts a new one. */
export const VISIT_MAX_MINUTES = 12 * 60;
export const ACTIVITY_KEEP_DAYS = 90;
export const ACTIVITY_MAX_VISITS = 500;
/** An account is online while its latest heartbeat is this recent (backend/src/repositories/presence.ts). */
export const ONLINE_MS = 60_000;

/** [start, minutes]: the start in whole minutes since 1970 (UTC), and how many minutes the visit lasted. */
export type Visit = [number, number];
export interface StoredActivity { v: 1; visits: Visit[] }

const isVisit = (value: unknown): value is Visit => Array.isArray(value) && value.length === 2
  && Number.isInteger(value[0]) && Number.isInteger(value[1]) && value[0] > 0 && value[1] >= 0 && value[1] <= VISIT_MAX_MINUTES;

export function readActivity(raw: unknown): StoredActivity {
  const visits = raw && typeof raw === 'object' && Array.isArray((raw as { visits?: unknown }).visits) ? (raw as { visits: unknown[] }).visits.filter(isVisit) : [];
  return { v: 1, visits };
}

/** Whether a heartbeat can change the visits: the first one, one after a break, or once the next step has come. */
export function heartbeatChangesVisits(previousSeenAt: string | null | undefined, now: Date): boolean {
  const previous = previousSeenAt ? Date.parse(previousSeenAt) : NaN;
  if (!Number.isFinite(previous)) return true;
  const gap = now.getTime() - previous;
  if (gap < 0) return false;
  if (gap > VISIT_GAP_MINUTES * 60_000) return true;
  const step = VISIT_STEP_MINUTES * 60_000;
  return Math.floor(previous / step) !== Math.floor(now.getTime() / step);
}

/** The visits after a heartbeat at `now`: the latest visit grows, or a new one starts after a break. */
export function recordHeartbeat(stored: StoredActivity, now: Date): StoredActivity {
  const minute = Math.floor(now.getTime() / 60_000);
  const visits = stored.visits.slice();
  const last = visits.at(-1);
  if (last && minute < last[0]) return { v: 1, visits }; // the clock went back: keep what is there
  const continues = last && minute - (last[0] + last[1]) <= VISIT_GAP_MINUTES && minute - last[0] <= VISIT_MAX_MINUTES;
  if (last && continues) visits[visits.length - 1] = [last[0], minute - last[0]];
  else visits.push([minute, 0]);
  const oldest = minute - ACTIVITY_KEEP_DAYS * 1440;
  return { v: 1, visits: visits.filter(visit => visit[0] >= oldest).slice(-ACTIVITY_MAX_VISITS) };
}

// ── The admin's view ──────────────────────────────────────────────────────────────────────────────

export type ActivityStatus = 'online' | 'today' | 'week' | 'month' | 'away' | 'none' | 'off';
export const ACTIVITY_STATUSES: ActivityStatus[] = ['online', 'today', 'week', 'month', 'away', 'none', 'off'];
/** Parts of the day, Bangkok time: 06–11, 11–14, 14–18, 18–22, 22–06. */
export type DayBand = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
export const DAY_BANDS: { key: DayBand; from: number; to: number }[] = [
  { key: 'morning', from: 6, to: 11 }, { key: 'midday', from: 11, to: 14 }, { key: 'afternoon', from: 14, to: 18 },
  { key: 'evening', from: 18, to: 22 }, { key: 'night', from: 22, to: 30 },
];
export const bandOfHour = (hour: number): DayBand => DAY_BANDS.find(band => (hour < 6 ? hour + 24 : hour) >= band.from && (hour < 6 ? hour + 24 : hour) < band.to)!.key;

export interface ActivityAccount {
  userId: string;
  publicId: string;
  displayName: string;
  createdAt: string;
  plan: AccountPlanStatus;
  status: ActivityStatus;
  /** The latest sign of use: a heartbeat, a page opened, a visit, or a sign-in. */
  lastActiveAt: string | null;
  /** Whole Bangkok days since lastActiveAt (0 = today). */
  daysAway: number | null;
  /** The account chose essential cookies only in a browser it signed in with: no usage statistics come from it. */
  statsOff: boolean;
  /** In the chosen period: days with any use, visits, and minutes in them. */
  activeDays: number;
  visits: number;
  minutes: number;
  /** The part of the day it uses the app most, or null without data. */
  band: DayBand | null;
  /** Days in the period it was on in each hour of the day (Bangkok, 0–23). */
  hours: number[];
  /** The Bangkok dates in the period with any use. */
  days: string[];
  /** The latest visits, newest first (at most 15). */
  recent: { start: string; minutes: number }[];
}

export interface AdminActivitySummary {
  range: AnalyticsRange;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  /** The first visit kept: times of day before it come only from pages opened, and visits are not counted. */
  trackingSince: string | null;
  totals: Record<ActivityStatus, number> & { accounts: number };
  /** [weekday Monday..Sunday][hour 0–23]: how many times an account was on in that hour, in the period. */
  heatmap: number[][];
  accounts: ActivityAccount[];
}

export interface ActivityInput {
  profiles: { user_id: string; public_id: string; display_name: string; created_at: string }[];
  plans: Map<string, AccountPlanStatus>;
  presence: Map<string, string>;
  /** Page openings in the period (cashflow_usage_daily): the day, and the last time that day a page was opened. */
  usage: { user_id: string; usage_date: string; last_seen_at: string }[];
  activity: Map<string, StoredActivity>;
  statsOff: Set<string>;
  signIns: Map<string, string>;
  range: AnalyticsRange;
  now: Date;
}

const BANGKOK_MS = 7 * 3600_000;
export const bangkokDate = (ms: number) => new Date(ms + BANGKOK_MS).toISOString().slice(0, 10);
const bangkokHour = (ms: number) => new Date(ms + BANGKOK_MS).getUTCHours();
const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const shiftDate = (date: string, days: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const latest = (values: (string | null | undefined)[]) => values.reduce<string | null>((best, value) => (value && Number.isFinite(Date.parse(value)) && (!best || Date.parse(value) > Date.parse(best)) ? new Date(Date.parse(value)).toISOString() : best), null);

export function summarizeActivity(input: ActivityInput): AdminActivitySummary {
  const nowMs = input.now.getTime();
  const toDate = bangkokDate(nowMs);
  const fromDate = shiftDate(toDate, -(input.range - 1));
  const usageBy = new Map<string, ActivityInput['usage']>();
  for (const row of input.usage) { const list = usageBy.get(row.user_id) ?? []; list.push(row); usageBy.set(row.user_id, list); }
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let trackingSince: number | null = null;

  const accounts = input.profiles.map((profile): ActivityAccount => {
    const visits = input.activity.get(profile.user_id)?.visits ?? [];
    if (visits[0] && (trackingSince === null || visits[0][0] < trackingSince)) trackingSince = visits[0][0];
    const usage = usageBy.get(profile.user_id) ?? [];
    const presence = input.presence.get(profile.user_id) ?? null;
    const lastVisit = visits.at(-1);
    const lastActiveAt = latest([presence, ...usage.map(row => row.last_seen_at), lastVisit ? new Date((lastVisit[0] + lastVisit[1]) * 60_000).toISOString() : null, input.signIns.get(profile.user_id)]);
    const statsOff = input.statsOff.has(profile.user_id);
    const online = !!presence && nowMs - Date.parse(presence) <= ONLINE_MS && nowMs >= Date.parse(presence) - ONLINE_MS;
    const daysAway = lastActiveAt ? Math.max(0, daysBetween(bangkokDate(Date.parse(lastActiveAt)), toDate)) : null;
    const status: ActivityStatus = online ? 'online' : statsOff ? 'off' : daysAway === null ? 'none'
      : daysAway === 0 ? 'today' : daysAway <= 7 ? 'week' : daysAway <= 30 ? 'month' : 'away';

    // Hours on, one mark per day and hour: from visits (every hour a visit touches) and from pages opened.
    const marks = new Set<string>();
    const days = new Set<string>();
    let visitCount = 0; let minutes = 0;
    for (const [start, length] of visits) {
      const startMs = start * 60_000; const endMs = (start + length) * 60_000;
      const date = bangkokDate(startMs);
      if (date < fromDate || date > toDate) continue;
      visitCount += 1; minutes += length; days.add(date);
      for (let at = startMs; at <= endMs; at = (Math.floor((at + BANGKOK_MS) / 3600_000) + 1) * 3600_000 - BANGKOK_MS) {
        const day = bangkokDate(at);
        if (day >= fromDate && day <= toDate) marks.add(`${day}|${bangkokHour(at)}`);
      }
    }
    for (const row of usage) {
      if (row.usage_date < fromDate || row.usage_date > toDate) continue;
      days.add(row.usage_date);
      const at = Date.parse(row.last_seen_at);
      if (Number.isFinite(at) && bangkokDate(at) === row.usage_date) marks.add(`${row.usage_date}|${bangkokHour(at)}`);
    }
    const hours = Array.from({ length: 24 }, () => 0);
    for (const mark of marks) {
      const [day, hour] = mark.split('|');
      hours[Number(hour)] += 1;
      heatmap[weekdayOf(day)][Number(hour)] += 1;
    }
    const bandTotals = new Map<DayBand, number>();
    hours.forEach((count, hour) => { if (count) bandTotals.set(bandOfHour(hour), (bandTotals.get(bandOfHour(hour)) ?? 0) + count); });
    const band = [...bandTotals.entries()].sort((a, b) => b[1] - a[1] || DAY_BANDS.findIndex(x => x.key === a[0]) - DAY_BANDS.findIndex(x => x.key === b[0]))[0]?.[0] ?? null;

    return {
      userId: profile.user_id, publicId: profile.public_id, displayName: profile.display_name, createdAt: profile.created_at,
      plan: input.plans.get(profile.user_id) ?? 'free', status, lastActiveAt, daysAway, statsOff,
      activeDays: days.size, visits: visitCount, minutes, band, hours, days: [...days].sort(),
      recent: visits.slice(-15).reverse().map(([start, length]) => ({ start: new Date(start * 60_000).toISOString(), minutes: length })),
    };
  });

  // Online first, then by how recently each was active; accounts without any sign last, newest sign-up first.
  const order: Record<ActivityStatus, number> = { online: 0, today: 1, week: 1, month: 1, away: 1, off: 1, none: 2 };
  accounts.sort((a, b) => order[a.status] - order[b.status]
    || (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '') || b.createdAt.localeCompare(a.createdAt));
  const totals = Object.fromEntries(ACTIVITY_STATUSES.map(status => [status, accounts.filter(account => account.status === status).length])) as Record<ActivityStatus, number>;
  return {
    range: input.range, fromDate, toDate, generatedAt: input.now.toISOString(),
    trackingSince: trackingSince === null ? null : new Date((trackingSince as number) * 60_000).toISOString(),
    totals: { ...totals, accounts: accounts.length }, heatmap, accounts,
  };
}
