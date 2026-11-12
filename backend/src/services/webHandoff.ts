import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from '../repositories/accounts.js';

// From LINE to the phone's own browser, signed in (owner, 2026-11-13: เชื่อมชีตจาก LINE). Google refuses sign-in inside
// LINE's browser, so the LINE page asks for a link the phone's Safari or Chrome opens: one use, five minutes, for one
// account and one purpose. Only a hash of its secret is kept (cashflow_private_state.handoff, server-only); opening it
// clears it, so a second open or an old link signs nobody in.

export type HandoffPurpose = 'sheets';
export const HANDOFF_MS = 5 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Stored { hash: string; exp: number; purpose: HandoffPurpose }
export interface HandoffDeps {
  load(userId: string): Promise<unknown>;
  save(userId: string, value: Stored): Promise<void>;
  clear(userId: string): Promise<void>;
  now(): number;
}

const hashOf = (secret: string) => createHash('sha256').update(`handoff:${secret}`).digest('hex');

/** A fresh link token for this account (any earlier one stops working). */
export async function createHandoff(userId: string, purpose: HandoffPurpose, deps: HandoffDeps = handoffDeps): Promise<string> {
  const secret = randomBytes(24).toString('base64url');
  await deps.save(userId, { hash: hashOf(secret), exp: deps.now() + HANDOFF_MS, purpose });
  return `${userId}.${secret}`;
}

/** The account a token opens, used up on the way; null when it is unknown, used, old or for another purpose. */
export async function consumeHandoff(token: unknown, purpose: HandoffPurpose, deps: HandoffDeps = handoffDeps): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [userId, secret, extra] = token.split('.');
  if (!userId || !secret || extra !== undefined || !UUID.test(userId) || !/^[A-Za-z0-9_-]{20,64}$/.test(secret)) return null;
  const stored = await deps.load(userId) as Partial<Stored> | null;
  if (!stored || typeof stored.hash !== 'string' || typeof stored.exp !== 'number' || stored.purpose !== purpose) return null;
  const given = Buffer.from(hashOf(secret), 'hex');
  const kept = Buffer.from(stored.hash, 'hex');
  // A wrong secret changes nothing (a guess cannot cancel the person's real link); the right one is used up at once.
  if (given.length !== kept.length || !timingSafeEqual(given, kept)) return null;
  await deps.clear(userId);
  return stored.exp > deps.now() ? userId : null;
}

export const handoffDeps: HandoffDeps = {
  async load(userId) {
    const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('handoff:data->handoff').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return (data as { handoff?: unknown } | null)?.handoff ?? null;
  },
  save: (userId, value) => patchPrivate(userId, { handoff: value }),
  clear: userId => patchPrivate(userId, {}, ['handoff']),
  now: () => Date.now(),
};
