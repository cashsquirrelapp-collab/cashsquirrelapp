import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
import { adminLevel, isOwnerAccount } from '../backend/src/security/adminAnalyticsAccess.js';
import { allowance, GRANT_TOKEN_BUCKET, type PlanInfo } from '../backend/src/ai/service.js';
import { grantedOnly } from '../backend/src/ai/supabaseDb.js';
import { aiConfig } from '../backend/src/ai/config.js';
import { accountTarget, grantedTotal, readGrants, GRANT_MAX_TOKENS } from '../shared/tokenGrants.js';
import { withoutMoney, type AdminAnalyticsSummary } from '../shared/adminAnalytics.js';
import { TEAM_ADMIN_VIEWS } from '../shared/adminLevel.js';

// Owner, 2026-11-04: two levels on the admin page (ผู้ดูแล and แอดมิน: the team never sees revenue, profit and cost, or the
// cash overview), admin rights given by the owner alone, and tokens given to any account by its UID.

const OWNER_EMAIL = 'heidnsko1234@gmail.com';
const confirmed = '2026-01-01T00:00:00Z';
const config = { ...aiConfig({}), enabled: true, proTokensPerCycle: 1650, trialTokens: 30 };

test('levels: the owner by verified email and admin role; any other admin is the team; nobody else', () => {
  assert.equal(adminLevel({ email: OWNER_EMAIL, email_confirmed_at: confirmed }, 'admin'), 'owner');
  assert.equal(adminLevel({ email: ' HEIDNSKO1234@gmail.com ', email_confirmed_at: confirmed }, 'admin'), 'owner');
  assert.equal(adminLevel({ email: 'team@example.com', email_confirmed_at: confirmed }, 'admin'), 'admin');
  assert.equal(adminLevel({ email: OWNER_EMAIL, email_confirmed_at: undefined }, 'admin'), 'admin', 'an unconfirmed owner email is never the owner');
  assert.equal(adminLevel({ email: OWNER_EMAIL, email_confirmed_at: confirmed }, 'user'), null);
  assert.equal(isOwnerAccount({ email: OWNER_EMAIL, email_confirmed_at: confirmed }), true);
  // The team's sections never include money, rights or tokens.
  for (const view of ['overview', 'revenue', 'profit', 'operations', 'team']) assert.equal((TEAM_ADMIN_VIEWS as readonly string[]).includes(view), false, view);
  assert.deepEqual([...TEAM_ADMIN_VIEWS], ['activity', 'product', 'customers', 'onboarding', 'feedback', 'broadcast']);
});

test('withoutMoney: every money figure goes, counts and plans stay', () => {
  const summary = {
    range: 30, fromDate: '2026-10-06', toDate: '2026-11-04', generatedAt: '2026-11-04T00:00:00Z', liveSignature: 'sig',
    totals: { accounts: 9, newAccounts: 2, activeUsers: 5, previousActiveUsers: 4, pageViews: 80, proAccounts: 3, paidProAccounts: 2, trialAccounts: 1,
      freeAccounts: 5, revenue: 35400, previousRevenue: 17700, paymentCount: 2, conversionRate: 0.22, averageRevenuePerPayer: 17700 },
    daily: [{ date: '2026-11-04', activeUsers: 3, pageViews: 20, revenue: 17700, payments: 1 }],
    features: [], personas: [{ key: 'freelance', accounts: 4, activeUsers: 3, proAccounts: 2, revenue: 35400 }],
    accounts: [{ userId: 'a', publicId: 'SQ-1', displayName: 'A', createdAt: confirmed, persona: 'freelance', jobTypes: [], planStatus: 'pro', plan: 'pro_prepaid',
      currentPeriodEnd: '2026-12-01', totalSpent: 17700, paymentCount: 1, lastPaymentAt: '2026-11-01', activeDays: 4, pageViews: 30, lastSeenAt: null, topFeatures: [] }],
    payments: [{ id: 'pi_1', userId: 'a', publicId: 'SQ-1', displayName: 'A', amount: 17700, currency: 'thb', paidAt: '2026-11-01', refunded: false }],
  } as unknown as AdminAnalyticsSummary;
  const team = withoutMoney(summary);
  assert.equal(team.moneyHidden, true);
  assert.equal('liveSignature' in team, false);
  assert.deepEqual(team.payments, []);
  assert.deepEqual([team.totals.revenue, team.totals.previousRevenue, team.totals.paymentCount, team.totals.averageRevenuePerPayer], [0, 0, 0, 0]);
  assert.deepEqual([team.daily[0].revenue, team.daily[0].payments, team.personas[0].revenue], [0, 0, 0]);
  assert.deepEqual([team.accounts[0].totalSpent, team.accounts[0].paymentCount, team.accounts[0].lastPaymentAt], [0, 0, null]);
  assert.deepEqual([team.totals.accounts, team.totals.proAccounts, team.accounts[0].planStatus, team.accounts[0].activeDays], [9, 3, 'pro', 4]);
  assert.equal(JSON.stringify(team).includes('17700'), false);
  assert.equal(summary.totals.revenue, 35400, 'the owner’s copy is untouched');
});

