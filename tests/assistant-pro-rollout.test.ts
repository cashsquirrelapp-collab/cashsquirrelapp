import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { aiConfig, assistantEnabledForPlan } from '../backend/src/ai/config';
import { routeHandler } from '../backend/src/http/router';
import { seal } from '../backend/src/security/cookies';
import { NO_TRIAL_FROM } from '../shared/trial';

// Free trials stopped for accounts made from 30 Oct 09:30 (shared/trial.ts); the trial fixture is an account made the day
// before "now", so the tests about an existing trial run with the clock at that moment, not the real date.
const atTrialTime = async (run: () => Promise<void>) => {
  mock.timers.enable({ apis: ['Date'], now: NO_TRIAL_FROM });
  try { await run(); } finally { mock.timers.reset(); }
};

// Actual router/auth/repository/gateway code, with synthetic accounts and every fetch intercepted.
// No production configuration, database, microphone or paid provider is used.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
type Membership = 'paid' | 'grant' | 'trial' | 'expired' | 'revoked' | 'free' | 'admin' | 'prepaid' | 'prepaid_unreadable';
const env = { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false' };

test('explicit Pro rollout opens only known eligible plans and never overrides global off', () => {
  const open = aiConfig(env);
  for (const plan of ['pro', 'trial', 'admin']) assert.equal(assistantEnabledForPlan(open, plan), true);
  for (const plan of ['none', 'free', 'PRO', '', 'anything']) assert.equal(assistantEnabledForPlan(open, plan), false);
  for (const plan of ['pro', 'trial', 'admin', 'none']) {
    assert.equal(assistantEnabledForPlan(aiConfig({ ...env, AI_ENABLED: 'false' }), plan), false);
  }
  for (const flag of [undefined, '', 'true', 'yes']) {
    const restricted = aiConfig({ ...env, AI_ADMINS_ONLY: flag });
    assert.equal(assistantEnabledForPlan(restricted, 'pro'), false);
    assert.equal(assistantEnabledForPlan(restricted, 'trial'), false);
    assert.equal(assistantEnabledForPlan(restricted, 'admin'), true);
  }
  const exception = aiConfig({ AI_ENABLED: 'true', AI_ALLOWED_EMAILS: ' Allowed@Example.test ' });
  assert.equal(assistantEnabledForPlan(exception, 'pro', 'allowed@example.test'), true);
  assert.equal(assistantEnabledForPlan(exception, 'trial', 'allowed@example.test'), true);
  for (const plan of ['none', 'free', 'unknown']) assert.equal(assistantEnabledForPlan(exception, plan, 'allowed@example.test'), false);
  assert.equal(assistantEnabledForPlan(exception, 'pro', 'prefix-allowed@example.test'), false);
  assert.equal(assistantEnabledForPlan(exception, 'pro', 'allowed@example.test.attacker.test'), false);
});

const realFetch = globalThis.fetch;
let membership: Membership;
let providerCalls: number;
let snapshotOwners: string[];
let reservations: any[];
let settlements: any[];
let unexpectedRequests: string[];
let reserveFailure: 'tokens' | 'daily_cap' | undefined;
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  Object.assign(process.env, env, {
    APP_URL: 'https://pro-rollout.example.test', SUPABASE_URL: 'https://pro-rollout.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    SESSION_SECRET: 'pro-rollout-test-only-session-secret-'.repeat(4), GEMINI_API_KEY: 'synthetic-model-key',
    AI_CHAT_MODEL: 'gemini-3.5-flash-lite', AI_ACTION_MODEL: 'gemini-3.5-flash-lite',
    AI_ALLOWED_EMAILS: '',
    AI_PRO_TOKENS_PER_CYCLE: '1000', AI_TRIAL_TOKENS: '25', AI_DAILY_COST_CAP_USD: '0.25',
  });
  membership = 'paid'; providerCalls = 0; snapshotOwners = []; reservations = []; settlements = [];
  unexpectedRequests = []; reserveFailure = undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.host === 'generativelanguage.googleapis.com') {
      providerCalls++;
      const voice = body.generationConfig.responseMimeType === 'application/json';
      return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: voice ? JSON.stringify({ text: 'ทดสอบเสียง' }) : 'คำตอบทดสอบ' }] } }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 2, promptTokensDetails: [{ modality: 'AUDIO', tokenCount: voice ? 10 : 0 }, { modality: 'TEXT', tokenCount: voice ? 10 : 20 }] } });
    }
    if (url.host !== 'pro-rollout.supabase.co') { unexpectedRequests.push(url.origin); throw new Error('External network disabled'); }
    if (url.pathname === '/auth/v1/user') {
      const bearer = new Headers(init?.headers).get('authorization')!.replace(/^Bearer /, '');
      const id = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub;
      return json({ id, email: id === A ? 'a@example.test' : 'b@example.test',
        created_at: membership === 'trial' ? new Date(Date.now() - 86400000).toISOString() : '2020-01-01T00:00:00Z',
        // Even purported admin claims here cannot replace the database role lookup.
        app_metadata: { role: 'admin' }, user_metadata: { role: 'admin', plan: 'pro', email: 'a@example.test' } });
    }
    const owner = url.searchParams.get('user_id')?.replace(/^eq\./, '') ?? body?.p_user_id;
    if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
    if (url.pathname.endsWith('/subscriptions')) {
      if (membership === 'prepaid' || membership === 'prepaid_unreadable') return json({ status: 'active', plan: 'pro_prepaid', current_period_end: '2099-01-01T00:00:00Z', pro_access_reset_at: null });
      if (membership === 'paid' || membership === 'expired') return json({ status: 'active', plan: 'monthly',
        current_period_end: new Date(Date.now() + (membership === 'paid' ? 1 : -1) * 86400000).toISOString() });
      if (membership === 'grant') return json({ status: 'active', plan: 'admin_grant' });
      if (membership === 'revoked') return json({ status: 'active', plan: 'admin_revoked' });
      return json(null);
    }
    // Plan tokens (shared/proTokens.ts): a yearly order, read for this account only.
    if (url.pathname.endsWith('/cashflow_prepaid_orders') && (membership === 'prepaid' || membership === 'prepaid_unreadable') && url.searchParams.get('user_id') === `in.(${A})`) {
      if (membership === 'prepaid_unreadable') return new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), { status: 403, headers: { 'content-type': 'application/json' } });
      return json([{ user_id: A, period: 'year', amount: 156200, paid_at: '2026-10-23T17:00:00Z', entitled_until: '2099-01-01T00:00:00Z', created_at: '2026-10-23T17:00:00Z' }]);
    }
    if (url.pathname.endsWith('/cashflow_card_cycles') && (membership === 'prepaid' || membership === 'prepaid_unreadable') && url.searchParams.get('user_id') === `in.(${A})`) return json([]);
    if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role: membership === 'admin' ? 'admin' : 'user' });
    if (url.pathname.endsWith('/cashflow_ai_usage')) return json([{ tokens: 10 }]);
    if (url.pathname.endsWith('/cashflow_account_snapshot')) {
      snapshotOwners.push(owner);
      return json({ user_id: owner, jobs: [], expenses: [], goals: [], settings: {}, versions: {} });
    }
    if (url.pathname.endsWith('/cashflow_ai_memories')) return json([]);
    // The name เลขา calls the user by (2026-10-27), read for the signed-in account only.
    if (url.pathname.endsWith('/cashflow_profiles') && (owner === A || owner === B)) return json({ display_name: 'ผู้ใช้ทดสอบ' });
    // Package E: the app chat's latest turns, read for the signed-in account only, to continue a task from LINE.
    if (url.pathname.endsWith('/cashflow_ai_messages') && (init?.method ?? 'GET') === 'GET' && (owner === A || owner === B)) return json([]);
    if (url.pathname.endsWith('/rpc/cashflow_ai_reserve')) {
      reservations.push(body);
      return json(reserveFailure ? { ok: false, reason: reserveFailure } : { ok: true, used_tokens: 10 + body.p_tokens, used_requests: 1 });
    }
    if (url.pathname.endsWith('/rpc/cashflow_ai_settle')) { settlements.push(body); return json(null); }
    // The database before 20261025150000_ai_cost_accounting.sql: the capped settle does not exist yet (real PostgREST answer).
    if (url.pathname.endsWith('/rpc/cashflow_ai_settle_capped')) {
      return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.cashflow_ai_settle_capped in the schema cache' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    unexpectedRequests.push(url.pathname); throw new Error('Unexpected mocked route');
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; assert.deepEqual(unexpectedRequests, []); });

