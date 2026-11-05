import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from './accounts.js';
import { addTokenGrant } from './tokenGrants.js';
import { HttpError } from '../http/guard.js';
import { normalizeCode, rankEntries, rankRewards, readEntry, REFERRAL_PER_PERSON, REFERRAL_TOKENS, REFERRAL_TOTAL, type ReferralEntry } from '../../../shared/referral.js';

// ชวนเพื่อน รับ 200 โทเคน (shared/referral.ts), kept in cashflow_private_state, a table only server code reads or writes:
// the code an account entered under referral, the devices an account has used under referralDevices (hashes, at most 5).
// No new table, so no SQL to run. The limits hold without a lock: a reward is written, then every reward is read back and
// ranked; one past the friend's 10 or the campaign's 100 is turned back at once, before any token is given.

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

/** Whether this account has recorded at least one job or expense of its own. */
export async function hasFirstRecord(userId: string): Promise<boolean> {
  for (const table of ['cashflow_jobs', 'cashflow_expenses'] as const) {
    const { count, error } = await getSupabaseAdmin().from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (error) throw error;
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Gives the friend its 200 tokens once this account (who entered the code) has its first record, while the friend has
 * fewer than 10 rewards and the campaign fewer than 100. Returns the entry as it stands afterwards.
 */
export async function rewardIfReady(userId: string, entry: ReferralEntry, now = new Date()): Promise<ReferralEntry> {
  if (entry.status !== 'pending' || !(await hasFirstRecord(userId))) return entry;
  const before = await allRewards();
  const refuse = async (reason: NonNullable<ReferralEntry['reason']>) => {
    const refused: ReferralEntry = { ...entry, status: 'refused', reason };
    await patchPrivate(userId, { referral: refused });
    return refused;
  };
  if (before.length >= REFERRAL_TOTAL) return refuse('campaign_full');
  if (before.filter(r => r.referrerId === entry.referrerId).length >= REFERRAL_PER_PERSON) return refuse('referrer_full');
  const rewarded: ReferralEntry = { ...entry, status: 'rewarded', rewardedAt: now.toISOString() };
  await patchPrivate(userId, { referral: rewarded });
  // Two rewards at the same moment for the last place: the ranking decides, the same for every reader.
  const after = await allRewards();
  const place = after.findIndex(r => r.userId === userId);
  const friendPlace = after.filter(r => r.referrerId === entry.referrerId).findIndex(r => r.userId === userId);
  if (place < 0 || place >= REFERRAL_TOTAL) return refuse('campaign_full');
  if (friendPlace >= REFERRAL_PER_PERSON) return refuse('referrer_full');
  // The grant's id is made from this account, so a retry never gives twice. If it cannot be written, the entry goes back
  // to waiting and the next look tries again.
  try {
    await addTokenGrant(entry.referrerId, { id: `referral-${userId.replace(/-/g, '')}`, tokens: REFERRAL_TOKENS, at: rewarded.rewardedAt!, note: 'ชวนเพื่อน' });
  } catch (error) {
    await patchPrivate(userId, { referral: entry }).catch(() => undefined);
    throw error;
  }
  return rewarded;
}

/** Enters a friend's code for this account, after every check; 4xx with a code the app words. */
export async function enterCode(input: { userId: string; code: string; deviceHash: string; entered: ReferralEntry | null }, now = new Date()): Promise<ReferralEntry> {
  const code = normalizeCode(input.code);
  if (input.entered) throw new HttpError(409, 'บัญชีนี้กรอกโค้ดไปแล้ว', 'referral_entered');
  const referrerId = await referrerOf(code);
  if (!referrerId) throw new HttpError(404, 'ไม่พบโค้ดนี้ กรุณาตรวจอีกครั้ง', 'referral_unknown');
  if (referrerId === input.userId) throw new HttpError(400, 'กรอกโค้ดของตัวเองไม่ได้', 'referral_self');
  if (await deviceUsed(input.deviceHash) || await referrerUsedDevice(referrerId, input.deviceHash)) {
    throw new HttpError(409, 'เครื่องนี้ใช้กรอกโค้ดชวนเพื่อนไปแล้ว', 'referral_device');
  }
  if ((await allRewards()).length >= REFERRAL_TOTAL) throw new HttpError(409, 'แคมเปญชวนเพื่อนครบ 100 สิทธิ์แล้ว', 'referral_full');
  const full = () => new HttpError(409, `โค้ดนี้มีคนใช้ครบ ${REFERRAL_PER_PERSON} คนแล้ว`, 'referral_referrer_full');
  if (rankEntries(await entryRowsFor(referrerId)).length >= REFERRAL_PER_PERSON) throw full();
  const entry: ReferralEntry = { code, referrerId, at: now.toISOString(), device: input.deviceHash, status: 'pending' };
  await patchPrivate(input.userId, { referral: entry });
  // Two people entering the same code for its last place at once: the ranking decides, the same for every reader.
  const place = rankEntries(await entryRowsFor(referrerId)).findIndex(e => e.userId === input.userId);
  if (place < 0 || place >= REFERRAL_PER_PERSON) {
    await patchPrivate(input.userId, {}, ['referral']);
    throw full();
  }
  return rewardIfReady(input.userId, entry, now);
}
