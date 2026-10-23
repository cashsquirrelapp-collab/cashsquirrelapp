// New versions reach people without an error page or a new sign-in (owner, 2026-10-22).
//
// After a deploy, a tab opened before it still runs the old build. Its pages load their code on
// demand, and the old files are gone: the server answers with the app's HTML, the import fails and,
// before this, the orange "โหลดหน้านี้ไม่สำเร็จ" page appeared. Now:
// - the app checks for a newer build when it comes back on screen and every few minutes;
// - once there is one, the next page switch (or coming back to the app) opens the new build, as a
//   normal page load: the sign-in is a cookie, so the person stays signed in;
// - a page whose code is gone reloads into the new build by itself, once, instead of showing an
//   error; a missing file found any other way (a menu item preloading its page on hover, say) only
//   marks the new build as ready, so nothing reloads under someone's hand.
// Nothing reloads while a save is still on its way (the app tells this module via setUpdateGuard).

const CHECK_EVERY_MS = 5 * 60_000;
const RELOAD_GUARD_KEY = 'cashflow_update_reload_at';
const RELOAD_GUARD_MS = 20_000;
const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

let updateReady = false;
let reloading = false;
let canReloadNow: () => boolean = () => true;
let hiddenAt = 0;

/** The running build's entry file, e.g. /assets/index-Crp9WHc8.js (null in development). */
export function currentBuild(doc: Pick<Document, 'querySelector'> = document): string | null {
  const src = doc.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') || '';
  return ENTRY_RE.exec(src)?.[0] ?? null;
}

/** The entry file the server would load now, read from the app's page. */
export async function latestBuild(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher('/', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'text/html' } });
    if (!res.ok) return null;
    return ENTRY_RE.exec(await res.text())?.[0] ?? null;
  } catch { return null; }
}

/** Failed on-demand code: the forms Chrome, Safari and Firefox use, and Vite's own. */
export function isChunkLoadError(error: unknown): boolean {
  const text = `${(error as { name?: string })?.name || ''} ${(error as { message?: string })?.message || String(error ?? '')}`;
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Expected a JavaScript(-or-Wasm)? module script|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i.test(text);
}

export function isUpdateReady(): boolean { return updateReady; }

/** The app says whether a reload would lose anything (a save still on its way). */
export function setUpdateGuard(guard: () => boolean): void { canReloadNow = guard; }

function recentlyReloaded(): boolean {
  try { return Date.now() - Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0) < RELOAD_GUARD_MS; } catch { return false; }
}

/**
 * Opens the new build (at `path`, or the current address). Refuses when a save is on its way, or
 * when it already reloaded moments ago (so a real outage cannot cause a reload loop).
 */
export function reloadForUpdate(path?: string, { force = false } = {}): boolean {
  if (!force && !canReloadNow()) return false;
  if (recentlyReloaded()) return false;
  try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())); } catch { /* still reload */ }
  reloading = true;
  if (path && path !== `${window.location.pathname}${window.location.search}`) window.location.assign(path);
  else window.location.reload();
  return true;
}

/**
 * After a failed on-demand import the page cannot go on, so it reloads into the new build; it first
 * waits (up to 5 seconds) for a save on its way to finish. False if it reloaded moments ago already.
 */
export function reloadWhenSafe(): boolean {
  if (reloading) return true;
  if (recentlyReloaded()) return false;
  reloading = true;
  const started = Date.now();
  const attempt = () => {
    if (canReloadNow() || Date.now() - started > 5000) reloadForUpdate(undefined, { force: true });
    else window.setTimeout(attempt, 250);
  };
  attempt();
  return true;
}

async function check(): Promise<void> {
  if (updateReady) return;
  const running = currentBuild();
  if (!running) return;
  const latest = await latestBuild();
  if (latest && latest !== running) updateReady = true;
}

/** Starts watching for new builds (production only). Returns a stop function. */
export function startUpdateWatch(): () => void {
  if (!currentBuild()) return () => {};
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    // Back on screen after a while with a new build waiting: open it now, before anything is touched.
    if (updateReady && hiddenAt && Date.now() - hiddenAt > 30_000) { reloadForUpdate(); return; }
    void check().then(() => {
      if (updateReady && hiddenAt && Date.now() - hiddenAt > 30_000) reloadForUpdate();
    });
  };
  document.addEventListener('visibilitychange', onVisibility);
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void check(); }, CHECK_EVERY_MS);
  // Vite reports a failed on-demand import here: the files are from an older build. The error still
  // reaches the caller (a page that cannot open reloads via ErrorBoundary); the next page switch
  // opens the new build.
  const onPreloadError = () => { updateReady = true; };
  window.addEventListener('vite:preloadError', onPreloadError);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(timer);
    window.removeEventListener('vite:preloadError', onPreloadError);
  };
}
