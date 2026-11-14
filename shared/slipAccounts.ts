// Which bank account a slip belongs to, and whether that slip was already recorded (owner, 2026-11-14: "แยกสลิปไว้แบบ
// เป็นระเบียบ ... ธนาคารกรุงไทย K-Bank ไทยพาณิชย์ ... เพื่อแบบว่ามันเป็นของคนละบัญชี"; agreed: by account, not by bank,
// shown as "KBank •1234", named by the person, and a slip sent twice is pointed out before it is saved again).
// Only the bank and the last four digits of the person's OWN account are kept (the side of the slip that is theirs);
// never a full account number. The slip's reference number (เลขที่รายการ) is what makes a slip the same slip.

export type SlipAccount = { bank: string; last4: string };

/** Banks a Thai slip can come from, by the codes the app's bank list uses (frontend/src/features/invoices/thaiBanks.ts). */
export const SLIP_BANKS = ['BBL', 'KBANK', 'KTB', 'SCB', 'TTB', 'BAY', 'UOB', 'CIMB', 'LHBANK', 'TISCO', 'KKP', 'ICBC', 'SCBT', 'GSB', 'GHB', 'BAAC', 'ISBT'] as const;
export type SlipBank = typeof SLIP_BANKS[number];
/** How a bank is written next to the digits: the short names people use. */
const SHORT: Record<string, string> = {
  BBL: 'กรุงเทพ', KBANK: 'KBank', KTB: 'กรุงไทย', SCB: 'SCB', TTB: 'ttb', BAY: 'กรุงศรี', UOB: 'UOB', CIMB: 'CIMB', LHBANK: 'LH Bank',
  TISCO: 'TISCO', KKP: 'KKP', ICBC: 'ICBC', SCBT: 'SC', GSB: 'ออมสิน', GHB: 'ธอส.', BAAC: 'ธ.ก.ส.', ISBT: 'อิสลาม',
};

export const isSlipBank = (value: unknown): value is SlipBank => typeof value === 'string' && (SLIP_BANKS as readonly string[]).includes(value);

/** A slip account as it can be kept: a known bank and exactly four digits. */
export function slipAccountOf(bank: unknown, last4: unknown): SlipAccount | null {
  const digits = typeof last4 === 'string' ? last4.replace(/\D/g, '') : '';
  return isSlipBank(bank) && /^\d{4}$/.test(digits) ? { bank, last4: digits } : null;
}

/** The slip's reference number as compared: letters and digits only, upper case; null when it is not one. */
export function slipRefOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ref = value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ref.length >= 6 && ref.length <= 40 ? ref : null;
}

export const accountKey = (account: SlipAccount) => `${account.bank}:${account.last4}`;

/** "KBank •1234", or the name the person gave it. */
export function accountLabel(account: SlipAccount, names?: Record<string, string> | null): string {
  const named = names?.[accountKey(account)]?.trim();
  return named || `${SHORT[account.bank] ?? account.bank} •${account.last4}`;
}

type WithSlip = { id?: string; name?: unknown; account?: unknown; slipRef?: unknown; slipRefs?: unknown };
const asAccount = (value: unknown): SlipAccount | null => {
  const row = value as Partial<SlipAccount> | null;
  return row && typeof row === 'object' ? slipAccountOf(row.bank, row.last4) : null;
};

/** The accounts the records came from, most used first. */
export function accountsInUse(...lists: readonly (readonly WithSlip[] | undefined)[]): { account: SlipAccount; count: number }[] {
  const seen = new Map<string, { account: SlipAccount; count: number }>();
  for (const list of lists) for (const row of list ?? []) {
    const account = asAccount(row.account);
    if (!account) continue;
    const entry = seen.get(accountKey(account)) ?? { account, count: 0 };
    entry.count += 1;
    seen.set(accountKey(account), entry);
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || accountKey(a.account).localeCompare(accountKey(b.account)));
}

/** The record's account, when it has one the app can show. */
export const recordAccount = (row: WithSlip): SlipAccount | null => asAccount(row.account);

/** The expense or job that already holds this slip's reference number (a slip sent twice), if any. */
export function slipAlreadyRecorded(ref: string | null, expenses: readonly WithSlip[] = [], jobs: readonly WithSlip[] = [], except?: string): { kind: 'expense' | 'job'; id: string; name: string } | null {
  if (!ref) return null;
  for (const row of expenses) if (row.id !== except && slipRefOf(row.slipRef) === ref) return { kind: 'expense', id: String(row.id), name: String(row.name ?? '') };
  for (const row of jobs) {
    if (row.id === except) continue;
    const refs = Array.isArray(row.slipRefs) ? row.slipRefs : [];
    if (refs.some(item => slipRefOf(item) === ref)) return { kind: 'job', id: String(row.id), name: String(row.name ?? '') };
  }
  return null;
}
