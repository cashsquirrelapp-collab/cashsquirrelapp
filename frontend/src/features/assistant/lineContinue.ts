// ทำต่อในแอป (owner's plan, item 4, 2026-11-14): LINE's button opens /assistant?continue=<id>&from=line. The id is kept on
// this tab as the page loads (the address is tidied and the app may move to the account's own address before the chat
// opens), then the chat takes it once and asks the server for that conversation (backend/src/ai/lineContinue.ts).

const KEY = 'krarok.lineContinue';
const ID = /^[A-Za-z0-9_-]{22}$/;
/** Taken within ten minutes of the page opening, or forgotten. */
const FRESH_MS = 10 * 60_000;

/** Keeps a ทำต่อในแอป id from the address (once, as the page loads) and takes it out of the address. */
export function rememberLineContinue(): void {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('continue');
    if (!url.pathname.startsWith('/assistant') || !id) return;
    url.searchParams.delete('continue');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    if (ID.test(id)) sessionStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() }));
  } catch { /* storage or history unavailable: the chat opens as usual */ }
}

/** The ทำต่อในแอป id waiting on this tab, taken once. */
export function takeLineContinue(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const kept = JSON.parse(raw) as { id?: unknown; at?: unknown };
    return typeof kept.id === 'string' && ID.test(kept.id) && typeof kept.at === 'number' && now - kept.at >= 0 && now - kept.at <= FRESH_MS ? kept.id : null;
  } catch { return null; }
}
