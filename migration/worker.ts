import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import { createApp } from '../backend/src/http/app.js';
import { seal, unseal } from '../backend/src/security/cookies.js';
import { readRawBody } from '../backend/src/http/guard.js';
import { nodeFixture } from './fixture.js';
import Stripe from 'stripe';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { configurationReady, allowedCoreRequest, configuredFeatures, scheduledPaths, STAGING_ORIGIN } from './staging-policy.js';
import { withCloudflareClientIp } from '../backend/src/security/requestContext.js';
import { runScheduledJobs } from './scheduled-runner.js';

// Only explicitly enabled routes can reach the isolated staging database.
const app = express();
app.disable('x-powered-by');
app.get('/__migration/health', (_req, res) => {
  const sample = { rehearsal: true };
  const token = seal(sample);
  const roundTrip = unseal<{ rehearsal: boolean }>(token);
  res.json({ status: 'isolated-rehearsal', backendEnabled: false,
    cryptoRoundTrip: roundTrip?.rehearsal === true,
    nodeCookieReadable: unseal<{ rehearsal: boolean }>(nodeFixture)?.rehearsal === true,
    syntheticCookie: token });
});
app.post('/__migration/raw-body', async (req, res) => {
  try {
    const body = await readRawBody(req as any, 1024);
    res.json({ bytes: body.length, hex: body.toString('hex') });
  } catch { res.status(413).json({ error: 'Probe limit exceeded' }); }
});
app.post('/__migration/stripe-signature', async (req, res) => {
  try {
    const raw = await readRawBody(req as any, 1024);
    const event = await Stripe.webhooks.constructEventAsync(raw, String(req.headers['stripe-signature'] || ''), 'synthetic-webhook-secret');
    res.json({ verified: true, eventType: event.type });
  } catch (error) { res.status(400).json({ verified: false, diagnostic: String(error) }); }
});
app.post('/__migration/line-signature', async (req, res) => {
  const raw = await readRawBody(req as any, 1024);
  const actual = Buffer.from(String(req.headers['x-line-signature'] || ''));
  const expected = Buffer.from(createHmac('sha256', 'synthetic-line-secret').update(raw).digest('base64'));
  const verified = actual.length === expected.length && timingSafeEqual(actual, expected);
  res.status(verified ? 200 : 401).json({ verified });
});
// Keep the same Express handlers used by the verified Vercel release.
app.use(createApp());
app.listen(3000);
const nodeHandler = httpServerHandler({ port: 3000 });
const nodeFetch = nodeHandler.fetch;
if (!nodeFetch) throw new Error('Cloudflare Node HTTP handler is unavailable');

export default {
  async scheduled(controller: ScheduledController, env: { [key: string]: unknown }, ctx: ExecutionContext) {
    if (!configuredFeatures(env).cron) throw new Error('Staging cron is not configured safely');
    await runScheduledJobs(scheduledPaths(controller.cron), async path => {
      // Internal scheduled requests have no incoming edge metadata; the Node adapter only consumes HTTP fields.
      const request = new Request(STAGING_ORIGIN + path, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }) as Request<unknown, IncomingRequestCfProperties>;
      return nodeFetch!(request, env, ctx);
    });
  },
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: { ASSETS: Fetcher; MIGRATION_PROBES?: string; STAGING_MODE?: string; [key: string]: unknown }, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    const ready = configurationReady(env);
    let response: Response;
    if (path === '/__staging/health') {
      response = Response.json({ status: ready ? 'core-staging' : 'mock-staging', database: ready ? 'staging-configured' : 'not-connected', features: configuredFeatures(env), featureState: 'configured-not-end-to-end-verification', accountDeletion: 'dry-run-only', baseline: 'dpl_GPqGXqmmkay7mA3GFECH7r2tc2rX' });
    } else if (path === '/__staging/status') {
      response = new Response('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staging กระรอกตุนเงิน</title><style>body{font:17px/1.8 system-ui;max-width:760px;margin:50px auto;padding:24px;color:#173c30;background:#f5f4f0}a{color:#176347}</style><h1>กระรอกตุนเงิน · Staging</h1><p>เวอร์ชันทดสอบบน Cloudflare ฐานข้อมูลแยกจากเว็บจริง ตรวจสถานะปัจจุบันจากแถบ STAGING ด้านล่าง เปิดบริการทดสอบทีละรายการตามการตั้งค่าที่ผ่านตรวจสอบ งานลบบัญชีเป็นการซ้อมตรวจรายการเท่านั้น</p><p>เมื่อเชื่อมฐานข้อมูลแล้ว ให้ใช้บัญชีทดสอบที่เตรียมไว้เพื่อบันทึกข้อมูลและเอกสารตัวอย่าง หลีกเลี่ยงข้อมูลส่วนตัวและเอกสารจริง โหมดข้อมูลตัวอย่างเก็บเฉพาะในเบราว์เซอร์</p><p><a href="/">เปิดหน้าเว็บ</a></p><script src="/staging-banner.js" defer></script></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } else if (path.startsWith('/__migration/')) {
      response = env.MIGRATION_PROBES === 'enabled' && env.STAGING_MODE === 'mock'
        ? await withCloudflareClientIp(request, () => nodeFetch(request, env, ctx))
        : new Response('Not found', { status: 404 });
    } else if ((path === '/api' || path.startsWith('/api/')) && ready) {
      response = await allowedCoreRequest(request, env)
        ? await withCloudflareClientIp(request, () => nodeFetch(request, env, ctx))
        : Response.json({ error: 'ฟีเจอร์นี้ยังไม่เปิดใน staging กรุณาใช้บัญชีทดสอบที่เตรียมไว้', code: 'STAGING_FEATURE_DISABLED' }, { status: 503 });
    } else if (path === '/api/auth' && request.method === 'GET' && !new URL(request.url).search) {
      response = Response.json({ session: null, stagingMode: 'mock' });
    } else if (path === '/api' || path.startsWith('/api/')) {
      response = Response.json({ error: 'ระบบทดสอบนี้ใช้ข้อมูลจำลอง ยังไม่เปิดการเชื่อมบริการจริง', code: 'STAGING_INTEGRATION_DISABLED' }, { status: 503 });
    } else {
      response = await env.ASSETS.fetch(request);
    }
    const headers = new Headers(response.headers);
    // Preserve separate session and PKCE cookies through the Node-to-Fetch adapter.
    const cookies = response.headers.getSetCookie();
    if (cookies.length) {
      headers.delete('Set-Cookie');
      for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    }
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    // Permit the LIFF SDK only when its isolated provider is enabled; preserve stricter file CSP.
    if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' ${configuredFeatures(env).line ? 'https://static.line-scdn.net' : ''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ${configuredFeatures(env).line ? 'https://api.line.me https://access.line.me https://liff.line.me' : ''}; frame-src ${configuredFeatures(env).line ? 'https://access.line.me https://liff.line.me' : "'none'"}; object-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'`);
    return new Response(response.body, { status: response.status, headers });
  }
};
