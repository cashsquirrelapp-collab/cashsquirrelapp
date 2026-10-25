import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
import { proTokensFor } from '../shared/proTokens.js';

// The admin page's AI credit (owner, 2026-10-25): owner-only; GET works out each provider's position, POST records the
// balance the provider's console shows. A fake Supabase: no network, no keys.

process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://ai-credit.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.SESSION_SECRET = 'ai-credit-test-only-secret-'.repeat(4);

const ownerEmail = 'heidnsko1234@gmail.com';
const user = { id: '11111111-1111-4111-8111-111111111111', email: ownerEmail, email_confirmed_at: '2026-01-01T00:00:00Z' as string | undefined, created_at: '2026-01-01T00:00:00Z', user_metadata: {} as Record<string, unknown> };
const sessionId = '33333333-3333-4333-8333-333333333333';
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: user.id, session_id: sessionId })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
const headers = { cookie, 'x-account-id': user.id };
const post = { ...headers, origin: process.env.APP_URL, 'x-csrf-protection': '1', 'content-type': 'application/json' };
const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
let role: 'admin' | 'user' = 'admin';
let records: { provider: string; balance_usd: string; recorded_at: string; note: string | null }[] = [];
let inserted: unknown[] = [];
let reads: string[] = [];

before(async () => {
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = init?.method || request?.method || 'GET';
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.origin === process.env.SUPABASE_URL) {
      if (url.pathname === '/auth/v1/user') return json(user);
      if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
      if (url.pathname.endsWith('/cashflow_user_roles')) return json(role === 'admin' ? [{ role }] : []);
      reads.push(`${method} ${url.pathname}`);
      if (url.pathname.endsWith('/cashflow_admin_ai_credit') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? (request ? await request.text() : '{}')));
        inserted.push(body);
        records.unshift({ provider: body.provider, balance_usd: body.balance_usd, recorded_at: new Date().toISOString(), note: body.note });
        return json(null, 201);
      }
      if (url.pathname.endsWith('/cashflow_admin_ai_credit')) return json(records);
      if (url.pathname.endsWith('/rpc/cashflow_admin_ai_provider_spend')) return json([{ provider: 'anthropic', day: new Date(Date.now() + 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10), usd: '2.000000', requests: 40 }]);
      if (url.pathname.endsWith('/rpc/cashflow_admin_ai_billing_issues')) return json([]);
      if (url.pathname.endsWith('/cashflow_admin_cost_settings')) return json([{ key: 'usd_thb', kind: 'fx_usd_thb', label: 'อัตรา', amount: '33.5000', active: true }]);
      // Paid plans covering now (shared/proTokens.ts): one yearly order bought after the change, one monthly card renewal before it.
      if (url.pathname.endsWith('/cashflow_prepaid_orders')) return json([{ user_id: 'u-year', period: 'year', amount: 156200, paid_at: new Date(Date.now() - 86_400_000).toISOString(), entitled_until: '2099-01-01T00:00:00Z', created_at: new Date(Date.now() - 86_400_000).toISOString() }]);
      if (url.pathname.endsWith('/cashflow_card_cycles')) return json([{ user_id: 'u-card', period_start: new Date(Date.now() - 86_400_000).toISOString(), period_end: '2099-01-01T00:00:00Z', refunded: false, paid_order: { period: 'month', created_at: '2026-10-20T00:00:00Z' } }]);
      return json([]);
    }
    return realFetch(input, init);
  };
  server = await new Promise<Server>(resolve => { const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => { role = 'admin'; user.email = ownerEmail; records = []; inserted = []; reads = []; });
after(async () => { globalThis.fetch = realFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test('the owner records a balance and sees credit left, days left and the reserve', async () => {
  const empty = await realFetch(`${origin}/api/admin-ai-credit`, { headers });
  assert.equal(empty.status, 200);
  const before = await empty.json() as any;
  assert.deepEqual(before.providers.map((p: any) => [p.provider, p.status]), [['anthropic', 'unknown'], ['google', 'unknown']]);
  // The worst case adds each paid plan's own tokens (here both paid before the change, or a yearly plan after it).
  const start = Date.now() - 86_400_000;
  const yearly = proTokensFor({ period: 'year', chargedBaht: 1562, start });
  const card = proTokensFor({ period: 'month', chargedBaht: null, start });
  assert.deepEqual(before.allowance, { proTokens: 1650, tokenUsd: 0.001, planTokens: yearly + card, planAccounts: 2 });
  const saved = await realFetch(`${origin}/api/admin-ai-credit`, { method: 'POST', headers: post, body: JSON.stringify({ provider: 'anthropic', balanceUsd: 50, note: 'เติมแล้ว' }) });
  assert.equal(saved.status, 200);
  assert.deepEqual(inserted, [{ provider: 'anthropic', balance_usd: '50.0000', note: 'เติมแล้ว', created_by: user.id }]);
  const body = await saved.json() as any;
  const claude = body.providers.find((p: any) => p.provider === 'anthropic');
  assert.equal(claude.recorded.balanceMicro, 50_000_000);
  assert.equal(body.rate4, 335_000);
});

test('bad amounts are refused; another account and a non-admin get nothing and write nothing', async () => {
  for (const body of [{ provider: 'openai', balanceUsd: 5 }, { provider: 'anthropic', balanceUsd: -1 }, { provider: 'anthropic', balanceUsd: 5, extra: 1 }, { provider: 'anthropic' }]) {
    assert.equal((await realFetch(`${origin}/api/admin-ai-credit`, { method: 'POST', headers: post, body: JSON.stringify(body) })).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(inserted, []);
  role = 'user';
  assert.equal((await realFetch(`${origin}/api/admin-ai-credit`, { headers })).status, 403);
  assert.equal((await realFetch(`${origin}/api/admin-ai-credit`, { method: 'POST', headers: post, body: JSON.stringify({ provider: 'anthropic', balanceUsd: 5 }) })).status, 403);
  role = 'admin';
  user.email = 'another-admin@example.com';
  assert.equal((await realFetch(`${origin}/api/admin-ai-credit`, { headers })).status, 403);
  assert.equal((await realFetch(`${origin}/api/admin-ai-credit`, { headers: { ...headers, 'x-account-id': sessionId } })).status, 401);
  assert.deepEqual(inserted, []);
  assert.deepEqual(reads, [], 'nothing about credit was read for them');
});
