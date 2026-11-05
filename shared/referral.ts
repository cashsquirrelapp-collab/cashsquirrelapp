// ใส่โค้ด รับ 200 โทเคน, ส่งต่อให้เพื่อน (owner, 2026-11-05, round 2: "กูอยากให้มันมีปุ่มให้ใส่โค้ด ... ใส่โค้ดเพื่อรับ ...
// โค้ดกูจะได้ประมาณสัก 5 สิทธิ์ ... การตลาดแบบว่าเป็นการแนะนำกันต่อกันเอง ... awareness ... สิทธิพิเศษที่เขาจะได้ก็คือได้รับ
// 200 โทเค็นให้ใช้ฟรี"). Every account's code is its public ID (SQ-XXXXXXXXXX). Any account with a confirmed email enters
// one friend's code, once, and gets 200 Krarok Tokens (a token grant) at once; the friend gets nothing, the gift is what
// they pass on. One code is entered by 5 people (the owner's own too: "ตัวนี้จะใส่ได้แค่ 5 สิทธิ์เท่านั้น"), 100 rewards in
// the whole campaign. One device enters a code once, and never the code of an account that has used that device.
// No guessing ("เครื่องมือสุ่มรหัส ... ห้ามได้เด็ดขาด"): every try counts, 5 a day per account and per device, 30 an hour
// per internet address (backend/src/handlers/referral.ts), and a code counts only for a real, live account.
// The first round (until 2026-11-05 16:xx) gave the tokens to the one who invited, 2 people a code: entries from it that
// were still waiting are finished the new way (the one who entered gets the tokens).

export const REFERRAL_TOKENS = 200;
export const REFERRAL_PER_PERSON = 5;
export const REFERRAL_TOTAL = 100;
/** The automatic 200 for new accounts ended here, when the invite campaign began (shared/signupGift.ts). */
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
  /** Why no reward came (the campaign or the code was full). */
  reason?: 'campaign_full' | 'referrer_full';
}

const CODE = /^SQ-[0-9A-F]{10}$/;
/**
 * The code in whatever was typed or pasted (owner, 2026-11-05: pasting over a field that already said "SQ-" made
 * "SQ-SQ-…"): spaces dropped, upper case, the first SQ code found (with or without its dash, even inside other words),
 * or the 10 characters alone with SQ- put in front.
 */
export function normalizeCode(text: string): string {
  const flat = text.toUpperCase().replace(/\s+/g, '');
  const found = /SQ-?([0-9A-F]{10})(?![0-9A-F])/.exec(flat);
  if (found) return `SQ-${found[1]}`;
  if (/^[0-9A-F]{10}$/.test(flat)) return `SQ-${flat}`;
  return flat;
}
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

/** The entries that hold one of a code's places (waiting or rewarded), first first (time, then account id). */
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
  /** How many have entered this account's code. */
  used: number;
  tokens: number;
  /** How many may enter this code (5 for every code today); null would mean no limit. */
  perPerson: number | null;
  /** Rewards left in the whole campaign. */
  left: number;
  total: number;
  /** This account may still enter a friend's code. */
  canEnter: boolean;
  /** The code it entered, and what came of it. */
  entered: { code: string; status: ReferralState } | null;
}

/** Who may enter a code: an account with a confirmed email (Google and Facebook sign-ins are), new or not. */
export const canEnterCode = (user: { email_confirmed_at?: string | null }) => Boolean(user.email_confirmed_at);

export const shareLink = (origin: string, code: string) => `${origin}/?ref=${encodeURIComponent(code)}`;
export const shareText = (origin: string, code: string) =>
  `ลองใช้แอปกระรอกตุนเงิน ช่วยจดงาน ตามเงินลูกค้า และสรุปการเงินให้ฟรีแลนซ์ กรอกโค้ดแนะนำ ${code} รับ 200 โทเคนใช้เลขากระรอกฟรี ${shareLink(origin, code)}`;
