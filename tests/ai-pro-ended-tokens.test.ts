import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig, assistantEnabledForPlan } from '../backend/src/ai/config';
import { allowance, handleMessage, lastPaidCycle, usageStatus, type AssistantDb } from '../backend/src/ai/service';
import { proHasEnded } from '../backend/src/ai/supabaseDb';
import { tokenBalanceText } from '../backend/src/ai/lineBridge';
import { HttpError } from '../backend/src/http/guard';

// Owner, 2026-10-28: "ถ้าหมดโปรไป เขายังเหลืออีกตั้ง 500 โทเค็น ก็คือให้เขาใช้จนหมดก่อน ... ระงับอะไรที่เป็นโปร ยกเว้นแชทบอท".
// When Pro ends, เลขา keeps chatting with the tokens left from the last paid month until they run out; nothing renews.

const config = aiConfig({ AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'g' });
const END = '2026-11-15T03:00:00.000Z';
const AFTER = new Date('2026-12-02T05:00:00.000Z');

test('pro ended: only a paid period that has passed; never an admin grant, a revoked one or an unpaid first invoice', () => {
  const now = AFTER.getTime();
  assert.equal(proHasEnded({ status: 'active', plan: 'pro_prepaid', current_period_end: END }, now), true);
  assert.equal(proHasEnded({ status: 'canceled', plan: 'pro_monthly', current_period_end: END }, now), true);
  assert.equal(proHasEnded({ status: 'past_due', plan: 'pro_monthly', current_period_end: END }, now), true);
  assert.equal(proHasEnded({ status: 'active', plan: 'pro_prepaid', current_period_end: '2027-01-01T00:00:00Z' }, now), false, 'still Pro');
  assert.equal(proHasEnded({ status: 'active', plan: 'admin_grant', current_period_end: END }, now), false);
  assert.equal(proHasEnded({ status: 'active', plan: 'admin_revoked', current_period_end: END }, now), false);
  assert.equal(proHasEnded({ status: 'canceled', plan: 'admin_removed', current_period_end: END }, now), false);
  assert.equal(proHasEnded({ status: 'incomplete', plan: 'pro_monthly', current_period_end: END }, now), false);
  assert.equal(proHasEnded({ status: 'incomplete_expired', plan: 'pro_monthly', current_period_end: END }, now), false);
  assert.equal(proHasEnded({ status: 'canceled', plan: 'pro_monthly', current_period_end: null }, now), false, 'never paid');
});

test('pro ended: the allowance is the last paid month, with no renewal date; the plan can chat', () => {
  const lapsed = allowance({ plan: 'lapsed', periodEnd: END }, config, AFTER);
  // Pro paid until 15 Nov 10:00 (Bangkok): the paid month is 15 Oct to 15 Nov, not the month that began at 00:00 on 15 Nov.
  assert.equal(lapsed.cycle, '2026-10-15', 'the usage of the final paid month counts');
  assert.equal(lastPaidCycle('2027-01-31T10:00:00Z'), '2026-12-31');
  assert.equal(lastPaidCycle('2026-12-01T16:30:00Z'), '2026-11-01', '23:30 Bangkok on 1 Dec: the month from 1 Nov');
  assert.equal(lapsed.resetsAt, null);
  assert.equal(lapsed.tokenLimit, config.proTokensPerCycle);
  assert.equal(allowance({ plan: 'lapsed', periodEnd: END, tokens: 900 }, config, AFTER).tokenLimit, 900, 'the plan that was paid for');
  assert.equal(allowance({ plan: 'lapsed', periodEnd: null }, config, AFTER).tokenLimit, 0);
  // Months later the same frozen month: nothing refills.
  assert.equal(allowance({ plan: 'lapsed', periodEnd: END }, config, new Date('2027-06-01T00:00:00Z')).cycle, '2026-10-15');
  assert.equal(assistantEnabledForPlan(config, 'lapsed'), true);
  assert.equal(assistantEnabledForPlan(config, 'none'), false);
});

function db(used: number, reserve: 'ok' | 'tokens' = 'ok'): AssistantDb & { cycles: string[] } {
  const cycles: string[] = [];
  return {
    cycles,
    async loadAccount(userId) { return { user: { user_id: userId, jobs: [], expenses: [], goals: [], statuses: [], settings: {} } as any, versions: {} }; },
    async reserve(input) { cycles.push(input.cycle); return reserve === 'ok' ? { ok: true, usedTokens: used + input.tokens, usedRequests: 1 } : { ok: false, reason: 'tokens' }; },
    async settle() {}, async usage(_, cycle) { cycles.push(cycle); return { tokens: used, requests: 0 }; },
    async saveProposal() {}, async claimProposal() { return null; }, async finishProposal() {}, async cancelProposal() { return false; },
    async applyChanges() { return true; }, async memories() { return []; }, async remember() {},
  };
}
const A = '88888888-8888-4888-8888-888888888888';

test('pro ended: the status shows what is left; once it is gone the account is ordinary again', async () => {
  const some = db(1150);
  const status = await usageStatus(some, config, A, { plan: 'lapsed', periodEnd: END }, AFTER);
  assert.deepEqual([status.plan, status.tokensLeft, status.resetsAt], ['lapsed', config.proTokensPerCycle - 1150, null]);
  assert.deepEqual(some.cycles, ['2026-10-15']);
  const gone = await usageStatus(db(config.proTokensPerCycle), config, A, { plan: 'lapsed', periodEnd: END }, AFTER);
  assert.equal(gone.plan, 'none');
  assert.match(tokenBalanceText(status), /Pro หมดอายุแล้ว ใช้โทเคนที่เหลือได้จนหมด/);
});

test('pro ended: a message runs on what is left; an empty pool says to renew, never a refill date', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'สวัสดีครับ' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } }),
    { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  const ok = db(100);
  const reply = await handleMessage(ok, { config, fetchImpl, now: AFTER }, A, { plan: 'lapsed', periodEnd: END }, { text: 'สวัสดี' });
  assert.equal(reply.text, 'สวัสดีครับ');
  assert.equal(ok.cycles[0], '2026-10-15', 'charged to the last Pro month');
  await assert.rejects(handleMessage(db(0, 'tokens'), { config, fetchImpl, now: AFTER }, A, { plan: 'lapsed', periodEnd: END }, { text: 'สวัสดี' }),
    (error: unknown) => error instanceof HttpError && error.status === 402 && error.code === 'ai_tokens_used' && /ต่ออายุ Pro/.test(error.message));
  await assert.rejects(handleMessage(db(0), { config, fetchImpl, now: AFTER }, A, { plan: 'none' }, { text: 'สวัสดี' }),
    (error: unknown) => error instanceof HttpError && error.status === 403);
});
