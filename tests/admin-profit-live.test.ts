import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';

// The admin page's live profit and AI cost (owner, 2026-10-25): owner-only and read-only; the same report engine as
// the monthly LINE report, with no AI note and nothing saved. A fake Supabase and Stripe: no network, no keys.

process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://profit-live.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.SESSION_SECRET = 'profit-live-test-only-secret-'.repeat(4);
process.env.STRIPE_SECRET_KEY = 'rk_live_mock_profit_key_not_a_real_secret';
process.env.STRIPE_MODE = 'live';

const ownerEmail = 'heidnsko1234@gmail.com';
const confirmedAt = '2026-01-01T00:00:00Z';
const user = { id: '11111111-1111-4111-8111-111111111111', email: ownerEmail, email_confirmed_at: confirmedAt as string | undefined, created_at: confirmedAt, user_metadata: {} as Record<string, unknown> };
const member = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: user.id, session_id: sessionId })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
const headers = { cookie, 'x-account-id': user.id };
const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
let role: 'admin' | 'user' = 'admin';
let reads: string[] = [];
let writes: string[] = [];

const aiMonth = {
  accounts: [{ user_id: member, messages: 40, failed_requests: 0, gemini_messages: 36, claude_messages: 4, krarok_tokens: 420, actual_usd: '0.120000', billable_usd: '0.110000',
    cache_overhead_usd: '0.010000', failed_attempt_usd: '0.000000', quota_overrun_usd: '0.000000', cache_saved_usd: '0.030000', escalated_usd: '0.000000', gemini_usd: '0.040000',
    claude_usd: '0.080000', other_usd: '0.000000', gemini_calls: 36, claude_calls: 4, gemini_failed_calls: 0, claude_failed_calls: 0, input_tokens: 40000, output_tokens: 4000,
    cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0, rows_without_cost_split: 0, cards_prepared: 6, cards_confirmed: 5, corrections: 1, tokens_used_up: false,
    latest_cycle_used: 420, latest_cycle_limit: 2500, is_admin: false }],
  coverage: { rows: 40, with_routing: 40, with_cost_split: 40, cost_without_split_usd: '0.000000' },
  days: { active: 3, near_cap: 0, at_cap: 0, max_usd: '0.050000' },
  reliability: { timeouts: 0, errors: 0, held_for_claude: 0, gemini_took_over: 0, escalations: 1, provider_retries: 0 },
  feedback: { by_kind: {}, top_questions: [], requested_features: [] },
};

before(async () => {
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = init?.method || request?.method || 'GET';
    const json = (body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...extra } });
    if (url.origin === process.env.SUPABASE_URL) {
      if (url.pathname === '/auth/v1/user') return json(user);
      if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
      if (method !== 'GET' && method !== 'HEAD' && !url.pathname.includes('/rpc/')) writes.push(url.pathname);
      reads.push(url.pathname);
      const accept = new Headers(init?.headers ?? request?.headers).get('accept') || '';
      if (url.pathname.endsWith('/cashflow_user_roles') && url.searchParams.get('select') === 'role') return json(role === 'admin' ? [{ role }] : []);
      if (url.pathname.endsWith('/rpc/cashflow_admin_ai_month')) return json(aiMonth);
      if (url.pathname.endsWith('/cashflow_admin_cost_settings')) return json([
        { key: 'coding_tool', kind: 'fixed_monthly', label: 'เครื่องมือเขียนโค้ด', amount: '750.0000', active: true },
        { key: 'usd_thb', kind: 'fx_usd_thb', label: 'อัตรา', amount: '33.5000', active: true }]);
      if (url.pathname.endsWith('/cashflow_ai_usage') && url.searchParams.get('select') === 'cost_usd') return json([{ cost_usd: '0.0125' }, { cost_usd: '0.0300' }]);
      if (url.pathname.endsWith('/cashflow_ai_usage')) return json([], { 'content-range': '*/2' });
      if (url.pathname.endsWith('/cashflow_admin_reports') && accept.includes('vnd.pgrst.object')) return json(null);
      return json([]);
    }
    if (url.hostname === 'api.stripe.com') {
      reads.push(`stripe${url.pathname}`);
      assert.equal(method, 'GET');
      return json({ object: 'list', data: [], has_more: false });
    }
    if (/googleapis|anthropic|openai/.test(url.hostname)) throw new Error('no AI call is allowed here');
    return realFetch(input, init);
  };
  server = await new Promise<Server>(resolve => { const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => { user.email = ownerEmail; user.email_confirmed_at = confirmedAt; user.user_metadata = {}; role = 'admin'; reads = []; writes = []; });
after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('the owner gets this month so far: real AI cost, the report figures, today against the cap; nothing saved, no AI note', async () => {
  const response = await realFetch(`${origin}/api/admin-profit-live`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as any;
  assert.equal(body.live, true);
  assert.match(body.month, /^\d{4}-\d{2}$/);
  // $0.12 at ฿33.50 = ฿4.02, from the usage rows, not from Krarok Tokens.
  assert.equal(body.metrics.ai.thb.total, 402);
  assert.equal(body.metrics.ai.requests, 40);
  assert.equal(body.accounts.find((row: any) => row.userId === member).aiUsd, 120_000);
  assert.deepEqual(body.today, { usdMicro: 42_500, capUsd: body.today.capUsd, requests: 2 });
  assert.ok(body.metrics.profit.unknownCosts.includes('Cloudflare'), 'costs not set yet are named, not 0');
  assert.equal(body.settings.fixedMonthlySatang, 75_000);
  assert.ok(reads.some(path => path.startsWith('stripe/v1/')), 'Stripe is read');
  assert.deepEqual(writes, [], 'nothing is written');
});

test('a past month is the whole month without today; a future or bad month is refused before anything is read', async () => {
  const past = await realFetch(`${origin}/api/admin-profit-live?month=2026-09`, { headers });
  assert.equal(past.status, 200);
  const body = await past.json() as any;
  assert.deepEqual([body.month, body.live, body.today], ['2026-09', false, null]);
  reads = [];
  for (const month of ['2999-01', '2026-13', 'abc']) {
    assert.equal((await realFetch(`${origin}/api/admin-profit-live?month=${month}`, { headers })).status, 400, month);
  }
  assert.deepEqual(reads.filter(path => !path.endsWith('/cashflow_user_roles')), []);
});

test('another admin, a revoked role, a switched account or no session gets nothing', async () => {
  user.email = 'another-admin@example.com';
  user.user_metadata = { email: ownerEmail, role: 'admin', canViewAdminAnalytics: true };
  const other = await realFetch(`${origin}/api/admin-profit-live`, { headers });
  assert.equal(other.status, 403);
  assert.equal(((await other.json()) as any).metrics, undefined);
  user.email = ownerEmail; user.user_metadata = {};
  role = 'user';
  assert.equal((await realFetch(`${origin}/api/admin-profit-live`, { headers })).status, 403);
  role = 'admin';
  assert.equal((await realFetch(`${origin}/api/admin-profit-live`)).status, 401);
  assert.equal((await realFetch(`${origin}/api/admin-profit-live`, { headers: { ...headers, 'x-account-id': sessionId } })).status, 401);
  assert.deepEqual(reads.filter(path => !path.endsWith('/cashflow_user_roles')), [], 'no report data was read for them');
});
