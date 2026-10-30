export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
export function appOrigin(): string {
  const url = new URL(required('APP_URL'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid APP_URL');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS in production');
  return url.origin;
}
/**
 * The app's own address and, while the site moves to its domain (owner, 2026-10-31: "ขึ้น .com"), the other addresses it
 * also answers on (APP_EXTRA_ORIGINS, comma separated, e.g. https://krarok.com). Links, e-mails, sign-in returns and
 * payments still use APP_URL; requests from any of these addresses pass the same-origin check.
 */
export function trustedOrigins(): string[] {
  const extra = (process.env.APP_EXTRA_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid APP_EXTRA_ORIGINS');
    return url.origin;
  });
  return [...new Set([appOrigin(), ...extra])];
}
/**
 * The address this request came in on, when it is one of the trusted ones (its Origin header, else its Host), else the
 * app's own address. Sign-in returns, payment returns and the billing portal come back to the address the customer is
 * using, where their sign-in is (owner, 2026-10-31: krarok.com beside workers.dev).
 */
export function originFor(req: { headers: Record<string, string | string[] | undefined> }): string {
  const trusted = trustedOrigins();
  const origin = req.headers.origin;
  if (typeof origin === 'string' && trusted.includes(origin)) return origin;
  const host = req.headers.host;
  if (typeof host === 'string' && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    const byHost = trusted.find(value => new URL(value).host === host.toLowerCase());
    if (byHost) return byHost;
  }
  return appOrigin();
}
export function supabaseUrl(): string {
  const url = new URL(required('SUPABASE_URL'));
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('SUPABASE_URL must use HTTPS');
  return url.origin;
}

export function sessionSecret(): string { const secret=required('SESSION_SECRET');if(secret.length<32)throw new Error('SESSION_SECRET must have at least 32 characters');return secret; }
