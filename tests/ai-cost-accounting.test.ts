import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { aiConfig } from '../backend/src/ai/config';
import { costSplit } from '../backend/src/ai/cost';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { handleMessage, type AssistantDb } from '../backend/src/ai/service';
import type { RoutingRecord } from '../backend/src/ai/routingPolicy';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner's cost brief "KRAROK AI — COST OPTIMIZATION & PROFITABILITY FIX" (2026-10-25), with fake Gemini and Claude
// servers and a test database: no network, no keys, no cost. Synthetic accounts only.

const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const day = (offset: number) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const account = (userId = A): UserRow => ({
  user_id: userId, statuses: [], goals: [], expenses: [], settings: {},
  jobs: [{ id: 'job-logo', name: 'ออกแบบโลโก้', client: 'ร้านตัวอย่าง', value: 12000, received: 0, pending: 12000, status: 'pending', creditTerm: 30, postDate: day(-40), payDate: day(-10), isPosted: true }] as any,
});
const env = { AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' };
const config = (over: Record<string, string> = {}) => aiConfig({ ...env, ...over });

type Reply = { status?: number; json?: unknown; fail?: Error };
// The shared rules (21,217 tokens on 2026-10-25) written to the 1-hour cache, or read from it.
const cold = { input_tokens: 40, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 24687, cache_creation: { ephemeral_1h_input_tokens: 21217, ephemeral_5m_input_tokens: 3470 } };
// The same first round with the shared rules already cached: only the per-message part is written.
const warmShared = { input_tokens: 40, output_tokens: 300, cache_read_input_tokens: 21217, cache_creation_input_tokens: 3470, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 3470 } };
const warm = { input_tokens: 40, output_tokens: 300, cache_read_input_tokens: 24000, cache_creation_input_tokens: 700, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 700 } };
const claude = (content: unknown[], usage = warm, stop = 'end_turn'): Reply => ({ json: { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: stop, stop_sequence: null, usage } });
const cText = (text: string, usage = warm) => claude([{ type: 'text', text }], usage);
const cTool = (name: string, input: Record<string, unknown>, usage = warm, text = '') => claude([...(text ? [{ type: 'text', text }] : []), { type: 'tool_use', id: `toolu_${name}`, name, input }], usage, 'tool_use');
const gText = (text: string): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 20000, cachedContentTokenCount: 14000, candidatesTokenCount: 80 } } });
const gCall = (name: string, args: Record<string, unknown>): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args, id: `c-${name}` }, thoughtSignature: 's' }] } }], usageMetadata: { promptTokenCount: 20000, cachedContentTokenCount: 14000, candidatesTokenCount: 20 } } });
const gFail = (status: number): Reply => ({ status, json: { error: { message: `busy ${status}` } } });

function providers(gemini: Reply[], anthropic: Reply[] = []) {
  const asked: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const isClaude = String(input).includes('anthropic');
    asked.push(isClaude ? 'claude' : 'gemini');
    const next = (isClaude ? anthropic : gemini).shift();
    if (!next) throw new Error(`no more fake ${isClaude ? 'Claude' : 'Gemini'} replies`);
    if (next.fail) throw next.fail;
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as unknown as typeof fetch;
  return { asked, fetchImpl };
}
const quiet = async <T>(run: () => Promise<T>) => { const warn = console.warn; console.warn = () => undefined; try { return await run(); } finally { console.warn = warn; } };

