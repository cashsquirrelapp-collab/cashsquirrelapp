import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';

// The automatic 200 tokens of 5 Nov 2569 (owner: "แจกโทเค็นให้ใช้น้องกระรอกฟรีทุกบัญชีเลยที่สมัครมาใหม่"), from the start
// of that day in Bangkok until ชวนเพื่อน รับ 200 โทเคน began ("ปิดแจกอัตโนมัติตอนแคมเปญขึ้น"). Accounts made in the window
// keep them; older and later accounts do not have them. The database is mocked; nothing is sent anywhere.

Object.assign(process.env, { SUPABASE_URL: 'https://signup-tokens.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' });
const { signupTokens, SIGNUP_TOKENS, SIGNUP_TOKENS_FROM } = await import('../backend/src/ai/signupTokens.js');
const { assistantPlan } = await import('../backend/src/ai/supabaseDb.js');
const { allowance, refuse } = await import('../backend/src/ai/service.js');
const { aiConfig } = await import('../backend/src/ai/config.js');
const { SIGNUP_GIFT_UNTIL } = await import('../shared/signupGift.js');
const { REFERRAL_FROM } = await import('../shared/referral.js');

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
beforeEach(() => { subscription = null; grants = null; });

const person = (created_at: string) => ({ id: '44444444-4444-4444-8444-444444444444', email: 'new@example.com', created_at, user_metadata: {}, app_metadata: {}, aud: 'authenticated' }) as unknown as User;
const MORNING = '2026-11-05T03:00:00Z'; // 10:00 in Bangkok, inside the window
const AFTER = new Date(REFERRAL_FROM + 60_000).toISOString();

test('the window: from the start of 5 Nov 2569 in Bangkok until the referral campaign began', () => {
  assert.equal(SIGNUP_TOKENS, 200);
  assert.equal(new Date(SIGNUP_TOKENS_FROM).toISOString(), '2026-11-04T17:00:00.000Z');
  assert.equal(SIGNUP_GIFT_UNTIL, REFERRAL_FROM, 'the automatic tokens end when ชวนเพื่อน begins');
  assert.equal(signupTokens('2026-11-04T16:59:59Z'), null);
  assert.deepEqual(signupTokens(MORNING), { tokens: 200, bucket: '2026-11-05' });
  assert.equal(signupTokens(new Date(REFERRAL_FROM - 1).toISOString())?.tokens, 200, 'the last moment before the campaign');
  assert.equal(signupTokens(AFTER), null, 'later accounts earn tokens by inviting friends');
  for (const bad of [null, undefined, '', 'not a date']) assert.equal(signupTokens(bad), null, String(bad));
});

test('the plan: the window keeps its 200; later accounts chat only with given tokens; Pro and a ban come first', async () => {
  assert.deepEqual(await assistantPlan(person(MORNING)), { plan: 'trial', tokens: 200, bucket: '2026-11-05', signup: true });
  assert.deepEqual(await assistantPlan(person(AFTER)), { plan: 'none' });
  grants = [{ id: 'referral-00000000000000000000000000000001', tokens: 200, at: '2026-11-06T05:00:00Z', note: 'ชวนเพื่อน' }];
  const invited = await assistantPlan(person(AFTER));
  assert.equal(invited.plan, 'trial', 'a friend\'s reward opens เลขา');
  assert.equal(allowance(invited, config, new Date('2026-11-07T05:00:00Z')).tokenLimit, 200);
  assert.equal(allowance(await assistantPlan(person(MORNING)), config, new Date('2026-11-07T05:00:00Z')).tokenLimit, 400, 'rewards add to the window\'s 200');
  grants = null;
  subscription = { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z', pro_access_reset_at: null };
  assert.equal((await assistantPlan(person(MORNING))).plan, 'pro');
  subscription = { status: 'canceled', plan: 'admin_revoked', current_period_end: null, pro_access_reset_at: null };
  assert.deepEqual(await assistantPlan(person(MORNING)), { plan: 'none' }, 'a ban stops เลขา');
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
  assert.throws(() => refuse('tokens', null, true, false, false), /สิทธิ์ทดลองใช้เลขากระรอกครบแล้ว/);
});
