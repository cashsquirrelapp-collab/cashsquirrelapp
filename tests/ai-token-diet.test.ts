import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, pastWorkContext, runAssistant } from '../backend/src/ai/gateway';
import { buildSystemPrompt, type PromptSlots } from '../backend/src/ai/prompt';
import { decideRoute } from '../backend/src/ai/routingPolicy';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-28: tokens went down too fast (a hello 4–5, a saved job 10–20). Each message now sends only what it
// needs, and "ความฉลาดยังจะคงไว้": every rule the owner taught stays where it is used.

const slots: PromptSlots = { route: 'chat', plan: 'pro', nowLocal: '28 ต.ค. 2569 10:00', knowledge: 'K', accountContext: '{}' };

test('the skills the owner taught are in both routes: delete all, save at once, card again, many items, memory, the chat thread', () => {
  for (const route of ['chat', 'action'] as const) {
    const prompt = buildSystemPrompt({ ...slots, route });
    for (const rule of ['DELETING JOBS (owner, 2026-10-28)', 'propose_delete_all_jobs', 'No password is needed', 'SAVING AT ONCE (owner, 2026-10-28)',
      '"บันทึกทั้ง 5 โปรเจกต์"', 'CARD AGAIN (owner, 2026-10-28)', 'MANY ITEMS (owner, 2026-10-28', 'propose_record_payments',
      'Never ask again for what this chat already has', 'ACCOUNT NAME below is the name on this user\'s account', 'COMMUNICATION PROFILE and MEMORY',
      'Keep the thread: a follow-up', 'MEMORY lines that start with กฎจากการแก้']) {
      assert.ok(prompt.includes(rule), `${route}: ${rule}`);
    }
  }
});

test('the rules for preparing changes go with the action route; the file rules with a file or money received', () => {
  const chat = buildSystemPrompt(slots);
  const action = buildSystemPrompt({ ...slots, route: 'action' });
  const withFile = buildSystemPrompt({ ...slots, route: 'action', files: true });
  for (const rule of ['Adding a job: the job form needs', 'Paid in installments', 'When the client pays', 'call past_work for that client', 'CLOSING LINE']) {
    assert.ok(action.includes(rule), rule);
    assert.ok(!chat.includes(rule), rule);
  }
  // Quotations and invoices go with a document in the chat.
  assert.ok(!action.includes('Quotations and invoices: use propose_add_document'));
  assert.ok(buildSystemPrompt({ ...slots, route: 'action', documents: true }).includes('Quotations and invoices: use propose_add_document'));
  assert.ok(!action.includes('TRANSFER SLIPS') && withFile.includes('TRANSFER SLIPS') && withFile.includes('Money in, thought through'));
  assert.ok(chat.length < 0.8 * buildSystemPrompt({ ...slots, route: 'action', files: true }).length);
  // The shared rules still come first and are the same for both routes (the providers cache them).
  assert.equal(chat.slice(0, chat.indexOf('MODE: conversation')), action.slice(0, action.indexOf('MODE: action')));
});

test('a question about an amount is a question; a stated amount is still recorded', () => {
  for (const text of ['เดือนนี้ได้เงินเท่าไหร่แล้ว', 'ปีนี้ได้รับเงินไปกี่บาท', 'ลูกค้าโอนมาเท่าไหร่', 'how much did I get paid this month']) {
    const decision = decideRoute({ text });
    assert.equal(decision.tools, 'chat', text);
    assert.equal(decision.intent, 'read', text);
  }
  for (const text of ['ได้เงินจากร้านกาแฟแล้ว 5,000 บาท', 'ลูกค้าโอนมาแล้ว', 'รับเงินงานโลโก้แล้ว']) assert.equal(decideRoute({ text }).tools, 'action', text);
});

