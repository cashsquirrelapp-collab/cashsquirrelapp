import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { handleAssistantMessage, buildJobFromDraft, buildExpenseFromDraft, type LineAssistantDependencies, type UserRow, type JobDraft } from '../backend/src/services/lineAssistant';
import { answerJobQuestion, nextJobQuestion, parseThaiDate, prefillJob, recentClients } from '../backend/src/services/lineJobQuestions';
import { activeAiQuestions, aiQuestionMessage, answerAiQuestion, pendingAiQuestions } from '../backend/src/services/lineAiQuestions';
import { lineEventCommand } from '../backend/src/handlers/line-webhook';
import { validateChanges } from '../shared/validation';

// Recording in the LINE chat asks what is missing one short question at a time with taps, and shows the card once
// (owner, 2026-11-14: "กูไม่ชอบลักษณะการถามเลย", "ตั้งชื่อโปรเจกต์ ... แล้วค่อยลูกค้าคือใคร", "หักเปอร์เซ็นต์ ... รับบางส่วน ...
// รับเป็นงวด ... ทำให้มัน cover ตัวแอปทั้งหมด"). No model, no tokens.

const saved = { APP_URL: process.env.APP_URL, LIFF_ID: process.env.LIFF_ID };
process.env.APP_URL = 'https://preview.example.test';
process.env.LIFF_ID = '1234567890-abcdefgh';
after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

function chat(jobs: UserRow['jobs'] = []) {
  const calls: string[] = [];
  const user: UserRow = { user_id: '00000000-0000-4000-8000-000000000001', jobs, goals: [], settings: {}, expenses: [], statuses: [], notif_settings: {} };
  const deps: LineAssistantDependencies = {
    async findUserByLineId() { return user; },
    async checkLinkedAccountWriteAccess() { return { allowed: true as const }; },
    async isProUser() { return true; },
    async assistantAnswer() { calls.push('ai'); return { messages: [{ type: 'text', text: 'ai' }], text: 'ai' }; },
    async saveJobDraft(u: UserRow, draft: JobDraft) { u.notif_settings = { ...u.notif_settings, pendingJobDraft: { createdAt: new Date().toISOString(), draft } }; },
    async saveExpenseDraft(u: UserRow, draft: any) { u.notif_settings = { ...u.notif_settings, pendingExpenseDraft: { createdAt: new Date().toISOString(), draft } }; },
    async clearJobDraft(u: UserRow) { const rest: any = { ...u.notif_settings }; delete rest.pendingJobDraft; u.notif_settings = rest; },
    async clearExpenseDraft(u: UserRow) { const rest: any = { ...u.notif_settings }; delete rest.pendingExpenseDraft; u.notif_settings = rest; },
    async keepAiQuestions(u: UserRow, state: any) { const rest: any = { ...u.notif_settings }; if (state) rest.pendingAiQuestions = state; else delete rest.pendingAiQuestions; u.notif_settings = rest; },
  } as LineAssistantDependencies;
  let n = 0;
  const say = async (text: string) => {
    const reply = await handleAssistantMessage('Uline', text, `op-${n += 1}`, deps) as any[];
    return reply[0];
  };
  return { user, calls, say, draft: () => user.notif_settings!.pendingJobDraft!.draft as JobDraft };
}
const taps = (message: any) => message.quickReply.items.map((item: any) => item.action.label);

