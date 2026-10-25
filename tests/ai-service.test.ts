import { launched } from '../backend/src/ai/knowledgeBase';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { RESERVE_TOKENS, confirmProposal, handleMessage, renewalCycle, tokenCycle, usageStatus, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';
import { HttpError } from '../backend/src/http/guard';
import type { UserRow } from '../backend/src/services/lineAssistant';

// เลขากระรอก access, Krarok Tokens and the confirm button, with an in-memory database that follows the same rules
// as database/ai_secretary.sql. No network, no keys, no cost.

const USER = '44444444-4444-4444-8444-444444444444';
const day = (offset: number) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const account = (): UserRow => ({
  user_id: USER, statuses: [], goals: [], expenses: [], settings: {},
  jobs: [{ id: 'job-logo', name: 'ออกแบบโลโก้', client: 'ร้านตัวอย่าง', type: 'ออกแบบ', note: '', value: 12000, received: 0, pending: 12000, status: 'pending', creditTerm: 30, postDate: day(-40), payDate: day(-10), isPosted: true }] as any,
});

function fakeDb(over: Partial<AssistantDb> = {}) {
  const usage: { requestId: string; cycle: string; tokens: number; status: string; cost: number }[] = [];
  const proposals = new Map<string, StoredProposal & { status: string }>();
  const applied: unknown[][] = [];
  const remembered: { id: string; kind: string; value: string }[] = [];
  let spentToday = 0;
  const db: AssistantDb = {
    async loadAccount() { return { user: account(), versions: { 'job-logo': 7 } }; },
    async reserve(input) {
      if (spentToday >= input.dailyCapUsd) return { ok: false, reason: 'daily_cap' };
      const rows = usage.filter(row => row.cycle === input.cycle && row.status !== 'released');
      const tokens = rows.reduce((sum, row) => sum + row.tokens, 0);
      if (input.requestLimit !== null && rows.length >= input.requestLimit) return { ok: false, reason: 'requests' };
      if (input.tokenLimit !== null && tokens >= input.tokenLimit) return { ok: false, reason: 'tokens' };
      usage.push({ requestId: input.requestId, cycle: input.cycle, tokens: input.tokens, status: 'reserved', cost: 0 });
      return { ok: true, usedTokens: tokens + input.tokens, usedRequests: rows.length + 1 };
    },
    async settle(input) {
      const row = usage.find(item => item.requestId === input.requestId && item.status === 'reserved');
      if (!row) return;
      Object.assign(row, { tokens: input.release ? 0 : input.tokens, status: input.release ? 'released' : 'settled', cost: input.costUsd });
      spentToday += input.costUsd;
    },
    async usage(_, cycle) {
      const rows = usage.filter(row => row.cycle === cycle && row.status !== 'released');
      return { tokens: rows.reduce((sum, row) => sum + row.tokens, 0), requests: rows.length };
    },
    async saveProposal(proposal) { proposals.set(proposal.id, { ...proposal, status: 'pending' }); },
    async claimProposal(userId, id) {
      const row = proposals.get(id);
      if (!row || row.userId !== userId || row.status !== 'pending') return null;
      row.status = 'applying';
      return row;
    },
    async finishProposal(_, id, status) { const row = proposals.get(id); if (row?.status === 'applying') row.status = status; },
    async cancelProposal(_, id) { const row = proposals.get(id); if (row?.status !== 'pending') return false; row.status = 'cancelled'; return true; },
    async applyChanges(_, changes) { applied.push(changes); return true; },
    async memories() { return remembered; },
    async remember(_, kind, value) { remembered.push({ id: `00000000-0000-4000-8000-${String(remembered.length).padStart(12, '0')}`, kind, value }); },
    ...over,
  };
  return { db, usage, proposals, applied, remembered, spend: (usd: number) => { spentToday += usd; } };
}

// These checks were written for a 1,000-token month; the 2,500 default (owner, 2026-10-24) is tested in ai-message-ceiling.
const config = (over: Record<string, string> = {}) => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'test-gemini', AI_PRO_TOKENS_PER_CYCLE: '1000', ...over });
function geminiReplies(...replies: unknown[]): typeof fetch {
  return (async () => {
    const next = replies.shift();
    if (!next) throw new Error('no more fake replies');
    const reply = next as { status?: number; json: unknown };
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}
// 10,000 input + 1,000 output tokens on 3.5 Flash-Lite = $0.0055 → 6 Krarok Tokens.
const text = (value: string) => ({ json: { candidates: [{ content: { role: 'model', parts: [{ text: value }] } }], usageMetadata: { promptTokenCount: 10000, candidatesTokenCount: 1000 } } });
const call = (name: string, args: Record<string, unknown>) => ({ json: { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } } });
const rejectsWith = (status: number, code?: string) => (error: unknown) => error instanceof HttpError && error.status === status && (!code || error.code === code);

test('a mismatched account snapshot fails before any provider call and releases the reservation', async () => {
  const state = fakeDb({ async loadAccount() { return { user: { ...account(), user_id: 'another-owner' }, versions: {} }; } });
  let calls = 0;
  await assert.rejects(() => handleMessage(state.db, { config: config(), fetchImpl: (async () => { calls++; throw new Error('must not call'); }) as typeof fetch }, USER, 'pro', { text: 'รายได้ทั้งปี' }), rejectsWith(403, 'ai_account_mismatch'));
  assert.equal(calls, 0);
  assert.equal(state.usage[0].status, 'released');
});

test('vault metadata reads bind to authenticated user and remain lazy', async () => {
  const owners: string[] = [];
  const state = fakeDb({ async listVaultFiles(owner) { owners.push(owner); return []; } });
  await handleMessage(state.db, { config: config(), fetchImpl: geminiReplies(text('สวัสดีครับ')) }, USER, 'pro', { text: 'สวัสดี' });
  assert.deepEqual(owners, []);
  await handleMessage(state.db, { config: config(), fetchImpl: geminiReplies(call('search_vault', {}), text('ยังไม่มีไฟล์ที่บันทึกไว้ครับ')) }, USER, 'pro', { text: 'มีไฟล์อะไรบ้าง' });
  // While the document vault is not open to every account, its tool is off and nothing is read.
  assert.deepEqual(owners, launched('vault') ? [USER] : []);
});

test('access: off when AI is off, Pro-only after the trial, and nothing is reserved before the check', async () => {
  const fake = fakeDb();
  await assert.rejects(handleMessage(fake.db, { config: aiConfig({}) }, USER, 'pro', { text: 'สวัสดี' }), rejectsWith(503, 'ai_disabled'));
  await assert.rejects(handleMessage(fake.db, { config: config() }, USER, 'none', { text: 'สวัสดี' }), rejectsWith(403, 'ai_pro_only'));
  assert.equal(fake.usage.length, 0);
});

test('trial: 25 Krarok Tokens for the whole trial, charged at the real cost; then refused before the model runs', async () => {
  const fake = fakeDb();
  // Each fake answer costs 6 tokens: 0, 6, 12, 18 and 24 used still leave room, so five answers go through. The fifth
  // is charged only the 1 token left (cost brief, 2026-10-25: never past the allowance; the app pays the other 5).
  for (let i = 0; i < 5; i += 1) {
    const reply = await handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(text('สวัสดีครับ')) }, USER, 'trial', { text: 'สวัสดี' });
    assert.equal(reply.tokens, i < 4 ? 6 : 1);
    assert.equal(reply.tokensLeft, Math.max(0, 25 - 6 * (i + 1)));
  }
  assert.equal(fake.usage.reduce((sum, row) => sum + row.tokens, 0), 25, 'exactly the allowance, never more');
  assert.ok(fake.usage.every(row => row.cycle === 'trial'));
  let modelCalled = false;
  const fetchImpl = (async () => { modelCalled = true; throw new Error('should not run'); }) as unknown as typeof fetch;
  await assert.rejects(handleMessage(fake.db, { config: config(), fetchImpl }, USER, 'trial', { text: 'ต่ออีก' }), rejectsWith(402, 'ai_trial_used'));
  assert.equal(modelCalled, false);
  const status = await usageStatus(fake.db, config(), USER, 'trial');
  assert.deepEqual([status.tokensLeft, status.tokenLimit, status.resetsAt], [0, 25, null]);
});