test('cost split: real spend, what the user pays, and the shared cache write as the app\'s overhead', () => {
  const coldUsage = { inputTokens: 24727, cachedInputTokens: 0, outputTokens: 300, thinkingTokens: 0, cacheWriteTokens: 24687, cacheWrite1hTokens: 21217 };
  const split = costSplit('anthropic', 'claude-sonnet-5-5', coldUsage);
  // 21,217 written for an hour at $4/MTok, 3,470 for 5 minutes at $2.50, 40 fresh at $2, 300 out at $10.
  assert.ok(Math.abs(split.actual - (21217 * 4 + 3470 * 2.5 + 40 * 2 + 300 * 10) / 1e6) < 1e-9);
  // The user pays the shared part as a cache read ($0.10/MTok on Sonnet 5.5, checked on the live pricing page 2026-10-25).
  assert.ok(Math.abs(split.billable - (21217 * 0.1 + 3470 * 2.5 + 40 * 2 + 300 * 10) / 1e6) < 1e-9);
  assert.ok(Math.abs(split.cacheOverhead - split.actual + split.billable) < 1e-12);
  const warmUsage = { inputTokens: 24740, cachedInputTokens: 24000, outputTokens: 300, thinkingTokens: 0, cacheWriteTokens: 700, cacheWrite1hTokens: 0 };
  const hit = costSplit('anthropic', 'claude-sonnet-5-5', warmUsage);
  assert.equal(hit.billable, hit.actual, 'a cache hit is the user\'s own cost');
  assert.ok(Math.abs(hit.cacheSaved - 24000 * 1.9 / 1e6) < 1e-9, 'reads saved 95% of their input price');
  const gemini = costSplit('gemini', 'gemini-3.5-flash-lite', { inputTokens: 20000, cachedInputTokens: 14000, outputTokens: 80, thinkingTokens: 0 });
  assert.deepEqual([gemini.billable === gemini.actual, gemini.cacheOverhead], [true, 0]);
});

test('first Sonnet message of the hour: the cache write never cuts the work short and is not charged; a cache hit costs the same', async () => {
  // Three rounds like the 2026-10-25 real run (past work → questions): the old ceiling stopped it after the first.
  const first = providers([], [cTool('past_work', { client: 'บริษัท ABC' }, cold), cTool('ask_user', { questions: [{ text: 'งานอะไร ราคาเท่าไหร่' }] }, warm, 'ขอรายละเอียดเพิ่มครับ')]);
  const reply = await runAssistant({ user: account(), plan: 'pro', text: 'สร้างใบเสนอราคาให้บริษัท ABC' }, { config: config(), ...memoryStores(), fetchImpl: first.fetchImpl });
  assert.deepEqual(first.asked, ['claude', 'claude'], 'the questions end the turn: no third round for a lead-in line');
  assert.equal(reply.cards[0]?.kind, 'questions');
  assert.equal(reply.text, 'ขอรายละเอียดเพิ่มครับ');
  assert.equal(reply.calls[0].stoppedAt, undefined);
  assert.ok(reply.costUsd > 0.09, `real spend counted: ${reply.costUsd}`);
  assert.ok(reply.tokens <= 25, `the user pays as if warm: ${reply.tokens}`);
  assert.ok(reply.routing!.cost!.cache_overhead_usd > 0.08);
  // The same request a minute later (cache hit): the user pays the same order of tokens, the app nothing extra.
  const second = providers([], [cTool('past_work', { client: 'บริษัท ABC' }, warmShared), cTool('ask_user', { questions: [{ text: 'งานอะไร' }] }, warm)]);
  const again = await runAssistant({ user: account(), plan: 'pro', text: 'สร้างใบเสนอราคาให้บริษัท ABC' }, { config: config(), ...memoryStores(), fetchImpl: second.fetchImpl });
  assert.equal(again.routing!.cost!.cache_overhead_usd, 0);
  assert.equal(again.tokens, reply.tokens, 'first of the hour or not, the user pays the same');
  assert.ok(Math.abs(again.billableUsd - reply.billableUsd) < 1e-9);
  assert.equal(again.text, 'รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ', 'questions with no words get a lead-in, never "could not finish"');
  // Cache expired again later: the next first message is again the app's overhead, not the user's.
  const later = providers([], [cText('ขอรายละเอียดครับ', cold)]);
  const expired = await runAssistant({ user: account(), plan: 'pro', text: 'ทำใบเสนอราคาให้ร้านตัวอย่างหน่อย' }, { config: config(), ...memoryStores(), fetchImpl: later.fetchImpl });
  assert.ok(expired.routing!.cost!.cache_overhead_usd > 0.08 && expired.tokens <= 15);
});

