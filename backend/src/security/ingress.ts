import { isIP } from 'node:net';
import type { VercelRequest } from '../http/types.js';
import { HttpError } from '../http/guard.js';
import { rateLimit } from './rateLimit.js';

// A bounded first layer avoids body/provider/DB work during a local flood.
// Durable counters below share limits across workers and serverless instances.
export class RequestLimiter {
  private buckets = new Map<string, { count: number; expires: number }>();
  constructor(private capacity = 5000, private now = Date.now) {}
  take(key: string, limit: number, seconds: number): void {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (bucket && bucket.expires > now) {
      if (bucket.count >= limit) throw new HttpError(429, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่');
      bucket.count++; return;
    }
    if (this.buckets.size >= this.capacity) {
      for (const [id, entry] of this.buckets) if (entry.expires <= now) this.buckets.delete(id);
      if (!bucket && this.buckets.size >= this.capacity) throw new HttpError(429, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่');
    }
    this.buckets.set(key, { count: 1, expires: now + seconds * 1000 });
  }
}
export function clientIp(req: VercelRequest): string {
  // Trust only a header supplied/overwritten by the actual Vercel platform.
  // Standalone Express deliberately ignores all caller-supplied proxy headers.
  const supplied = process.env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : undefined;
  const candidate = typeof supplied === 'string' ? supplied.split(',')[0].trim() : '';
  const ip = isIP(candidate) ? candidate : req.socket?.remoteAddress || 'unknown';
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}
const limiter = new RequestLimiter();
const policies: Record<string, { group: string; limit: number }> = {
  auth: { group: 'auth', limit: 30 },
  'password-reset-email': { group: 'reset', limit: 10 },
  'password-reset-line': { group: 'reset', limit: 10 },
  'send-credit-alert': { group: 'credit-alert', limit: 10 },
  'liff-submit': { group: 'liff', limit: 20 },
  'download-report': { group: 'download', limit: 20 },
  'stripe-webhook': { group: 'stripe-webhook', limit: 300 },
  'line-webhook': { group: 'line-webhook', limit: 300 }
};
export async function ingressLimit(req: VercelRequest, route: string): Promise<void> {
  const policy = policies[route] || { group: 'api', limit: 240 };
  const identity = clientIp(req);
  limiter.take('global', 3000, 60);
  limiter.take(`${policy.group}:${identity}`, policy.limit, 60);
  // Guest development remains usable without a real Supabase project.
  const configured = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (configured || process.env.NODE_ENV === 'production') {
    await rateLimit('ingress-global', policy.group, policy.group.includes('webhook') ? 3000 : 6000, 60);
    await rateLimit(`ingress-${policy.group}`, identity, policy.limit, 60);
  }
}
