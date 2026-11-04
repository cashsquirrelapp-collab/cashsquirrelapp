import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from './accounts.js';
import { isConsented, readConsents, withConsent, type ConsentKey, type ConsentRecords } from '../../../shared/consents.js';

// The account's consent records (shared/consents.ts), under `consents` in cashflow_private_state: a table only server code
// reads or writes. No new table, so no SQL to run.

/** The records. A read error counts as none: nothing that needs consent runs on an unreadable record. */
export async function loadConsents(userId: string): Promise<ConsentRecords> {
  try {
    const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('consents:data->consents').eq('user_id', userId).maybeSingle();
    if (error) return {};
    return readConsents((data as { consents?: unknown } | null)?.consents);
  } catch { return {}; }
}

export async function hasConsent(userId: string, key: ConsentKey): Promise<boolean> {
  return isConsented(await loadConsents(userId), key);
}

/** Agreeing or withdrawing, kept with the version and the time. */
export async function saveConsent(userId: string, key: ConsentKey, accepted: boolean): Promise<ConsentRecords> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('consents:data->consents').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const next = withConsent(readConsents((data as { consents?: unknown } | null)?.consents), key, accepted);
  await patchPrivate(userId, { consents: next });
  return next;
}
