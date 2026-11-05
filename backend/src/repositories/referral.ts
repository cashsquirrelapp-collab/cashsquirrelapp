import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from './accounts.js';
import { addTokenGrant } from './tokenGrants.js';
import { HttpError } from '../http/guard.js';
import { isOwnerAccount } from '../security/adminAnalyticsAccess.js';
import { normalizeCode, rankEntries, rankRewards, readEntry, REFERRAL_PER_PERSON, REFERRAL_TOKENS, REFERRAL_TOTAL, type ReferralEntry } from '../../../shared/referral.js';

// ใส่โค้ด รับ 200 โทเคน (shared/referral.ts), kept in cashflow_private_state, a table only server code reads or writes:
// the code an account entered under referral, the devices an account has used under referralDevices (hashes, at most 5).
// No new table, so no SQL to run. The limits hold without a lock: an entry is written, then every entry is read back and
// ranked; one past the code's 5 or the campaign's 100 is turned back at once, before any token is given.

const MAX_DEVICES = 5;
export const deviceHash = (deviceId: string) => createHash('sha256').update(`krarok-referral:${deviceId}`).digest('hex');

type Row = { user_id: string; entry?: unknown; devices?: unknown };
const db = () => getSupabaseAdmin().from('cashflow_private_state');

/** This account's entered code and the devices it has used. A read error counts as nothing entered. */
export async function loadReferral(userId: string): Promise<{ entry: ReferralEntry | null; devices: string[] }> {
  const { data, error } = await db().select('entry:data->referral,devices:data->referralDevices').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const row = (data || {}) as Row;
  return { entry: readEntry(row.entry), devices: Array.isArray(row.devices) ? row.devices.filter((d): d is string => typeof d === 'string') : [] };
}

/** Remembers that this account uses this device (so it can never enter its own code from a second account here). */
export async function rememberDevice(userId: string, devices: string[], hash: string): Promise<void> {
  if (devices.includes(hash)) return;
  await patchPrivate(userId, { referralDevices: [...devices, hash].slice(-MAX_DEVICES) });
}

