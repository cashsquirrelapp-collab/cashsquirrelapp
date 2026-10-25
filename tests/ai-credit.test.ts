import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { aiConfig } from '../backend/src/ai/config';
import { billingIssueOf } from '../backend/src/ai/billing';
import { memoryStores, runAssistant, failedRouting } from '../backend/src/ai/gateway';
import { ProviderError } from '../backend/src/ai/types';
import { creditStatus, issueAlertText, issueAlerts, lowAlertText, sendCreditAlerts } from '../backend/src/services/aiCredit';
import type { UserRow } from '../backend/src/services/lineAssistant';

// AI credit and reserve (owner, 2026-10-25: warn before a provider's credit runs out, say how much to keep ready, and never
// leave users wondering why เลขา stopped). Synthetic figures; fake providers and LINE; no network, no keys.

const NOW = new Date('2026-10-25T05:00:00Z'); // 25 Oct 2569 12:00 Bangkok
const days = (perDay: number, n = 10, today = 0) => [
  ...Array.from({ length: n }, (_, index) => ({ day: new Date(Date.parse('2026-10-25T00:00:00Z') - (index + 1) * 86_400_000).toISOString().slice(0, 10), usdMicro: perDay, requests: 20 })),
  ...(today ? [{ day: '2026-10-25', usdMicro: today, requests: 5 }] : []),
];
const record = (usd: string, at = '2026-10-20T03:00:00Z') => ({ provider: 'anthropic' as const, balance_usd: usd, recorded_at: at, note: null });

test('status: recorded balance minus measured spend, days left at the recent pace, reserve for 30 days with 30%, what to top up', () => {
  // $20 recorded, $8 spent since, $1.00 a day: $12 left, 12 days → watch; reserve 30 × $1 × 1.3 = $39 → top up $27.
  const watch = creditStatus({ provider: 'anthropic', now: NOW, record: record('20.0000'), spentSinceMicro: 8_000_000, days: days(1_000_000), issues: [] });
  assert.deepEqual([watch.remainingMicro, watch.dailyMicro, watch.runwayDays, watch.runOutOn, watch.reserve30Micro, watch.topUpMicro, watch.status],
    [12_000_000, 1_000_000, 12, '2026-11-06', 39_000_000, 27_000_000, 'watch']);
  assert.equal(creditStatus({ provider: 'anthropic', now: NOW, record: record('20'), spentSinceMicro: 15_000_000, days: days(1_000_000), issues: [] }).status, 'low');
  assert.equal(creditStatus({ provider: 'anthropic', now: NOW, record: record('20'), spentSinceMicro: 1_000_000, days: days(1_000_000), issues: [] }).status, 'ok');
  assert.equal(creditStatus({ provider: 'anthropic', now: NOW, record: record('20'), spentSinceMicro: 21_000_000, days: days(1_000_000), issues: [] }).status, 'out');
  // A busy day counts: today's $3 so far beats the $1 average.
  assert.equal(creditStatus({ provider: 'anthropic', now: NOW, record: record('20'), spentSinceMicro: 0, days: days(1_000_000, 10, 3_000_000), issues: [] }).dailyMicro, 3_000_000);
  // Only three days of use so far: their average, not a week's.
  assert.equal(creditStatus({ provider: 'anthropic', now: NOW, record: record('20'), spentSinceMicro: 0, days: days(900_000, 3), issues: [] }).dailyMicro, 900_000);
  // Nothing recorded: unknown, never 0 left; a billing answer in the last day: out, whatever was recorded.
  const none = creditStatus({ provider: 'google', now: NOW, record: null, spentSinceMicro: null, days: days(500_000), issues: [] });
  assert.deepEqual([none.remainingMicro, none.runwayDays, none.topUpMicro, none.status, none.reserve30Micro], [null, null, null, 'unknown', 19_500_000]);
  const issue = creditStatus({ provider: 'anthropic', now: NOW, record: record('100'), spentSinceMicro: 0, days: days(1_000_000), issues: [{ issue: 'anthropic_credit', times: 3, last_at: '2026-10-25T04:00:00Z' }, { issue: 'gemini_quota', times: 1, last_at: '2026-10-25T04:00:00Z' }] });
  assert.deepEqual([issue.status, issue.issues.length], ['out', 1]);
});

