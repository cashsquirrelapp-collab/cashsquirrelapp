import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { quickAnswer, quickKind } from '../backend/src/ai/quickAnswers';
import { handleMessage, type AssistantDb } from '../backend/src/ai/service';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-27: "กำลังดำเนินการ" asks which jobs are in progress, and if there are none, says so. The window's
// buttons (and the same words typed in the app) are answered from the account's jobs, without a model and for no tokens.

const USER = '55555555-5555-4555-8555-555555555555';
const day = (offset: number) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const job = (over: Record<string, unknown>) => ({ id: 'j', name: 'งาน', client: '', type: 'ออกแบบ', note: '', value: 1000, received: 0, pending: 1000, status: 'pending', creditTerm: 0, postDate: day(-5), payDate: day(4), isPosted: true, ...over });
const account = (jobs: unknown[]): UserRow => ({ user_id: USER, statuses: [], goals: [], expenses: [], settings: {}, jobs } as unknown as UserRow);

test('the quick questions: the bare words, the window buttons\' questions and English; never other sentences', () => {
  for (const text of ['กำลังดำเนินการ', 'กำลังดำเนินงาน', 'กำลังทำ', 'งานที่กำลังทำ', 'มีงานไหนที่กำลังดำเนินการอยู่บ้าง', 'งานที่กำลังดำเนินการมีอะไรบ้าง', 'มีงานอะไรกำลังทำอยู่บ้างครับ', ' กำลังดำเนินการ? ', 'Which jobs are in progress?']) {
    assert.equal(quickKind(text), 'wip', text);
  }
  for (const text of ['รอรับเงิน', 'มีงานไหนที่ยังรอรับเงินอยู่บ้าง', 'งานที่ยังไม่ได้รับเงินมีอะไรบ้าง', 'Which jobs are still waiting for payment?']) {
    assert.equal(quickKind(text), 'unpaid', text);
  }
  for (const text of ['กำลังทำใบเสนอราคาให้ลูกค้า', 'เพิ่มงานกำลังทำ ค่าจ้าง 5,000', 'กำลังทำอะไรอยู่', 'ตรวจงานที่ยังไม่ได้รับเงิน', 'สรุปเดือนนี้', 'สวัสดี']) {
    assert.equal(quickKind(text), null, text);
  }
});

test('"กำลังทำ" right after เลขา asked about a job\'s stage is an answer for เลขา, not the quick question', () => {
  const asked = [{ role: 'assistant' as const, text: 'งานนี้ส่งงานแล้วหรือยังกำลังทำอยู่ครับ' }];
  assert.equal(quickKind('กำลังทำ', asked), null);
  // An ordinary "anything else?" does not count as such a question.
  assert.equal(quickKind('กำลังดำเนินการ', [{ role: 'assistant', text: 'มีอะไรให้ผมช่วยต่อไหมครับ บอกได้เลยนะ!' }]), 'wip');
});

