import { createHmac, timingSafeEqual } from 'node:crypto';
import { QUOTE_LINK_DAYS } from '../../../shared/quoteApproval.js';

// The confirmation link of a quotation (shared/quoteApproval.ts) carries who owns it, which document, which version and
// when it stops working, signed with a key only the server holds; nothing is stored to make one, and a link cannot be
// guessed or altered. The key is derived from SESSION_SECRET for this purpose alone.

export interface QuoteLink { owner: string; document: string; revision: string; expires: number }

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const sign = (payload: string, secret: string) => createHmac('sha256', createHmac('sha256', secret).update('quote-link').digest()).update(payload).digest('base64url');

export function makeQuoteToken(link: Omit<QuoteLink, 'expires'>, secret: string, now = Date.now()): string {
  if (!secret) throw new Error('A key is needed for quotation links');
  const expires = now + QUOTE_LINK_DAYS * 86_400_000;
  const payload = b64([link.owner, link.document, link.revision, expires.toString(36)].join('|'));
  return `${payload}.${sign(payload, secret)}`;
}

/** The link's contents when the signature is right and it has not expired; null otherwise. */
export function readQuoteToken(token: string, secret: string, now = Date.now()): QuoteLink | null {
  if (!secret || typeof token !== 'string' || token.length > 400) return null;
  const [payload, mac, extra] = token.split('.');
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const parts = Buffer.from(payload, 'base64url').toString('utf8').split('|');
  if (parts.length !== 4) return null;
  const [owner, document, revision, expiresText] = parts;
  const expires = parseInt(expiresText, 36);
  if (!owner || !document || !revision || !Number.isFinite(expires) || expires < now) return null;
  return { owner, document, revision, expires };
}