test('billing answers are told apart from passing faults', () => {
  assert.equal(billingIssueOf(new ProviderError('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.', 400, 'anthropic', false)), 'anthropic_credit');
  assert.equal(billingIssueOf(new ProviderError('You exceeded your current quota, please check your plan and billing details.', 429, 'gemini', true)), 'gemini_quota');
  assert.equal(billingIssueOf(new ProviderError('Billing account for project is not enabled', 403, 'gemini', false)), 'gemini_billing');
  for (const error of [new ProviderError('Overloaded', 529, 'anthropic', true), new ProviderError('Resource has been exhausted (e.g. check quota).', 429, 'gemini', true),
    new ProviderError('Internal error', 500, 'gemini', true), new Error('timeout')]) assert.equal(billingIssueOf(error), undefined, String(error));
  assert.equal(failedRouting({ text: 'สรุปเดือนนี้' }, aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), new ProviderError('You exceeded your current quota, please check your plan and billing details.', 429, 'gemini', true), 10).error, 'billing_gemini_quota');
});

test('the owner hears once a day per problem; the messages are formal and say what to do', async () => {
  const pushed: string[] = [];
  const claimed = new Set<string>();
  const deps = {
    db: { from: (table: string) => ({ select: () => ({ eq: async () => ({ data: table === 'cashflow_user_roles' ? [{ user_id: 'u1' }] : [], error: null }),
      in: async () => ({ data: [{ user_id: 'u1', line_user_id: 'U1' }], error: null }) }) }) } as any,
    push: async (_line: string, message: any) => { pushed.push(message.text); return 'accepted' as const; },
    claim: async (key: string) => (claimed.has(key) ? false : (claimed.add(key), true)),
  };
  const alerts = issueAlerts(['anthropic_credit', 'anthropic_credit'], NOW);
  assert.deepEqual(alerts.map(alert => alert.key), ['ai-billing:anthropic_credit:2026-10-25']);
  assert.deepEqual(await sendCreditAlerts(alerts, deps), { sent: 1, skipped: 0, failed: 0 });
  assert.deepEqual(await sendCreditAlerts(issueAlerts(['anthropic_credit'], NOW), deps), { sent: 0, skipped: 1, failed: 0 }, 'not twice the same day');
  assert.match(pushed[0], /^แจ้งเตือนเครดิต AI\nClaude \(Anthropic\) แจ้งว่าเครดิตไม่พอแล้ว/);
  assert.match(issueAlertText('gemini_quota'), /ใช้เกินโควตาของบัญชีแล้ว/);
  const low = creditStatus({ provider: 'anthropic', now: NOW, record: record('20'), spentSinceMicro: 15_000_000, days: days(1_000_000), issues: [] });
  assert.equal(lowAlertText(low, 335_000), 'แจ้งเตือนเครดิต AI\nClaude (Anthropic) เหลือประมาณ $5.00 (฿168) ใช้ได้อีกราว 5 วัน (ถึงประมาณ 30 ต.ค. 2569)\nควรเติมอย่างน้อย $34.00 (฿1,139) เพื่อให้พอใช้ 30 วัน\nเติมได้ที่ console.anthropic.com แล้วบันทึกยอดใหม่ในหน้าแอดมิน');
  assert.equal(lowAlertText({ ...low, status: 'watch' }, 335_000), null, 'two weeks left: no message yet');
  for (const text of pushed) assert.doesNotMatch(text, /ค้าบ|นะคะ|จ้า/);
});

// ---------- in a chat: the owner is told at once, the user is told plainly ----------
const account = (): UserRow => ({ user_id: '55555555-5555-4555-8555-555555555555', statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as unknown as UserRow);
const env = { AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' };
function providers(anthropicStatus: number, anthropicMessage: string, geminiText = 'สรุปให้แล้วครับ') {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('anthropic')) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: anthropicMessage } }), { status: anthropicStatus, headers: { 'content-type': 'application/json', 'request-id': 'req' } });
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: geminiText }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

test('a request where Claude is out of credit still answers with Gemini, and the routing log carries the billing problem', async () => {
  const warn = console.warn; console.warn = () => undefined;
  try {
    const reply = await runAssistant({ user: account(), plan: 'pro', text: 'วิเคราะห์รายรับ 6 เดือนล่าสุดเทียบกับรายจ่าย แล้วบอกแนวโน้ม' },
      { config: aiConfig(env), ...memoryStores(), fetchImpl: providers(400, 'Your credit balance is too low to access the Anthropic API.') });
    assert.deepEqual(reply.routing?.billing, ['anthropic_credit']);
    assert.equal(reply.text, 'สรุปให้แล้วครับ');
  } finally { console.warn = warn; }
});

