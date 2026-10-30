// The free Pro trial, counted from the account's real creation date (Supabase Auth or cashflow_profiles, never
// something the browser can set). Owner, 2026-10-24: 3 days for accounts created from 25 Oct 2569 00:00 Bangkok time;
// accounts created before kept the 14 days they were given. Owner, 2026-10-30: no free trial any more ("ทดลองฟรี
// ... ไม่มีนะ ปิดไว้ซะ"): accounts created from NO_TRIAL_FROM get none; accounts created before keep the days they
// were given until those end. Every server check, the app and the admin lists use this one rule so they cannot disagree.

export const DAY_MS = 86_400_000;
/** Accounts created at or after this moment get the 3-day trial. */
export const SHORT_TRIAL_FROM = Date.parse('2026-10-25T00:00:00+07:00');
export const SHORT_TRIAL_DAYS = 3;
export const LEGACY_TRIAL_DAYS = 14;
/** Accounts created at or after this moment get no trial (owner, 2026-10-30). */
export const NO_TRIAL_FROM = Date.parse('2026-10-30T09:30:00+07:00');

type When = string | number | Date | null | undefined;
const timeOf = (value: When): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** How many trial days an account created then gets (0 from NO_TRIAL_FROM). */
export function trialDays(createdAt: When): number {
  const created = timeOf(createdAt);
  if (created !== null && created >= NO_TRIAL_FROM) return 0;
  return created !== null && created >= SHORT_TRIAL_FROM ? SHORT_TRIAL_DAYS : LEGACY_TRIAL_DAYS;
}

/** When the trial ends, or null without a creation date or without a trial. */
export function trialEndsAt(createdAt: When): Date | null {
  const created = timeOf(createdAt);
  if (created === null) return null;
  const days = trialDays(created);
  return days > 0 ? new Date(created + days * DAY_MS) : null;
}

/** True while the account is inside its free trial. */
export function inFreeTrial(createdAt: When, now: number = Date.now()): boolean {
  const end = trialEndsAt(createdAt);
  return end !== null && end.getTime() > now;
}
