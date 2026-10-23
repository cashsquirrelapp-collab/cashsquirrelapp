// Financial working copies live only in this page's memory. Cloud is the
// persistent store; closing/reloading the page never leaves a business cache.
const entries = new Map<string, string>();
export const privateCache = {
  getItem(key: string) { return entries.get(key) ?? null; },
  setItem(key: string, value: string) { entries.set(key, value); },
  removeItem(key: string) { entries.delete(key); },
  clear() { entries.clear(); }
};
export function clearLegacyFinancialCache(): void {
  const financial = /^cashflow_(jobs|goals|settings|statuses|job_types|expenses|notif_settings|user_avatar|invoices|issuer)(_|$)/;
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      const isReloadSnapshot = key.startsWith('cashflow_jobs_reload_');
      if (financial.test(key) || isReloadSnapshot || (key.startsWith('sb-') && key.includes('auth-token'))) {
        storage.removeItem(key);
      }
    }
  }
  // remix_invoices/issuer_profile are legacy original documents, not disposable
  // caches. Keep the explicit owner-confirmed import/export flow for those.
}
