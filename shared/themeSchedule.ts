// Light and dark by the clock, or by hand (owner, 2026-10-30: "ให้ยูสเซอร์ปรับได้เอง อัตโนมัติ ... กำหนดว่า 6 โมงเย็นปรับ
// ... หรือจะปรับด้วยมือแมนนวลก็ได้ ... ผู้ใช้ใหม่สว่างตลอดทั้งคืน ... 6 โมงเย็นเป็นต้นไปมีเตือนนิดหน่อย ถามแค่ครั้งเดียว
// ตลอดแอคเคาท์"). The choice lives in the account's own settings (`settings.theme`) and on the device for a quick start.
// Times are Bangkok wall-clock times.

export type ThemeMode = 'auto' | 'light' | 'dark';
export interface ThemePreference {
  mode: ThemeMode;
  /** When the automatic schedule turns dark, and when it turns light again ("HH:MM", Bangkok). */
  darkFrom: string;
  lightFrom: string;
  /** The one-time evening tip for new accounts has been answered (never shown again). */
  asked?: boolean;
}

export const DEFAULT_DARK_FROM = '18:00';
export const DEFAULT_LIGHT_FROM = '06:00';
/** Accounts created from this moment are "new": light all night until they choose, and they get the evening tip once. */
export const THEME_DEFAULTS_ROLLOUT_AT = Date.parse('2026-10-30T00:00:00+07:00');
/** The tip is offered from this time in the evening until the morning. */
export const THEME_TIP_FROM = '18:00';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isClockTime = (value: unknown): value is string => typeof value === 'string' && TIME.test(value);
export const minutesOf = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const BANGKOK_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
/** Minutes since Bangkok midnight. */
export const bangkokMinutes = (now: Date) => Math.floor(((now.getTime() + BANGKOK_MS) % DAY_MS + DAY_MS) % DAY_MS / 60_000);

/** A saved or typed preference, checked; null when it is not one. */
export function readThemePreference(raw: unknown): ThemePreference | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.mode !== 'auto' && value.mode !== 'light' && value.mode !== 'dark') return null;
  const darkFrom = isClockTime(value.darkFrom) ? value.darkFrom : DEFAULT_DARK_FROM;
  const lightFrom = isClockTime(value.lightFrom) ? value.lightFrom : DEFAULT_LIGHT_FROM;
  if (darkFrom === lightFrom) return null;
  return { mode: value.mode, darkFrom, lightFrom, ...(value.asked === true ? { asked: true } : {}) };
}

/** Whether the schedule says dark at this moment. A schedule may cross midnight (18:00 → 06:00) or not (13:00 → 15:00). */
export function scheduleIsDark(pref: Pick<ThemePreference, 'darkFrom' | 'lightFrom'>, now: Date): boolean {
  const t = bangkokMinutes(now), dark = minutesOf(pref.darkFrom), light = minutesOf(pref.lightFrom);
  return dark > light ? t >= dark || t < light : t >= dark && t < light;
}

/**
 * Which stretch of the schedule this moment is in, so a change by hand holds until the next switch. The usual
 * 18:00 / 06:00 schedule keeps the number the app has always stored (devices and tests that saved it keep working).
 */
export function schedulePeriod(pref: Pick<ThemePreference, 'darkFrom' | 'lightFrom'>, now: Date): string {
  const bkk = now.getTime() + BANGKOK_MS;
  if (pref.darkFrom === DEFAULT_DARK_FROM && pref.lightFrom === DEFAULT_LIGHT_FROM) {
    return String(Math.floor((bkk - Date.UTC(1970, 0, 1, 6, 0, 0, 0)) / (12 * 3600_000)));
  }
  const midnight = Math.floor(bkk / DAY_MS) * DAY_MS;
  const starts = [-1, 0].flatMap(day => [minutesOf(pref.darkFrom), minutesOf(pref.lightFrom)].map(m => midnight + day * DAY_MS + m * 60_000));
  const start = Math.max(...starts.filter(at => at <= bkk));
  return `${pref.darkFrom}-${pref.lightFrom}@${start / 60_000}`;
}

export const isNewThemeAccount = (createdAt: string | null | undefined) => {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(created) && created >= THEME_DEFAULTS_ROLLOUT_AT;
};

/**
 * The preference in force: the saved one; otherwise automatic 18:00 / 06:00 for accounts from before, and for a new
 * account "by hand" (no automatic switch, so it stays light all night) until it chooses.
 */
export function effectiveThemePreference(saved: ThemePreference | null, account: { createdAt?: string | null } | null): ThemePreference {
  if (saved) return saved;
  return { mode: account && isNewThemeAccount(account.createdAt) ? 'light' : 'auto', darkFrom: DEFAULT_DARK_FROM, lightFrom: DEFAULT_LIGHT_FROM };
}

/** The one-time evening tip: a new account that has not answered it, from 18:00 until the morning switch to light. */
export function shouldOfferThemeTip(input: { saved: ThemePreference | null; createdAt?: string | null; guest?: boolean; groupWorkspace?: boolean; now: Date }): boolean {
  if (input.guest || input.groupWorkspace || input.saved?.asked || !isNewThemeAccount(input.createdAt)) return false;
  return scheduleIsDark({ darkFrom: THEME_TIP_FROM, lightFrom: DEFAULT_LIGHT_FROM }, input.now);
}

/** "สลับเป็นโหมดสว่างตอน 06:00" — what the schedule does next, for the settings sheet. */
export function nextSwitchText(pref: Pick<ThemePreference, 'darkFrom' | 'lightFrom'>, now: Date): string {
  return scheduleIsDark(pref, now) ? `สลับเป็นโหมดสว่างตอน ${pref.lightFrom}` : `สลับเป็นโหมดมืดตอน ${pref.darkFrom}`;
}
