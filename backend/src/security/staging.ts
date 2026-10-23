// Guardrails specific to the isolated migration rehearsal; no production defaults change.
export type StagingEnvironment = Record<string, unknown>;
export const STAGING_ORIGIN = 'https://cashsquirrel-staging.cashsquirrelapp.workers.dev';
export const STAGING_DATABASE = 'https://odsdgxeaiqdepriqmaya.supabase.co';
// The test recipient is independent of the system sender.
export const STAGING_EMAIL = 'heidnsko1234@gmail.com';
export const STAGING_EMAIL_SENDER = 'kraroapp@gmail.com';
export const STAGING_GOOGLE_EMAIL = 'cashsquirrelapp@gmail.com';
export const STAGING_LOGIN_CHANNEL = '2012039027';

export function isStaging(env: StagingEnvironment = process.env): boolean {
  return Boolean(env.STAGING_MODE) || env.APP_URL === STAGING_ORIGIN || env.SUPABASE_URL === STAGING_DATABASE;
}

export function stagingBaseReady(env: StagingEnvironment): boolean {
  return env.STAGING_MODE === 'integrated' && env.APP_URL === STAGING_ORIGIN &&
    env.SUPABASE_URL === STAGING_DATABASE && env.STRIPE_MODE === 'test';
}

function has(env: StagingEnvironment, name: string, length = 1): boolean {
  return typeof env[name] === 'string' && (env[name] as string).length >= length;
}

export function stagingProviderReady(provider: 'email' | 'line' | 'stripe' | 'google' | 'cron', env: StagingEnvironment = process.env): boolean {
  if (!stagingBaseReady(env) || env[`STAGING_${provider.toUpperCase()}`] !== 'enabled') return false;
  switch (provider) {
    case 'email': return env.GMAIL_USER === STAGING_EMAIL_SENDER && has(env, 'GMAIL_APP_PASSWORD', 16);
    case 'google': return env.STAGING_GOOGLE_TEST_EMAIL === STAGING_GOOGLE_EMAIL;
    case 'line': return env.LINE_CHANNEL_ID === STAGING_LOGIN_CHANNEL &&
      typeof env.LIFF_ID === 'string' && env.LIFF_ID.startsWith(`${STAGING_LOGIN_CHANNEL}-`) &&
      has(env, 'LINE_CHANNEL_SECRET', 16) && has(env, 'LINE_CHANNEL_ACCESS_TOKEN', 20) &&
      typeof env.STAGING_LINE_USER_ID === 'string' && /^U[0-9a-f]{32}$/.test(env.STAGING_LINE_USER_ID);
    case 'stripe': return typeof env.STRIPE_SECRET_KEY === 'string' && /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY) &&
      typeof env.STRIPE_WEBHOOK_SECRET === 'string' && env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_') &&
      has(env, 'STRIPE_PRO_PRICE_ID') && has(env, 'STRIPE_PRO_INTRO_COUPON_ID') && has(env, 'STRIPE_BILLING_PORTAL_CONFIGURATION_ID');
    case 'cron': return has(env, 'CRON_SECRET', 32);
  }
}

export function stagingEmailAllowed(email: unknown, env: StagingEnvironment = process.env): boolean {
  return !isStaging(env) || (stagingProviderReady('email', env) && typeof email === 'string' && email.toLowerCase() === STAGING_EMAIL);
}

export function stagingGoogleAllowed(email: unknown, env: StagingEnvironment = process.env): boolean {
  return !isStaging(env) || (stagingProviderReady('google', env) && typeof email === 'string' && email.toLowerCase() === STAGING_GOOGLE_EMAIL);
}

export function stagingLineAllowed(userId: unknown, env: StagingEnvironment = process.env): boolean {
  return !isStaging(env) || (stagingProviderReady('line', env) && userId === env.STAGING_LINE_USER_ID);
}

export function stagingRecipientAllowed(email: unknown, lineUserId: unknown): boolean {
  return !isStaging() || stagingEmailAllowed(email) || stagingLineAllowed(lineUserId);
}
