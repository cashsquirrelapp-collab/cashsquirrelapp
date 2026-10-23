// The logo that phones show while the app opens (owner, 2026-10-22). boot-skeleton.js draws it before
// the app's code arrives; the app calls hideSplash() once the page under it is ready.
// - It stays long enough for its entrance to finish (MIN_VISIBLE_MS), so it never just flickers.
// - It waits for the page's own loading placeholders (aria-busy) to go, for at most MAX_WAIT_MS more,
//   so the logo hands over to real content rather than to a skeleton.
const MIN_VISIBLE_MS = 1100;
const MAX_WAIT_MS = 2500;
const LEAVE_MS = 450;

export function hideSplash(): void {
  const el = typeof document === 'undefined' ? null : document.getElementById('app-splash');
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  const shownAt = Number(el.dataset.shownAt) || Date.now();
  const askedAt = Date.now();
  const leave = () => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), LEAVE_MS);
  };
  const check = () => {
    const entranceDone = Date.now() - shownAt >= MIN_VISIBLE_MS;
    const placeholders = document.querySelector('#root [aria-busy="true"]');
    if (entranceDone && (!placeholders || Date.now() - askedAt >= MAX_WAIT_MS)) leave();
    else window.setTimeout(check, 80);
  };
  check();
}
