import { getSupabaseAdmin } from '../config/supabase.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';

/** New documents (quotations, invoices, receipts, tax invoices) a Free account may create in a calendar month. */
export const FREE_DOCUMENT_LIMIT = 10;

export interface DocumentQuota { used: number; limit: number; month: string }

/** The quota month in Thai time, e.g. "2026-10". */
export function documentQuotaMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}

// One server-only claim row per document created: `document-quota:<user>:<month>:<slot>`, slots 1..limit.
// The table only takes unique keys, so two saves at the same moment can never share a slot, and a
// deleted document never gives its slot back. Account deletion clears every key containing `:<user>:`.
const slotPrefix = (userId: string, month: string) => `document-quota:${userId}:${month}:`;

export async function documentQuotaUsed(userId: string, month = documentQuotaMonth()): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('cashflow_delivery_claims')
    .select('key', { count: 'exact', head: true }).like('key', `${slotPrefix(userId, month)}%`);
  if (error) throw error;
  return count ?? 0;
}

export async function documentQuota(userId: string, now = new Date()): Promise<DocumentQuota> {
  const month = documentQuotaMonth(now);
  return { used: await documentQuotaUsed(userId, month), limit: FREE_DOCUMENT_LIMIT, month };
}

/**
 * Takes `needed` free slots of this month. Returns the claimed keys, or null (holding nothing) when
 * fewer than `needed` are left. Starts after the slots already used, so a normal save makes one insert.
 */
export async function claimDocumentSlots(userId: string, needed: number, now = new Date()): Promise<string[] | null> {
  const month = documentQuotaMonth(now);
  const used = await documentQuotaUsed(userId, month);
  if (used + needed > FREE_DOCUMENT_LIMIT) return null;
  const order = Array.from({ length: FREE_DOCUMENT_LIMIT }, (_, i) => ((used + i) % FREE_DOCUMENT_LIMIT) + 1);
  const claimed: string[] = [];
  for (const slot of order) {
    if (claimed.length === needed) break;
    const key = `${slotPrefix(userId, month)}${slot}`;
    if (await claimDelivery(key)) claimed.push(key);
  }
  if (claimed.length < needed) {
    await releaseDocumentSlots(claimed);
    return null;
  }
  return claimed;
}

/** Gives back slots of a save that did not happen (conflict or error). Never called after a successful save. */
export async function releaseDocumentSlots(keys: string[]): Promise<void> {
  for (const key of keys) {
    try { await releaseDelivery(key); }
    catch (error) { console.error('document-quota: could not release a slot of a failed save', { type: error instanceof Error ? error.name : 'UnknownError' }); }
  }
}
