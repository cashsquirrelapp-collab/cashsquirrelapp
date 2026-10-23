import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
import { canViewAdminAnalytics } from '../backend/src/security/adminAnalyticsAccess.js';

process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://analytics-access.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.SESSION_SECRET = 'analytics-test-only-secret-'.repeat(4);

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
let privateReads = 0;
let profiles = [{ user_id: user.id, public_id: 'SQ-0000000001', display_name: 'Owner', created_at: confirmedAt }];
let prepaid: Record<string, unknown>[] = [];
let fullProfilePages = false;
// Count-only requests (the live revenue pulse), by table.
let pulseCounts: Record<string, number> = {};
let pulseReads = 0;

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
    if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role });
    if (init?.method === 'HEAD') {
      pulseReads++;
      return new Response(null, { headers: { 'content-range': `*/${pulseCounts[url.pathname.split('/').pop()!] ?? 0}` } });
    }
    privateReads++;
    if (url.pathname.endsWith('/cashflow_profiles')) return json(fullProfilePages ? Array.from({ length: 1000 }, () => profiles[0]) : profiles);
    if (url.pathname.endsWith('/cashflow_payments')) return json([{ payment_id: 'pi_owner_only', user_id: user.id, amount: 14900, currency: 'thb', paid_at: new Date().toISOString(), refunded: false }]);
    if (url.pathname.endsWith('/cashflow_prepaid_orders')) {
      assert.equal(url.searchParams.get('livemode'), 'eq.true');
      assert.equal(url.searchParams.get('status'), 'in.(paid,refunded)');
      return json(prepaid);
    }
    if (url.pathname.endsWith('/cashflow_card_cycles')) {
      assert.equal(url.searchParams.get('cashflow_prepaid_orders.livemode'), 'eq.true');
      assert.ok(url.searchParams.get('select')?.includes('cashflow_prepaid_orders!inner(livemode)'));
      return json([]);
    }
    if (['subscriptions', 'cashflow_usage_daily', 'cashflow_documents', 'cashflow_promptpay_payments', 'cashflow_stripe_events'].some(table => url.pathname.endsWith(`/${table}`))) return json([]);
    throw new Error(`Unexpected mock endpoint ${url.pathname}`);
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
  privateReads = 0;
  pulseReads = 0;
  pulseCounts = {};
  profiles = [{ user_id: user.id, public_id: 'SQ-0000000001', display_name: 'Owner', created_at: confirmedAt }];
  prepaid = [];
  fullProfilePages = false;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('only the exact verified owner email with the current admin role is eligible', () => {
  assert.equal(canViewAdminAnalytics(user, 'admin'), true);
  assert.equal(canViewAdminAnalytics({ ...user, email: ownerEmail.toUpperCase() }, 'admin'), true);
  for (const email of [undefined, 'another-admin@example.com', 'heidnsko1234+admin@gmail.com', 'heidnsko1234@gmail.com.evil.test']) {
    assert.equal(canViewAdminAnalytics({ ...user, email }, 'admin'), false);
  }
  assert.equal(canViewAdminAnalytics({ ...user, email_confirmed_at: undefined }, 'admin'), false);
  assert.equal(canViewAdminAnalytics(user, 'user'), false);
});