test('the project, then the client, withholding, how and when it was paid: one question at a time, then the card', async () => {
  const { say, draft, calls } = chat([{ id: 'j1', name: 'x', client: 'คุณบี', status: 'done', pending: 0, payDate: null, postDate: '2026-11-01' } as any]);
  let reply = await say('งานตัดต่อ 3000 บาท');
  assert.equal(reply.text, 'งานตัดต่อ ฿3,000 ครับ เป็นโปรเจกต์อะไรครับ\nเช่น ตัดต่อคลิปรีวิว ร้านกาแฟ');
  assert.deepEqual(taps(reply), ['ใช้ชื่อ “งานตัดต่อ”', 'กรอกในฟอร์ม']);
  reply = await say('ตัดต่อคลิปรีวิวคาเฟ่ EP.3');
  assert.equal(draft().name, 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3');
  assert.equal(reply.text, 'ลูกค้าคือใครครับ');
  assert.deepEqual(taps(reply), ['ข้าม', 'คุณบี', 'กรอกในฟอร์ม'], 'the clients the account already has');
  reply = await say('ชื่อยอร์ช');
  assert.equal(draft().client, 'ยอร์ช');
  assert.equal(reply.text, 'ลูกค้าหัก ณ ที่จ่ายไหมครับ');
  assert.deepEqual(taps(reply).slice(0, 5), ['ไม่หัก', 'หัก 1%', 'หัก 2%', 'หัก 3%', 'หัก 5%']);
  reply = await say('หัก 3%');
  assert.equal(reply.text, 'ได้รับเงินแล้วหรือยังครับ');
  assert.deepEqual(taps(reply).slice(0, 4), ['ยังไม่ได้รับ', 'รับครบแล้ว', 'รับบางส่วน', 'แบ่งงวด']);
  reply = await say('รับครบแล้ว');
  assert.equal(reply.text, 'รับเงินวันไหนครับ');
  assert.equal(reply.quickReply.items[2].action.type, 'datetimepicker');
  const card = await say('เมื่อวาน');
  assert.equal(card.type, 'flex');
  const words = JSON.stringify(card);
  for (const text of ['ยอร์ช', 'หัก ณ ที่จ่าย 3%', '2,910', 'รับเงินครบแล้ว · เมื่อวาน']) assert.ok(words.includes(text), text);
  assert.ok(!calls.includes('ai'), 'no model');
  const job = buildJobFromDraft(draft());
  assert.deepEqual([job.status, job.received, job.pending, job.payDate, job.whtAmount, (job as any).paymentStatus], ['done', 2910, 0, day(-1), 90, 'paid']);
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_jobs', id: job.id, op: 'set', version: null, data: job as any }]));
});

test('part paid: how much came and when the rest is due, saved as the app saves a deposit', async () => {
  const { say, draft } = chat();
  await say('รับงานออกแบบโลโก้ร้านกาแฟ 5000');
  await say('ข้าม');
  let reply = await say('รับบางส่วน');
  assert.match(reply.text, /^รับมาแล้วเท่าไรครับ/);
  assert.deepEqual(taps(reply)[0], 'ครึ่งหนึ่ง ฿2,500');
  reply = await say('2000');
  assert.equal(reply.text, 'ยอดที่เหลือ ฿3,000 จะได้วันไหนครับ');
  const card = await say('อีก 30 วัน');
  assert.equal(card.type, 'flex');
  const job = buildJobFromDraft(draft()) as any;
  assert.deepEqual([job.status, job.received, job.pending, job.depositAmount, job.depositDate, job.payDate, job.creditTerm], ['partial', 2000, 3000, 2000, today, day(30), 30]);
});

test('instalments: how many and when the first is due; the first paid today counts as received', async () => {
  const { say, draft } = chat();
  await say('บันทึกงาน เว็บไซต์บริษัทเอ 30000');
  await say('บริษัท เอ จำกัด');
  await say('หัก 3%');
  let reply = await say('แบ่งงวด');
  assert.match(reply.text, /^แบ่งกี่งวดครับ \(ยอดหลังหักภาษี ฿29,100\)$/);
  reply = await say('3 งวด');
  assert.match(reply.text, /^3 งวด งวดละ ฿9,700 ครับ งวดแรกครบกำหนดวันไหนครับ/);
  const card = await say('รับงวดแรกแล้ว');
  assert.match(JSON.stringify(card), /แบ่ง 3 งวด งวดละ ฿\s?9,700/);
  const job = buildJobFromDraft(draft()) as any;
  assert.equal(job.status, 'installment');
  assert.deepEqual(job.installments.map((row: any) => [row.amount, row.status]), [[9700, 'paid'], [9700, 'pending'], [9700, 'pending']]);
  assert.equal(job.installments[0].paidAt, today);
  assert.deepEqual([job.received, job.pending, job.payDate], [9700, 19400, job.installments[1].dueDate]);
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_jobs', id: job.id, op: 'set', version: null, data: job }]));
});

test('not paid yet: delivered or in progress, when it will be delivered, and when the money is due', async () => {
  const { say, draft } = chat();
  await say('รับงาน ถ่ายภาพสินค้าร้านบี 8000');
  await say('ร้านบี');
  await say('ไม่หัก');
  let reply = await say('ยังไม่ได้รับ');
  assert.equal(reply.text, 'ส่งงานแล้วหรือยังครับ');
  reply = await say('กำลังทำ');
  assert.equal(reply.text, 'จะส่งงานวันไหนครับ');
  reply = await say(`วันที่ ${day(6)}`);
  assert.equal(reply.text, 'ส่งงานแล้วลูกค้าจะจ่ายภายในกี่วันครับ');
  const card = await say('เครดิต 30 วัน');
  assert.ok(JSON.stringify(card).includes('กำลังทำ'));
  const job = buildJobFromDraft(draft()) as any;
  assert.deepEqual([job.status, job.isPosted, job.postDate, job.creditTerm, job.payDate, job.whtRate], ['pending', false, day(6), 30, day(36), 0]);
});

test('what the message said is never asked again; a skipped client asks no withholding; a known client brings its rate', () => {
  assert.equal(nextJobQuestion({ name: 'ตัดต่อคลิปรีวิว', value: 3000, client: 'ยอร์ช', whtRate: 3, paymentStatus: 'pending', workStatus: 'delivered', creditTerm: 30 }), null);
  assert.equal(nextJobQuestion({ name: 'ตัดต่อคลิปรีวิว', value: 3000, client: '', skipped: ['client'] }), 'payment');
  const known = prefillJob({ name: 'โพสต์ IG', value: 5000, client: 'ร้านกาแฟ' }, { today, jobs: [{ client: 'ร้านกาแฟ', whtRate: 3, postDate: '2026-10-01' }] });
  assert.equal(known.whtRate, 3);
  assert.equal(nextJobQuestion(known), 'payment');
  assert.deepEqual(recentClients({ today, jobs: [{ client: 'A', postDate: '2026-01-01' }, { client: 'B', postDate: '2026-03-01' }, { client: 'a', postDate: '2026-04-01' }] }), ['a', 'B']);
  // Commands and new records are never answers.
  for (const text of ['สรุปเดือนนี้', 'ยกเลิก', 'หัก 3%', '5000', 'ทำไมครับ?']) assert.equal(answerJobQuestion('client', text, {}, { today }), null, text);
});

test('a new record typed while a question waits is that record, not the answer', async () => {
  const { say, user } = chat();
  await say('งานตัดต่อ 3000');
  const reply = await say('ค่ากาแฟ 60');
  assert.equal(reply.type, 'flex', 'the coffee is its own card');
  assert.equal((user.notif_settings!.pendingExpenseDraft!.draft as any).name, 'ค่ากาแฟ');
  assert.equal(user.notif_settings!.pendingJobDraft, undefined, 'the job left half-told gives way, as before (one draft at a time)');
});

test('an expense: its category asked with taps when it is not known; a day said in the message is kept', async () => {
  const { say, user } = chat();
  const reply = await say('ซื้อกล้อง 25000');
  assert.equal(reply.text, 'ซื้อกล้อง ฿25,000 ครับ อยู่หมวดไหนครับ');
  assert.equal(taps(reply).length, 9);
  const card = await say('หมวด ค่าอุปกรณ์/ซอฟต์แวร์');
  assert.equal(card.type, 'flex');
  user.notif_settings = {};
  await say('เมื่อวาน ค่ากาแฟ 60');
  const expense = buildExpenseFromDraft(user.notif_settings!.pendingExpenseDraft!.draft as any);
  assert.deepEqual([expense.name, expense.amount, expense.date], ['ค่ากาแฟ', 60, day(-1)]);
});

test('days as people type them, and the picker\'s day comes in as text', () => {
  const base = '2026-11-14';
  for (const [text, expected] of [['วันนี้', base], ['เมื่อวาน', '2026-11-13'], ['พรุ่งนี้', '2026-11-15'], ['อีก 7 วัน', '2026-11-21'], ['อีก 1 เดือน', '2026-12-14'],
    ['สิ้นเดือนนี้', '2026-11-30'], ['ต้นเดือนหน้า', '2026-12-01'], ['15 พ.ย.', '2026-11-15'], ['3 ธันวาคม 2569', '2026-12-03'], ['5/1/70', '2027-01-05'],
    ['วันที่ 20', '2026-11-20'], ['2026-12-31', '2026-12-31'], ['31/2', null], ['เดี๋ยวนี้', null]] as const) {
    assert.equal(parseThaiDate(text, base), expected, text);
  }
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: 'qd:date', params: { date: '2026-11-20' } } } as any), 'วันที่ 2026-11-20');
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: 'qd:date', params: {} } } as any), null);
});