test('Pro: charged the real cost in Krarok Tokens, and refused once the month is used up', async () => {
  const fake = fakeDb();
  const reply = await handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(text('เดือนนี้รับแล้ว')) }, USER, 'pro', { text: 'เดือนนี้ได้เงินเท่าไหร่' });
  assert.equal(reply.tokens, 6);
  assert.equal(reply.tokensLeft, 994);
  assert.equal(fake.usage[0].status, 'settled');
  assert.equal(fake.usage[0].cycle, tokenCycle());
  const status = await usageStatus(fake.db, config(), USER, 'pro');
  assert.deepEqual([status.tokensLeft, status.trialLeft], [994, null]);

  const full = fakeDb();
  full.usage.push({ requestId: 'old', cycle: tokenCycle(), tokens: 1000, status: 'settled', cost: 1 });
  await assert.rejects(handleMessage(full.db, { config: config(), fetchImpl: geminiReplies(text('-')) }, USER, 'pro', { text: 'อีกนิด' }), rejectsWith(402, 'ai_tokens_used'));
});

test('Pro: two requests at once with the last token left — only one goes through', async () => {
  const fake = fakeDb();
  fake.usage.push({ requestId: 'old', cycle: tokenCycle(), tokens: 999, status: 'settled', cost: 0.999 });
  const results = await Promise.allSettled([
    handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(text('ก')) }, USER, 'pro', { text: 'หนึ่ง' }),
    handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(text('ข')) }, USER, 'pro', { text: 'สอง' }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(RESERVE_TOKENS > 1, true);
});