test('grants as stored: only well-formed ones count; the UID box takes SQ IDs and account UUIDs', () => {
  const grants = readGrants([
    { id: 'grant-0001', tokens: 200, at: '2026-11-04T05:00:00Z', note: '  รางวัลกิจกรรม ' },
    { id: 'grant-0002', tokens: 0, at: '2026-11-04T05:00:00Z' },
    { id: 'grant-0003', tokens: GRANT_MAX_TOKENS + 1, at: '2026-11-04T05:00:00Z' },
    { id: 'x', tokens: 10, at: '2026-11-04T05:00:00Z' },
    { id: 'grant-0004', tokens: 1.5, at: '2026-11-04T05:00:00Z' },
    { id: 'grant-0005', tokens: 50, at: 'not a date' },
    'junk', null,
    { id: 'grant-0006', tokens: 50, at: '2026-11-04T06:00:00Z' },
  ]);
  assert.deepEqual(grants.map(grant => grant.id), ['grant-0001', 'grant-0006']);
  assert.equal(grants[0].note, 'รางวัลกิจกรรม');
  assert.equal(grantedTotal(grants), 250);
  assert.deepEqual(readGrants('nope'), []);
  assert.deepEqual(accountTarget(' sq-6735ab827f '), { publicId: 'SQ-6735AB827F' });
  assert.deepEqual(accountTarget('11111111-1111-4111-8111-111111111111'), { userId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(accountTarget('SQ-123'), null);
  assert.equal(accountTarget('someone@example.com'), null);
});

test('given tokens alone open เลขา in one bucket from the day of the first grant; nothing refills', () => {
  assert.deepEqual(grantedOnly(undefined), { plan: 'none' });
  assert.deepEqual(grantedOnly([]), { plan: 'none' });
  const plan = grantedOnly([{ tokens: 300, at: '2026-11-04T18:30:00Z' }, { tokens: 200, at: '2026-11-03T20:00:00Z' }]);
  // 03:00 on 4 Nov in Bangkok is the first grant's day.
  assert.equal(plan.bucket, '2026-11-04');
  assert.equal(plan.granted, true);
  const limits = allowance(plan, config, new Date('2026-12-20T00:00:00Z'));
  assert.deepEqual(limits, { cycle: '2026-11-04', resetsAt: null, tokenLimit: 500, requestLimit: null });
});

test('given tokens on each plan: monthly plans take this cycle’s grants, allowances that never refill take all', () => {
  const now = new Date('2026-11-20T05:00:00Z');
  const grants = [
    { tokens: 100, at: '2026-10-25T05:00:00Z' }, // last month, and before the Pro cycle that started 1 Nov
    { tokens: 200, at: '2026-11-04T05:00:00Z' }, // this month and this cycle
  ];
  const limit = (plan: PlanInfo) => allowance(plan, config, now).tokenLimit;
  // Paid Pro renewing on the 1st: this cycle is 1 Nov – 1 Dec.
  assert.equal(limit({ plan: 'pro', periodEnd: '2026-12-01T00:00:00+07:00', grants }), 1650 + 200);
  assert.equal(limit({ plan: 'pro', periodEnd: '2026-12-01T00:00:00+07:00' }), 1650, 'no grants, no change');
  // Admins: the calendar month.
  assert.equal(limit({ plan: 'admin', grants }), 1650 + 200);
  // Pro given by hand never refills: every grant counts.
  assert.equal(allowance({ plan: 'pro', grants }, config, now).cycle, GRANT_TOKEN_BUCKET);
  assert.equal(limit({ plan: 'pro', grants }), 1650 + 300);
  // A tester: 200 of their own plus every grant; a plain trial too.
  assert.equal(limit({ plan: 'trial', tokens: 200, bucket: '2026-11-04', grants }), 200 + 300);
  assert.equal(limit({ plan: 'trial', grants }), 30 + 300);
  assert.equal(limit({ plan: 'trial' }), 30);
  // Pro that ended on 10 Nov: its last paid cycle is 10 Oct – 10 Nov. Grants from that cycle (25 Oct, 4 Nov) or since
  // (15 Nov) count; one from before it (1 Oct) does not.
  const lapsed: PlanInfo = { plan: 'lapsed', periodEnd: '2026-11-10T00:00:00+07:00', grants: [...grants, { tokens: 50, at: '2026-11-15T05:00:00Z' }, { tokens: 999, at: '2026-10-01T05:00:00Z' }] };
  assert.equal(limit(lapsed), 1650 + 100 + 200 + 50);
  // A malformed entry never adds.
  assert.equal(limit({ plan: 'admin', grants: [{ tokens: -5, at: '2026-11-04T05:00:00Z' }, { tokens: 10, at: 'x' }] }), 1650);
});

test('an admins’ token reset counts only grants given since it', () => {
  const now = new Date('2026-11-20T05:00:00Z');
  const reset = Date.parse('2026-11-10T00:00:00+07:00');
  const limits = allowance({ plan: 'admin', grants: [{ tokens: 200, at: '2026-11-04T05:00:00Z' }, { tokens: 70, at: '2026-11-12T05:00:00Z' }] },
    { ...config, adminTokensResetAt: reset }, now);
  assert.equal(limits.cycle, '2026-11-10');
  assert.equal(limits.tokenLimit, 1650 + 70);
});

// ── The owner's tools over HTTP ─────────────────────────────────────────────────────────────────

Object.assign(process.env, { APP_URL: 'http://127.0.0.1:3000', SUPABASE_URL: 'https://team-tokens.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin', SESSION_SECRET: 'team-tokens-secret-'.repeat(5) });
const OWNER = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const actor: Record<string, unknown> = { id: OWNER, email: OWNER_EMAIL, email_confirmed_at: confirmed, created_at: confirmed, user_metadata: {} };
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: OWNER, session_id: '33333333-3333-4333-8333-333333333333' })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
const headers = { cookie, 'x-account-id': OWNER, 'x-csrf-protection': '1', 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' };
const realFetch = globalThis.fetch;
let server: Server; let origin = '';
let roles: Record<string, 'admin' | 'user'> = {};
let privateState: Record<string, Record<string, unknown>> = {};
let patches: { p_user_id: string; p_patch: Record<string, unknown> }[] = [];
let roleCalls: Record<string, unknown>[] = [];
const profiles = [
  { user_id: OWNER, public_id: 'SQ-0000000001', display_name: 'Owner', created_at: confirmed },
  { user_id: FRIEND, public_id: 'SQ-6735AB827F', display_name: 'เพื่อน', created_at: confirmed },
];

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const eq = (column: string) => url.searchParams.get(column)?.replace(/^eq\./, '');
    if (url.pathname === '/auth/v1/user') return json(actor);
    const adminUser = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
    if (adminUser) {
      const id = adminUser[1];
      return json({ id, email: id === OWNER ? OWNER_EMAIL : 'friend@example.com', email_confirmed_at: confirmed, created_at: confirmed, user_metadata: {}, aud: 'authenticated' });
    }
    if (/cashflow_(session_active|rate_limit)$/.test(url.pathname)) return json(true);
    if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role: roles[eq('user_id') ?? ''] ?? 'user' });
    if (url.pathname.endsWith('/cashflow_profiles')) {
      const list = url.searchParams.get('user_id')?.match(/^in\.\((.*)\)$/);
      if (list) return json(profiles.filter(row => list[1].split(',').includes(row.user_id)));
      const found = profiles.find(row => (eq('public_id') ? row.public_id === eq('public_id') : row.user_id === eq('user_id')));
      return json(found ?? null);
    }
    if (url.pathname.endsWith('/cashflow_private_state')) {
      const id = eq('user_id');
      if (id) return json({ grants: privateState[id]?.aiTokenGrants ?? null });
      // The owner's log: every account with grants.
      return json(Object.entries(privateState).filter(([, data]) => data.aiTokenGrants).map(([user_id, data]) => ({ user_id, grants: data.aiTokenGrants })));
    }
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      const body = JSON.parse(String(init?.body));
      patches.push(body);
      privateState[body.p_user_id] = { ...(privateState[body.p_user_id] ?? {}), ...body.p_patch };
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith('/rpc/cashflow_set_system_role')) {
      const body = JSON.parse(String(init?.body));
      roleCalls.push(body);
      roles[body.p_target] = body.p_role;
      return new Response(null, { status: 204 });
    }
    // Plan and usage reads for the "tokens left" line: unanswered here, so the line is simply left out.
    return json({ message: 'not in this test' }, 500);
  };
  server = await new Promise<Server>(resolve => { const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => {
  actor.email = OWNER_EMAIL;
  roles = { [OWNER]: 'admin' };
  privateState = {};
  patches = [];
  roleCalls = [];
});
after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>(resolve => server.close(() => resolve()));
});
const get = (path: string) => realFetch(`${origin}${path}`, { headers });
const post = (body: unknown) => realFetch(`${origin}/api/admin-users`, { method: 'POST', headers, body: JSON.stringify(body) });

