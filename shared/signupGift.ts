import { REFERRAL_FROM } from './referral.js';

// The 200 free เลขากระรอก tokens new accounts had for a few hours on 5 Nov 2569 (owner: "แจกโทเค็นให้ใช้น้องกระรอกฟรีทุก
// บัญชีเลยที่สมัครมาใหม่คนละ200โทเค็น"), until ชวนเพื่อน รับ 200 โทเคน replaced it (shared/referral.ts: "ปิดแจกอัตโนมัติตอน
// แคมเปญขึ้น"). Accounts made in that window keep them; later accounts earn tokens by inviting friends.

export const SIGNUP_GIFT_TOKENS = 200;
/** The window: from the start of 5 Nov 2569 in Bangkok until the campaign began. */
export const SIGNUP_GIFT_FROM = Date.parse('2026-11-05T00:00:00+07:00');
export const SIGNUP_GIFT_UNTIL = REFERRAL_FROM;

/** Whether an account, by when it was made, had the automatic tokens. */
export function hadSignupGift(createdAt: string | null | undefined): boolean {
  const made = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(made) && made >= SIGNUP_GIFT_FROM && made < SIGNUP_GIFT_UNTIL;
}
