// ชวนเพื่อน รับ 200 โทเคน (owner, 2026-11-05: "จะทำโทเคนได้ก็ต่อเมื่อเอาโค้ดไปให้บัญชีอื่นกรอก ... คนที่ชวนจะได้ 200 โทเคน
// คนที่โดนชวนจะไม่ได้ ถ้าอยากได้ต้องไปชวนอีกคน ... บัญชีห้ามซ้ำคนเดิมเด็ดขาด"; design B, the orange banner).
// Every account's code is its public ID (SQ-XXXXXXXXXX). A new account (made after the campaign began, email confirmed)
// enters one friend's code, once; the friend gets 200 Krarok Tokens (a token grant) once this account has recorded its
// first job or expense. One code is entered by 2 people at most (owner: "โค้ดหนึ่งสามารถกรอกได้แค่2คน"), 100 rewards in the
// whole campaign. One device enters a code once, and never the code of an account that has used that device ("เช็คเครื่อง
// ได้เลย"). The card follows Fastwork's invite card (owner's reference): the code large, one copy button, no LINE.

export const REFERRAL_TOKENS = 200;
export const REFERRAL_PER_PERSON = 2;
export const REFERRAL_TOTAL = 100;
/** Accounts made from this moment can enter a friend's code; the automatic 200 for new accounts ends here. */
export const REFERRAL_FROM = Date.parse('2026-11-05T15:25:00+07:00');

export type ReferralState = 'pending' | 'rewarded' | 'refused';
/** The code an account entered, kept under referral in its private state (server code only). */
export interface ReferralEntry {
  code: string;
  referrerId: string;
  at: string;
  /** SHA-256 of the device's own random id (never the id itself). */
  device: string;
  status: ReferralState;
  rewardedAt?: string;
  /** Why no reward came (the campaign or the friend's 10 were full). */
  reason?: 'campaign_full' | 'referrer_full';
}

const CODE = /^SQ-[0-9A-F]{10}$/;
export const normalizeCode = (text: string) => text.trim().toUpperCase().replace(/\s+/g, '');
export const isReferralCode = (text: string) => CODE.test(normalizeCode(text));

export function readEntry(value: unknown): ReferralEntry | null {
  const item = value as Partial<ReferralEntry> | null;
  if (!item || typeof item !== 'object') return null;
  if (typeof item.code !== 'string' || !CODE.test(item.code) || typeof item.referrerId !== 'string' || typeof item.device !== 'string') return null;
  if (typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))) return null;
  if (!['pending', 'rewarded', 'refused'].includes(String(item.status))) return null;
  return {
    code: item.code, referrerId: item.referrerId, at: item.at, device: item.device, status: item.status as ReferralState,
    ...(typeof item.rewardedAt === 'string' && Number.isFinite(Date.parse(item.rewardedAt)) ? { rewardedAt: item.rewardedAt } : {}),
    ...(item.reason === 'campaign_full' || item.reason === 'referrer_full' ? { reason: item.reason } : {}),
  };
}

/** The entries that hold one of a code's 2 places (waiting or rewarded), first first (time, then account id). */
export function rankEntries(rows: { userId: string; entry: ReferralEntry | null }[]): { userId: string; at: string }[] {
  return rows.filter(row => row.entry && row.entry.status !== 'refused')
    .map(row => ({ userId: row.userId, at: row.entry!.at }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/** Rewards in the order they were given (time, then account id, so every reader agrees on who came first). */
export function rankRewards(rows: { userId: string; entry: ReferralEntry | null }[]): { userId: string; referrerId: string; at: string }[] {
  return rows.filter(row => row.entry?.status === 'rewarded' && row.entry.rewardedAt)
    .map(row => ({ userId: row.userId, referrerId: row.entry!.referrerId, at: row.entry!.rewardedAt! }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/** What the app shows for one account. */
export interface ReferralStatus {
  code: string | null;
  /** Friends who brought this account its tokens, and friends who entered the code but have not recorded anything yet. */
  rewarded: number;
  pending: number;
  tokens: number;
  perPerson: number;
  /** Rewards left in the whole campaign. */
  left: number;
  total: number;
  /** This account may still enter a friend's code. */
  canEnter: boolean;
  /** The code it entered, and what came of it. */
  entered: { code: string; status: ReferralState } | null;
}

/** A new member for this campaign: made after it began, with a confirmed email (Google and Facebook sign-ins are). */
export const isNewMember = (user: { created_at?: string | null; email_confirmed_at?: string | null }) =>
  Boolean(user.email_confirmed_at) && Number.isFinite(Date.parse(user.created_at ?? '')) && Date.parse(user.created_at!) >= REFERRAL_FROM;

export const shareLink = (origin: string, code: string) => `${origin}/?ref=${encodeURIComponent(code)}`;
export const shareText = (origin: string, code: string) =>
  `ลองใช้แอปกระรอกตุนเงิน ช่วยจดงาน ตามเงินลูกค้า และสรุปการเงินให้ฟรีแลนซ์ สมัครแล้วกรอกโค้ดของผม ${code} ให้หน่อยนะ ${shareLink(origin, code)}`;