test('a failed answer costs nothing and says to try again', async () => {
  const fake = fakeDb();
  // Gemini failing twice: a busy answer is tried once more, then the request gives up.
  const failing = geminiReplies({ status: 500, json: { error: { message: 'internal' } } }, { status: 500, json: { error: { message: 'internal' } } });
  await assert.rejects(handleMessage(fake.db, { config: config(), fetchImpl: failing }, USER, 'pro', { text: 'สวัสดี' }), rejectsWith(503, 'ai_provider'));
  assert.equal(fake.usage[0].status, 'released');
  assert.equal(fake.usage[0].tokens, 0);
});

test('the daily safety cap stops every request for the day', async () => {
  const fake = fakeDb();
  fake.spend(5);
  await assert.rejects(handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(text('-')) }, USER, 'admin', { text: 'สวัสดี' }), rejectsWith(503, 'ai_daily_cap'));
});

test('a proposal records the version the AI read; confirm applies it once through the app save', async () => {
  const fake = fakeDb();
  const reply = await handleMessage(fake.db, {
    config: config(),
    fetchImpl: geminiReplies(call('propose_record_payment', { job_id: 'job-logo', mode: 'full', date: '2026-10-24' }), text('เตรียมไว้แล้ว กดยืนยันบนการ์ดได้เลยครับ')),
  }, USER, 'pro', { text: 'งานโลโก้ได้เงินครบแล้ว' });
  const card = reply.cards.find(item => item.kind === 'confirm') as { id: string };
  assert.ok(card);
  assert.equal(fake.proposals.get(card.id)!.baseVersion, 7);
  assert.equal(fake.applied.length, 0, 'nothing written before confirm');

  const done = await confirmProposal(fake.db, USER, card.id);
  assert.deepEqual(done, { status: 'applied', kind: 'record_payment', jobId: 'job-logo' });
  const [change] = fake.applied[0] as any[];
  assert.deepEqual([change.table, change.id, change.op, change.version, change.data.status, change.data.pending], ['cashflow_jobs', 'job-logo', 'set', 7, 'done', 0]);
  await assert.rejects(confirmProposal(fake.db, USER, card.id), rejectsWith(409, 'ai_proposal_gone'));
  assert.equal(fake.applied.length, 1, 'a second tap applies nothing');
});

test('confirm: another account cannot apply it, a changed job is refused, a failed save can be retried', async () => {
  const fake = fakeDb();
  const reply = await handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(call('propose_add_job', { name: 'แปลเอกสาร', value: 4000, client: 'ลูกค้าตัวอย่าง', delivered: true, delivery_date: '2026-10-24', payment_status: 'unpaid', credit_term_days: 30, wht_rate: 0 }), text('เตรียมไว้แล้ว')) }, USER, 'pro', { text: 'เพิ่มงานแปลเอกสาร 4000' });
  const id = (reply.cards[0] as { id: string }).id;
  await assert.rejects(confirmProposal(fake.db, '55555555-5555-4555-8555-555555555555', id), rejectsWith(409));

  let attempts = 0;
  const flaky = fakeDb({ async applyChanges() { attempts += 1; if (attempts === 1) throw new Error('network'); return true; } });
  flaky.proposals.set(id, { ...fake.proposals.get(id)!, status: 'pending' });
  await assert.rejects(confirmProposal(flaky.db, USER, id), /network/);
  assert.equal(flaky.proposals.get(id)!.status, 'pending');
  assert.equal((await confirmProposal(flaky.db, USER, id)).status, 'applied');
  assert.equal(fake.applied.length, 0, 'the other account wrote nothing');

  const stale = fakeDb({ async applyChanges() { return false; } });
  stale.proposals.set(id, { ...fake.proposals.get(id)!, status: 'pending' });
  await assert.rejects(confirmProposal(stale.db, USER, id), rejectsWith(409, 'ai_proposal_stale'));
  assert.equal(stale.proposals.get(id)!.status, 'stale');
});