test('the request\'s real-spend safety limit stops before another paid round; Gemini stays cheap', async () => {
  const loop = providers([], [cTool('search_jobs', { query: 'โลโก้' }, cold), cTool('search_jobs', { query: 'โลโก้' }, cold), cText('ไม่ควรถึงตรงนี้')]);
  const limited = await runAssistant({ user: account(), plan: 'pro', text: 'วิเคราะห์รายได้ปีนี้ให้หน่อย' }, { config: config({ AI_REQUEST_COST_LIMIT_USD: '0.15' }), ...memoryStores(), fetchImpl: loop.fetchImpl });
  assert.deepEqual(loop.asked, ['claude', 'claude']);
  assert.equal(limited.calls[0].stoppedAt, 'budget');
  const light = providers([gText('สวัสดีครับ')]);
  const chat = await runAssistant({ user: account(), plan: 'pro', text: 'สวัสดี' }, { config: config(), ...memoryStores(), fetchImpl: light.fetchImpl });
  assert.deepEqual([chat.tokens, chat.billableUsd === chat.costUsd, chat.overheadUsd], [Math.max(1, Math.ceil(chat.costUsd / 0.001)), true, 0]);
  assert.ok(chat.tokens <= 8);
});

test('a card prepared before the provider fails is kept, charged once, never prepared twice', async () => {
  const stores = memoryStores();
  const timeout = new DOMException('The operation timed out.', 'TimeoutError');
  // The card comes with a read in the same step, so the turn goes on (a step of cards only ends it, 2026-10-28).
  const withRead: Reply = { json: { candidates: [{ content: { role: 'model', parts: [
    { functionCall: { name: 'propose_add_job', args: { name: 'ตัดคลิป', value: 2000, client: 'ไม่ระบุ', delivered: false, payment_status: 'unpaid', credit_term_days: 15, wht_rate: 0 }, id: 'c-1' }, thoughtSignature: 's' },
    { functionCall: { name: 'search_jobs', args: { query: 'ตัดคลิป' }, id: 'c-2' } }] } }], usageMetadata: { promptTokenCount: 20000, cachedContentTokenCount: 14000, candidatesTokenCount: 20 } } };
  const failing = providers([withRead, { fail: timeout }]);
  const reply = await runAssistant({ user: account(), plan: 'pro', text: 'เพิ่มงานตัดคลิป 2,000 บาท' }, { config: config(), ...stores, fetchImpl: failing.fetchImpl });
  assert.equal(reply.cards[0]?.kind, 'confirm');
  assert.equal(stores.saved.size, 1, 'one proposal, not repeated');
  assert.equal(reply.calls[0].stoppedAt, 'interrupted');
  assert.match(reply.text, /ยังไม่ได้บันทึก/);
  assert.ok(reply.tokens >= 1 && reply.costUsd > 0, 'the finished round is paid once');
  assert.equal(reply.routing?.outcome, 'card');
});

test('escalation and fallback: a failed Sonnet attempt is real spend for the app, never charged; one charge per message', async () => {
  const partialClaude = { status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } } };
  const fallback = providers([gText('วิเคราะห์แล้วครับ')], [cTool('search_jobs', { query: 'x' }, warm), partialClaude]);
  const reply = await quiet(() => runAssistant({ user: account(), plan: 'pro', text: 'วิเคราะห์รายได้ปีนี้ให้หน่อย' }, { config: config(), ...memoryStores(), fetchImpl: fallback.fetchImpl }));
  assert.deepEqual(fallback.asked, ['claude', 'claude', 'gemini']);
  assert.deepEqual(reply.calls.map(call => [call.provider, Boolean(call.failed)]), [['anthropic', true], ['gemini', false]]);
  assert.ok(reply.routing!.cost!.failed_attempt_usd > 0);
  assert.ok(Math.abs(reply.billableUsd - reply.calls[1].costUsd) < 1e-12, 'the user pays only for the answer they got');
  // Gemini retried a busy answer once: counted in the routing log.
  const busy = providers([gFail(503), gText('สวัสดีครับ')]);
  const retried = await runAssistant({ user: account(), plan: 'pro', text: 'สวัสดี' }, { config: config(), ...memoryStores(), fetchImpl: busy.fetchImpl });
  assert.equal(retried.routing?.provider_retries, 1);
});

