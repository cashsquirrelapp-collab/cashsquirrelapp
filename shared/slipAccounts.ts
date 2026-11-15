// Which bank account a slip belongs to, and whether that slip was already recorded (owner, 2026-11-14: "แยกสลิปไว้แบบ
// เป็นระเบียบ ... ธนาคารกรุงไทย K-Bank ไทยพาณิชย์ ... เพื่อแบบว่ามันเป็นของคนละบัญชี"; agreed: by account, not by bank,
// shown as "KBank •1234", named by the person, and a slip sent twice is pointed out before it is saved again).
// Only the bank and the last four digits of the person's OWN account are kept (the side of the slip that is theirs);
// never a full account number. The slip's reference number (เลขที่รายการ) is what makes a slip the same slip.

export type SlipAccount = { bank: string; last4: string };

/**
 * Every bank in Thailand a slip can come from (owner, 2026-11-15: "เอาทั้งหมดของประเทศไทยที่มีเลยนะ"): the Thai commercial
 * banks, the foreign banks with a branch in Thailand, the state banks, and the e-wallets slips are made from. Codes follow
 * the app's bank list where it has one (frontend/src/features/invoices/thaiBanks.ts; SME D is SMED here).
 */
export const SLIP_BANKS = ['BBL', 'KBANK', 'KTB', 'SCB', 'TTB', 'BAY', 'UOB', 'CIMB', 'LHBANK', 'TISCO', 'KKP', 'ICBC', 'TCRB', 'SCBT', 'BOC', 'SMTB',
  'CITI', 'HSBC', 'SMBC', 'MIZUHO', 'DB', 'JPM', 'BNP', 'BOFA', 'IOB', 'MEGA', 'OCBC', 'RHB',
  'GSB', 'GHB', 'BAAC', 'EXIM', 'SMED', 'ISBT', 'TMN', 'SPAY'] as const;
export type SlipBank = typeof SLIP_BANKS[number];
/** How a bank is written next to the digits: the short names people use. */
const SHORT: Record<string, string> = {
  BBL: 'กรุงเทพ', KBANK: 'KBank', KTB: 'กรุงไทย', SCB: 'SCB', TTB: 'ttb', BAY: 'กรุงศรี', UOB: 'UOB', CIMB: 'CIMB', LHBANK: 'LH Bank',
  TISCO: 'TISCO', KKP: 'KKP', ICBC: 'ICBC', TCRB: 'ไทยเครดิต', SCBT: 'SC', BOC: 'Bank of China', SMTB: 'SMTB', CITI: 'Citi', HSBC: 'HSBC', SMBC: 'SMBC',
  MIZUHO: 'Mizuho', DB: 'Deutsche', JPM: 'JPMorgan', BNP: 'BNP', BOFA: 'BofA', IOB: 'IOB', MEGA: 'Mega ICBC', OCBC: 'OCBC', RHB: 'RHB',
  GSB: 'ออมสิน', GHB: 'ธอส.', BAAC: 'ธ.ก.ส.', EXIM: 'EXIM', SMED: 'SME D',
  ISBT: 'อิสลาม', TMN: 'TrueMoney', SPAY: 'ShopeePay',
};

/**
 * The bank a slip names, read from what is printed on it (its name in Thai or English, or the bank's app): the code comes
 * from this table, never from the AI's guess (owner, 2026-11-15: "มึงแน่ใจ for sure นะว่าอันไหนของธนาคารไหน"). Ordered so
 * that a longer name is tried before one it contains (Standard Chartered before SCB).
 */