test('memory: "เรียกผมว่าบอส" is saved and used as the name next time', async () => {
  const fake = fakeDb();
  await handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(call('remember', { kind: 'preferred_name', value: 'บอส' }), text('รับทราบครับบอส')) }, USER, 'pro', { text: 'เรียกผมว่าบอสนะ' });
  assert.deepEqual(fake.remembered.map(({ kind, value }) => ({ kind, value })), [{ kind: 'preferred_name', value: 'บอส' }]);
  let system = '';
  const capture = (async (_url: string, init: RequestInit) => {
    system = JSON.parse(String(init.body)).systemInstruction.parts[0].text;
    return new Response(JSON.stringify(text('ครับบอส').json), { status: 200 });
  }) as unknown as typeof fetch;
  await handleMessage(fake.db, { config: config(), fetchImpl: capture }, USER, 'pro', { text: 'สวัสดี' });
  assert.match(system, /PREFERRED NAME[^\n]*: "บอส"/);
});

test('Pro tokens renew every month on the renewal day, also for 6-month and yearly plans', () => {
  const bkk = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  // Monthly plan renewing 15 Nov (Bangkok): this cycle started 15 Oct, next reset 15 Nov.
  let cycle = renewalCycle('2026-11-15T03:00:00Z', new Date('2026-10-24T05:00:00Z'));
  assert.deepEqual([cycle.cycle, bkk(cycle.resetsAt.toISOString())], ['2026-10-15', '2026-11-15']);
  // Yearly plan renewing 20 Oct next year: still a fresh 1,000 every month on the 20th.
  cycle = renewalCycle('2027-10-20T10:00:00Z', new Date('2026-10-24T05:00:00Z'));
  assert.deepEqual([cycle.cycle, bkk(cycle.resetsAt.toISOString())], ['2026-10-20', '2026-11-20']);
  // Renewal on the 31st: February resets on its last day, March on the 31st.
  cycle = renewalCycle('2027-01-31T10:00:00Z', new Date('2026-03-05T05:00:00Z'));
  assert.deepEqual([cycle.cycle, bkk(cycle.resetsAt.toISOString())], ['2026-02-28', '2026-03-31']);
  // The reset happens at midnight Bangkok time on the renewal day.
  cycle = renewalCycle('2026-11-15T03:00:00Z', new Date('2026-10-14T17:00:00Z'));
  assert.equal(cycle.cycle, '2026-10-15');
  cycle = renewalCycle('2026-11-15T03:00:00Z', new Date('2026-10-14T16:59:00Z'));
  assert.equal(cycle.cycle, '2026-09-15');
});

test('Pro: usage is filed under the renewal cycle and the "used up" message gives the reset date', async () => {
  const plan = { plan: 'pro' as const, periodEnd: new Date(Date.now() + 10 * 86400000).toISOString() };
  const { cycle } = renewalCycle(plan.periodEnd);
  const fake = fakeDb();
  await handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(text('ครับ')) }, USER, plan, { text: 'สวัสดี' });
  assert.equal(fake.usage[0].cycle, cycle);
  fake.usage.push({ requestId: 'big', cycle, tokens: 1000, status: 'settled', cost: 1 });
  await assert.rejects(handleMessage(fake.db, { config: config(), fetchImpl: geminiReplies(text('-')) }, USER, plan, { text: 'อีก' }),
    (error: unknown) => error instanceof HttpError && error.status === 402 && /จะได้รับใหม่วันที่ \d+ \S+ \d{4}/.test(error.message));
  const status = await usageStatus(fake.db, config(), USER, plan);
  assert.equal(status.tokensLeft, 0);
  assert.ok(status.resetsAt && new Date(status.resetsAt).getTime() > Date.now());
});