const user = (): UserRow => ({
  user_id: '33333333-3333-4333-8333-333333333333', statuses: [], goals: [], expenses: [], settings: {},
  jobs: [
    { id: 'j1', name: 'ตัดต่อคลิป', client: 'ร้านกาแฟตัวอย่าง', value: 3000, received: 0, pending: 3000, status: 'pending', creditTerm: 30, whtRate: 3, isPosted: true, postDate: '2026-10-01', payDate: '2026-10-31' },
    { id: 'j2', name: 'โลโก้', client: 'บริษัท ตัวอย่าง จำกัด', value: 9000, received: 9000, pending: 0, status: 'done', creditTerm: 0, isPosted: true, postDate: '2026-09-01', payDate: '2026-09-01' },
  ],
} as never);

test('past work is looked up for a saved client the chat names, the most specific name only', () => {
  const found = JSON.parse(pastWorkContext(user(), ['บันทึกงานตัดคลิปให้ร้านกาแฟตัวอย่าง 3,000'])!);
  assert.equal(found.length, 1);
  assert.equal(found[0].found, true);
  assert.deepEqual(found[0].names_in_records, ['ร้านกาแฟตัวอย่าง']);
  assert.equal(found[0].usual.credit_term_days, 30);
  assert.equal(pastWorkContext(user(), ['บันทึกงานให้ลูกค้าใหม่ 2,000']), undefined);
});

type Reply = { json: unknown };
const gText = (text: string): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } } });
const gCall = (name: string, args: Record<string, unknown>): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args, id: `c-${name}` }, thoughtSignature: 's' }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } } });
function fake(replies: Reply[]) {
  const sent: { system: string; tools: string[] }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ system: body.systemInstruction.parts.map((part: { text: string }) => part.text).join(''), tools: (body.tools?.[0]?.functionDeclarations ?? []).map((tool: { name: string }) => tool.name) });
    const next = replies.shift();
    if (!next) throw new Error('no more fake replies');
    return new Response(JSON.stringify(next.json), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}
const config = aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'test-gemini' });
const ask = async (text: string, replies: Reply[], history: { role: 'user' | 'assistant'; text: string }[] = []) => {
  const { sent, fetchImpl } = fake(replies);
  const reply = await runAssistant({ user: user(), plan: 'pro', text, history }, { config, ...memoryStores(), now: new Date('2026-10-28T03:00:00Z'), fetchImpl });
  return { sent, reply };
};

test('small talk gets the short tool set; a question about the records, or the message after one, gets every tool', async () => {
  const hello = await ask('สวัสดีครับ วันนี้อากาศดีจัง', [gText('สวัสดีครับ')]);
  assert.ok(hello.sent[0].tools.length <= 11, String(hello.sent[0].tools.length));
  assert.ok(hello.sent[0].tools.includes('route_to_action') && hello.sent[0].tools.includes('remember'));
  assert.match(hello.sent[0].system, /TOOLS THIS TURN: a short set/);
  const money = await ask('เดือนนี้ได้เงินเท่าไหร่แล้ว', [gText('ได้ ฿9,000 ครับ')]);
  assert.ok(money.sent[0].tools.includes('search_documents') && money.sent[0].tools.length >= 20);
  const followUp = await ask('แล้วอันไหนเยอะสุด', [gText('งานโลโก้ครับ')], [{ role: 'user', text: 'เดือนนี้ได้เงินเท่าไหร่แล้ว' }, { role: 'assistant', text: 'ได้ ฿9,000 ครับ' }]);
  assert.ok(followUp.sent[0].tools.length >= 20);
  assert.doesNotMatch(followUp.sent[0].system, /TOOLS THIS TURN/);
});