/** The account whose code this is, by its public ID. */
export async function referrerOf(code: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_profiles').select('user_id').eq('public_id', normalizeCode(code)).maybeSingle();
  if (error) throw error;
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/** Whether a code was already entered from this device, by any account. */
export async function deviceUsed(hash: string): Promise<boolean> {
  const { data, error } = await db().select('user_id').eq('data->referral->>device', hash).limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

/** Whether this device is one the friend's own account has used. */
export async function referrerUsedDevice(referrerId: string, hash: string): Promise<boolean> {
  return (await loadReferral(referrerId)).devices.includes(hash);
}

/** Every reward given, first first; and the entries naming one friend. */
export async function allRewards(): Promise<{ userId: string; referrerId: string; at: string }[]> {
  const { data, error } = await db().select('user_id,entry:data->referral').eq('data->referral->>status', 'rewarded').limit(5000);
  if (error) throw error;
  return rankRewards(((data || []) as Row[]).map(row => ({ userId: row.user_id, entry: readEntry(row.entry) })));
}
async function entryRowsFor(referrerId: string): Promise<{ userId: string; entry: ReferralEntry | null }[]> {
  const { data, error } = await db().select('user_id,entry:data->referral').eq('data->referral->>referrerId', referrerId).limit(1000);
  if (error) throw error;
  return ((data || []) as Row[]).map(row => ({ userId: row.user_id, entry: readEntry(row.entry) }));
}
export async function entriesFor(referrerId: string): Promise<ReferralEntry[]> {
  return (await entryRowsFor(referrerId)).map(row => row.entry).filter((entry): entry is ReferralEntry => Boolean(entry));
}

/**
 * The account behind a code. A code counts only for a real, live account (owner, 2026-11-05: "ถ้าไม่ใช่โค้ดที่เป็นมีบัญชี
 * จริงๆ ห้ามได้เด็ดขาด"): it exists, its email is confirmed, it is not banned, paused or deleted. The owner's own code has
 * no limit of people (it goes into the clips); every other code takes 5.
 */
export async function codeAccount(referrerId: string): Promise<{ live: boolean; limit: number | null }> {
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(referrerId);
  if (error && (error as { status?: number }).status !== 404) throw error;
  const user = data?.user;
  const banned = Boolean(user?.banned_until && Date.parse(user.banned_until) > Date.now());
  const live = Boolean(user && user.email_confirmed_at && !banned && !user.deleted_at && user.app_metadata?.account_paused !== true);
  return { live, limit: user && isOwnerAccount(user) ? null : REFERRAL_PER_PERSON };
}
export async function codeLimit(referrerId: string): Promise<number | null> {
  return (await codeAccount(referrerId)).limit;
}

/** How many have entered this account's code (waiting entries from the first round included). */
export async function usedCount(referrerId: string): Promise<number> {
  return rankEntries(await entryRowsFor(referrerId)).length;
}

/**
 * Gives this account (who entered the code) its 200 tokens, while the campaign has fewer than 100 rewards. The entry is
 * written as rewarded first and ranked against every other reward; one past the 100th is turned back before any token.
 * The grant's id is made from this account, so a retry never gives twice; if it cannot be written, the entry goes back to
 * what it was and the error is the caller's.
 */
async function reward(userId: string, entry: ReferralEntry, before: ReferralEntry | null, now: Date): Promise<ReferralEntry> {
  const rewarded: ReferralEntry = { ...entry, status: 'rewarded', rewardedAt: now.toISOString() };
  await patchPrivate(userId, { referral: rewarded });
  const undo = () => (before ? patchPrivate(userId, { referral: before }) : patchPrivate(userId, {}, ['referral'])).catch(() => undefined);
  const place = (await allRewards()).findIndex(r => r.userId === userId);
  if (place < 0 || place >= REFERRAL_TOTAL) {
    await undo();
    throw new HttpError(409, `แคมเปญครบ ${REFERRAL_TOTAL} สิทธิ์แล้ว`, 'referral_full');
  }
  try {
    await addTokenGrant(userId, { id: `referral-${userId.replace(/-/g, '')}`, tokens: REFERRAL_TOKENS, at: rewarded.rewardedAt!, note: 'ใส่โค้ดเพื่อน' });
  } catch (error) {
    await undo();
    throw error;
  }
  return rewarded;
}

/** An entry from the first round that was still waiting for a first record: finished the new way. */
export async function finishWaiting(userId: string, entry: ReferralEntry, now = new Date()): Promise<ReferralEntry> {
  if (entry.status !== 'pending') return entry;
  if ((await allRewards()).length >= REFERRAL_TOTAL) {
    const refused: ReferralEntry = { ...entry, status: 'refused', reason: 'campaign_full' };
    await patchPrivate(userId, { referral: refused });
    return refused;
  }
  return reward(userId, entry, entry, now).catch(async error => {
    if ((error as { code?: string }).code !== 'referral_full') throw error;
    const refused: ReferralEntry = { ...entry, status: 'refused', reason: 'campaign_full' };
    await patchPrivate(userId, { referral: refused });
    return refused;
  });
}

/** Enters a friend's code for this account, after every check, and gives it 200 tokens at once; 4xx with a code the app words. */
export async function enterCode(input: { userId: string; code: string; deviceHash: string; entered: ReferralEntry | null }, now = new Date()): Promise<ReferralEntry> {
  const code = normalizeCode(input.code);
  if (input.entered) throw new HttpError(409, 'บัญชีนี้กรอกโค้ดไปแล้ว', 'referral_entered');
  const unknown = () => new HttpError(404, 'ไม่พบโค้ดนี้ กรุณาตรวจอีกครั้ง', 'referral_unknown');
  const referrerId = await referrerOf(code);
  if (!referrerId) throw unknown();
  if (referrerId === input.userId) throw new HttpError(400, 'กรอกโค้ดของตัวเองไม่ได้', 'referral_self');
  // A code of an account that is not real and live is answered exactly as one that does not exist.
  const account = await codeAccount(referrerId);
  if (!account.live) throw unknown();
  if (await deviceUsed(input.deviceHash) || await referrerUsedDevice(referrerId, input.deviceHash)) {
    throw new HttpError(409, 'เครื่องนี้ใช้กรอกโค้ดไปแล้ว', 'referral_device');
  }
  if ((await allRewards()).length >= REFERRAL_TOTAL) throw new HttpError(409, `แคมเปญครบ ${REFERRAL_TOTAL} สิทธิ์แล้ว`, 'referral_full');
  const limit = account.limit;
  const full = () => new HttpError(409, `โค้ดนี้มีคนใช้ครบ ${limit} คนแล้ว`, 'referral_referrer_full');
  if (limit !== null && rankEntries(await entryRowsFor(referrerId)).length >= limit) throw full();
  const entry: ReferralEntry = { code, referrerId, at: now.toISOString(), device: input.deviceHash, status: 'pending' };
  await patchPrivate(input.userId, { referral: entry });
  // Two people entering the same code for its last place at once: the ranking decides, the same for every reader.
  if (limit !== null) {
    const place = rankEntries(await entryRowsFor(referrerId)).findIndex(e => e.userId === input.userId);
    if (place < 0 || place >= limit) {
      await patchPrivate(input.userId, {}, ['referral']);
      throw full();
    }
  }
  return reward(input.userId, entry, null, now);
}
