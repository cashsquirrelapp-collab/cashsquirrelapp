// Free เลขากระรอก tokens for new accounts (owner, 2026-11-05: "อยากแจกโทเค็นให้ใช้น้องกระรอกฟรีทุกบัญชีเลยที่สมัครมาใหม่
// คนละ200โทเค็น", from accounts created on 5 Nov 2569 on): 200 Krarok Tokens each, once, never refilled, counted in a bucket
// of their own named after the Bangkok day the account was made (the usage table takes 'YYYY-MM-DD'). The charge is
// capped at what is left (cashflow_ai_settle_capped), so an account can never use more than 200. Pro, a Pro that has
// ended, a ban and a tester's own tokens all come first (supabaseDb.assistantPlan).

export const SIGNUP_TOKENS = 200;
/** Accounts created from this moment get the tokens: the start of 5 Nov 2569 in Bangkok. */
export const SIGNUP_TOKENS_FROM = Date.parse('2026-11-05T00:00:00+07:00');

const BANGKOK = 7 * 3600_000;

/** The tokens a new account gets, or null for an account made before the start (or with no readable creation time). */
export function signupTokens(createdAt: string | null | undefined): { tokens: number; bucket: string } | null {
  const made = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(made) || made < SIGNUP_TOKENS_FROM) return null;
  return { tokens: SIGNUP_TOKENS, bucket: new Date(made + BANGKOK).toISOString().slice(0, 10) };
}
