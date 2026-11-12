import React from 'react';
import { NO_LABS, isLabId, type LabFeatureId, type LabState } from '../../../shared/labs';
import { apiJson } from './api';

// Settings › ฟีเจอร์ทดลอง (shared/labs.ts): this account's state, read once per account and shared by every screen that
// asks. An answer that cannot be read counts as not a tester, so nothing experimental shows by mistake.

const states = new Map<string, LabState>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function read(value: unknown): LabState {
  const labs = (value as { labs?: unknown } | null)?.labs as { tester?: unknown; on?: unknown } | undefined;
  if (!labs || labs.tester !== true) return NO_LABS;
  return { tester: true, on: Array.isArray(labs.on) ? labs.on.filter(isLabId) : [] };
}

function load(account: string) {
  if (states.has(account) || loading.has(account)) return;
  loading.add(account);
  apiJson<unknown>('/api/labs', { headers: { 'X-Account-ID': account } })
    .then(reply => { states.set(account, read(reply)); })
    .catch(() => { states.set(account, NO_LABS); })
    .finally(() => { loading.delete(account); emit(); });
}

/** This account's ฟีเจอร์ทดลอง (NO_LABS while loading, for guests, and when it cannot be read). */
export function useLabs(account: string | null | undefined): LabState {
  React.useEffect(() => { if (account) load(account); }, [account]);
  return React.useSyncExternalStore(subscribe, () => (account ? states.get(account) ?? NO_LABS : NO_LABS), () => NO_LABS);
}

/** A tester turns one built feature on or off for itself; the server's answer replaces the state. */
export async function setLabFeature(account: string, feature: LabFeatureId, on: boolean): Promise<LabState> {
  const reply = await apiJson<unknown>('/api/labs', { method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ feature, on }) });
  const next = read(reply);
  states.set(account, next);
  emit();
  return next;
}
