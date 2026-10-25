import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { confirmProposal, handleMessage, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';
import { HttpError } from '../backend/src/http/guard';
import type { UserRow } from '../backend/src/services/lineAssistant';

// The provider and database are wholly in memory. Even unexpected global fetches fail closed.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JOB = 'same-job-id';
const NOW = new Date('2026-10-24T06:00:00.000Z');
const PAID_DATE = '2026-10-24';
const copy = <T,>(value: T): T => structuredClone(value);
const other = (owner: string) => owner === A ? B : A;
const sentinel = (owner: string) => owner === A ? 'OWNER_A_PRIVATE_JOB' : 'OWNER_B_PRIVATE_JOB';
// These checks were written for a 1,000-token month; the 2,500 default (owner, 2026-10-24) is tested in ai-message-ceiling.
const configuration = aiConfig({ AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'synthetic-never-sent', AI_MAX_TOOL_STEPS: '3', AI_PRO_TOKENS_PER_CYCLE: '1000' });
type Job = NonNullable<UserRow['jobs']>[number] & { remindAt: string; lastActivityAt: string };
type Write = { owner: string; changes: Array<{ table: string; id: string; op: string; version: number; data: Job }> };

function fixture() {
  const accounts = new Map<string, UserRow>([A, B].map((owner, index) => [owner, {
    user_id: owner, statuses: [{ id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'done', label: 'จ่ายครบ', behavior: 'done' }],
    goals: [], expenses: [], settings: {},
    jobs: [{ id: JOB, name: sentinel(owner), client: `ลูกค้าบัญชี ${index + 1}`, type: 'ออกแบบ', note: `รายละเอียด ${sentinel(owner)}`,
      value: (index + 1) * 10000, whtRate: 3, whtAmount: (index + 1) * 300, received: 4000, pending: (index + 1) * 9700 - 4000,
      status: 'partial', paymentStatus: 'partial', creditTerm: 30, isPosted: false, postDate: '2026-10-30', payDate: '2026-11-29',
      depositAmount: 4000, depositDate: '2026-10-20', remindAt: '2026-11-29', lastActivityAt: '2026-10-20T03:00:00.000Z' }] as Job[],
  }]));
  const versions = new Map([[A, 7], [B, 31]]);
  const proposals = new Map<string, StoredProposal & { status: string }>();
  const writes: Write[] = [];
  const attempts: Write[] = [];
  const loads: string[] = [];
  const usage: Array<{ owner: string; requestId: string; cycle: string; tokens: number; costUsd: number; released: boolean }> = [];
  const db: AssistantDb = {
    async loadAccount(owner) { loads.push(owner); return { user: copy(accounts.get(owner)!), versions: { [JOB]: versions.get(owner)! } }; },
    async reserve(input) {
      const earlier = usage.filter(row => row.owner === input.userId && row.cycle === input.cycle && !row.released);
      usage.push({ owner: input.userId, requestId: input.requestId, cycle: input.cycle, tokens: input.tokens, costUsd: 0, released: false });
      return { ok: true, usedTokens: earlier.reduce((sum, row) => sum + row.tokens, 0) + input.tokens, usedRequests: earlier.length + 1 };
    },
    async settle(input) { const row = usage.find(item => item.owner === input.userId && item.requestId === input.requestId)!; Object.assign(row, { tokens: input.tokens, costUsd: input.costUsd, released: input.release }); },
    async usage(owner, cycle) { const rows = usage.filter(row => row.owner === owner && row.cycle === cycle && !row.released); return { tokens: rows.reduce((sum, row) => sum + row.tokens, 0), requests: rows.length }; },
    async saveProposal(proposal) { proposals.set(proposal.id, { ...copy(proposal), status: 'pending' }); },
    async claimProposal(owner, id) { const row = proposals.get(id); if (!row || row.userId !== owner || row.status !== 'pending') return null; row.status = 'applying'; return copy(row); },
    async finishProposal(owner, id, status) { const row = proposals.get(id); if (row?.userId === owner && row.status === 'applying') row.status = status; },
    async cancelProposal(owner, id) { const row = proposals.get(id); if (!row || row.userId !== owner || row.status !== 'pending') return false; row.status = 'cancelled'; return true; },
    async applyChanges(owner, raw) {
      const changeSet = copy(raw) as Write['changes']; attempts.push({ owner, changes: changeSet });
      assert.equal(changeSet.length, 1, 'one full record update, not separate withholding/payment writes');
      const [change] = changeSet;
      assert.equal(change.table, 'cashflow_jobs'); assert.equal(change.id, JOB); assert.equal(change.op, 'set');
      if (change.version !== versions.get(owner)) return false;
      const account = accounts.get(owner)!;
      account.jobs = account.jobs!.map(job => job.id === change.id ? copy(change.data) : job);
      versions.set(owner, change.version + 1); writes.push({ owner, changes: changeSet }); return true;
    },
    async memories() { return []; }, async remember() { throw new Error('This request must not save memory'); },
  };
  return { db, accounts, versions, proposals, loads, usage, writes, attempts };
}

function provider(owner: string) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [
    { name: 'search_jobs', args: { query: sentinel(owner) } },
    { name: 'get_job', args: { job_id: JOB } },
    { name: 'propose_edit_job', args: { job_id: JOB, wht_rate: 0, payment_status: 'paid', paid_date: PAID_DATE } },
  ];
  const bodies: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    assert.ok(url.pathname.includes('gemini-3.5-flash-lite'));
    const body = String(init?.body); bodies.push(body);
    assert.ok(!body.includes(sentinel(other(owner))), 'another account must never enter provider context or tool results');
    const call = calls[bodies.length - 1];
    assert.ok(call, 'the final allowed model turn prepares its confirmation without an extra provider call');
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ functionCall: call }] } }],
      usageMetadata: { promptTokenCount: 10000, candidatesTokenCount: 1000 } });
  }) as typeof fetch;
  return { fetchImpl, bodies };
}

