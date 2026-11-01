import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefing, deliveredNotInvoiced } from '../shared/briefing';
import { clientStandings, collectionDraft, owedJobs } from '../backend/src/ai/collections';
import { memoryStores } from '../backend/src/ai/gateway';
import { lineAssistantReply } from '../backend/src/ai/lineFormat';
import { quickAnswer, quickKind } from '../backend/src/ai/quickAnswers';
import { createToolbox } from '../backend/src/ai/tools';
import { weekPlan, weekPlanText } from '../backend/src/ai/weekPlan';
import { buildDigestFlexMessage, buildInsightFlexMessage } from '../backend/src/services/lineReminders';
import { mergeTold, morningInsights } from '../backend/src/services/morningInsights';

// Owner, 2026-11-02: help getting paid, เลขา thinking ahead in the 08:00 message, and a plan for the week. All from the
// account's saved data with plain rules; no model, no network.

const NOW = new Date('2026-11-04T03:00:00Z'); // Wednesday 4 Nov 2569, 10:00 in Bangkok
const job = (id: string, extra: Record<string, unknown>) => ({ id, name: `งาน ${id}`, client: 'ร้านตัวอย่าง', type: 'Other', value: 10000, received: 0, pending: 10000,
  status: 'pending', creditTerm: 30, payDate: null, note: '', isPosted: true, ...extra });
const user = (jobs: unknown[], extra: Record<string, unknown> = {}) => ({ user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs, ...extra }) as any;

test('collections: what each client owes now, how much is late and for how long, latest first', () => {
  const u = user([
    job('a', { client: 'คุณเอ', pending: 5000, payDate: '2026-10-25', followUpCount: 2, lastFollowUpDate: '2026-11-01' }),
    job('b', { client: 'คุณเอ', pending: 3000, payDate: '2026-11-10' }),
    job('c', { client: 'ร้านบี', pending: 7500, payDate: '2026-11-04' }),
    job('d', { client: 'ร้านบี', pending: 0, status: 'done', payDate: '2026-10-01' }),
  ]);
  assert.deepEqual(owedJobs(u, NOW).map(row => [row.id, row.daysLate]), [['a', 10], ['b', -6], ['c', 0]]);
  const [first, second] = clientStandings(u, NOW);
  assert.deepEqual(first, { client: 'คุณเอ', owed: 8000, late: 5000, lateJobs: 1, maxDaysLate: 10, jobs: 2, followUps: 2, lastFollowUp: '2026-11-01' });
  assert.equal(second.client, 'ร้านบี');
  assert.equal(second.late, 0);
});

