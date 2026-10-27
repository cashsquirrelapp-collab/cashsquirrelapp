import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { asksToSave, autoSaveCards, autoSaveText, wantsSaveNow } from '../backend/src/ai/autoSave';
import { ALL_JOBS, bulkDeleteChanges, isDeleteAll, proposalBaseVersion, proposalChanges } from '../backend/src/ai/proposals';
import { confirmProposal, handleMessage, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';
import { createToolbox } from '../backend/src/ai/tools';
import { HttpError } from '../backend/src/http/guard';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-28: (1) "บันทึกให้หน่อย" saves what is being recorded at once (new jobs, money received, expenses), so
// many items need no tap each; (2) deleting one job confirms its card once, deleting EVERY job is one card and one
// go-ahead, no password ("ไม่จำเป็นต้องใส่รหัสแล้ว แค่อนุญาตในแชท"); (3) many payments are prepared in one call and a
// typed "ยืนยัน" applies every waiting card; (4) a saved card opens its job. Fake models and an in-memory database.

const A = '77777777-7777-4777-8777-777777777777';
const now = Date.parse('2026-10-28T03:00:00Z');

// ---------- when the user's words ask to save now ----------
test('save now: the user\'s own words, not เลขา\'s, and never when they ask to hold', () => {
  for (const said of ['บันทึกให้หน่อย', 'บันทึกเลย', 'บันทึกทั้ง 5 โปรเจกต์เลย', 'บันทึกทั้งหมดเลยครับ', 'กูบอกว่าบันทึกทั้งหมด', 'เซฟให้ด้วย', 'ลงให้เลย', 'เพิ่มงานให้หน่อย',
    'ไม่ต้องรอยืนยัน บันทึกได้เลย', 'งาน A 5,000 งาน B 3,000 บันทึกให้เลยนะ', 'save it now']) assert.equal(asksToSave(said), true, said);
  for (const said of ['เพิ่มงานตัดคลิป 2,000 ลูกค้าตัวอย่าง', 'ยังไม่ต้องบันทึก ขอดูก่อน', 'อย่าเพิ่งบันทึกนะ', 'เตรียมไว้ก่อน ขอตรวจก่อน', 'บันทึกว่าอะไร',
    'ไม่บันทึกครับ', 'งานนี้ราคาเท่าไหร่', "don't save yet"]) assert.equal(asksToSave(said), false, said);
});

test('save now: an answer to เลขา\'s question right after "บันทึกให้หน่อย" still saves; an older ask does not', () => {
  const asked = [{ role: 'user' as const, text: 'บันทึกงานออกแบบโลโก้ 8,000 ให้หน่อย' }, { role: 'assistant' as const, text: 'ลูกค้าชื่ออะไรครับ?' }];
  assert.equal(wantsSaveNow('บริษัท เอ จำกัด', asked), true);
  assert.equal(wantsSaveNow('บริษัท เอ จำกัด แต่ยังไม่ต้องบันทึกนะ', asked), false, 'a hold in this message wins');
  assert.equal(wantsSaveNow('บริษัท เอ จำกัด', [asked[0], { role: 'assistant', text: 'เตรียมการ์ดไว้แล้วครับ' }]), false, 'เลขา asked nothing');
  assert.equal(wantsSaveNow('บริษัท เอ จำกัด', [{ role: 'user', text: 'สวัสดี' }, { role: 'assistant', text: 'ลูกค้าชื่ออะไรครับ?' }]), false);
  assert.equal(wantsSaveNow('บริษัท เอ จำกัด'), false);
});

test('save now: what is being recorded (new jobs, money received, expenses); edits, documents and deletes wait', () => {
  const card = (id: string) => ({ kind: 'confirm' as const, id, title: id, changes: [] });
  const kinds = new Map<string, any>([['p_add1', 'add_job'], ['p_pay', 'record_payment'], ['p_exp', 'add_expense'], ['p_doc', 'add_document'], ['p_edit', 'edit_job'], ['p_all', 'delete_job']]);
  const { save, others } = autoSaveCards([card('p_add1'), card('p_doc'), card('p_pay'), card('p_edit'), card('p_exp'), card('p_all'), { kind: 'navigation', label: 'x', path: '/jobs', autoOpen: false } as any], kinds);
  assert.deepEqual(save.map(item => item.id), ['p_add1', 'p_pay', 'p_exp']);
  assert.equal(others, 3);
  assert.equal(autoSaveText({ saved: 5, failed: 0, waiting: 0 }), 'บันทึกให้แล้ว 5 รายการครับ กดปุ่มบนการ์ดเพื่อเปิดดูหรือแก้ไขรายละเอียดได้เลย');
  assert.match(autoSaveText({ saved: 4, failed: 1, waiting: 2 }), /อีก 1 รายการยังบันทึกไม่ได้.*รายการอื่นยังรอให้กดยืนยัน/);
});

// ---------- the delete-all proposal ----------
test('delete all: one card counts the jobs; each delete uses the version the account has now; later jobs are not in it', () => {
  // Stored as a delete_job proposal for ALL_JOBS with a marker (the database's list of proposal kinds is unchanged).
  const proposal = { kind: 'delete_job' as const, jobId: ALL_JOBS, record: { allJobs: true, ids: ['j1', 'j2', 'j3'] } };
  assert.equal(isDeleteAll(proposal), true);
  assert.equal(isDeleteAll({ kind: 'delete_job', jobId: 'j1', record: null }), false, 'one job: its own card');
  assert.equal(isDeleteAll({ kind: 'delete_job', jobId: ALL_JOBS, record: null }), false, 'the id alone is not enough');
  assert.equal(isDeleteAll({ kind: 'delete_job', jobId: 'j1', record: { allJobs: true, ids: ['j1'] } }), false, 'the marker alone is not enough');
  assert.equal(isDeleteAll({ kind: 'delete_expense', jobId: ALL_JOBS, record: { allJobs: true, ids: ['e1'] } }), false, 'jobs only');
  assert.equal(proposalBaseVersion({ ...proposal, id: 'p_x', userId: A, title: '', changes: [], createdAt: 0 }, {}), null);
  assert.throws(() => proposalChanges(proposal, null), /delete-all/);
  const changes = bulkDeleteChanges(proposal, { j1: 4, j3: 9, j9: 2 });
  assert.deepEqual(changes, [{ table: 'cashflow_jobs', id: 'j1', op: 'delete', version: 4 }, { table: 'cashflow_jobs', id: 'j3', op: 'delete', version: 9 }],
    'j2 was already gone; j9 was added after the card and stays');
  assert.throws(() => bulkDeleteChanges({ kind: 'delete_job', jobId: 'j1', record: { ids: ['j1'] } }, { j1: 1 }), /Not a delete-all/);
  assert.throws(() => bulkDeleteChanges({ ...proposal, record: { allJobs: true, ids: [] } }, {}), /Invalid/);
});

const user = (jobs: Array<{ id: string; value: number }>): UserRow => ({ user_id: A, statuses: [], goals: [], expenses: [], settings: {},
  jobs: jobs.map(job => ({ ...job, name: `งาน ${job.id}`, client: 'ลูกค้า', received: 0, pending: job.value, status: 'pending', creditTerm: 0, postDate: '2026-10-01', payDate: '2026-10-30', isPosted: true })) as any } as UserRow);
const memory = { remember: async () => undefined };

test('delete all tool: one card for every job, no password; never an empty account', async () => {
  const saved: any[] = [];
  const call = { id: 'c1', name: 'propose_delete_all_jobs', args: {} };
  const empty = await createToolbox({ user: user([]), proposals: { save: async () => undefined }, memory, channel: 'app' } as any)(call);
  assert.match((empty.result as any).error, /ยังไม่มีงาน/);
  for (const channel of ['app', 'line'] as const) {
    const ok = await createToolbox({ user: user([{ id: 'j1', value: 1000 }, { id: 'j2', value: 2500.5 }]), proposals: { save: async (p: unknown) => { saved.push(p); } }, memory, channel } as any)(call);
    assert.equal(ok.card?.kind, 'confirm');
    assert.equal((ok.card as any).secure, undefined, 'no password box');
    assert.equal((ok.card as any).title, 'ลบงานทั้งหมด 2 งาน');
    assert.deepEqual((ok.card as any).changes.map((row: { label: string }) => row.label), ['จำนวนงาน', 'มูลค่ารวม', 'ผลกระทบ']);
    assert.deepEqual((ok.card as any).changes.slice(0, 2), [{ label: 'จำนวนงาน', value: '2 งาน' }, { label: 'มูลค่ารวม', value: '฿3,500.5' }]);
  }
  assert.equal(saved[0].kind, 'delete_job');
  assert.equal(saved[0].jobId, ALL_JOBS);
  assert.deepEqual(saved[0].record, { allJobs: true, ids: ['j1', 'j2'] });
});

test('many payments: one call, one standard payment card per job; paid jobs are listed, never guessed', async () => {
  const saved: any[] = [];
  const account = user([{ id: 'j1', value: 1000 }, { id: 'j2', value: 2000 }, { id: 'j3', value: 3000 }]);
  (account.jobs as any[])[2] = { ...(account.jobs as any[])[2], received: 3000, pending: 0, status: 'paid', paymentStatus: 'paid' };
  const box = createToolbox({ user: account, proposals: { save: async (p: unknown) => { saved.push(p); } }, memory, channel: 'app' } as any);
  const listed = await box({ id: 'c2', name: 'propose_record_payments', args: { job_ids: ['j1', 'j3', 'j1', 'nope'], date: '2026-10-27' } });
  assert.equal((listed.result as any).ok, true);
  assert.equal((listed.result as any).prepared, 1, 'j1 once; j3 is already paid; nope does not exist');
  assert.deepEqual((listed.result as any).skipped.map((row: { job: string }) => row.job), ['งาน j3', 'nope']);
  assert.equal(listed.extraCards?.length, 1);
  assert.equal(saved.at(-1).kind, 'record_payment');
  assert.equal(saved.at(-1).tool, 'propose_record_payment', 'each card is the single-payment card, editable as usual');
  assert.deepEqual(saved.at(-1).args, { job_id: 'j1', mode: 'full', date: '2026-10-27' });
  saved.length = 0;
  const all = await box({ id: 'c3', name: 'propose_record_payments', args: { all_unpaid: true } });
  assert.equal((all.result as any).prepared, 2);
  assert.deepEqual(saved.map(row => row.jobId), ['j1', 'j2']);
  const none = await box({ id: 'c4', name: 'propose_record_payments', args: {} });
  assert.match((none.result as any).error, /ต้องระบุงาน/);
});

/** An in-memory database: proposals, account versions and every save that was asked for. */
function memoryDb(jobs: Array<{ id: string; value: number }>, versions: Record<string, number>) {
  const proposals = new Map<string, StoredProposal & { status: string }>();
  const writes: unknown[][] = [];
  let conflicts = 0;
  const db: AssistantDb & { conflictNext(): void } = {
    conflictNext() { conflicts += 1; },
    async loadAccount() { return { user: user(jobs), versions: { ...versions } }; },
    async reserve(input) { return { ok: true, usedTokens: input.tokens, usedRequests: 1 }; },
    async settle() {},
    async usage() { return { tokens: 0, requests: 0 }; },
    async saveProposal(proposal) { proposals.set(proposal.id, { ...proposal, status: 'pending' }); },
    async claimProposal(userId, id) { const row = proposals.get(id); if (!row || row.userId !== userId || row.status !== 'pending') return null; row.status = 'applying'; return { ...row }; },
    async finishProposal(_, id, status) { const row = proposals.get(id); if (row) row.status = status; },
    async cancelProposal() { return false; },
    async applyChanges(_, changes) { writes.push(changes as unknown[]); if (conflicts > 0) { conflicts -= 1; return false; } return true; },
    async memories() { return []; },
    async remember() {},
  };
  return { db, proposals, writes };
}
const bulk = (state: ReturnType<typeof memoryDb>) => {
  const proposal: StoredProposal = { id: 'p_00000000-0000-4000-8000-000000000001', userId: A, kind: 'delete_job', jobId: ALL_JOBS, record: { allJobs: true, ids: ['j1', 'j2'] },
    title: 'ลบงานทั้งหมด 2 งาน', changes: [], createdAt: now, baseVersion: null };
  state.proposals.set(proposal.id, { ...proposal, status: 'pending' });
  return proposal.id;
};
const refusedWith = (status: number, code: string) => (error: unknown) => error instanceof HttpError && error.status === status && error.code === code;

test('delete all confirm: one go-ahead deletes every counted job in one save; one edit in between is retried', async () => {
  const state = memoryDb([{ id: 'j1', value: 1 }, { id: 'j2', value: 2 }], { j1: 3, j2: 5 });
  const id = bulk(state);
  state.db.conflictNext();
  const done = await confirmProposal(state.db, A, id);
  assert.deepEqual(done, { status: 'applied', kind: 'delete_job', allJobs: true, count: 2, path: '/jobs' });
  assert.equal(state.writes.length, 2, 'the first save met an edit and was tried once more');
  assert.deepEqual(state.writes[1], [{ table: 'cashflow_jobs', id: 'j1', op: 'delete', version: 3 }, { table: 'cashflow_jobs', id: 'j2', op: 'delete', version: 5 }]);
  assert.equal(state.proposals.get(id)!.status, 'applied');
  await assert.rejects(confirmProposal(state.db, A, id), refusedWith(409, 'ai_proposal_gone'), 'one card deletes once');
});

test('delete all confirm: two edits in a row leave the card open to try again', async () => {
  const state = memoryDb([{ id: 'j1', value: 1 }], { j1: 3 });
  const id = bulk(state);
  state.db.conflictNext(); state.db.conflictNext();
  await assert.rejects(confirmProposal(state.db, A, id, { channel: 'line' }), refusedWith(409, 'ai_proposal_stale'));
  assert.equal(state.proposals.get(id)!.status, 'pending');
});

// ---------- end to end: "บันทึกให้หน่อย" with fake models ----------
type Reply = { json: unknown };
const usage = { promptTokenCount: 50, candidatesTokenCount: 5 };
const gCalls = (...calls: Array<[string, Record<string, unknown>]>): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: calls.map(([name, args], index) => ({ functionCall: { name, args, id: `c-${index}` }, thoughtSignature: 's' })) } }], usageMetadata: usage } });
const gText = (text: string): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: usage } });
const cText = (text: string): Reply => ({ json: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 60, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
const cCalls = (...calls: Array<[string, Record<string, unknown>]>): Reply => ({ json: { id: 'msg_0', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
  content: calls.map(([name, input], index) => ({ type: 'tool_use', id: `toolu_${index}`, name, input })), stop_reason: 'tool_use', stop_sequence: null,
  usage: { input_tokens: 60, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
function fakeModels(steps: Array<Array<[string, Record<string, unknown>]> | string>) {
  const gemini = steps.map(step => (typeof step === 'string' ? gText(step) : gCalls(...step)));
  const claude = steps.map(step => (typeof step === 'string' ? cText(step) : cCalls(...step)));
  return (async (input: RequestInfo | URL) => {
    const next = (String(input).includes('anthropic') ? claude : gemini).shift();
    if (!next) throw new Error('no more fake replies');
    return new Response(JSON.stringify(next.json), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}
const config = () => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' });
const job = (name: string, value: number) => ['propose_add_job', { name, value, client: 'ลูกค้าตัวอย่าง', delivered: false, payment_status: 'unpaid', credit_term_days: 15, wht_rate: 0 }] as [string, Record<string, unknown>];

test('save now, end to end: "บันทึกให้หน่อย" saves every new job at once, each card opens its job; otherwise cards wait', async () => {
  const state = memoryDb([], {});
  const said = 'บันทึกให้หน่อย งานตัดคลิป 2,000 งานออกแบบปก 3,500 งานถ่ายรูป 5,000 ลูกค้าตัวอย่าง';
  const reply = await handleMessage(state.db, { config: config(), fetchImpl: fakeModels([[job('ตัดคลิป', 2000), job('ออกแบบปก', 3500), job('ถ่ายรูป', 5000)], 'เตรียมการ์ดไว้ 3 ใบครับ กดยืนยันได้เลย']), now: new Date(now) },
    A, 'pro', { text: said, history: [] });
  const cards = reply.cards.filter(card => card.kind === 'confirm') as Array<{ id: string; status?: string; path?: string }>;
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(card => card.status), ['applied', 'applied', 'applied']);
  for (const card of cards) {
    const stored = state.proposals.get(card.id)!;
    assert.equal(stored.status, 'applied');
    assert.equal(card.path, `/jobs?job=${encodeURIComponent(stored.jobId)}`);
  }
  assert.equal(state.writes.length, 3, 'one save per job, through the same confirm as a tap');
  assert.equal(reply.text, 'บันทึกให้แล้ว 3 รายการครับ กดปุ่มบนการ์ดเพื่อเปิดดูหรือแก้ไขรายละเอียดได้เลย');

  // The same jobs without "บันทึกให้หน่อย": the cards wait for a tap, as before.
  const waiting = memoryDb([], {});
  const plain = await handleMessage(waiting.db, { config: config(), fetchImpl: fakeModels([[job('ตัดคลิป', 2000)], 'เตรียมการ์ดไว้แล้วครับ']), now: new Date(now) },
    A, 'pro', { text: 'เพิ่มงานตัดคลิป 2,000 ลูกค้าตัวอย่าง', history: [] });
  assert.equal((plain.cards[0] as { status?: string }).status, undefined);
  assert.equal(waiting.writes.length, 0);
  assert.equal(plain.text, 'เตรียมการ์ดไว้แล้วครับ');

  // LINE keeps its buttons.
  const line = memoryDb([], {});
  await handleMessage(line.db, { config: config(), fetchImpl: fakeModels([[job('ตัดคลิป', 2000)], 'เตรียมการ์ดไว้แล้วครับ']), now: new Date(now) },
    A, 'pro', { text: 'บันทึกให้หน่อย งานตัดคลิป 2,000 ลูกค้าตัวอย่าง', history: [], channel: 'line' });
  assert.equal(line.writes.length, 0);
});

test('a confirmed job opens its form; a deleted one opens the jobs page', async () => {
  const state = memoryDb([{ id: 'job-1', value: 1000 }], { 'job-1': 2 });
  const proposal = (kind: StoredProposal['kind'], id: string, record: Record<string, unknown> | null): string => {
    const key = `p_00000000-0000-4000-8000-00000000000${state.proposals.size + 2}`;
    state.proposals.set(key, { id: key, userId: A, kind, jobId: id, record, title: '', changes: [], createdAt: now, baseVersion: kind === 'add_job' ? null : 2, status: 'pending' });
    return key;
  };
  const record = { id: 'job-new', name: 'ตัดคลิป', client: 'ลูกค้า', value: 2000, received: 0, pending: 2000, status: 'pending', creditTerm: 0, postDate: '2026-10-28', payDate: '2026-10-28', isPosted: false, type: 'ยังไม่ระบุ', note: '' };
  const added = await confirmProposal(state.db, A, proposal('add_job', 'job-new', record));
  assert.equal(added.path, '/jobs?job=job-new');
  const deleted = await confirmProposal(state.db, A, proposal('delete_job', 'job-1', null));
  assert.equal(deleted.path, '/jobs');
});

test('a typed go-ahead in the app applies every card still waiting, with no model call; LINE shows them again', async () => {
  const state = memoryDb([{ id: 'job-1', value: 1000 }], { 'job-1': 2 });
  const noModel = (() => { throw new Error('must not call a model'); }) as unknown as typeof fetch;
  const waitingFor = (n: number) => {
    const id = `p_00000000-0000-4000-8000-0000000000${String(10 + n)}`;
    state.proposals.set(id, { id, userId: A, kind: 'add_job', jobId: `job-new-${n}`, title: 'เพิ่มงานใหม่ 1 งาน', changes: [], createdAt: now - 60_000, baseVersion: null, status: 'pending',
      record: { id: `job-new-${n}`, name: `งาน ${n}`, client: 'ลูกค้า', value: 1000 * n, received: 0, pending: 1000 * n, status: 'pending', creditTerm: 0, postDate: '2026-10-28', payDate: '2026-10-28', isPosted: false, type: 'ยังไม่ระบุ', note: '' } });
    return id;
  };
  (state.db as AssistantDb).pendingProposals = async () => [...state.proposals.values()].filter(row => row.status === 'pending');
  (state.db as AssistantDb).recentAppTurns = async () => ({ turns: [], lastAt: null });
  const ids = [waitingFor(1), waitingFor(2), waitingFor(3)];
  const line = await handleMessage(state.db, { config: config(), fetchImpl: noModel, now: new Date(now) }, A, 'pro', { text: 'ยืนยันทั้งหมด', history: [], channel: 'line' });
  assert.equal(line.cards.length, 3);
  assert.equal(state.writes.length, 0, 'LINE keeps its buttons');
  const app = await handleMessage(state.db, { config: config(), fetchImpl: noModel, now: new Date(now) }, A, 'pro', { text: 'ยืนยันทั้งหมดครับ', history: [] });
  assert.equal(app.text, 'ทำรายการให้แล้ว 3 รายการครับ');
  assert.deepEqual(app.cards.map(card => (card as { status?: string }).status), ['applied', 'applied', 'applied']);
  assert.deepEqual(ids.map(id => state.proposals.get(id)!.status), ['applied', 'applied', 'applied']);
  assert.equal(state.writes.length, 3);
  assert.equal(app.tokens, 0);
});