const rejects = (code: string) => (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === code;
async function prepare(state: ReturnType<typeof fixture>, owner: string) {
  const fake = provider(owner);
  const result = await handleMessage(state.db, { config: configuration, fetchImpl: fake.fetchImpl, now: NOW }, owner, 'pro', {
    text: `แก้งาน ${sentinel(owner)} ไม่หัก ณ ที่จ่าย และรับเงินครบแล้ววันที่ ${PAID_DATE} ไม่เปลี่ยนวันส่งงาน`,
  });
  const cards = result.cards.filter(card => card.kind === 'confirm');
  assert.equal(cards.length, 1, 'both changes need exactly one review');
  assert.match(cards[0].changes.find(row => row.label === 'หัก ณ ที่จ่าย')?.value ?? '', /→ 0% \(฿0\)/);
  assert.equal(cards[0].changes.find(row => row.label === 'สถานะการชำระ')?.value, 'รับครบแล้ว');
  assert.ok(cards[0].changes.find(row => row.label === 'วันที่รับยอดครบ')?.value.endsWith(PAID_DATE));
  assert.match(result.text, /ยังไม่ได้บันทึก/, 'step-limit response makes the pending state explicit');
  assert.equal(state.proposals.size, 1);
  assert.equal(state.writes.length, 0); assert.equal(state.attempts.length, 0);
  assert.deepEqual(state.loads, [owner]);
  assert.equal(fake.bodies.length, 3);
  // Three real mocked provider turns: 3 × ($0.003 input + $0.0025 output), rounded once to 17 Krarok Tokens.
  assert.equal(result.tokens, 17); assert.equal(result.tokensLeft, 983);
  assert.equal(state.usage.length, 1); assert.equal(state.usage[0].owner, owner);
  assert.ok(Math.abs(state.usage[0].costUsd - 0.0165) < 1e-10); assert.equal(state.usage[0].released, false);
  return { card: cards[0], fake, result };
}

test('compound withholding/payment edit prepares one review and confirms atomically for the own account despite identical job IDs', async t => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network disabled for compound-action tests'); };
  try {
    for (const owner of [A, B]) await t.test(owner === A ? 'owner A' : 'owner B', async () => {
      const state = fixture();
      const before = copy(state.accounts.get(owner)!); const foreignBefore = copy(state.accounts.get(other(owner))!);
      const { card, fake } = await prepare(state, owner);
      assert.deepEqual(state.accounts.get(owner), before, 'preparation never changes a live record');
      const proposal = state.proposals.get(card.id)!;
      assert.equal(proposal.kind, 'edit_job'); assert.equal(proposal.baseVersion, owner === A ? 7 : 31);
      assert.equal(proposal.userId, owner); assert.equal(proposal.jobId, JOB);
      await assert.rejects(confirmProposal(state.db, other(owner), card.id), rejects('ai_proposal_gone'));
      assert.equal(state.proposals.get(card.id)?.status, 'pending', 'a foreign confirmation cannot consume the owner proposal');
      assert.equal(state.attempts.length, 0);
      assert.deepEqual(await confirmProposal(state.db, owner, card.id), { status: 'applied', kind: 'edit_job', jobId: JOB });
      const job = state.accounts.get(owner)!.jobs![0] as Job; const previous = before.jobs![0] as Job;
      assert.deepEqual([job.whtRate, job.whtAmount, job.received, job.pending, job.paymentStatus, job.status, job.payDate], [0, 0, previous.value, 0, 'paid', 'done', PAID_DATE]);
      for (const key of ['isPosted', 'postDate', 'creditTerm', 'depositAmount', 'depositDate', 'remindAt', 'name', 'client', 'note'] as const) assert.equal(job[key], previous[key], `${key} must be preserved`);
      assert.deepEqual(state.accounts.get(other(owner)), foreignBefore, 'the same ID in another account remains untouched');
      assert.equal(state.writes.length, 1); assert.equal(state.writes[0].owner, owner);
      assert.equal(state.proposals.get(card.id)?.status, 'applied');
      await assert.rejects(confirmProposal(state.db, owner, card.id), rejects('ai_proposal_gone'));
      assert.equal(state.writes.length, 1); assert.equal(state.attempts.length, 1);
      assert.equal(fake.bodies.length, 3, 'confirm, foreign attempts and replay do not call a model');
      assert.equal(state.usage.length, 1, 'confirmation does not charge a second request');
    });
  } finally { globalThis.fetch = realFetch; }
});

test('a concurrent edit makes the combined proposal stale without applying either financial change', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network disabled for compound-action tests'); };
  try {
    const state = fixture(); const foreignBefore = copy(state.accounts.get(B)!);
    const { card, fake } = await prepare(state, A);
    state.accounts.get(A)!.jobs![0].note = 'Owner changed this in the job editor';
    state.versions.set(A, 8);
    const concurrentRecord = copy(state.accounts.get(A)!);
    await assert.rejects(confirmProposal(state.db, A, card.id), rejects('ai_proposal_stale'));
    assert.deepEqual(state.accounts.get(A), concurrentRecord);
    assert.deepEqual(state.accounts.get(B), foreignBefore);
    assert.equal(state.writes.length, 0); assert.equal(state.attempts.length, 1);
    assert.equal(state.proposals.get(card.id)?.status, 'stale');
    await assert.rejects(confirmProposal(state.db, A, card.id), rejects('ai_proposal_gone'));
    assert.equal(state.attempts.length, 1); assert.equal(fake.bodies.length, 3);
  } finally { globalThis.fetch = realFetch; }
});