test('the owner finds an account by its UID and gives it tokens once, however often the same grant is sent', async () => {
  const found = await get('/api/admin-users?action=lookup&target=sq-6735ab827f');
  assert.equal(found.status, 200);
  const account = await found.json() as any;
  assert.deepEqual([account.userId, account.displayName, account.role, account.isOwner, account.granted], [FRIEND, 'เพื่อน', 'user', false, 0]);
  assert.equal((await get('/api/admin-users?action=lookup&target=SQ-FFFFFFFFFF')).status, 404);
  assert.equal((await get('/api/admin-users?action=lookup&target=hello')).status, 400);

  const grant = { action: 'grant-tokens', userId: FRIEND, tokens: 300, note: 'รางวัลกิจกรรม', requestId: 'grant-request-1' };
  const first = await post(grant);
  assert.equal(first.status, 200);
  const body = await first.json() as any;
  assert.equal(body.added, true);
  assert.equal(body.account.granted, 300);
  assert.equal(body.account.grants[0].note, 'รางวัลกิจกรรม');
  // A double click or a retry: the same id gives nothing more.
  const again = await post(grant);
  assert.equal((await again.json() as any).added, false);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].p_user_id, FRIEND);
  assert.deepEqual(Object.keys(patches[0].p_patch), ['aiTokenGrants'], 'only the grants are written');
  // A second grant adds to the first.
  await post({ ...grant, tokens: 200, requestId: 'grant-request-2', note: undefined });
  assert.equal(grantedTotal(readGrants(privateState[FRIEND].aiTokenGrants)), 500);

  // Out of range, or a field the page never sends: refused before anything is written.
  for (const bad of [{ ...grant, tokens: 0 }, { ...grant, tokens: GRANT_MAX_TOKENS + 1 }, { ...grant, tokens: 2.5 }, { ...grant, requestId: 'x' }, { ...grant, at: '2020-01-01' }]) {
    assert.equal((await post(bad)).status, 400);
  }
  assert.equal((await post({ ...grant, userId: '44444444-4444-4444-8444-444444444444', requestId: 'grant-request-3' })).status, 404);
  assert.equal(patches.length, 2);

  // The log lists them, newest first.
  const log = await (await get('/api/admin-users?action=token-grants')).json() as any;
  assert.deepEqual(log.grants.map((entry: any) => [entry.tokens, entry.publicId, entry.displayName]), [[200, 'SQ-6735AB827F', 'เพื่อน'], [300, 'SQ-6735AB827F', 'เพื่อน']]);
});

