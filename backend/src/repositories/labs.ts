import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from './accounts.js';
import { readLabs, type LabFeatureId, type LabRecord } from '../../../shared/labs.js';

// ฟีเจอร์ทดลอง per account (shared/labs.ts), under `labs` in cashflow_private_state: a table only server code reads or
// writes. No new table, so no SQL to run.

/** The record. A read error counts as not a tester: nothing experimental opens on an unreadable record. */
export async function loadLabs(userId: string): Promise<LabRecord> {
  try {
    const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('labs:data->labs').eq('user_id', userId).maybeSingle();
    if (error) return { tester: false, on: [] };
    return readLabs((data as { labs?: unknown } | null)?.labs);
  } catch { return { tester: false, on: [] }; }
}

async function readOrThrow(userId: string): Promise<LabRecord> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('labs:data->labs').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return readLabs((data as { labs?: unknown } | null)?.labs);
}

/** The owner makes an account a tester or not. The features it turned on are kept for if it is made a tester again. */
export async function setLabTester(userId: string, tester: boolean, now = new Date()): Promise<LabRecord> {
  const next: LabRecord = { ...(await readOrThrow(userId)), tester, at: now.toISOString() };
  await patchPrivate(userId, { labs: next });
  return next;
}

/** A tester turns one feature on or off for itself. */
export async function setLabFeature(userId: string, feature: LabFeatureId, on: boolean, now = new Date()): Promise<LabRecord> {
  const current = await readOrThrow(userId);
  const list = on ? [...new Set([...current.on, feature])] : current.on.filter(id => id !== feature);
  const next: LabRecord = { ...current, on: list, at: now.toISOString() };
  await patchPrivate(userId, { labs: next });
  return next;
}
