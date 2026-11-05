import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';

// Free เลขากระรอก tokens for new accounts (owner, 2026-11-05: "แจกโทเค็นให้ใช้น้องกระรอกฟรีทุกบัญชีเลยที่สมัครมาใหม่คนละ
// 200โทเค็น"): accounts made from 5 Nov 2569 (Bangkok) get 200 once, in a bucket of their own; older accounts, Pro and
// bans are unchanged. The database is mocked; nothing is sent anywhere.

Object.assign(process.env, { SUPABASE_URL: 'https://signup-tokens.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' });
const { signupTokens, SIGNUP_TOKENS, SIGNUP_TOKENS_FROM } = await import('../backend/src/ai/signupTokens.js');
const { assistantPlan } = await import('../backend/src/ai/supabaseDb.js');
const { allowance, refuse } = await import('../backend/src/ai/service.js');
const { aiConfig } = await import('../backend/src/ai/config.js');

const config = { ...aiConfig({}), enabled: true, proTokensPerCycle: 1650, trialTokens: 30 };
const realFetch = globalThis.fetch;
let subscription: Record<string, unknown> | null = null;
let grants: unknown = null;

before(() => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/subscriptions')) return json(subscription);
    if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role: 'user' });
    if (url.pathname.endsWith('/cashflow_private_state')) return json({ grants });
    if (url.pathname.endsWith('/cashflow_profiles')) return json({ public_id: 'SQ-0000000042' });
    return new Response(JSON.stringify({ message: 'not in this test' }), { status: 500 });
  };
});
after(() => { globalThis.fetch = realFetch; });

const person = (created_at: string) => ({ id: '44444444-4444-4444-8444-444444444444', email: 'new@example.com', created_at, user_metadata: {}, app_metadata: {}, aud: 'authenticated' }) as unknown as User;

test('who gets them: accounts made from 5 Nov 2569 in Bangkok, each in the bucket of the day it was made', () => {
  assert.equal(SIGNUP_TOKENS, 200);
  assert.equal(new Date(SIGNUP_TOKENS_FROM).toISOString(), '2026-11-04T17:00:00.000Z');
  assert.equal(signupTokens('2026-11-04T16:59:59Z'), null, 'one second before midnight in Bangkok');
  assert.deepEqual(signupTokens('2026-11-04T17:00:00Z'), { tokens: 200, bucket: '2026-11-05' });
  assert.deepEqual(signupTokens('2026-11-05T20:00:00Z'), { tokens: 200, bucket: '2026-11-06' }, 'the Bangkok day, not UTC');
  for (const bad of [null, undefined, '', 'not a date']) assert.equal(signupTokens(bad), null, String(bad));
});

test('a new account chats with 200 tokens; an older one does not; Pro and a ban come first; given tokens add', async () => {
  subscription = null; grants = null;
  assert.deepEqual(await assistantPlan(person('2026-11-05T03:00:00Z')), { plan: 'trial', tokens: 200, bucket: '2026-11-05', signup: true });
  assert.deepEqual(await assistantPlan(person('2026-11-01T03:00:00Z')), { plan: 'none' }, 'made before the start, no free trial since 30 Oct');
  subscription = { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z', pro_access_reset_at: null };
  assert.equal((await assistantPlan(person('2026-11-05T03:00:00Z'))).plan, 'pro', 'paid Pro keeps its own monthly tokens');
  subscription = { status: 'canceled', plan: 'admin_revoked', current_period_end: null, pro_access_reset_at: null };
  assert.deepEqual(await assistantPlan(person('2026-11-05T03:00:00Z')), { plan: 'none' }, 'a ban stops เลขา');
  subscription = null;
  grants = [{ id: 'grant-0001', tokens: 100, at: '2026-11-06T05:00:00Z' }];
  const given = await assistantPlan(person('2026-11-05T03:00:00Z'));
  assert.equal(given.plan, 'trial');
  assert.equal(allowance(given, config, new Date('2026-11-07T05:00:00Z')).tokenLimit, 200 + 100);
  grants = null;
});

test('the allowance never refills, and the end is said as free tokens used up', () => {
  const plan = { plan: 'trial' as const, tokens: 200, bucket: '2026-11-05', signup: true as const };
  assert.deepEqual(allowance(plan, config, new Date('2027-03-01T05:00:00Z')), { cycle: '2026-11-05', resetsAt: null, tokenLimit: 200, requestLimit: null });
  assert.throws(() => refuse('tokens', null, true, false, true), (error: Error & { status?: number; code?: string }) => {
    assert.equal(error.status, 402);
    assert.equal(error.code, 'ai_trial_used');
    assert.match(error.message, /โทเคนฟรีสำหรับบัญชีใหม่ครบแล้ว/);
    return true;
  });
  // A tester's or a plain trial's end is worded as before.
  assert.throws(() => refuse('tokens', null, true, false, false), /สิทธิ์ทดลองใช้เลขากระรอกครบแล้ว/);
});