test('collection draft: courteous fixed wording by how late, exact saved figures, the user\'s bank details and name, their polite ending', () => {
  const profile = { issuer_profile: { name: 'สตูดิโอตัวอย่าง', bankName: 'กสิกรไทย', bankAccount: '123-4-56789-0', bankAccountName: 'สตูดิโอ ตัวอย่าง' } };
  const ahead = collectionDraft(user([job('a', { client: 'คุณเอ', pending: 5000, payDate: '2026-11-08' })], profile), { client: 'คุณเอ', particle: 'ค่ะ', now: NOW })!;
  assert.equal(ahead.tone, 'ahead');
  assert.match(ahead.text, /^สวัสดีค่ะ คุณเอ ขออนุญาตแจ้งเตือนล่วงหน้าเรื่องค่าบริการงาน "งาน a" ยอด 5,000 บาท ซึ่งจะครบกำหนดชำระวันที่ 8 พ.ย. 2569/);
  assert.match(ahead.text, /ช่องทางชำระ: กสิกรไทย 123-4-56789-0 ชื่อบัญชี สตูดิโอ ตัวอย่าง/);
  assert.match(ahead.text, /\nสตูดิโอตัวอย่าง$/);
  assert.doesNotMatch(ahead.text, /ครับ/);

  const late = collectionDraft(user([job('a', { client: 'คุณเอ', pending: 5000, payDate: '2026-10-30' })]), { client: 'เอ', now: NOW })!;
  assert.equal(late.tone, 'late');
  assert.match(late.text, /ซึ่งครบกำหนดชำระเมื่อวันที่ 30 ต.ค. 2569 \(เลยกำหนดมา 5 วัน\)/);
  assert.match(late.text, /รบกวนช่วยตรวจสอบให้ด้วยนะครับ/);
  assert.equal(late.bank, false);

  const long = collectionDraft(user([
    job('a', { client: 'ร้านบี', pending: 4000, payDate: '2026-10-01' }), job('b', { client: 'ร้านบี', pending: 2500.5, payDate: '2026-10-20' }),
    job('z', { client: 'คนอื่น', pending: 9000, payDate: '2026-10-02' }),
  ]), { client: 'ร้านบี', now: NOW })!;
  assert.equal(long.tone, 'long_late');
  assert.equal(long.total, 6500.5);
  assert.match(long.text, /ค่าบริการ 2 รายการ รวม 6,500.5 บาท ขณะนี้เลยกำหนดมา 34 วันแล้ว/);
  assert.match(long.text, /• งาน a 4,000 บาท \(ครบกำหนด 1 ต.ค. 2569\)/);
  assert.match(long.text, /ภายในวันที่ 7 พ.ย. 2569 ได้ไหมครับ/);
  assert.doesNotMatch(long.text, /คนอื่น|9,000/);

  // No client named: the client whose money is latest. Nothing owed: no draft.
  assert.equal(collectionDraft(user([job('a', { client: 'คุณเอ', payDate: '2026-11-01' }), job('b', { client: 'ร้านบี', payDate: '2026-10-01' })]), { now: NOW })!.client, 'ร้านบี');
  assert.equal(collectionDraft(user([job('a', { pending: 0, status: 'done' })]), { now: NOW }), null);
  assert.equal(collectionDraft(user([job('a', { client: 'คุณเอ', payDate: '2026-11-01' })]), { client: 'ไม่มีคนนี้', now: NOW }), null);
});

test('collection_draft tool: a copy card from the templates; the model sees the facts but never the bank account number', async () => {
  const u = user([job('a', { client: 'คุณเอ', pending: 5000, payDate: '2026-10-30' })], { issuer_profile: { name: 'สตูดิโอ', bankName: 'กสิกรไทย', bankAccount: '123-4-56789-0' } });
  const execute = createToolbox({ user: u, ...memoryStores(), now: NOW });
  const outcome = await execute({ id: '1', name: 'collection_draft', args: { client: 'คุณเอ', particle: 'ครับ' } });
  assert.equal(outcome.card?.kind, 'message_draft');
  const card = outcome.card as { kind: 'message_draft'; title: string; text: string; note: string };
  assert.equal(card.title, 'ข้อความทวงเงิน · คุณเอ');
  assert.match(card.text, /123-4-56789-0/);
  assert.equal(card.note, 'คัดลอกไปส่งลูกค้าเองได้เลย เลขาไม่ส่งแทน');
  const facts = JSON.stringify(outcome.result);
  assert.doesNotMatch(facts, /123-4-56789-0|56789/);
  assert.match(facts, /"bank_details_included":true/);
  assert.match(facts, /"days_late":5/);
  // In LINE the message goes by itself, so a long press copies or forwards exactly what the client reads.
  const messages = lineAssistantReply('ร่างข้อความทวงคุณเอให้แล้วครับ', [outcome.card!]);
  assert.equal((messages[messages.length - 1] as { text: string }).text, card.text);

  const standings = (await execute({ id: '2', name: 'receivables', args: {} })).result as { by_client: { client: string; most_days_late: number }[] };
  assert.deepEqual(standings.by_client.map(row => [row.client, row.most_days_late]), [['คุณเอ', 5]]);
});