test('soft budget: past 80% of the daily cap no optional Sonnet use; documents still go to Sonnet', async () => {
  const budget = { spentTodayUsd: 4.2, capUsd: 5 };
  const analysis = providers([gText('สรุปแนวโน้มให้แล้วครับ')]);
  const light = await runAssistant({ user: account(), plan: 'pro', text: 'วิเคราะห์รายได้ปีนี้ให้หน่อย', budget }, { config: config(), ...memoryStores(), fetchImpl: analysis.fetchImpl });
  assert.deepEqual(analysis.asked, ['gemini']);
  assert.equal(light.routing?.budget, 'soft');
  const empty = providers([gText('')], [cText('ไม่ควรถูกเรียก')]);
  await runAssistant({ user: account(), plan: 'pro', text: 'สวัสดี', budget }, { config: config(), ...memoryStores(), fetchImpl: empty.fetchImpl });
  assert.deepEqual(empty.asked, ['gemini'], 'no step up while the budget is soft');
  const document = providers([], [cText('ขอรายละเอียดครับ')]);
  await runAssistant({ user: account(), plan: 'pro', text: 'สร้างใบเสนอราคาให้บริษัท ABC', budget }, { config: config(), ...memoryStores(), fetchImpl: document.fetchImpl });
  assert.deepEqual(document.asked, ['claude']);
});

// ---------- the database: reserve returns today's spend; settle never passes the allowance ----------
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}');`);
  for (const file of ['database/ai_secretary.sql', 'supabase/migrations/20261025150000_ai_cost_accounting.sql']) await db.exec(await readFile(file, 'utf8'));
  return db;
}
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('database: settle never charges past what is left, two at once included; settling twice changes nothing; other accounts untouched', async () => {
  const db = await database();
  const reserve = async (user: string, n: number) => (await db.query<{ r: any }>(`select public.cashflow_ai_reserve('${user}','2026-10','${uuid(n)}',5,100,null,5) as r`)).rows[0].r;
  const settle = async (user: string, n: number, tokens: number, cost = 0.01, release = false) =>
    (await db.query<{ c: number }>(`select public.cashflow_ai_settle_capped('${user}','2026-10','${uuid(n)}',${tokens},${cost},'m','chat','v',${release},100) as c`)).rows[0].c;
  await db.exec(`insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,cost_usd) values ('${uuid(1)}','${A}','2026-10',80,'settled',0.08),('${uuid(2)}','${B}','2026-10',95,'settled',0.4);`);
  const first = await reserve(A, 10);
  assert.equal(first.ok, true);
  assert.equal(Number(first.spent_today_usd), 0.48, 'the whole app\'s spend today');
  const second = await reserve(A, 11);
  assert.equal(second.ok, true);
  // 80 used, two answers of 30 each: the first is charged 15 (100 − 80 − the other reservation's 5), the second the rest.
  assert.equal(await settle(A, 10, 30), 15);
  assert.equal(await settle(A, 11, 30), 5);
  const used = (await db.query<{ t: number }>(`select sum(tokens)::int as t from public.cashflow_ai_usage where user_id='${A}'`)).rows[0].t;
  assert.equal(used, 100, 'exactly the allowance');
  assert.equal(await settle(A, 10, 30), 15, 'settling again returns what was charged and changes nothing');
  assert.equal((await db.query<{ t: number }>(`select sum(tokens)::int as t from public.cashflow_ai_usage where user_id='${B}'`)).rows[0].t, 95, 'B untouched');
  // A released request keeps its real cost on the row (the daily cap counts it) and charges nothing.
  await reserve(B, 12);
  assert.equal(await settle(B, 12, 7, 0.03, true), 0);
  const row = (await db.query<{ status: string; cost: string }>(`select status, cost_usd::text as cost from public.cashflow_ai_usage where request_id='${uuid(12)}'`)).rows[0];
  assert.deepEqual([row.status, Number(row.cost)], ['released', 0.03]);
  const capped = (await db.query<{ r: any }>(`select public.cashflow_ai_reserve('${B}','2026-10','${uuid(13)}',5,100,null,0.5) as r`)).rows[0].r;
  assert.deepEqual([capped.ok, capped.reason], [false, 'daily_cap']);
});

