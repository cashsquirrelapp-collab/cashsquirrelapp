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
export function supabaseUrl(): string {
  const url = new URL(required('SUPABASE_URL'));
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('SUPABASE_URL must use HTTPS');
  return url.origin;
}

export function sessionSecret(): string { const secret=required('SESSION_SECRET');if(secret.length<32)throw new Error('SESSION_SECRET must have at least 32 characters');return secret; }