test('delivered with no bill: 3 to 60 days after delivery, still owed, no invoice or receipt for the client since 45 days before', () => {
  const jobs = [
    job('new', { postDate: '2026-11-03' }),                                 // 1 day: too soon
    job('due', { postDate: '2026-10-30', client: 'ลูกค้าหนึ่ง' }),           // 5 days, no bill
    job('billed', { postDate: '2026-10-28', client: 'ลูกค้าสอง' }),          // billed (an invoice for the client)
    job('old', { postDate: '2026-08-01', client: 'ลูกค้าสาม' }),             // past 60 days
    job('paid', { postDate: '2026-10-25', status: 'done', pending: 0 }),
    job('working', { postDate: '2026-10-25', isPosted: false }),
  ] as any[];
  const invoices = [{ id: 'i1', documentType: 'invoice', createdDate: '2026-10-20', client: { name: ' ลูกค้าสอง ' } }, { id: 'q1', documentType: 'quotation', createdDate: '2026-10-29', client: { name: 'ลูกค้าหนึ่ง' } }] as any[];
  assert.deepEqual(deliveredNotInvoiced(jobs, invoices, '2026-11-04').map(row => [row.id, row.days]), [['due', 5]]);
  const briefing = buildBriefing({ jobs, expenses: [], invoices, now: NOW });
  const item = briefing.items.find(entry => entry.kind === 'not_invoiced')!;
  assert.equal(item.title, 'ส่งงานแล้วยังไม่ออกใบแจ้งหนี้ 1 งาน');
  assert.equal(item.action.page, 'invoice');
  // An account that never issues bills in the app is not asked to.
  assert.ok(!buildBriefing({ jobs, expenses: [], invoices: [invoices[1]], now: NOW }).items.some(entry => entry.kind === 'not_invoiced'));
});

test('morning notes: each thing at most once a week; cash short only with recorded cash; the record keeps three weeks', () => {
  const jobs = [job('due', { postDate: '2026-10-30', client: 'ลูกค้าหนึ่ง' })] as any[];
  const invoices = [{ id: 'i0', documentType: 'invoice', createdDate: '2026-09-01', client: { name: 'อื่น' } }] as any[];
  const first = morningInsights({ jobs, invoices, now: NOW });
  assert.deepEqual(first.items.map(item => item.kind), ['not_invoiced']);
  assert.deepEqual(first.told, { 'bill:due': '2026-11-04' });
  assert.deepEqual(morningInsights({ jobs, invoices, told: { 'bill:due': '2026-11-01' }, now: NOW }).items, [], 'told three days ago');
  assert.equal(morningInsights({ jobs, invoices, told: { 'bill:due': '2026-10-28' }, now: NOW }).items.length, 1, 'told a week ago');

  const short = morningInsights({ jobs: [], expenses: [], settings: { cashOpening: { amount: 1000 }, fixedExpenseItems: [{ id: 'f', name: 'ค่าเช่า', amount: 8000 }] as any, monthlyExpense: 8000 }, now: NOW });
  assert.deepEqual(short.items.map(item => item.kind), ['cash_short']);
  assert.match(short.items[0].lines[0], /^คาดการณ์: เงินในแอป ฿1,000/);
  assert.deepEqual(morningInsights({ jobs: [], expenses: [], settings: { monthlyExpense: 8000 }, now: NOW }).items, [], 'no recorded cash, no forecast');

  assert.deepEqual(mergeTold({ 'bill:x': '2026-10-01', 'bill:y': '2026-10-30', junk: 5 as any }, { 'bill:z': '2026-11-04' }, NOW), { 'bill:y': '2026-10-30', 'bill:z': '2026-11-04' });
});

