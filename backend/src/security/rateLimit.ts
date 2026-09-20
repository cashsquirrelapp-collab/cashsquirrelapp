import { createHash, createHmac } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError } from '../http/guard.js';
export function challengeHash(code: string): string { return createHmac('sha256', sessionSecret()).update(code).digest('hex'); }
export async function rateLimit(scope: string, identity: string, limit: number, seconds: number): Promise<void> {
  const key = createHash('sha256').update(`${scope}:${identity}`).digest('hex');
  const { data, error } = await getSupabaseAdmin().rpc('cashflow_rate_limit', { p_key: key, p_limit: limit, p_seconds: seconds });
  if (error) throw error; if (!data) throw new HttpError(429, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่');
}