// ---------- the service: charge capped, hard stop before the start, failure cost kept ----------
function fakeDb(spentTodayUsd?: number, over: Partial<AssistantDb> = {}) {
  const rows: { requestId: string; tokens: number; status: string; cost: number }[] = [];
  const routing: RoutingRecord[] = [];
  const db: AssistantDb = {
    async loadAccount() { return { user: account(), versions: {} }; },
    async reserve(input) {
      const used = rows.filter(row => row.status !== 'released').reduce((sum, row) => sum + row.tokens, 0);
      if (input.tokenLimit !== null && used >= input.tokenLimit) return { ok: false, reason: 'tokens' };
      rows.push({ requestId: input.requestId, tokens: input.tokens, status: 'reserved', cost: 0 });
      return { ok: true, usedTokens: used + input.tokens, usedRequests: rows.length, ...(spentTodayUsd !== undefined ? { spentTodayUsd } : {}) };
    },
    async settle(input) { const row = rows.find(item => item.requestId === input.requestId); if (row) Object.assign(row, { tokens: input.release ? 0 : input.tokens, status: input.release ? 'released' : 'settled', cost: input.costUsd }); },
    async usage() { return { tokens: 0, requests: 0 }; },
    async saveProposal() {}, async claimProposal() { return null; }, async finishProposal() {}, async cancelProposal() { return false; },
    async applyChanges() { return true; }, async memories() { return []; }, async remember() {},
    async saveRouting(_, __, record) { routing.push(record); },
    ...over,
  };
  return { db, rows, routing };
}

test('service: the last message of a cycle is charged only what is left; past the cap it never starts; a timeout keeps its real cost', async () => {
  // 1,647 of 1,650 used (the Pro month since 2026-10-25): a Sonnet answer worth about 20 tokens is charged the 3 left;
  // the app pays the rest.
  const { db, rows, routing } = fakeDb(1);
  rows.push({ requestId: 'earlier', tokens: 1647, status: 'settled', cost: 1.647 });
  const sonnet = providers([], [cText('ขอรายละเอียดครับ')]);
  const reply = await handleMessage(db, { config: config(), fetchImpl: sonnet.fetchImpl }, A, 'pro', { text: 'สร้างใบเสนอราคาให้บริษัท ABC' });
  assert.equal(reply.tokens, 3);
  assert.equal(reply.tokensLeft, 0);
  assert.ok(routing[0].cost!.quota_overrun_usd > 0);
  // The daily cap: a Sonnet request at $4.95 of $5 is refused before any model call; a Gemini one still runs.
  const nearCap = fakeDb(4.95);
  const none = providers([], []);
  await assert.rejects(handleMessage(nearCap.db, { config: config(), fetchImpl: none.fetchImpl }, A, 'pro', { text: 'สร้างใบเสนอราคาให้บริษัท ABC' }), (error: any) => error.status === 503);
  assert.deepEqual(none.asked, []);
  assert.equal(nearCap.rows[0].status, 'released');
  const chat = providers([gText('สวัสดีครับ')]);
  await quiet(() => handleMessage(nearCap.db, { config: config(), fetchImpl: chat.fetchImpl }, A, 'pro', { text: 'สวัสดี' }));
  assert.deepEqual(chat.asked, ['gemini']);
  // A timeout after a finished round: the user pays nothing, the row keeps the real cost of that round.
  const slow = fakeDb(0);
  const timeout = new DOMException('The operation timed out.', 'TimeoutError');
  const stuck = providers([gCall('search_jobs', { query: 'โลโก้' }), { fail: timeout }]);
  await assert.rejects(handleMessage(slow.db, { config: config(), fetchImpl: stuck.fetchImpl }, A, 'pro', { text: 'งานโลโก้ค้างอยู่เท่าไหร่' }));
  assert.equal(slow.rows[0].status, 'released');
  assert.equal(slow.rows[0].tokens, 0);
  assert.ok(slow.rows[0].cost > 0, 'the finished round stays in the real spend');
  assert.deepEqual([slow.routing[0].outcome, slow.routing[0].error], ['error', 'timeout']);
  assert.ok(slow.routing[0].cost!.failed_attempt_usd > 0);
});

