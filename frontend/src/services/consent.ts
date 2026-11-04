import React from 'react';
import { CONSENT_KEYS, CONSENT_VERSIONS, isConsented, readConsents, type ConsentKey, type ConsentRecord, type ConsentRecords } from '../../../shared/consents';
import { apiJson } from './api';

// What the signed-in account has agreed to (shared/consents.ts; owner, 2026-11-05). The server keeps the record and is
// what counts: เลขากระรอก and connecting LINE refuse without it (428). This device keeps a copy per account so the app
// knows at once on the next visit (no flash of the terms dialog), and an agreement whose save failed is sent again.

export const CONSENT_CACHE_KEY = 'krarok_consent';
type Cached = Record<string, Partial<Record<ConsentKey, string>>>;

function readCache(): Cached {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONSENT_CACHE_KEY) || '{}') as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Cached : {};
  } catch { return {}; }
}
function writeCache(account: string, key: ConsentKey, version: string | null) {
  try {
    const all = readCache();
    const mine = { ...(all[account] ?? {}) };
    if (version) mine[key] = version; else delete mine[key];
    all[account] = mine;
    window.localStorage.setItem(CONSENT_CACHE_KEY, JSON.stringify(all));
  } catch { /* storage blocked: the server's record still counts */ }
}
const cachedYes = (account: string, key: ConsentKey) => readCache()[account]?.[key] === CONSENT_VERSIONS[key];

interface Entry { status: 'loading' | 'ready' | 'offline'; records: ConsentRecords }
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let tick = 0;
const emit = () => { tick += 1; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

type Reply = { consents?: unknown };
const post = (account: string, key: ConsentKey, accepted: boolean) => apiJson<Reply>('/api/consent', {
  method: 'POST', headers: { 'X-Account-ID': account },
  body: JSON.stringify({ key, accepted, ...(accepted ? { version: CONSENT_VERSIONS[key] } : {}) }),
});

function load(account: string) {
  if (entries.has(account)) return;
  entries.set(account, { status: 'loading', records: {} });
  apiJson<Reply>('/api/consent', { headers: { 'X-Account-ID': account } }).then(reply => {
    const records = readConsents(reply?.consents);
    for (const key of CONSENT_KEYS) {
      const record = records[key];
      // Withdrawn on another device: this one forgets it too.
      if (record?.withdrawnAt && record.version === CONSENT_VERSIONS[key]) writeCache(account, key, null);
      // Agreed on this device while its save failed: sent again now.
      else if (!isConsented(records, key) && cachedYes(account, key)) void post(account, key, true).catch(() => undefined);
    }
    entries.set(account, { status: 'ready', records });
    emit();
  }).catch(() => { entries.set(account, { status: 'offline', records: {} }); emit(); });
}

/** Agreed (true), not agreed (false), or not known yet (undefined, while the first answer is on its way). */
export function consentGiven(account: string, key: ConsentKey): boolean | undefined {
  if (cachedYes(account, key)) return true;
  const entry = entries.get(account);
  if (!entry || entry.status === 'loading') return undefined;
  return isConsented(entry.records, key);
}

function settle(account: string, key: ConsentKey, accepted: boolean, reply?: Reply) {
  writeCache(account, key, accepted ? CONSENT_VERSIONS[key] : null);
  const before = entries.get(account)?.records ?? {};
  const records = reply?.consents !== undefined ? readConsents(reply.consents) : before;
  entries.set(account, { status: 'ready', records });
  emit();
}

/** Agrees to the words on screen. `keepIfOffline` lets the terms go on when the save fails (sent again next visit);
 *  เลขากระรอก and LINE need the server's record, so their failure is the caller's to show. */
export async function giveConsent(account: string, key: ConsentKey, options: { keepIfOffline?: boolean } = {}): Promise<void> {
  try {
    settle(account, key, true, await post(account, key, true));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 409) { window.location.reload(); throw error; }
    if (!options.keepIfOffline || (status && status >= 400 && status < 500 && status !== 429)) throw error;
    settle(account, key, true);
  }
}

/** Withdraws เลขากระรอก (LINE is withdrawn by disconnecting it; the terms by deleting the account). */
export async function withdrawConsent(account: string, key: 'ai'): Promise<void> {
  settle(account, key, false, await post(account, key, false));
}

/** The server said the agreement is missing (428): asked again here. */
export function consentMissing(account: string, key: ConsentKey) {
  writeCache(account, key, null);
  const before = entries.get(account)?.records ?? {};
  const { [key]: _gone, ...rest } = before;
  entries.set(account, { status: 'ready', records: rest });
  emit();
}

/** LINE was disconnected (which withdraws its consent on the server). */
export const lineDisconnected = (account: string) => consentMissing(account, 'line');

export function useConsents(account?: string) {
  const version = React.useSyncExternalStore(subscribe, () => tick, () => tick);
  React.useEffect(() => { if (account) load(account); }, [account]);
  return React.useMemo(() => ({
    given: (key: ConsentKey) => (account ? consentGiven(account, key) : undefined),
    record: (key: ConsentKey): ConsentRecord | undefined => (account ? entries.get(account)?.records[key] : undefined),
  }), [account, version]); // eslint-disable-line react-hooks/exhaustive-deps
}