const BANK_NAMES: [SlipBank, RegExp][] = [
  ['SCBT', /สแตนดาร์ด\s*ชาร์เตอร์ด|standard\s*chartered|\bscbt\b/i],
  ['SCB', /ไทยพาณิชย์|siam\s*commercial|\bscb\b|scb\s*easy/i],
  ['KBANK', /กสิกร|kasikorn|\bk\s?bank\b|\bk\s?plus\b|\bk\+|line\s*bk|make\s*by\s*kbank/i],
  ['BBL', /กรุงเทพ|bangkok\s*bank|\bbbl\b|bualuang|บัวหลวง/i],
  ['KTB', /กรุงไทย|krung\s*thai|\bktb\b|เป๋าตัง|paotang/i],
  ['TTB', /ทหารไทย|ธนชาต|ทีทีบี|\bttb\b|\btmb\b|thanachart/i],
  ['BAY', /กรุงศรี|krungsri|ayudhya|ayutthaya|\bbay\b/i],
  ['UOB', /ยูโอบี|\buob\b|\btmrw\b/i],
  ['CIMB', /ซีไอเอ็มบี|\bcimb\b/i],
  ['LHBANK', /แลนด์\s*แอนด์\s*เฮ้?าส์|land\s*(?:and|&)\s*houses?|\blh\s*bank\b/i],
  ['TISCO', /ทิสโก้|\btisco\b/i],
  ['KKP', /เกียรตินาคิน|kiatnakin|\bkkp\b|\bdime!?(?=\s|$)/i],
  ['MEGA', /เมกะ\s*สากลพาณิชย์|mega\s*international|mega\s*icbc/i],
  ['ICBC', /ไอซีบีซี|\bicbc\b/i],
  ['TCRB', /ไทยเครดิต|thai\s*credit|\btcrb\b/i],
  ['BOC', /แห่งประเทศจีน|bank\s*of\s*china/i],
  ['SMTB', /ซูมิโตโม\s*มิตซุย\s*ทรัสต์|sumitomo\s*mitsui\s*trust|\bsmtb\b/i],
  ['CITI', /ซิตี้แบงก์|citi\s*bank|\bcitibank\b/i],
  ['HSBC', /เอชเอสบีซี|\bhsbc\b/i],
  ['SMBC', /ซูมิโตโม|sumitomo|\bsmbc\b/i],
  ['MIZUHO', /มิซูโฮ|mizuho/i],
  ['DB', /ดอยซ์|deutsche\s*bank/i],
  ['JPM', /เจพี\s*มอร์แกน|j\.?\s*p\.?\s*morgan/i],
  ['BNP', /บีเอ็นพี|bnp\s*paribas/i],
  ['BOFA', /แห่งอเมริกา|bank\s*of\s*america|\bbofa\b/i],
  ['IOB', /อินเดียน\s*โอเวอร์ซีส์|indian\s*overseas|\biob\b/i],
  ['OCBC', /โอซีบีซี|oversea-?\s*chinese|\bocbc\b/i],
  ['RHB', /อาร์เอชบี|\brhb\b/i],
  ['GSB', /ออมสิน|government\s*savings|\bgsb\b|\bmymo\b/i],
  ['GHB', /อาคารสงเคราะห์|ธอส|government\s*housing|\bghb\b|\bgh\s*bank\b/i],
  ['BAAC', /ธ\.\s*ก\.\s*ส\.?|ธกส(?![\u0E00-\u0E7F])|เพื่อการเกษตรและสหกรณ์|\bbaac\b/i],
  ['EXIM', /เพื่อการส่งออกและนำเข้า|\bexim\b/i],
  ['SMED', /พัฒนาวิสาหกิจ|\bsme\s*d\b|sme\s*development/i],
  ['ISBT', /อิสลามแห่งประเทศไทย|islamic\s*bank|\bibank\b|\bisbt\b/i],
  ['TMN', /ทรู\s*มันนี่|true\s*money/i],
  ['SPAY', /ช้อปปี้\s*เพย์|shopee\s*pay/i],
];
/** The bank a printed name points to, or null when it names none of them (then no account is kept). */
export function bankFromText(text: unknown): SlipBank | null {
  if (typeof text !== 'string') return null;
  const value = text.normalize('NFC').trim();
  if (!value || value.length > 80) return null;
  return BANK_NAMES.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

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