test('cache choice: while Sonnet is quiet the shared rules get the 5-minute cache, while busy the 1-hour one; the user pays neither write', async () => {
  const bodies: any[] = [];
  const coldFive = { input_tokens: 40, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 24687, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 24687 } };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(cText('ขอรายละเอียดครับ', coldFive).json), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'r' } });
  }) as unknown as typeof fetch;
  const quietHour = await runAssistant({ user: account(), plan: 'pro', text: 'สร้างใบเสนอราคาให้บริษัท ABC', cacheHint: '5m' }, { config: config(), ...memoryStores(), fetchImpl });
  assert.deepEqual(bodies[0].system[0].cache_control, { type: 'ephemeral' }, 'the shared rules: 5 minutes');
  assert.equal(bodies[0].system[1].cache_control, undefined);
  assert.equal(quietHour.routing?.claude_cache, '5m');
  const shared = quietHour.calls[0].usage.sharedWrite5mTokens ?? 0;
  assert.ok(shared > 15000 && shared <= 24687, `the shared rules' part of the write: ${shared}`);
  assert.ok(quietHour.overheadUsd > 0 && quietHour.tokens < 20, `user ${quietHour.tokens} tokens, app ${quietHour.overheadUsd}`);
  await runAssistant({ user: account(), plan: 'pro', text: 'สร้างใบเสนอราคาให้บริษัท ABC', cacheHint: '1h' }, { config: config(), ...memoryStores(), fetchImpl });
  assert.deepEqual(bodies[1].system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  // The service picks it from the reservation: 0 or 1 Sonnet answers in the last hour → 5 minutes; 2 or more → 1 hour.
  const picked: (string | undefined)[] = [];
  for (const count of [0, 1, 2, undefined]) {
    const { db } = fakeDb(0, { async reserve() { return { ok: true, usedTokens: 5, usedRequests: 1, spentTodayUsd: 0, ...(count !== undefined ? { smartLastHour: count } : {}) }; } });
    bodies.length = 0;
    await handleMessage(db, { config: config(), fetchImpl }, A, 'pro', { text: 'สร้างใบเสนอราคาให้บริษัท ABC' });
    picked.push(bodies[0].system[0].cache_control?.ttl ?? bodies[0].system[0].cache_control?.type);
  }
  assert.deepEqual(picked, ['ephemeral', 'ephemeral', '1h', '1h'], 'before the SQL runs (no count) it stays on 1 hour');
});

test('database: the reservation counts the app\'s Sonnet answers of the last hour', async () => {
  const db = await database();
  await db.exec(`insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,cost_usd,model,created_at) values
    ('${uuid(30)}','${B}','2026-10',20,'settled',0.02,'claude-sonnet-5-5',now() - interval '10 minutes'),
    ('${uuid(31)}','${B}','2026-10',20,'settled',0.02,'claude-sonnet-5-5',now() - interval '2 hours'),
    ('${uuid(32)}','${B}','2026-10',4,'settled',0.004,'gemini-3.5-flash-lite',now() - interval '5 minutes');`);
  const reserved = (await db.query<{ r: any }>(`select public.cashflow_ai_reserve('${A}','2026-10','${uuid(33)}',5,2500,null,5) as r`)).rows[0].r;
  assert.equal(Number(reserved.smart_last_hour), 1, 'any account\'s Sonnet answers count: the cache is shared');
});
