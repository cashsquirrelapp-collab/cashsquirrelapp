import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';

process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://finance-access.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.SESSION_SECRET = 'finance-test-only-secret-'.repeat(4);
process.env.STRIPE_SECRET_KEY = 'rk_live_mock_finance_key_not_a_real_secret';
process.env.STRIPE_MODE = 'live';

const ownerEmail = 'heidnsko1234@gmail.com';
const confirmedAt = '2026-01-01T00:00:00Z';
const user = {
  id: '11111111-1111-4111-8111-111111111111', email: ownerEmail,
  email_confirmed_at: confirmedAt as string | undefined,
  created_at: confirmedAt, user_metadata: {} as Record<string, unknown>,
};
const sessionId = '33333333-3333-4333-8333-333333333333';
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: user.id, session_id: sessionId })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
const headers = { cookie, 'x-account-id': user.id };
const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
let role: 'admin' | 'user' = 'admin';
let stripeReads = 0;

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.origin === process.env.SUPABASE_URL) {
      if (url.pathname === '/auth/v1/user') return json(user);
      if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
      if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role });
      throw new Error(`Unexpected database read ${url.pathname}`);
    }
    if (url.hostname === 'api.stripe.com') {
      stripeReads++;
      assert.equal(init?.method || 'GET', 'GET');
      if (url.pathname === '/v1/balance') return json({ object: 'balance', livemode: true, available: [{ amount: -263, currency: 'thb' }], pending: [{ amount: 15620, currency: 'thb' }] });
      if (['/v1/balance_transactions', '/v1/charges', '/v1/payouts'].includes(url.pathname)) return json({ object: 'list', data: [], has_more: false });
      throw new Error(`Unexpected Stripe read ${url.pathname}`);
    }
    return realFetch(input, init);
  };
  server = await new Promise<Server>(resolve => {
    const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
  });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

beforeEach(() => {
  user.email = ownerEmail;
  user.email_confirmed_at = confirmedAt;
  user.user_metadata = {};
  role = 'admin';
  stripeReads = 0;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('verified current owner can read real finance sections through the route with no-store', async () => {
  const response = await realFetch(`${origin}/api/admin-stripe-finance?range=30`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as any;
  assert.equal(body.scope, 'stripe_account');
  assert.equal(body.balance.data.currencies[0].available, -263);
  assert.equal(body.balance.data.currencies[0].pending, 15620);
  assert.equal(body.payouts.data.nextPayoutsComplete, true);
  assert.equal(stripeReads, 6);
});

test('another admin is rejected before any Stripe read despite forged owner identity metadata', async () => {
  user.email = 'another-admin@example.com';
  user.user_metadata = { email: ownerEmail, role: 'admin', canViewAdminAnalytics: true };
  const response = await realFetch(`${origin}/api/admin-stripe-finance?email=${ownerEmail}`, { headers: { ...headers, 'x-user-email': ownerEmail } });
  assert.equal(response.status, 403);
  assert.equal(stripeReads, 0);
  const body = await response.json() as any;
  for (const key of ['balance', 'summary', 'payments', 'payouts']) assert.equal(body[key], undefined);
});

test('unverified owner, revoked admin role, anonymous and switched-account sessions cannot read Stripe', async () => {
  user.email_confirmed_at = undefined;
  assert.equal((await realFetch(`${origin}/api/admin-stripe-finance`, { headers })).status, 403);
  user.email_confirmed_at = confirmedAt;
  role = 'user';
  assert.equal((await realFetch(`${origin}/api/admin-stripe-finance`, { headers })).status, 403);
  role = 'admin';
  assert.equal((await realFetch(`${origin}/api/admin-stripe-finance`)).status, 401);
  assert.equal((await realFetch(`${origin}/api/admin-stripe-finance`, { headers: { cookie } })).status, 401);
  assert.equal((await realFetch(`${origin}/api/admin-stripe-finance`, { headers: { ...headers, 'x-account-id': sessionId } })).status, 401);
  assert.equal(stripeReads, 0);
});

test('invalid date ranges are rejected before provider access and writes are not accepted', async () => {
  assert.equal((await realFetch(`${origin}/api/admin-stripe-finance?range=365`, { headers })).status, 400);
  const response = await realFetch(`${origin}/api/admin-stripe-finance`, { method: 'POST', headers: { ...headers, origin: process.env.APP_URL!, 'x-csrf-protection': '1', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 405);
  assert.equal(stripeReads, 0);
});
