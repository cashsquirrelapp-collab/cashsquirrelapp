import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { routeHandler } from '../backend/src/http/router';
import { seal } from '../backend/src/security/cookies';
import { readGrants } from '../shared/tokenGrants';

// No guessing codes (owner, 2026-11-05: "เครื่องมือสุ่มรหัสหลายๆรอบเพื่อที่จะให้มันได้โทเค็นฟรี ... ถ้าไม่ใช่โค้ดที่เป็นมีบัญชี
// จริงๆ ห้ามได้เด็ดขาด"). /api/referral over HTTP against a stand-in database: every try counts (5 a day per account, 5 a
// day per device, 30 an hour per address), and a code counts only for a real, live account.

const realFetch = globalThis.fetch;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const code = (n: number) => `SQ-${String(n).padStart(10, '0')}`;
const REAL = uid(1);
type Account = { confirmed?: boolean; banned?: boolean; paused?: boolean };
let accounts: Record<string, Account>;
let state: Record<string, Record<string, unknown>>;
let counts: Map<string, number>;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  Object.assign(process.env, {
    APP_URL: 'https://referral.example.test', SUPABASE_URL: 'https://guard.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    SESSION_SECRET: 'referral-guard-test-only-secret-'.repeat(4),
  });
  accounts = { [REAL]: { confirmed: true } };
  state = {};
  counts = new Map();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host !== 'guard.supabase.co') throw new Error('External network disabled');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const param = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');
    if (url.pathname === '/auth/v1/user') {
      const bearer = new Headers(init?.headers).get('authorization')!.replace(/^Bearer /, '');
      const id = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub;
      return json({ id, email: `${id.slice(-4)}@example.test`, email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' });
    }
    const admin = /\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
    if (admin) {
      const account = accounts[admin[1]];
      if (!account) return json({ message: 'User not found' }, 404);
      return json({ id: admin[1], aud: 'authenticated', email: `${admin[1].slice(-4)}@example.test`, created_at: '2026-01-01T00:00:00Z',
        email_confirmed_at: account.confirmed ? '2026-01-01T00:00:00Z' : null, banned_until: account.banned ? '2099-01-01T00:00:00Z' : null,
        app_metadata: account.paused ? { account_paused: true } : {}, user_metadata: {} });
    }
    if (url.pathname.endsWith('/rpc/cashflow_session_active')) return json(true);
    if (url.pathname.endsWith('/rpc/cashflow_rate_limit')) {
      const next = (counts.get(body.p_key) ?? 0) + 1;
      counts.set(body.p_key, next);
      return json(next <= body.p_limit);
    }
    if (url.pathname.endsWith('/cashflow_profiles')) {
      const wanted = param('public_id');
      if (wanted) { const n = Number(wanted.slice(3)); return json(wanted === code(n) && n > 0 && n < 100 ? { user_id: uid(n) } : null); }
      return json({ public_id: code(Number(param('user_id')!.slice(-12))) });
    }
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      state[body.p_user_id] = { ...(state[body.p_user_id] ?? {}), ...body.p_patch };
      for (const key of body.p_remove ?? []) delete state[body.p_user_id][key];
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith('/cashflow_private_state')) {
      const rows = Object.entries(state);
      const entry = (s: Record<string, unknown>) => s.referral as Record<string, string> | undefined;
      if (param('data->referral->>device')) return json(rows.filter(([, s]) => entry(s)?.device === param('data->referral->>device')).map(([user_id]) => ({ user_id })));
      if (param('data->referral->>status')) return json(rows.filter(([, s]) => entry(s)?.status === param('data->referral->>status')).map(([user_id, s]) => ({ user_id, entry: s.referral })));
      if (param('data->referral->>referrerId')) return json(rows.filter(([, s]) => entry(s)?.referrerId === param('data->referral->>referrerId')).map(([user_id, s]) => ({ user_id, entry: s.referral })));
      const id = param('user_id') ?? '';
      if ((url.searchParams.get('select') ?? '').startsWith('grants')) return json({ grants: state[id]?.aiTokenGrants ?? null });
      return json({ entry: state[id]?.referral ?? null, devices: state[id]?.referralDevices ?? null });
    }
    throw new Error(`Unexpected mocked route ${url.pathname}`);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

async function enter(owner: string, codeText: string, device: string, address = '203.0.113.7') {
  const accessToken = `e30.${Buffer.from(JSON.stringify({ sub: owner, session_id: owner.replace(/^./, 'c') })).toString('base64url')}.synthetic`;
  const session = seal({ access_token: accessToken, refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() });
  const raw = Buffer.from(JSON.stringify({ code: codeText }));
  const req = Object.assign(Readable.from([raw]), {
    method: 'POST', url: '/api/referral', query: {}, socket: { remoteAddress: address },
    headers: { cookie: `__Host-cashflow-session=${session}`, 'x-account-id': owner, 'x-device-id': device, origin: process.env.APP_URL!,
      'x-csrf-protection': '1', 'content-type': 'application/json', 'content-length': String(raw.length) },
  });
  const result = { status: 200, body: undefined as any };
  const headers = new Map<string, unknown>();
  const res = {
    headersSent: false,
    setHeader(name: string, value: unknown) { headers.set(name.toLowerCase(), value); },
    getHeader(name: string) { return headers.get(name.toLowerCase()); }, hasHeader(name: string) { return headers.has(name.toLowerCase()); },
    status(status: number) { result.status = status; return this; },
    json(value: unknown) { result.body = value; this.headersSent = true; return this; },
  };
  await routeHandler('referral')(req as any, res as any);
  return result;
}
const guess = (n: number) => `SQ-${(0xABC0000000 + n).toString(16).toUpperCase()}`;
const device = (n: number) => `device-under-test-${String(n).padStart(4, '0')}`;
const tokensOf = (id: string) => readGrants(state[id]?.aiTokenGrants).reduce((sum, grant) => sum + grant.tokens, 0);

test('a guessing account: 5 tries a day, then locked, even when the 6th is a real code', async () => {
  const guesser = uid(500);
  for (let i = 0; i < 5; i += 1) {
    const reply = await enter(guesser, guess(i), device(1));
    assert.deepEqual([reply.status, reply.body.code], [404, 'referral_unknown'], `try ${i + 1}`);
  }
  const locked = await enter(guesser, code(1), device(1));
  assert.deepEqual([locked.status, locked.body.code], [429, 'referral_locked']);
  assert.match(locked.body.error, /พรุ่งนี้/);
  assert.equal(tokensOf(guesser), 0, 'nothing given');
});

test('a guessing device: 5 tries a day across new accounts, then every account on it is locked', async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await enter(uid(600 + i), guess(i), device(2))).status, 404);
  const locked = await enter(uid(610), code(1), device(2));
  assert.deepEqual([locked.status, locked.body.code], [429, 'referral_locked']);
  assert.equal(tokensOf(uid(610)), 0);
});

