// What an account has agreed to, and when (owner, 2026-11-05: "อะไรที่มันเป็นข้อมูลที่เซนซิทีฟทุกจุด ... ให้เขายืนยันหรือยินยอม
// เราก่อน ... ข้อมูลของ AI เองอาจจะมีข้อผิดพลาดในการตอบ ... เขียนแจ้งเตือนหรือให้เขากดยินยอม"). The privacy policy names
// consent as the legal basis for เลขากระรอก and for LINE; these are the records of it, kept on the server per account
// (cashflow_private_state.consents, written only by the server) with the version of the words that was shown.
//
// terms: the terms of use and the privacy policy, and that the client data the person records is theirs to use.
// ai: เลขากระรอก (in the app, by voice and in LINE): what is sent to the AI service, and that answers can be wrong.
// line: connecting LINE: the LINE user id kept, notifications and cards sent through LINE.

export const CONSENT_KEYS = ['terms', 'ai', 'line'] as const;
export type ConsentKey = typeof CONSENT_KEYS[number];

/** The version of each text. A new version asks every account again. */
export const CONSENT_VERSIONS: Record<ConsentKey, string> = { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' };

/** The terms are asked once, when the account is new (owner, 2026-11-05: "ถามแค่ครั้งเดียวพอตอนที่เขาเพิ่งสมัครมาใหม่ ไม่ต้อง
 *  ถามทุกครั้งเวลาเปิดเว็บไซต์"): accounts made from the day the terms dialog began. Older accounts are not stopped by it;
 *  เลขากระรอก and LINE still ask for their own consent once, the first time they are used (the server requires it). */
export const TERMS_FROM = Date.parse('2026-11-05T00:00:00+07:00');
export function asksTerms(createdAt?: string | null): boolean {
  const made = Date.parse(createdAt ?? '');
  return Number.isFinite(made) && made >= TERMS_FROM;
}

export interface ConsentRecord { version: string; at: string; withdrawnAt?: string }
export type ConsentRecords = Partial<Record<ConsentKey, ConsentRecord>>;

const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** The records as stored; anything malformed is left out (it then counts as not agreed). */
export function readConsents(raw: unknown): ConsentRecords {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ConsentRecords = {};
  for (const key of CONSENT_KEYS) {
    const value = (raw as Record<string, unknown>)[key] as Partial<ConsentRecord> | undefined;
    if (!value || typeof value.version !== 'string' || !isDate(value.at)) continue;
    out[key] = { version: value.version.slice(0, 20), at: value.at, ...(isDate(value.withdrawnAt) ? { withdrawnAt: value.withdrawnAt } : {}) };
  }
  return out;
}

/** Agreed to the current words and not withdrawn. */
export const isConsented = (records: ConsentRecords, key: ConsentKey) => {
  const record = records[key];
  return Boolean(record && record.version === CONSENT_VERSIONS[key] && !record.withdrawnAt);
};

/** The records after agreeing (the current version, now) or withdrawing (the agreement kept, with when it was withdrawn). */
export function withConsent(records: ConsentRecords, key: ConsentKey, accepted: boolean, now = new Date()): ConsentRecords {
  const at = now.toISOString();
  if (accepted) return { ...records, [key]: { version: CONSENT_VERSIONS[key], at } };
  const current = records[key];
  return current ? { ...records, [key]: { ...current, withdrawnAt: at } } : records;
}