test('the answers: none says so plainly; otherwise every job with its client and amount, and where to see them all', () => {
  assert.equal(quickAnswer('wip', account([job({ isPosted: true })])), 'ตอนนี้ยังไม่มีงานที่กำลังดำเนินการครับ');
  assert.equal(quickAnswer('unpaid', account([job({ pending: 0, received: 1000, status: 'done' })])), 'ตอนนี้ไม่มีงานที่รอรับเงินครับ');
  const wip = quickAnswer('wip', account([job({ id: 'a', name: 'ตัดต่อคลิป', client: 'ปล่อยจอย', value: 4500, isPosted: false }), job({ id: 'b', name: 'ถ่ายภาพ', value: 2000, isPosted: false })]));
  assert.match(wip, /^ตอนนี้มีงานที่กำลังดำเนินการ \*\*2 งาน\*\* มูลค่ารวม \*\*฿6,500\*\* ครับ/);
  assert.match(wip, /1\. \*\*ตัดต่อคลิป\*\* · ปล่อยจอย — ฿4,500/);
  assert.match(wip, /2\. \*\*ถ่ายภาพ\*\* — ฿2,000/);
  assert.match(wip, /\[หน้างาน\]\(\/jobs\)/);
  const unpaid = quickAnswer('unpaid', account([job({ name: 'แม่', client: 'เงินที่บ้าน', pending: 1000 })]));
  assert.match(unpaid, /^ตอนนี้มีงานที่รอรับเงิน \*\*1 งาน\*\* รวม \*\*฿1,000\*\* ครับ/);
  assert.match(unpaid, /1\. \*\*แม่\*\* · เงินที่บ้าน — ฿1,000 · กำหนดรับ/);
  const many = quickAnswer('wip', account(Array.from({ length: 12 }, (_, i) => job({ id: `w${i}`, name: `งาน ${i + 1}`, isPosted: false }))));
  assert.match(many, /10\. \*\*งาน 10\*\*/);
  assert.doesNotMatch(many, /11\. /);
  assert.match(many, /และอีก 2 งาน/);
});

function fakeDb(jobs: unknown[]) {
  const usage: { requestId: string; tokens: number; status: string }[] = [];
  const db = {
    async loadAccount() { return { user: account(jobs), versions: {} }; },
    async reserve(input: { requestId: string; tokens: number }) { usage.push({ requestId: input.requestId, tokens: input.tokens, status: 'reserved' }); return { ok: true, usedTokens: input.tokens, usedRequests: 1 }; },
    async settle(input: { requestId: string; tokens: number; release: boolean }) {
      const row = usage.find(item => item.requestId === input.requestId);
      if (row) Object.assign(row, { tokens: input.release ? 0 : input.tokens, status: input.release ? 'released' : 'settled' });
    },
    async usage() { return { tokens: 0, requests: 0 }; },
    async saveProposal() {}, async claimProposal() { return null; }, async finishProposal() {}, async cancelProposal() { return false; },
    async applyChanges() { return true; }, async memories() { return []; }, async remember() {},
  } as unknown as AssistantDb;
  return { db, usage };
}
const config = aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'test-gemini', AI_PRO_TOKENS_PER_CYCLE: '1000' });
const noModel = (async () => { throw new Error('the model must not be called'); }) as unknown as typeof fetch;

test('in the app: the window\'s "กำลังดำเนินการ" is answered from the jobs, with no model call and no tokens', async () => {
  const none = fakeDb([job({ isPosted: true })]);
  const empty = await handleMessage(none.db, { config, fetchImpl: noModel }, USER, 'pro', { text: 'มีงานไหนที่กำลังดำเนินการอยู่บ้าง' });
  assert.equal(empty.text, 'ตอนนี้ยังไม่มีงานที่กำลังดำเนินการครับ');
  assert.equal(empty.tokens, 0);
  assert.equal(empty.tokensLeft, 1000);
  assert.equal(none.usage[0].status, 'settled');

  const some = fakeDb([job({ name: 'ตัดต่อคลิป', client: 'ปล่อยจอย', value: 4500, isPosted: false })]);
  const listed = await handleMessage(some.db, { config, fetchImpl: noModel }, USER, 'admin', { text: 'กำลังดำเนินการ' });
  assert.match(listed.text, /ตัดต่อคลิป/);
  assert.equal(listed.tokens, 0);
});

test('LINE and a question with a file still go to the model (LINE has its own quick replies)', async () => {
  const fake = fakeDb([]);
  await assert.rejects(handleMessage(fake.db, { config, fetchImpl: noModel }, USER, 'pro', { text: 'กำลังดำเนินการ', channel: 'line' }));
  await assert.rejects(handleMessage(fake.db, { config, fetchImpl: noModel }, USER, 'pro', { text: 'กำลังดำเนินการ', attachment: { name: 'a.jpg', mimeType: 'image/jpeg', data: '/9j/' } }));
});