test('morning LINE card: the notes under the money due, or on their own with a link to deal with them', () => {
  const insights = morningInsights({ jobs: [job('due', { postDate: '2026-10-30', client: 'ลูกค้าหนึ่ง' })] as any[], invoices: [{ id: 'i0', documentType: 'invoice', createdDate: '2026-09-01', client: { name: 'อื่น' } }] as any[], now: NOW }).items;
  const alone = JSON.stringify(buildInsightFlexMessage(insights, { now: NOW }));
  assert.match(alone, /เลขาชวนดู/);
  assert.match(alone, /ส่งงานแล้วยังไม่ออกใบแจ้งหนี้ 1 งาน/);
  assert.match(alone, /งาน due · ลูกค้าหนึ่ง · ฿10,000 · ส่งงานมา 5 วัน/);
  const due = [{ ...job('late', { payDate: '2026-11-01' }), dueDate: '2026-11-01', diffDays: -3 }] as any[];
  const both = JSON.stringify(buildDigestFlexMessage(due, { insights, now: NOW }));
  assert.match(both, /เตือนรับเงิน/);
  assert.match(both, /เลขาชวนดู/);
  assert.doesNotMatch(JSON.stringify(buildDigestFlexMessage(due, { now: NOW })), /เลขาชวนดู/);
});

test('week plan: work to deliver, unbilled work, money expected and late, quotations waiting; a quick answer with no model', () => {
  const u = user([
    job('deliver', { isPosted: false, postDate: '2026-11-06', client: 'ลูกค้าส่งงาน' }),
    job('later', { isPosted: false, postDate: '2026-11-12' }),
    job('money', { payDate: '2026-11-07', pending: 6000 }),
    job('late', { payDate: '2026-10-20', pending: 2000 }),
    job('unbilled', { postDate: '2026-10-30', client: 'ลูกค้าหนึ่ง', payDate: '2026-11-29' }),
  ], { invoices: [{ id: 'q1', documentType: 'quotation', documentNo: 'QT-001', createdDate: '2026-10-20', client: { name: 'ลูกค้าเสนอ' } }] });
  const plan = weekPlan(u, { now: NOW });
  assert.deepEqual([plan.start, plan.end], ['2026-11-04', '2026-11-08']);
  assert.deepEqual(plan.deliver.map(row => row.id), ['deliver']);
  assert.deepEqual(plan.money.map(row => row.id), ['money']);
  assert.deepEqual(plan.late.map(row => row.id), ['late']);
  assert.deepEqual(plan.bill.map(row => row.id), ['unbilled']);
  assert.deepEqual(plan.quotes.map(row => row.number), ['QT-001']);
  const next = weekPlan(u, { next: true, now: NOW });
  assert.deepEqual([next.start, next.end, next.deliver.map(row => row.id)], ['2026-11-09', '2026-11-15', ['later']]);

  for (const text of ['สัปดาห์นี้มีอะไรต้องทำ', 'อาทิตย์นี้มีงานอะไรบ้าง', 'สัปดาห์นี้มีอะไรต้องทำบ้างครับ', 'วางแผนสัปดาห์นี้หน่อย']) assert.equal(quickKind(text), 'week', text);
  assert.equal(quickKind('สัปดาห์หน้ามีอะไรต้องทำบ้าง'), 'next_week');
  assert.equal(quickKind('เพิ่มงานสัปดาห์หน้า 5000'), null);
  const text = quickAnswer('week', u, NOW);
  assert.match(text, /^สัปดาห์นี้ \(4 พ.ย. 2569 – 8 พ.ย. 2569\) มีเรื่องที่ควรทำดังนี้ครับ/);
  assert.match(text, /\*\*งานที่ต้องส่ง 1 งาน\*\*\n- งาน deliver · ลูกค้าส่งงาน — ส่งภายใน 6 พ.ย. 2569/);
  assert.match(text, /\*\*เงินที่เลยกำหนดแล้ว 1 งาน · ฿2,000\*\*/);
  assert.match(text, /ร่างข้อความทวงเงินให้หน่อย/);
  assert.equal(weekPlanText(weekPlan(user([]), { now: NOW })), 'สัปดาห์นี้ (4 พ.ย. 2569 – 8 พ.ย. 2569) ยังไม่มีงานที่ต้องส่ง เงินที่ครบกำหนด หรือเรื่องที่ต้องตามครับ');
});
