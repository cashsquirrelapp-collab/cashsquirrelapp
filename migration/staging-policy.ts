import { stagingBaseReady, stagingProviderReady } from '../backend/src/security/staging.js';
export { STAGING_ORIGIN, STAGING_DATABASE } from '../backend/src/security/staging.js';
export type StagingEnv = Record<string, unknown>;

export function configurationReady(env: StagingEnv): boolean {
  if (!stagingBaseReady(env)) return false;
  if (typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32 ||
      typeof env.SUPABASE_SERVICE_ROLE_KEY !== 'string' || !env.SUPABASE_SERVICE_ROLE_KEY ||
      typeof env.SUPABASE_PUBLISHABLE_KEY !== 'string' || !env.SUPABASE_PUBLISHABLE_KEY) return false;
  // Paid AI and production shortcuts cannot be added to this free rehearsal.
  if (Object.entries(env).some(([name, value]) => value &&
      /^(OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_AI_|LINE_RECIPIENTS$|STRIPE_LEGACY_)/.test(name))) return false;
  if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_test_/.test(String(env.STRIPE_SECRET_KEY))) return false;
  if (env.LINE_CHANNEL_ID && env.LINE_CHANNEL_ID !== '2012039027') return false;
  for (const [provider, names] of [
    ['email', ['GMAIL_USER','GMAIL_APP_PASSWORD']],
    ['line', ['LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_CHANNEL_ACCESS_TOKEN','LIFF_ID']],
    ['stripe', ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']],
    ['google', ['STAGING_GOOGLE_TEST_EMAIL']],
    ['cron', ['CRON_SECRET']],
  ] as const) {
    if ((env[`STAGING_${provider.toUpperCase()}`] === 'enabled' || names.some(name => env[name])) && !stagingProviderReady(provider, env)) return false;
  }
  return true;
}

const coreRoutes = new Set(['/api/data', '/api/groups', '/api/profile', '/api/vault',
  '/api/vault-upload', '/api/vault-file', '/api/usage-analytics', '/api/download-report']);
export const cronRoutes = new Set(['/api/send-overdue-digest', '/api/send-monthly-report', '/api/send-wht50-reminder', '/api/close-expired-accounts']);
const lineRoutes = new Set(['/api/liff-config', '/api/liff-submit', '/api/line-session', '/api/line-link-code', '/api/line-webhook']);

export function configuredFeatures(env: StagingEnv) {
  const core = configurationReady(env);
  const email = core && stagingProviderReady('email', env);
  return { core, signup: email, oauth: core && stagingProviderReady('google', env),
    stripe: core && stagingProviderReady('stripe', env), line: core && stagingProviderReady('line', env),
    email, cron: core && stagingProviderReady('cron', env) };
}

export async function allowedCoreRequest(request: Request, env: StagingEnv = {}): Promise<boolean> {
  const url = new URL(request.url);
  if (!['GET', 'POST'].includes(request.method)) return false;
  if (coreRoutes.has(url.pathname)) return true;
  if (lineRoutes.has(url.pathname)) return stagingProviderReady('line', env);
  if (['/api/billing','/api/stripe-webhook'].includes(url.pathname)) return stagingProviderReady('stripe', env);
  if (['/api/confirm-email','/api/password-reset-email'].includes(url.pathname)) return stagingProviderReady('email', env);
  if (url.pathname === '/api/notify') return stagingProviderReady('email', env) || stagingProviderReady('line', env);
  if (cronRoutes.has(url.pathname)) return request.method === 'GET' && stagingProviderReady('cron', env);
  if (url.pathname !== '/api/auth') return false;
  if (request.method === 'GET') return !url.search || stagingProviderReady('google', env) || stagingProviderReady('email', env);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return false;
  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 16 * 1024) { void reader.cancel(); return false; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const action = JSON.parse(new TextDecoder().decode(bytes))?.action;
    if (action === 'signin' || action === 'logout') return true;
    if (action === 'oauth') return stagingProviderReady('google', env);
    return ['signup','unlock-request','unlock-verify'].includes(action) && stagingProviderReady('email', env);
  } catch { return false; }
  finally { reader.releaseLock(); }
}

// All expressions are UTC. These correspond to 08:00/09:00 Asia/Bangkok.
export function scheduledPaths(cron: string): string[] {
  switch (cron) {
    case '0 1 * * *': return ['/api/send-overdue-digest'];
    case '0 1 1 * *': return ['/api/send-monthly-report', '/api/send-wht50-reminder'];
    case '0 2 * * *': return ['/api/close-expired-accounts'];
    default: return [];
  }
}
