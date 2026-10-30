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
export function supabaseUrl(): string {
  const url = new URL(required('SUPABASE_URL'));
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('SUPABASE_URL must use HTTPS');
  return url.origin;
}

export function sessionSecret(): string { const secret=required('SESSION_SECRET');if(secret.length<32)throw new Error('SESSION_SECRET must have at least 32 characters');return secret; }
