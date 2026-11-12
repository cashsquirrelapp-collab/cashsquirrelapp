import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from './accounts.js';
import { readGoogleRecord, type GoogleRecord } from '../../../shared/googleSheets.js';

// The account's Google connection (shared/googleSheets.ts), under `google` in cashflow_private_state: a table only server
// code reads or writes. No new table, so no SQL to run.

/** The kept record, or null when there is none or it cannot be read as one. A read error is thrown (not "not connected"),
 *  so a database hiccup never looks like a lost connection. */
export async function loadGoogle(userId: string): Promise<GoogleRecord | null> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('google:data->google').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return readGoogleRecord((data as { google?: unknown } | null)?.google);
}

export async function saveGoogle(userId: string, record: GoogleRecord): Promise<void> {
  await patchPrivate(userId, { google: record });
}

export async function removeGoogle(userId: string): Promise<void> {
  await patchPrivate(userId, {}, ['google']);
}