test('เลขา\'s own questions: one at a time, no numbering, ไม่ระบุ as the skip tap; the answers go to เลขา together', () => {
  const state = pendingAiQuestions([
    { id: 'a', text: 'งานตัดต่อ ฿3,000 นี้ลูกค้าชื่ออะไร', options: ['ไม่ระบุ'], allowText: true },
    { id: 'b', text: 'งานนี้ได้รับเงินหรือยัง', options: ['รับครบแล้ววันนี้', 'ยังไม่จ่าย', 'รับบางส่วน'], allowText: false },
  ], new Date());
  const first = aiQuestionMessage(state, today) as any;
  assert.equal(first.text, 'งานตัดต่อ ฿3,000 นี้ลูกค้าชื่ออะไร (1/2)');
  assert.deepEqual(taps(first), ['ข้าม']);
  const step = answerAiQuestion(state, 'ยอร์ช', today) as any;
  assert.equal(step.next.text, 'งานนี้ได้รับเงินหรือยัง (2/2)');
  assert.deepEqual(taps(step.next), ['รับครบแล้ววันนี้', 'ยังไม่จ่าย', 'รับบางส่วน', 'ข้าม']);
  const done = answerAiQuestion(step.state, 'รับครบแล้ววันนี้', today) as any;
  assert.equal(done.composed, 'ตอบคำถาม:\n- งานตัดต่อ ฿3,000 นี้ลูกค้าชื่ออะไร: ยอร์ช\n- งานนี้ได้รับเงินหรือยัง: รับครบแล้ววันนี้');
  assert.equal(answerAiQuestion(state, 'x'.repeat(500), today), null, 'not an answer');
  assert.equal(activeAiQuestions({ ...state, at: new Date(Date.now() - 31 * 60_000).toISOString() }), null, 'old questions lapse');
});

test('LINE asks เลขา\'s next question with no model, then sends every answer at once', async () => {
  const { say, user, calls } = chat();
  user.notif_settings = { pendingAiQuestions: pendingAiQuestions([
    { id: 'a', text: 'ลูกค้าคือใคร', options: [], allowText: true },
    { id: 'b', text: 'ส่งงานแล้วหรือยัง', options: ['ส่งแล้ว', 'ยังไม่ส่ง'], allowText: false },
  ]) } as any;
  const reply = await say('ยอร์ช');
  assert.equal(reply.text, 'ส่งงานแล้วหรือยัง (2/2)');
  assert.ok(!calls.includes('ai'));
  await say('ส่งแล้ว');
  assert.ok(calls.includes('ai'));
  assert.equal((user.notif_settings as any).pendingAiQuestions, undefined);
});