test('a guessing address: 30 tries an hour across accounts and devices, then locked', async () => {
  for (let i = 0; i < 30; i += 1) assert.equal((await enter(uid(700 + i), guess(i), device(100 + i), '198.51.100.9')).status, 404, `try ${i + 1}`);
  const locked = await enter(uid(800), code(1), device(200), '198.51.100.9');
  assert.deepEqual([locked.status, locked.body.code], [429, 'referral_locked']);
  // Someone else elsewhere is not touched by it.
  assert.equal((await enter(uid(801), code(1), device(201), '192.0.2.44')).status, 200);
});

test('a code counts only for a real, live account: unconfirmed, banned, paused or missing is "not found"', async () => {
  accounts[uid(2)] = { confirmed: false };
  accounts[uid(3)] = { confirmed: true, banned: true };
  accounts[uid(4)] = { confirmed: true, paused: true };
  // uid(5) has a profile but no account at all.
  for (const [i, n] of [2, 3, 4, 5].entries()) {
    const reply = await enter(uid(900 + i), code(n), device(300 + i));
    assert.deepEqual([reply.status, reply.body.code], [404, 'referral_unknown'], `code of account ${n}`);
    assert.equal(tokensOf(uid(900 + i)), 0);
  }
  const good = await enter(uid(910), code(1), device(310));
  assert.equal(good.status, 200);
  assert.equal(tokensOf(uid(910)), 200, 'a real code still gives its 200 at once');
  // Entering again (right or wrong) is refused without spending a try.
  assert.deepEqual([(await enter(uid(910), code(1), device(310))).body.code], ['referral_entered']);
});