test('the owner makes a team admin and takes it back; the owner’s own account never changes', async () => {
  assert.equal((await post({ userId: FRIEND, role: 'admin' })).status, 200);
  assert.deepEqual(roleCalls.at(-1), { p_actor: OWNER, p_target: FRIEND, p_role: 'admin' });
  assert.equal((await post({ userId: FRIEND, role: 'user' })).status, 200);
  assert.equal((await post({ userId: OWNER, role: 'user' })).status, 409);
  assert.equal(roleCalls.length, 2);
});

test('a team admin sees the account list but none of the owner’s tools', async () => {
  actor.email = 'team@example.com';
  roles = { [OWNER]: 'admin' };
  for (const path of ['/api/admin-users?action=lookup&target=SQ-6735AB827F', '/api/admin-users?action=token-grants', '/api/admin-users?action=recovery-links',
    '/api/admin-users?action=deletion-requests', '/api/admin-users?action=dashboard']) {
    assert.equal((await get(path)).status, 403, path);
  }
  assert.equal((await post({ action: 'grant-tokens', userId: FRIEND, tokens: 100, requestId: 'grant-request-9' })).status, 403);
  assert.equal((await post({ userId: FRIEND, role: 'admin' })).status, 403);
  assert.equal(patches.length + roleCalls.length, 0);
});