function wav() {
  const bytes = Buffer.alloc(44 + 32000);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(32000, 40);
  return { mimeType: 'audio/wav', data: bytes.toString('base64') };
}
const chat = { action: 'message', text: 'สวัสดี' };
const voice = { action: 'transcribe', audio: wav(), language: 'th-TH' };
async function request(owner: string, body?: unknown, headerOwner = owner) {
  const accessToken = `e30.${Buffer.from(JSON.stringify({ sub: owner, session_id: owner.replace(/^./, 'c') })).toString('base64url')}.synthetic`;
  const session = seal({ access_token: accessToken, refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() });
  const raw = Buffer.from(JSON.stringify(body ?? {}));
  const req = Object.assign(Readable.from([raw]), {
    method: body ? 'POST' : 'GET', url: '/api/assistant', query: {}, socket: { remoteAddress: '127.0.0.1' },
    headers: { cookie: `__Host-cashflow-session=${session}`, 'x-account-id': headerOwner, origin: process.env.APP_URL!,
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
  await routeHandler('assistant')(req as any, res as any);
  return result;
}

test('active paid Pro and existing Pro grants get live status, chat and voice with owner-bound accounting', async () => {
  for (const [owner, member] of [[A, 'paid'], [B, 'grant']] as const) {
    membership = member;
    const status = await request(owner);
    assert.deepEqual([status.status, status.body.enabled, status.body.plan, status.body.tokenLimit, status.body.tokensLeft], [200, true, 'pro', 1000, 990]);
    const message = await request(owner, chat); const transcript = await request(owner, voice);
    assert.equal(message.status, 200); assert.equal(message.body.text, 'คำตอบทดสอบ');
    assert.equal(transcript.status, 200); assert.equal(transcript.body.text, 'ทดสอบเสียง');
  }
  assert.equal(providerCalls, 4);
  // The chat reads the account; dictation reads it once more, only for names to spell (owner, 2026-10-26), and each
  // read is the caller's own account.
  assert.deepEqual(snapshotOwners, [A, A, B, B]);
  assert.deepEqual(reservations.map(row => row.p_user_id), [A, A, B, B]);
  assert.deepEqual(settlements.map(row => row.p_user_id), [A, A, B, B]);
  assert.ok(reservations.every(row => row.p_token_limit === 1000 && row.p_daily_cap_usd === 0.25));
  assert.ok(settlements.every(row => row.p_release === false));
});

test('existing free Pro trial retains 25 total tokens and verified admins get the Pro allowance (owner, 2026-10-27)', () => atTrialTime(async () => {
  for (const [member, plan, limit, left] of [['trial', 'trial', 25, 15], ['admin', 'admin', 1000, 990]] as const) {
    membership = member;
    const status = await request(A);
    assert.deepEqual([status.body.enabled, status.body.plan, status.body.tokenLimit, status.body.tokensLeft], [true, plan, limit, left]);
    for (const body of [chat, voice]) assert.equal((await request(A, body)).status, 200);
  }
  assert.deepEqual(reservations.map(row => row.p_token_limit), [25, 25, 1000, 1000]);
  assert.deepEqual(reservations.slice(0, 2).map(row => row.p_cycle), ['trial', 'trial']);
  assert.equal(providerCalls, 4);
}));

test('pkg51 email exceptions survive rollback using verified email, without granting a plan or trusting metadata email', async () => {
  process.env.AI_ADMINS_ONLY = 'true'; process.env.AI_ALLOWED_EMAILS = 'a@example.test';
  assert.equal((await request(A)).body.enabled, true);
  assert.equal((await request(B)).body.enabled, false);
  for (const body of [chat, voice]) {
    assert.equal((await request(A, body)).status, 200);
    assert.equal((await request(B, body)).body.code, 'ai_disabled');
  }
  membership = 'free';
  assert.equal((await request(A)).body.enabled, false);
  for (const body of [chat, voice]) assert.equal((await request(A, body)).body.code, 'ai_pro_only');
  assert.equal(providerCalls, 2); assert.ok(reservations.every(row => row.p_user_id === A));
});

test('free and revoked accounts cannot use chat/voice despite editable metadata claiming admin or Pro', async () => {
  for (const member of ['free', 'revoked'] as const) {
    membership = member;
    const status = await request(A);
    assert.deepEqual([status.status, status.body.enabled, status.body.plan, status.body.tokensLeft], [200, false, 'none', null]);
    for (const body of [chat, voice]) {
      const reply = await request(A, body);
      assert.equal(reply.status, 403); assert.equal(reply.body.code, 'ai_pro_only');
    }
  }
  assert.equal(providerCalls, 0); assert.equal(reservations.length, 0); assert.deepEqual(snapshotOwners, []);
});

test('Pro that has ended chats on with the tokens left from its last month, and says to renew when they are gone', async () => {
  // Owner, 2026-10-28: "ถ้าหมดโปรไป เขายังเหลืออีกตั้ง 500 โทเค็น ก็คือให้เขาใช้จนหมดก่อน".
  membership = 'expired';
  const status = await request(A);
  assert.deepEqual([status.status, status.body.enabled, status.body.plan, status.body.resetsAt], [200, true, 'lapsed', null]);
  assert.equal(status.body.tokensLeft, status.body.tokenLimit - 10, 'the last month\'s allowance less what it used');
  reserveFailure = 'tokens';
  for (const body of [chat, voice]) {
    const reply = await request(A, body);
    assert.equal(reply.status, 402); assert.equal(reply.body.code, 'ai_tokens_used');
    assert.match(reply.body.error, /ต่ออายุ Pro/);
  }
  reserveFailure = undefined;
  assert.equal(providerCalls, 0);
});

test('the explicit admin-only rollback and global-off switch still block Pro chat and transcription', async () => {
  for (const patch of [{ AI_ADMINS_ONLY: 'true' }, { AI_ADMINS_ONLY: 'false', AI_ENABLED: 'false' }]) {
    Object.assign(process.env, patch);
    assert.equal((await request(A)).body.enabled, false);
    for (const body of [chat, voice]) {
      const reply = await request(A, body);
      assert.equal(reply.status, 503); assert.equal(reply.body.code, 'ai_disabled');
    }
  }
  membership = 'admin';
  assert.equal((await request(A, chat)).body.code, 'ai_disabled', 'global off also blocks admins');
  assert.equal(providerCalls, 0); assert.equal(reservations.length, 0);
});

test('Pro rollout does not bypass exhausted tokens, trial tokens, daily cap or provider keys', () => atTrialTime(async () => {
  for (const member of ['paid', 'trial'] as const) {
    membership = member;
    for (const failure of ['tokens', 'daily_cap'] as const) {
      reserveFailure = failure;
      for (const body of [chat, voice]) {
        const reply = await request(A, body);
        assert.equal(reply.status, failure === 'tokens' ? 402 : 503);
        assert.equal(reply.body.code, failure === 'daily_cap' ? 'ai_daily_cap' : member === 'trial' ? 'ai_trial_used' : 'ai_tokens_used');
      }
    }
  }
  assert.equal(providerCalls, 0); assert.equal(settlements.length, 0);
  reserveFailure = undefined; membership = 'paid'; process.env.GEMINI_API_KEY = '';
  assert.equal((await request(A, chat)).body.code, 'ai_unavailable');
  assert.equal((await request(A, voice)).body.code, 'ai_voice_unavailable');
  assert.equal(providerCalls, 0);
  assert.ok(settlements.every(row => row.p_release === true && row.p_user_id === A));
}));

test('browser owner, plan and rollout overrides cannot change authenticated scope or eligibility', async () => {
  assert.equal((await request(B, chat, A)).status, 401);
  membership = 'free';
  for (const base of [chat, voice]) for (const override of [{ user_id: A }, { account_id: A }, { plan: 'admin' }, { role: 'admin' }, { email: 'a@example.test' }, { AI_ADMINS_ONLY: false }]) {
    assert.equal((await request(B, { ...base, ...override })).status, 400);
  }
  assert.equal(providerCalls, 0); assert.equal(reservations.length, 0); assert.deepEqual(snapshotOwners, []);
});

test('a member on a paid plan gets that plan\'s 1,650 tokens, also one paid earlier; unreadable orders keep the default', async () => {
  membership = 'prepaid';
  const status = await request(A);
  assert.deepEqual([status.status, status.body.plan, status.body.tokenLimit, status.body.tokensLeft], [200, 'pro', 1650, 1640]);
  assert.equal((await request(A, chat)).status, 200);
  assert.equal(reservations.at(-1).p_token_limit, 1650);
  membership = 'prepaid_unreadable';
  const fallback = await request(A);
  assert.deepEqual([fallback.status, fallback.body.tokenLimit], [200, 1000], 'a read error never refuses the member');
});