test('verified owner can receive analytics and its financial fields', async () => {
  const response = await realFetch(`${origin}/api/admin-analytics?range=30`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as any;
  assert.equal(body.totals.revenue, 14900);
  assert.equal(body.payments[0].amount, 14900);
  assert.equal(body.accounts[0].totalSpent, 14900);
  assert.equal(privateReads, 9);
});

test('live prepaid QR updates dashboard revenue, payer history and account spending without a legacy ledger entry', async () => {
  prepaid = [
    { payment_id: 'pi_direct_159', user_id: user.id, amount: 15900, paid_at: new Date().toISOString(), status: 'paid', livemode: true },
    { payment_id: 'pi_refunded', user_id: user.id, amount: 84900, paid_at: new Date().toISOString(), status: 'refunded', livemode: true },
  ];
  const response = await realFetch(`${origin}/api/admin-analytics?range=30`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.totals.revenue, 30800);
  assert.equal(body.totals.paymentCount, 2);
  assert.equal(body.accounts[0].totalSpent, 30800);
  assert.equal(body.accounts[0].paymentCount, 2);
  assert.equal(body.daily.reduce((sum: number, day: any) => sum + day.revenue, 0), 30800);
  assert.equal(body.payments.find((payment: any) => payment.id === 'pi_direct_159')?.amount, 15900);
  assert.equal(body.payments.find((payment: any) => payment.id === 'pi_refunded')?.refunded, true);
});

test('signup counts use the same inclusive Bangkok dates as the revenue report', async () => {
  const day = 86_400_000;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const start = Date.parse(`${today}T00:00:00.000Z`) - 6 * day - 7 * 3_600_000;
  profiles = [
    { ...profiles[0], created_at: new Date(start + 30 * 60_000).toISOString() },
    { ...profiles[0], user_id: 'before', created_at: new Date(start - 1).toISOString() },
    { ...profiles[0], user_id: 'future', created_at: new Date(start + 7 * day).toISOString() },
  ];
  const response = await realFetch(`${origin}/api/admin-analytics?range=7`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.totals.accounts, 3);
  assert.equal(body.totals.newAccounts, 1);
});

test('the report fails explicitly rather than silently truncating financial data at the pagination limit', async () => {
  fullProfilePages = true;
  const response = await realFetch(`${origin}/api/admin-analytics`, { headers });
  assert.equal(response.status, 500);
  const body = await response.json() as any;
  assert.equal(body.totals, undefined);
});

test('another admin is denied before reading private tables, despite forged identity hints', async () => {
  user.email = 'another-admin@example.com';
  user.user_metadata = { email: ownerEmail, role: 'admin', canViewAdminAnalytics: true };
  const response = await realFetch(`${origin}/api/admin-analytics?range=30&email=${ownerEmail}`, {
    headers: { ...headers, 'x-user-email': ownerEmail },
  });
  assert.equal(response.status, 403);
  assert.equal(privateReads, 0);
  const body = await response.json() as any;
  for (const field of ['totals', 'payments', 'accounts', 'daily', 'personas']) assert.equal(body[field], undefined);
});

test('unverified owner and revoked admin privileges fail closed', async () => {
  user.email_confirmed_at = undefined;
  assert.equal((await realFetch(`${origin}/api/admin-analytics`, { headers })).status, 403);
  user.email_confirmed_at = confirmedAt;
  role = 'user';
  assert.equal((await realFetch(`${origin}/api/admin-analytics`, { headers })).status, 403);
  assert.equal(privateReads, 0);
});

test('anonymous and account-mismatched requests cannot read analytics', async () => {
  assert.equal((await realFetch(`${origin}/api/admin-analytics`)).status, 401);
  assert.equal((await realFetch(`${origin}/api/admin-analytics`, { headers: { cookie } })).status, 401);
  assert.equal((await realFetch(`${origin}/api/admin-analytics`, { headers: { ...headers, 'x-account-id': sessionId } })).status, 401);
  assert.equal(privateReads, 0);
});

test('session capability comes from server-verified identity, not editable metadata', async () => {
  const session = async () => (await (await realFetch(`${origin}/api/auth`, { headers })).json() as any).session;
  assert.equal((await session()).user.canViewAdminAnalytics, true);
  user.email = 'another-admin@example.com';
  user.user_metadata = { email: ownerEmail, canViewAdminAnalytics: true };
  assert.equal((await session()).user.canViewAdminAnalytics, false);
  assert.equal(privateReads, 0);
});

test('live revenue pulse: owner only, cheap, and it changes when a payment arrives or is refunded', async () => {
  const pulse = async () => realFetch(`${origin}/api/admin-analytics?pulse=1`, { headers });
  const first = await pulse();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const a = (await first.json() as any).signature;
  assert.equal(typeof a, 'string');
  assert.equal(pulseReads, 8);
  assert.equal(privateReads, 0); // counts only: no payment rows, names or amounts are read
  assert.equal((await (await pulse()).json() as any).signature, a);
  pulseCounts.cashflow_prepaid_orders = 1; // a QR or one-time card payment
  const b = (await (await pulse()).json() as any).signature;
  assert.notEqual(b, a);
  pulseCounts.cashflow_card_cycles = 1; // a renewal refunded
  assert.notEqual((await (await pulse()).json() as any).signature, b);

  // The full snapshot carries the pulse taken before it was read, so nothing lands unseen.
  const snapshot = await (await realFetch(`${origin}/api/admin-analytics?range=30`, { headers })).json() as any;
  assert.equal(typeof snapshot.liveSignature, 'string');

  pulseReads = 0;
  role = 'user';
  assert.equal((await pulse()).status, 403);
  role = 'admin';
  user.email = 'another-admin@example.com';
  assert.equal((await pulse()).status, 403);
  assert.equal((await realFetch(`${origin}/api/admin-analytics?pulse=1`)).status, 401);
  assert.equal(pulseReads, 0);
});
