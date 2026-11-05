import { hadSignupGift, SIGNUP_GIFT_FROM, SIGNUP_GIFT_TOKENS } from '../../../shared/signupGift.js';

// The automatic 200 tokens of the morning of 5 Nov 2569 (shared/signupGift.ts): once, never refilled, counted in a bucket
// of their own named after the Bangkok day the account was made (the usage table takes 'YYYY-MM-DD'); the charge is
// capped at what is left (cashflow_ai_settle_capped). Pro, a Pro that has ended, a ban and a tester's own tokens all come
// first (supabaseDb.assistantPlan). Later accounts earn tokens by inviting friends (shared/referral.ts, token grants).

export const SIGNUP_TOKENS = SIGNUP_GIFT_TOKENS;
export const SIGNUP_TOKENS_FROM = SIGNUP_GIFT_FROM;

const BANGKOK = 7 * 3600_000;

/** The tokens an account made in the window has, or null for any other account. */
export function signupTokens(createdAt: string | null | undefined): { tokens: number; bucket: string } | null {
  if (!hadSignupGift(createdAt)) return null;
  return { tokens: SIGNUP_TOKENS, bucket: new Date(Date.parse(createdAt!) + BANGKOK).toISOString().slice(0, 10) };
}
