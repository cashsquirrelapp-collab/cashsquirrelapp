import { getSupabaseAdmin } from '../config/supabase.js';
import { stagingOwnerLine, stagingUnlocked } from '../security/stagingUnlock.js';

// The owner's test accounts on staging.krarok.com: the one STAGING_UNLOCK_USER_ID names, and the one linked to the owner's
// own LINE (security/stagingUnlock.ts stagingOwnerLine), the account made by signing up in that LINE chat. Both read as
// the owner's account on the real site: admin, Pro and เลขา's allowance (owner, 2026-11-13: "ปลดล็อกทั้งหมด"; 2026-11-14:
// "เอาของบัญชี staging ของกูที่กูคุยกับมึงอยู่"). Off on the real site before any read.
const SECONDS = 60;
const known = new Map<string, { at: number; owner: boolean }>();

export async function stagingOwnerAccount(userId: unknown, now = Date.now()): Promise<boolean> {
  if (stagingUnlocked(userId)) return true;
  if (typeof userId !== 'string' || !userId || !stagingOwnerLine(process.env.STAGING_LINE_USER_ID)) return false;
  const seen = known.get(userId);
  if (seen && now - seen.at < SECONDS * 1000) return seen.owner;
  const { data, error } = await getSupabaseAdmin().from('cashflow_line_links').select('line_user_id').eq('user_id', userId).maybeSingle();
  // A read that fails counts as not the owner's this time, and is not remembered.
  if (error) return false;
  const owner = stagingOwnerLine(data?.line_user_id);
  known.set(userId, { at: now, owner });
  return owner;
}
