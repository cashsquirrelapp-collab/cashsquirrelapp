import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from './accounts.js';

// The owner's button (2026-11-12: "ถ้ากูไม่กด มึงห้ามสลับนะ แต่ถ้ากูกด มึงสามารถสลับต่อเนื่องได้เลย"): while Gemini is out of
// credit and not topped up yet, the owner turns this on and every เลขา message (app and LINE) is answered by Claude.
// Nothing turns it on by itself. Kept under aiSmartForLight in the owner's cashflow_private_state row: a table only
// server code reads or writes, so no new SQL.

export interface SmartSwitch { on: boolean; at: string | null }
const KEY = 'aiSmartForLight';
const OFF: SmartSwitch = { on: false, at: null };
// Each message reads it; the owner's own Worker sees a change at once, others within this time.
const CACHE_MS = 30_000;
let cached: { at: number; value: SmartSwitch } | null = null;

export function readSmartSwitch(value: unknown): SmartSwitch | null {
  if (!value || typeof value !== 'object') return null;
  const { on, at } = value as { on?: unknown; at?: unknown };
  if (typeof on !== 'boolean' || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  return { on, at };
}

/** The newest setting; off when none was ever saved. Throws on a read error (callers treat that as off). */
export async function loadSmartSwitch(fresh = false): Promise<SmartSwitch> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select(`value:data->${KEY}`).not(`data->${KEY}`, 'is', null).limit(20);
  if (error) throw error;
  const value = ((data || []) as { value?: unknown }[]).map(row => readSmartSwitch(row.value)).filter((item): item is SmartSwitch => item !== null)
    .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!))[0] ?? OFF;
  cached = { at: Date.now(), value };
  return value;
}

/** Only the owner's admin page calls this (admin-ai-credit, owner-only). */
export async function saveSmartSwitch(userId: string, on: boolean, now = new Date()): Promise<SmartSwitch> {
  const value: SmartSwitch = { on, at: now.toISOString() };
  await patchPrivate(userId, { [KEY]: value });
  cached = { at: Date.now(), value };
  return value;
}
