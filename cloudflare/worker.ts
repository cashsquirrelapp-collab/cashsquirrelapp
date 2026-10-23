import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../backend/src/http/app.js';
import { withCloudflareClientIp } from '../backend/src/security/requestContext.js';
import { scheduledPaths } from './schedule.js';
import { answerWithin } from './deferred.js';
import { runScheduledJobs } from '../migration/scheduled-runner.js';

// Production on Cloudflare Workers: the same Express backend Vercel runs (backend/src/http/app.ts),
// the built frontend as static assets, and the cron jobs vercel.json used to schedule.
// The staging Worker (migration/worker.ts) keeps its own allow-lists; nothing here is staging.

type Env = { ASSETS: Fetcher; APP_URL?: string; CRON_SECRET?: string; CRON_ENABLED?: string; [key: string]: unknown };

const app = createApp();
app.listen(3000);
const nodeFetch = httpServerHandler({ port: 3000 }).fetch;
if (!nodeFetch) throw new Error('Cloudflare Node HTTP handler is unavailable');

// LINE cancels a webhook that takes ~1.7 s; answer before that and finish the work in the background.
const LINE_WEBHOOK_BUDGET_MS = 900;

// The headers vercel.json put on every response.
const SITE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.line-scdn.net https://js.stripe.com https://checkout.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.stripe.com https://*.googleusercontent.com https://profile.line-scdn.net; connect-src 'self' https://fonts.googleapis.com https://api.stripe.com https://checkout.stripe.com https://merchant-ui-api.stripe.com https://api.emailjs.com https://api.line.me https://access.line.me https://liff.line.me; frame-src https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://access.line.me https://liff.line.me; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const NO_STORE = /^\/(api\/|recover$|login$)/;

function finish(response: Response, path: string): Response {
  const headers = new Headers(response.headers);
  // Keep each Set-Cookie separate (session and PKCE cookies) through the Node-to-Fetch adapter.
  const cookies = response.headers.getSetCookie();
  if (cookies.length) {
    headers.delete('Set-Cookie');
    for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  }
  for (const [name, value] of Object.entries(SITE_HEADERS)) if (!headers.has(name)) headers.set(name, value);
  if (NO_STORE.test(path)) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/api/line-webhook') {
      // Answer LINE within its time limit; the handler keeps running and sends the reply (see deferred.ts).
      const work = Promise.resolve(withCloudflareClientIp(request as Request & { cf?: unknown }, () => nodeFetch(request as never, env, ctx)));
      const response = await answerWithin(work, LINE_WEBHOOK_BUDGET_MS, ctx,
        () => Response.json({ ok: true, deferred: true }),
        () => console.error('LINE webhook failed after the early answer'));
      return finish(response, path);
    }
    const response = path === '/api' || path.startsWith('/api/')
      ? await withCloudflareClientIp(request as Request & { cf?: unknown }, () => nodeFetch(request as never, env, ctx))
      : await env.ASSETS.fetch(request);
    return finish(response, path);
  },

  // Off until cutover (CRON_ENABLED=true): while Vercel still runs the same jobs, two schedulers
  // would send every digest and report twice.
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (env.CRON_ENABLED !== 'true') { console.log('Scheduled jobs are off (CRON_ENABLED is not true)', { cron: controller.cron }); return; }
    if (!env.CRON_SECRET || !env.APP_URL) throw new Error('CRON_SECRET and APP_URL are required for scheduled jobs');
    await runScheduledJobs(scheduledPaths(controller.cron, controller.scheduledTime), async path => {
      const request = new Request(env.APP_URL!.replace(/\/$/, '') + path, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
      return nodeFetch(request as never, env, ctx);
    }, result => {
      // The shared runner logs bounded counters only; a 200 response can still contain delivery failures.
      console.log('Scheduled job', result);
    });
  },
};
