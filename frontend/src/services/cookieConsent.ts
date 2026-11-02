// The visitor's cookie choice (owner, 2026-11-02: "ทำปุ่มยอมรับคุกกี้"). The site uses only the cookies sign-in and
// security need, keeps some preferences in the browser, and keeps usage statistics: feature use, and when the account
// is on the app (the privacy policy, sections 2 and 7). The one optional part is those statistics: "เฉพาะที่จำเป็น"
// turns them off for this browser.
// Kept in this browser only; the banner comes back when the choice is cleared or its version changes.

export const COOKIE_CONSENT_KEY = 'krarok_cookie_consent';
/** Fired to open the banner again (the footer's ตั้งค่าคุกกี้). */
export const COOKIE_SETTINGS_EVENT = 'krarok:cookie-settings';
export interface CookieConsent { v: 1; stats: boolean; at: string }

export function readCookieConsent(): CookieConsent | null {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    const value = raw ? JSON.parse(raw) as Partial<CookieConsent> : null;
    return value && value.v === 1 && typeof value.stats === 'boolean' && typeof value.at === 'string' ? value as CookieConsent : null;
  } catch {
    return null;
  }
}

/** Fired after a choice is saved, so a signed-in app can pass it on (App.tsx, usageAnalyticsApi.statsChoice). */
export const COOKIE_CHOICE_EVENT = 'krarok:cookie-choice';

export function saveCookieConsent(stats: boolean): CookieConsent {
  const value: CookieConsent = { v: 1, stats, at: new Date().toISOString() };
  try { window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(value)); } catch { /* storage blocked: asked again next visit */ }
  try { window.dispatchEvent(new Event(COOKIE_CHOICE_EVENT)); } catch { /* no window events (tests) */ }
  return value;
}

/** Usage statistics (feature views, presence) are sent unless this browser chose essential cookies only. */
export function usageStatsAllowed(): boolean {
  return readCookieConsent()?.stats !== false;
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
