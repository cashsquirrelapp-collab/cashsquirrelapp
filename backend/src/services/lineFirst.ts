import { createHmac } from 'node:crypto';
import { LINE_ONLY_DOMAIN } from '../../../shared/lineAccount.js';

// LINE as the main channel (owner, 2026-11-13): people add the LINE OA and start there. Two Worker settings switch it on,
// so the real site keeps working exactly as today until the owner says "ขึ้นได้" (after Gemini is topped up in December):
//   LINE_SIGNUP=enabled       a new friend gets a เริ่มใช้งาน card and signs up inside LINE (name + work type, no email)
//   FREE_MONTHLY_TOKENS=200   accounts without Pro chat with เลขา on this many tokens a month (app and LINE share them)

type Env = Record<string, unknown>;

export function lineSignupOn(env: Env = process.env): boolean {
  return env.LINE_SIGNUP === 'enabled';
}

/** The monthly allowance of an account without Pro; 0 = off (the default: เลขา stays a Pro feature). */
export function freeMonthlyTokens(env: Env = process.env): number {
  const tokens = Number(env.FREE_MONTHLY_TOKENS);
  return Number.isInteger(tokens) && tokens > 0 && tokens <= 2000 ? tokens : 0;
}

/** The usage bucket of a free month: the first day of the Bangkok calendar month, so it refills on the 1st. */
export function freeBucket(now = new Date()): string {
  return `${new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 7)}-01`;
}

/**
 * The account address of a LINE user who signed up in LINE: derived from the LINE user ID with a server key, so a retry
 * finds the same account and the address says nothing about who it is.
 */
export function lineOnlyEmail(lineUserId: string, key: string): string {
  if (!key) throw new Error('A key is needed for LINE accounts');
  return `u${createHmac('sha256', key).update(`line-account:${lineUserId}`).digest('hex').slice(0, 32)}@${LINE_ONLY_DOMAIN}`;
}
