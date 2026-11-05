import { z } from 'zod';
import { HttpError, withGuard } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { allRewards, codeLimit, deviceHash, enterCode, finishWaiting, loadReferral, rememberDevice, usedCount } from '../repositories/referral.js';
import { rateLimit } from '../security/rateLimit.js';
import { clientIp } from '../security/ingress.js';
import { requireUser } from '../security/session.js';
import { canEnterCode, REFERRAL_TOKENS, REFERRAL_TOTAL, type ReferralEntry, type ReferralStatus } from '../../../shared/referral.js';

// ใส่โค้ด รับ 200 โทเคน (shared/referral.ts). GET: this account's code, how many have entered it, the rewards left, whether
// it may still enter a friend's code (and finishes a first-round entry that was still waiting). POST: enter a friend's
// code; the 200 tokens are given at once. The device's own random id comes in X-Device-ID; only its hash is kept.

const enterSchema = z.object({ code: z.string().min(3).max(24) }).strict();

/**
 * No guessing codes (owner, 2026-11-05: "เครื่องมือสุ่มรหัสหลายๆรอบเพื่อที่จะให้มันได้โทเค็นฟรี ... ห้ามได้เด็ดขาด"). Every
 * try counts, right or wrong: 5 a day for an account, 5 a day for a device, 30 an hour for an internet address. A person
 * enters a code once or twice; a guessing tool is stopped long before it could find one of about a trillion codes.
 */
export const TRY_LIMITS = [
  { scope: 'referral-try-account', limit: 5, seconds: 86_400 },
  { scope: 'referral-try-device', limit: 5, seconds: 86_400 },
  { scope: 'referral-try-ip', limit: 30, seconds: 3_600 },
] as const;
async function countTry(identities: [string, string, string]): Promise<void> {
  try {
    for (const [i, rule] of TRY_LIMITS.entries()) await rateLimit(rule.scope, identities[i], rule.limit, rule.seconds);
  } catch (error) {
    if ((error as { status?: number }).status === 429) {
      throw new HttpError(429, 'กรอกโค้ดหลายครั้งเกินไป เพื่อความปลอดภัย กรุณาลองใหม่ในวันพรุ่งนี้', 'referral_locked');
    }
    throw error;
  }
}
const DEVICE = /^[A-Za-z0-9-]{16,64}$/;

async function publicId(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_profiles').select('public_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as { public_id?: string | null } | null)?.public_id ?? null;
}

async function status(user: { id: string; email_confirmed_at?: string | null }, entry: ReferralEntry | null): Promise<ReferralStatus> {
  const [code, used, limit, rewards] = await Promise.all([publicId(user.id), usedCount(user.id), codeLimit(user.id), allRewards()]);
  const left = Math.max(0, REFERRAL_TOTAL - rewards.length);
  return {
    code, used, tokens: REFERRAL_TOKENS, perPerson: limit, left, total: REFERRAL_TOTAL,
    canEnter: !entry && left > 0 && canEnterCode(user), entered: entry ? { code: entry.code, status: entry.status } : null,
  };
}

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  const device = String(req.headers['x-device-id'] ?? '');
  const hash = DEVICE.test(device) ? deviceHash(device) : null;
  const { entry, devices } = await loadReferral(user.id);
  if (hash) await rememberDevice(user.id, devices, hash);
  if (req.method === 'GET') {
    await rateLimit('referral-read', user.id, 30, 60);
    const current = entry?.status === 'pending' ? await finishWaiting(user.id, entry) : entry;
    res.json(await status(user, current));
    return;
  }
  await rateLimit('referral-enter', user.id, 10, 60);
  const parsed = enterSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'กรุณากรอกโค้ดแนะนำ', 'referral_invalid');
  if (!hash) throw new HttpError(400, 'กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง', 'referral_device_missing');
  if (!canEnterCode(user)) throw new HttpError(403, 'กรุณายืนยันอีเมลก่อนกรอกโค้ด', 'referral_email');
  if (entry) throw new HttpError(409, 'บัญชีนี้กรอกโค้ดไปแล้ว', 'referral_entered');
  await countTry([user.id, hash, clientIp(req)]);
  const saved = await enterCode({ userId: user.id, code: parsed.data.code, deviceHash: hash, entered: entry });
  res.json(await status(user, saved));
}, { csrf: true });
