import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from './accounts.js';
import { HttpError } from '../http/guard.js';
import { GRANT_MAX_KEPT, readGrants, type TokenGrant } from '../../../shared/tokenGrants.js';

// Tokens the owner gives an account (shared/tokenGrants.ts), kept under aiTokenGrants in cashflow_private_state: a table
// only server code reads or writes. No new table, so no SQL to run.

/** An account's grants. A read error counts as none: never more tokens by mistake. */
export async function loadTokenGrants(userId: string): Promise<TokenGrant[]> {
  try {
    const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('grants:data->aiTokenGrants').eq('user_id', userId).maybeSingle();
    if (error) return [];
    return readGrants((data as { grants?: unknown } | null)?.grants);
  } catch { return []; }
}

/** Grants for many accounts at once (the owner's lists). Throws on a read error. */
export async function loadTokenGrantsFor(userIds: string[]): Promise<Map<string, TokenGrant[]>> {
  const found = new Map<string, TokenGrant[]>();
  if (!userIds.length) return found;
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('user_id,grants:data->aiTokenGrants').in('user_id', userIds);
  if (error) throw error;
  for (const row of (data || []) as { user_id: string; grants: unknown }[]) {
    const grants = readGrants(row.grants);
    if (grants.length) found.set(row.user_id, grants);
  }
  return found;
}

/** The latest grants across every account, newest first (the owner's log). */
export async function recentTokenGrants(limit = 30): Promise<{ userId: string; grant: TokenGrant }[]> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('user_id,grants:data->aiTokenGrants')
    .not('data->aiTokenGrants', 'is', null).limit(5000);
  if (error) throw error;
  return ((data || []) as { user_id: string; grants: unknown }[])
    .flatMap(row => readGrants(row.grants).map(grant => ({ userId: row.user_id, grant })))
    .sort((a, b) => Date.parse(b.grant.at) - Date.parse(a.grant.at))
    .slice(0, limit);
}

/**
 * Adds one grant. The same id again changes nothing (a double click, a retry). Only the owner's page calls this, one grant
 * at a time, so reading the list and writing it back cannot lose another grant made at the same moment in practice.
 */
export async function addTokenGrant(userId: string, grant: TokenGrant): Promise<{ grants: TokenGrant[]; added: boolean }> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('grants:data->aiTokenGrants').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const current = readGrants((data as { grants?: unknown } | null)?.grants);
  if (current.some(entry => entry.id === grant.id)) return { grants: current, added: false };
  // Never drop an older grant to make room: that would take tokens away.
  if (current.length >= GRANT_MAX_KEPT) throw new HttpError(409, `บัญชีนี้ได้รับโทเคนครบ ${GRANT_MAX_KEPT} ครั้งแล้ว`);
  const grants = [...current, grant];
  await patchPrivate(userId, { aiTokenGrants: grants });
  return { grants, added: true };
}
