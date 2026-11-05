import { z } from 'zod';
import { HttpError, withGuard } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { allRewards, deviceHash, enterCode, entriesFor, loadReferral, rememberDevice, rewardIfReady } from '../repositories/referral.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { isNewMember as newMember, REFERRAL_PER_PERSON, REFERRAL_TOKENS, REFERRAL_TOTAL, type ReferralEntry, type ReferralStatus } from '../../../shared/referral.js';

// ชวนเพื่อน รับ 200 โทเคน (shared/referral.ts). GET: this account's code, its friends so far, the rewards left, whether it
// may still enter a friend's code (and gives the friend its tokens once this account has its first record). POST: enter a
// friend's code. The device's own random id comes in X-Device-ID; only its hash is kept.

const enterSchema = z.object({ code: z.string().min(3).max(24) }).strict();
const DEVICE = /^[A-Za-z0-9-]{16,64}$/;

async function publicId(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_profiles').select('public_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as { public_id?: string | null } | null)?.public_id ?? null;
}

async function status(user: { id: string; created_at?: string; email_confirmed_at?: string | null }, entry: ReferralEntry | null): Promise<ReferralStatus> {
  const [code, mine, rewards] = await Promise.all([publicId(user.id), entriesFor(user.id), allRewards()]);
  const left = Math.max(0, REFERRAL_TOTAL - rewards.length);
  return {
    code, rewarded: mine.filter(e => e.status === 'rewarded').length, pending: mine.filter(e => e.status === 'pending').length,
    tokens: REFERRAL_TOKENS, perPerson: REFERRAL_PER_PERSON, left, total: REFERRAL_TOTAL,
    canEnter: !entry && left > 0 && newMember(user), entered: entry ? { code: entry.code, status: entry.status } : null,
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
    const current = entry?.status === 'pending' ? await rewardIfReady(user.id, entry) : entry;
    res.json(await status(user, current));
    return;
  }
  await rateLimit('referral-enter', user.id, 10, 60);
  const parsed = enterSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'กรุณากรอกโค้ดของเพื่อน', 'referral_invalid');
  if (!hash) throw new HttpError(400, 'กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง', 'referral_device_missing');
  if (!newMember(user)) throw new HttpError(403, 'กรอกโค้ดได้เฉพาะบัญชีที่สมัครใหม่และยืนยันอีเมลแล้ว', 'referral_not_new');
  const saved = await enterCode({ userId: user.id, code: parsed.data.code, deviceHash: hash, entered: entry });
  res.json(await status(user, saved));
}, { csrf: true });