// One Krarok Token pool per account, wherever เลขา is used (owner, 2026-10-24: "โทเค็นของตัวใน LINE กับตัวในแอปต้อง
// ซิงกัน ... ต้องจำกัดการใช้แต่ละยูสเซอร์ ... ถึงจะเชื่อมที่ไหนก็ตามต้องโทเคนเดียวกัน").
async function linePool(over: Record<string, string> = {}) {
  const { lineAssistantAnswer } = await import('../backend/src/ai/lineBridge');
  const state = fakeDb();
  const limits: string[] = [];
  let modelRuns = 0;
  const deps = {
    env: { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'test-gemini', AI_PRO_TOKENS_PER_CYCLE: '1000', ...over },
    db: state.db,
    plan: async () => ({ plan: 'pro' as const, email: null }),
    rateLimit: async (scope: string, id: string, limit: number, seconds: number) => { limits.push(`${scope}:${id}:${limit}/${seconds}`); },
    run: ((db, messageDeps, ...rest) => { modelRuns += 1; return handleMessage(db, { ...messageDeps, fetchImpl: geminiReplies(text('ตอบใน LINE ครับ')) }, ...rest); }) as typeof handleMessage,
  };
  const ask = (question: string) => lineAssistantAnswer({ user_id: USER } as UserRow, question, [], deps);
  return { state, limits, ask, runs: () => modelRuns };
}

test('one token pool: an answer in LINE and one in the app draw on the same allowance, and LINE shows the same balance', async () => {
  const { state, limits, ask, runs } = await linePool();
  await ask('สรุปเดือนนี้ให้หน่อย');
  const app = await handleMessage(state.db, { config: config({ AI_ADMINS_ONLY: 'false' }), fetchImpl: geminiReplies(text('ตอบในแอปครับ')) }, USER, 'pro', { text: 'สรุปเดือนนี้' });
  assert.equal(new Set(state.usage.map(row => row.cycle)).size, 1, 'both answers are filed under the same cycle');
  assert.equal(app.tokensLeft, 1000 - 12, 'the app counts what LINE used');
  const status = await usageStatus(state.db, config(), USER, 'pro');
  assert.equal(status.tokensLeft, 988);
  // "เช็กโทเคน" in LINE: the same number as the app's token ring, with no AI call.
  const balance = await ask('เช็กโทเคน');
  assert.equal(runs(), 1);
  assert.match(balance!.text, /เหลือ 988 จาก 1,000/);
  assert.match(balance!.text, /ใช้ร่วมกันทั้งเลขาในแอปและใน LINE/);
  // LINE's AI messages share the app's per-minute limit (same scope and key); the balance check is free.
  const { MESSAGE_RATE } = await import('../backend/src/ai/service');
  assert.deepEqual(limits, [`${MESSAGE_RATE.scope}:${USER}:${MESSAGE_RATE.limit}/${MESSAGE_RATE.seconds}`]);
  const handler = (await import('node:fs')).readFileSync(new URL('../backend/src/handlers/assistant.ts', import.meta.url), 'utf8');
  assert.match(handler, /rateLimit\(MESSAGE_RATE\.scope, user\.id, MESSAGE_RATE\.limit, MESSAGE_RATE\.seconds\)/);
});

test('LINE: a low balance is shown under the answer; a used-up pool is refused in LINE as in the app', async () => {
  const { state, ask } = await linePool({ AI_PRO_TOKENS_PER_CYCLE: '10' });
  const first = await ask('ใครค้างจ่ายบ้าง');
  assert.match(JSON.stringify(first!.messages), /เหลือโทเคนเลขารอบนี้ 4 จาก 10 \(ใช้ร่วมกับในแอป\)/);
  await handleMessage(state.db, { config: config({ AI_ADMINS_ONLY: 'false', AI_PRO_TOKENS_PER_CYCLE: '10' }), fetchImpl: geminiReplies(text('ตอบในแอปครับ')) }, USER, 'pro', { text: 'อีกนิด' });
  const refused = await ask('สรุปเดือนนี้');
  assert.match(refused!.text, /โทเคนของรอบนี้หมดแล้ว จะได้รับใหม่วันที่/);
});

test('LINE: too many messages in a minute get the same polite refusal as the app, without an AI call', async () => {
  const { lineAssistantAnswer } = await import('../backend/src/ai/lineBridge');
  let ran = false;
  const reply = await lineAssistantAnswer({ user_id: USER } as UserRow, 'สรุปเดือนนี้', [], {
    env: { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'test-gemini' }, db: fakeDb().db,
    plan: async () => ({ plan: 'pro' as const, email: null }),
    rateLimit: async () => { throw new HttpError(429, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่'); },
    run: (async () => { ran = true; throw new Error('must not run'); }) as unknown as typeof handleMessage,
  });
  assert.equal(reply!.text, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่');
  assert.equal(ran, false);
});