test('the database: spend per provider per Bangkok day from the per-call log or the row, and billing answers of the last day', async () => {
  const db = new PGlite();
  const A = '11111111-1111-4111-8111-111111111111';
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${A}');
    create table public.cashflow_user_roles(user_id uuid primary key, role text not null);`);
  await db.exec(await readFile('database/ai_secretary.sql', 'utf8'));
  for (const name of ['20261024120000_ai_proposal_args.sql', '20261025090000_ai_learning.sql', '20261025130000_ai_routing_log.sql', '20261025150000_ai_cost_accounting.sql', '20261025230000_admin_ai_credit.sql'])
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
  let n = 0;
  const usage = (at: string, cost: string, model: string | null, routing: unknown = null) => db.query(`insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,cost_usd,model,route,created_at,routing)
    values($1,$2,'2026-10-01',1,'settled',$3,$4,'chat',$5,$6::jsonb)`, [`00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, A, cost, model, at, routing === null ? null : JSON.stringify(routing)]);
  try {
    // 25 Oct 00:30 Bangkok: one request that used both (Gemini failed over to Claude).
    await usage('2026-10-24T17:30:00Z', '0.030000', 'claude-sonnet-5-5', { calls: [{ provider: 'gemini', usd: 0.004 }, { provider: 'anthropic', usd: 0.026 }] });
    // 24 Oct 23:59 Bangkok: a voice note (no per-call log).
    await usage('2026-10-24T16:59:00Z', '0.001500', 'gemini-3.5-flash-lite');
    // A failed request whose Claude call was refused for credit.
    await usage('2026-10-25T03:00:00Z', '0.000000', null, { calls: [], error: 'billing_anthropic_credit' });
    await usage('2026-10-25T03:10:00Z', '0.003000', 'gemini-3.5-flash-lite', { calls: [{ provider: 'gemini', usd: 0.003 }], billing: ['anthropic_credit'] });
    const spend = await db.query(`select provider, day::text, usd::text, requests::int from public.cashflow_admin_ai_provider_spend('2026-10-20T00:00:00Z', '2026-10-26T00:00:00Z')`);
    assert.deepEqual(spend.rows, [
      { provider: 'google', day: '2026-10-24', usd: '0.001500', requests: 1 },
      { provider: 'anthropic', day: '2026-10-25', usd: '0.026', requests: 1 },
      { provider: 'google', day: '2026-10-25', usd: '0.007', requests: 2 },
    ]);
    const issues = await db.query(`select issue, times::int from public.cashflow_admin_ai_billing_issues('2026-10-24T05:00:00Z')`);
    assert.deepEqual(issues.rows, [{ issue: 'anthropic_credit', times: 2 }]);
    // Only the server may read it: the browser roles have no access.
    const grants = await db.query(`select has_table_privilege('authenticated', 'public.cashflow_admin_ai_credit', 'select') as can`);
    assert.deepEqual(grants.rows, [{ can: false }]);
  } finally { await db.close(); }
});

test('the chat service tells the owner at once, and a request that cannot be answered says plainly that เลขา is paused', async () => {
  const { handleMessage } = await import('../backend/src/ai/service');
  const db: any = {
    async loadAccount() { return { user: account(), versions: {} }; },
    async reserve() { return { ok: true, usedTokens: 5, usedRequests: 1 }; },
    async settle() {}, async usage() { return { tokens: 0, requests: 0 }; },
    async saveProposal() {}, async claimProposal() { return null; }, async finishProposal() {}, async cancelProposal() { return false; },
    async applyChanges() { return true; }, async memories() { return []; }, async remember() {}, async saveRouting() {},
  };
  const told: string[][] = [];
  const warn = console.warn; console.warn = () => undefined;
  try {
    const answered = await handleMessage(db, { config: aiConfig(env), fetchImpl: providers(400, 'Your credit balance is too low to access the Anthropic API.'), onBillingIssue: async issues => { told.push(issues); } },
      account().user_id, 'pro', { text: 'วิเคราะห์รายรับ 6 เดือนล่าสุดเทียบกับรายจ่าย แล้วบอกแนวโน้ม' });
    assert.equal(answered.text, 'สรุปให้แล้วครับ');
    assert.deepEqual(told, [['anthropic_credit']]);
    const quota = (async () => new Response(JSON.stringify({ error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' } }), { status: 429, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    await assert.rejects(handleMessage(db, { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), fetchImpl: quota, onBillingIssue: async issues => { told.push(issues); } }, account().user_id, 'pro', { text: 'สวัสดีครับ' }),
      (error: any) => error.status === 503 && error.code === 'ai_paused' && /พักให้บริการชั่วคราว.*ไม่มีการหักโทเคน/.test(error.message));
    assert.deepEqual(told.at(-1), ['gemini_quota']);
  } finally { console.warn = warn; }
});
