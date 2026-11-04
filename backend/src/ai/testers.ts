import { createHash } from 'node:crypto';

// Friends trying เลขากระรอก before it opens to them (owner, 2026-11-04: "บัญชีละ 200 โทเคนเพื่อทดลองใช้เลขากระรอก ห้ามเกิน
// เด็ดขาด เอาไว้ให้เพื่อนทดลองใช้และก็รอรับฟีดแบค"): 200 Krarok Tokens each, once, never refilled, counted in a bucket of their
// own so nothing used before counts against it. The charge is capped at what is left (cashflow_ai_settle_capped), so an
// account can never be charged past 200. Kept as SHA-256 of each account's public ID (SQ-…): this repository is public.

const TESTERS = new Set([
  'e075d9f23eb60d49f844fcff29460773e6c9f756b652d1e76f70ae0f31586b32',
  '94e81690563e0667d2eaf7e117c908785d8f6d1b2624bb267e43bf4d40b9a999',
  '2e173b57aadc3dc24dd4b9541e37ab9367af4843006b21274512a840bc2135de',
]);

export const TESTER_TOKENS = 200;
/** The usage table's cycle_key takes 'YYYY-MM-DD': the day the tokens were given. */
export const TESTER_BUCKET = '2026-11-04';

export function isTesterPublicId(publicId: string | null | undefined): boolean {
  if (!publicId) return false;
  return TESTERS.has(createHash('sha256').update(publicId.trim().toUpperCase()).digest('hex'));
}
