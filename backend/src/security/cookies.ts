import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { sessionSecret, appOrigin } from '../config/env.js';
function key(): Buffer { const secret = sessionSecret(); return createHash('sha256').update(secret).digest(); }
export function seal(value: unknown): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function unseal<T>(value: string): T | null {
  try { const buffer = Buffer.from(value, 'base64url'); if (buffer.length < 29 || buffer.length > 5000) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), buffer.subarray(0,12)); decipher.setAuthTag(buffer.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString());
  } catch { return null; }
}
function name(kind: string): string { return `${appOrigin().startsWith('https:') ? '__Host-' : ''}cashflow-${kind}`; }
export function readCookie<T>(req: VercelRequest, kind = 'session'): T | null {
  const part = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name(kind)}=`));
  return part ? unseal<T>(part.slice(part.indexOf('=')+1)) : null;
}
export function writeCookie(res: VercelResponse, value: unknown, kind = 'session', maxAge = 60*60*24*30): void {
  const cookie = `${name(kind)}=${value === null ? '' : seal(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value === null ? 0 : maxAge}${appOrigin().startsWith('https:') ? '; Secure' : ''}`;
  if (cookie.length > 4096) throw new Error('Session cookie exceeds browser limit');
  const existing = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : []), cookie]);
}