test('a job for a saved client is prepared in the first round with past work already in the prompt, without the slip rules', async () => {
  const job = { name: 'ตัดต่อคลิป', value: 3000, client: 'ร้านกาแฟตัวอย่าง', delivered: false, payment_status: 'unpaid', credit_term_days: 30, wht_rate: 3 };
  const say = 'เตรียมการ์ดงานตัดต่อคลิปให้แล้วครับ ใส่ให้ว่า: ยังไม่รับเงิน · หัก 3% ตามงานเดิม · เครดิต 30 วัน';
  const { sent, reply } = await ask('บันทึกงานตัดต่อคลิปให้ร้านกาแฟตัวอย่าง 3,000 บาท', [gCall('propose_add_job', { ...job, say })]);
  assert.equal(sent.length, 1, 'one round: no extra round for past_work, none only to write the closing line');
  assert.equal(reply.text, say, 'the closing line the model wrote with the card');
  assert.match(sent[0].system, /PAST WORK \(past_work already looked up/);
  assert.match(sent[0].system, /"names_in_records":\["ร้านกาแฟตัวอย่าง"\]/);
  assert.match(sent[0].system, /unless PAST WORK below already has that\n  client/);
  assert.doesNotMatch(sent[0].system, /TRANSFER SLIPS/);
  assert.ok(reply.cards.some(card => card.kind === 'confirm'));
  const paid = await ask('ร้านกาแฟตัวอย่างโอนมาแล้ว 2,910 บาท', [gText('ตรวจแล้วครับ')]);
  assert.match(paid.sent[0].system, /TRANSFER SLIPS/, 'money received keeps the withholding reasoning');
});

test('a step of cards only ends the turn; a card that is not ready, or a read in the same step, goes on as before', async () => {
  const missing = await ask('บันทึกงานให้หน่อย', [gCall('propose_add_job', { name: 'งาน' }), gText('ขอยอดเงินของงานนี้ด้วยครับ')]);
  assert.equal(missing.sent.length, 2, 'the tool answered missing: the model asks next');
  assert.equal(missing.reply.text, 'ขอยอดเงินของงานนี้ด้วยครับ');
  const standard = await ask('add a logo job for 5,000', [gCall('propose_add_job', { name: 'Logo', value: 5000, client: 'ไม่ระบุ', delivered: false, payment_status: 'unpaid', credit_term_days: 0, wht_rate: 0 })]);
  assert.equal(standard.sent.length, 1);
  assert.match(standard.reply.text, /Nothing is saved yet/, 'an English message gets the English line');
  // The say field never reaches the tool or the saved proposal.
  const stores = memoryStores();
  const { fetchImpl } = fake([gCall('propose_add_job', { name: 'โลโก้', value: 5000, client: 'ไม่ระบุ', delivered: false, payment_status: 'unpaid', credit_term_days: 0, wht_rate: 0, say: 'พร้อมแล้วครับ' })]);
  await runAssistant({ user: user(), plan: 'pro', text: 'เพิ่มงานโลโก้ 5,000' }, { config, ...stores, now: new Date('2026-10-28T03:00:00Z'), fetchImpl });
  assert.doesNotMatch(JSON.stringify([...stores.saved.values()]), /พร้อมแล้วครับ/);
});

test('document tools go with a document in the chat; a job alone does not carry them', async () => {
  const job = await ask('เพิ่มงานโลโก้ 5,000', [gText('ขอชื่อลูกค้าด้วยครับ')]);
  assert.ok(!job.sent[0].tools.includes('propose_add_document') && job.sent[0].tools.includes('propose_add_job'));
  assert.doesNotMatch(job.sent[0].system, /Quotations and invoices: use propose_add_document/);
  const quote = await ask('ออกใบเสนอราคาให้ร้านกาแฟตัวอย่าง', [gText('ขอรายการงานด้วยครับ')]);
  assert.ok(quote.sent[0].tools.includes('propose_add_document') && quote.sent[0].tools.includes('propose_update_issuer'));
  assert.match(quote.sent[0].system, /Quotations and invoices: use propose_add_document/);
  // A follow-up in a document chat that goes to the action tools keeps them.
  const later = await ask('เพิ่มอีกรายการ 3 ชิ้น ชิ้นละ 500', [gText('รับทราบครับ')], [{ role: 'user', text: 'ออกใบเสนอราคาให้ร้านกาแฟตัวอย่าง' }, { role: 'assistant', text: 'ขอรายการงานด้วยครับ' }]);
  assert.ok(later.sent[0].tools.includes('propose_add_document'));
});
