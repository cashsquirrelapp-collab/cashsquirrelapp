import { isReferralCode, normalizeCode, type ReferralStatus } from '../../../shared/referral';
import { apiJson } from './api';

// ใส่โค้ด รับ 200 โทเคน (shared/referral.ts): this device's own random id (the server keeps only its hash, so one device
// enters a friend's code once), the code a shared link brought (?ref=SQ-…), and the calls.

/** Sent when this account has just been given tokens, so เลขากระรอก turns on without a reload. */
export const TOKENS_GRANTED_EVENT = 'krarok:tokens-granted';

const DEVICE_KEY = 'krarok_device';
const REF_KEY = 'krarok_ref';
let fallbackDevice = '';

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    if (!fallbackDevice) fallbackDevice = crypto.randomUUID();
    return fallbackDevice;
  }
}

/** A link like krarok.com/?ref=SQ-… keeps its code on this device until the new account is ready to enter it. */
export function rememberSharedCode(search = window.location.search): void {
  const ref = new URLSearchParams(search).get('ref');
  if (!ref || !isReferralCode(ref)) return;
  try { localStorage.setItem(REF_KEY, normalizeCode(ref)); } catch { /* typed by hand instead */ }
}
export function sharedCode(): string {
  try { return localStorage.getItem(REF_KEY) ?? ''; } catch { return ''; }
}

const headers = (account: string) => ({ 'X-Account-ID': account, 'X-Device-ID': deviceId() });
export async function readReferral(account: string): Promise<ReferralStatus | null> {
  try { return await apiJson<ReferralStatus>('/api/referral', { headers: headers(account) }); } catch { return null; }
}
/** Enters a friend's code. Throws with the server's words and code when it cannot be counted. */
export function enterReferral(account: string, code: string): Promise<ReferralStatus> {
  return apiJson<ReferralStatus>('/api/referral', { method: 'POST', headers: headers(account), body: JSON.stringify({ code: normalizeCode(code) }) });
}
