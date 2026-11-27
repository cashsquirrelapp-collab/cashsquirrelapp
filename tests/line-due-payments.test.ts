import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import {
  applyFullPayment, applyPartialPayment, decodeDueAction, dueRefFromDigestId, dueShortRef, encodeDueAction,
  handleDueAction, handleDuePartialText, parsePartialText, partialPrompt, type DuePaymentDependencies,
} from '../backend/src/services/lineDuePayments';
import { buildMorningMessages, buildReminderTestMessages, findJobsNeedingAttention } from '../backend/src/services/lineReminders';
import { lineEventCommand } from '../backend/src/handlers/line-webhook';
import { handleAssistantMessage, type LineAssistantDependencies, type UserRow } from '../backend/src/services/lineAssistant';

// One-tap answers to the 08:00 reminder (owner, 2026-10-22): ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ under
// each job due today or overdue, recorded exactly as the app's payment dialogs record it.
const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = 'https://preview.example.test';
after(() => { if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl; });

const JOB = '0b8f3c2e-1111-4111-8111-111111111111';
const today = '2026-10-22';
const nowIso = '2026-10-22T01:00:00.000Z';
const job = (over: Partial<Job> = {}): Job => ({
  id: JOB, name: 'ออกแบบโลโก้ ร้านตัวอย่าง', type: 'Design', client: 'ลูกค้าตัวอย่าง', value: 10000, received: 0, pending: 9700,
  status: 'pending', postDate: '2026-10-01', payDate: '2026-10-22', creditTerm: 21, whtRate: 3, ...over,
} as Job);
const installments = (over: Partial<Job> = {}): Job => job({
  value: 20000, whtRate: 0, pending: 20000, payDate: '2026-10-22',
  installments: [
    { id: 'installment-1-0', label: 'งวดที่ 1', amount: 10000, dueDate: '2026-10-22', paidAt: null, status: 'pending' },
    { id: 'installment-1-1', label: 'งวดที่ 2', amount: 10000, dueDate: '2026-11-22', paidAt: null, status: 'pending' },
  ], ...over,
});

test('button data round-trips, carries an instalment, and refuses unsafe ids', () => {
  const data = encodeDueAction('paid', { jobId: JOB, installmentId: 'installment-1-0' })!;
  assert.equal(data, `due:paid:${JOB}:installment-1-0`);
  assert.deepEqual(decodeDueAction(data), { kind: 'paid', ref: { jobId: JOB, installmentId: 'installment-1-0' } });
  assert.deepEqual(decodeDueAction(`due:later:${JOB}`), { kind: 'later', ref: { jobId: JOB } });
  assert.equal(encodeDueAction('paid', { jobId: 'a b' }), null);
  assert.equal(encodeDueAction('paid', { jobId: 'x'.repeat(129) }), null);
  assert.equal(decodeDueAction('due:delete:x'), null);
  assert.equal(decodeDueAction('draft:confirm:job:0123456789abcdef'), null);
  assert.deepEqual(dueRefFromDigestId(`${JOB}:installment-1-0`), { jobId: JOB, installmentId: 'installment-1-0' });
  assert.equal(dueRefFromDigestId('a:b:c'), null);
});

test('ได้รับแล้ว records the rest after withholding, the way the app does', () => {
  const result = applyFullPayment(job(), undefined, today, nowIso);
  assert.ok(!('error' in result));
  assert.equal(result.amount, 9700);
  assert.equal(result.job.received, 9700);
  assert.equal(result.job.pending, 0);
  assert.equal(result.job.status, 'done');
  assert.equal(result.job.paymentStatus, 'paid');
  assert.equal(result.job.payDate, today);
  assert.equal(result.job.lastActivityAt, nowIso);
  // After a deposit, only the remainder is new money.
  const afterDeposit = applyFullPayment(job({ received: 3000, pending: 6700, paymentStatus: 'partial' }), undefined, today, nowIso);
  assert.ok(!('error' in afterDeposit) && afterDeposit.amount === 6700 && afterDeposit.job.received === 9700);
  assert.deepEqual(applyFullPayment(job({ pending: 0, paymentStatus: 'paid' }), undefined, today, nowIso), { error: 'already_paid' });
});

test('an instalment is paid on its own; the job is paid once every instalment is', () => {
  const first = applyFullPayment(installments(), 'installment-1-0', today, nowIso);
  assert.ok(!('error' in first));
  assert.equal(first.amount, 10000);
  assert.equal(first.full, false);
  assert.equal(first.job.paymentStatus, 'partial');
  assert.equal(first.job.pending, 10000);
  assert.equal(first.job.payDate, '2026-11-22');
  assert.equal(first.job.installments![0].paidAt, today);
  const second = applyFullPayment(first.job, 'installment-1-1', today, nowIso);
  assert.ok(!('error' in second) && second.full && second.job.paymentStatus === 'paid' && second.job.pending === 0);
  assert.deepEqual(applyFullPayment(first.job, 'installment-1-0', today, nowIso), { error: 'already_paid' });
  assert.deepEqual(applyFullPayment(installments(), 'installment-9', today, nowIso), { error: 'missing_installment' });
});

test('ได้ไม่ครบ records a first deposit; the whole remainder counts as paid; a second part goes to the app', () => {
  const deposit = applyPartialPayment(job(), 5000, today, nowIso);
  assert.ok(!('error' in deposit));
  assert.deepEqual([deposit.job.status, deposit.job.received, deposit.job.pending, deposit.job.paymentStatus, deposit.job.depositDate, deposit.job.depositAmount], ['partial', 5000, 4700, 'partial', today, 5000]);
  const whole = applyPartialPayment(job(), 9700, today, nowIso);
  assert.ok(!('error' in whole) && whole.full && whole.job.paymentStatus === 'paid');
  assert.deepEqual(applyPartialPayment(deposit.job, 1000, today, nowIso), { error: 'already_partial' });
  assert.deepEqual(applyPartialPayment(installments(), 1000, today, nowIso), { error: 'installments' });
  assert.deepEqual(applyPartialPayment(job(), 0, today, nowIso), { error: 'invalid_amount' });
});

test('the typed amount after ได้ไม่ครบ is read in the forms people type', () => {
  const code = dueShortRef({ jobId: JOB });
  assert.match(code, /^[0-9A-F]{6}$/);
  assert.equal(partialPrompt({ jobId: JOB }), `รับเงินบางส่วน #${code} ยอด `);
  assert.deepEqual(parsePartialText(`รับเงินบางส่วน #${code} ยอด 5,000`), { shortRef: code, amount: 5000 });
  assert.deepEqual(parsePartialText(`รับเงินบางส่วน #${code.toLowerCase()} 2500.50 บาท`), { shortRef: code, amount: 2500.5 });
  assert.deepEqual(parsePartialText(`รับเงินไม่ครบ #${code} ยอด: ฿1200`), { shortRef: code, amount: 1200 });
  assert.equal(parsePartialText('รับเงินบางส่วน ยอด 5000'), null);
  assert.equal(parsePartialText('สรุปเดือนนี้'), null);
});

function fakeStore(start: Job, conflicts = 0) {
  const state = { job: start, version: 3, saves: [] as Job[], conflicts };
  const deps: DuePaymentDependencies = {
    async loadJob(_user, id) { return id === state.job.id ? { data: state.job, version: state.version } : null; },
    async saveJob(_user, _id, version, data) {
      if (state.conflicts > 0) { state.conflicts--; state.version++; return false; }
      assert.equal(version, state.version);
      state.saves.push(data); state.job = data; state.version++; return true;
    },
    today: () => today, now: () => new Date(nowIso),
  };
  return { state, deps };
}
const json = (value: unknown) => JSON.stringify(value);

test('a tap saves through the versioned save, retries once if another device saved first, and replies with a receipt', async () => {
  const { state, deps } = fakeStore(job(), 1);
  const reply = await handleDueAction({ user_id: 'u1' }, { kind: 'paid', ref: { jobId: JOB } }, deps);
  assert.equal(state.saves.length, 1);
  assert.equal(state.job.paymentStatus, 'paid');
  assert.match(json(reply), /บันทึกรับเงินแล้ว/);
  assert.match(json(reply), /9,700/);
  // Pressing the same button again changes nothing.
  const again = await handleDueAction({ user_id: 'u1' }, { kind: 'paid', ref: { jobId: JOB } }, deps);
  assert.match(json(again), /บันทึกรับเงินครบไว้แล้ว/);
  assert.equal(state.saves.length, 1);
  // Two conflicts in a row: nothing is overwritten, the person is told to try again.
  const busy = fakeStore(job(), 2);
  assert.match(json(await handleDueAction({ user_id: 'u1' }, { kind: 'paid', ref: { jobId: JOB } }, busy.deps)), /เพิ่งถูกแก้จากอีกเครื่อง/);
  assert.equal(busy.state.saves.length, 0);
});

test('ยังไม่ได้ saves nothing; ได้ไม่ครบ asks for the amount; sample cards never touch data', async () => {
  const { state, deps } = fakeStore(job());
  assert.match(json(await handleDueAction({ user_id: 'u1' }, { kind: 'later', ref: { jobId: JOB } }, deps)), /พรุ่งนี้ 08:00/);
  assert.match(json(await handleDueAction({ user_id: 'u1' }, { kind: 'partial', ref: { jobId: JOB } }, deps)), new RegExp(`#${dueShortRef({ jobId: JOB })}`));
  assert.match(json(await handleDueAction({ user_id: 'u1' }, { kind: 'paid', ref: { jobId: 'demo-today' } }, deps)), /ตัวอย่าง/);
  assert.equal(state.saves.length, 0);
  const typed = await handleDuePartialText({ user_id: 'u1', jobs: [{ id: JOB, pending: 9700 }] }, `รับเงินบางส่วน #${dueShortRef({ jobId: JOB })} ยอด 4000`, deps);
  assert.match(json(typed), /บันทึกรับเงินบางส่วนแล้ว/);
  assert.equal(state.job.received, 4000);
  assert.equal(state.job.pending, 5700);
  assert.match(json(await handleDuePartialText({ user_id: 'u1', jobs: [] }, 'รับเงินบางส่วน #ABCDEF ยอด 10', deps)), /ไม่พบงานที่ตรงกับรหัสนี้/);
  assert.equal(await handleDuePartialText({ user_id: 'u1', jobs: [] }, 'สรุปเดือนนี้', deps), null);
});

test('the 08:00 push: late money as one card (owner: "เลยกำหนดเป็นการ์ด"), today and soon as messages, all in one push', () => {
  const now = new Date('2026-10-22T01:00:00Z');
  const rows = findJobsNeedingAttention([
    { id: 'aaaa1111', name: 'งานเลยกำหนด', client: 'A', status: 'pending', pending: 4500, payDate: '2026-10-19' },
    { id: 'bbbb2222', name: 'งานเลยนานกว่า', client: 'Z', status: 'pending', pending: 1500, payDate: '2026-10-12' },
    { id: JOB, name: 'งานวันนี้', client: 'B', status: 'pending', pending: 9700, payDate: '2026-10-22' },
    { id: 'cccc3333', name: 'งานใกล้ครบ', client: 'C', status: 'pending', pending: 2500, payDate: '2026-10-24' },
  ] as never, now);
  const { messages } = buildMorningMessages({ payments: rows, name: 'ปาร์ค', now });
  assert.equal(messages.length, 3);
  // 1 · the card: late money only, most late first, total on the band, buttons under each.
  const card = json(messages[0]);
  assert.match(card, /"header"/);
  assert.match(card, /เตือนรับเงิน/);
  assert.match(card, /ยอดเลยกำหนดที่ต้องติดตาม/);
  assert.match(card, /฿ 6,000/);
  assert.match(card, /เลยกำหนด · 2 รายการ/);
  assert.ok(card.indexOf('งานเลยนานกว่า') < card.indexOf('งานเลยกำหนด'), 'most late first');
  assert.doesNotMatch(card, /งานวันนี้|งานใกล้ครบ/);
  assert.equal((messages[0] as { altText: string }).altText, 'เงินเลยกำหนด 2 รายการ รวม ฿6,000');
  // 2, 3 · เลขา's messages, the first by name; buttons only on what is due today.
  assert.equal((messages[1] as { altText: string }).altText, 'คุณปาร์ค วันนี้ครบกำหนดรับเงิน งานวันนี้ จากB ฿9,700 นะครับ');
  assert.equal(messages[2].type, 'text');
  assert.equal((messages[2] as { text: string }).text, 'อีก 2 วันครบกำหนดรับเงิน งานใกล้ครบ จากC ฿2,500 ครับ');
  const data = [...json(messages).matchAll(/"data":"(due:[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(data.sort(), [`due:later:${JOB}`, 'due:later:aaaa1111', 'due:later:bbbb2222', `due:paid:${JOB}`, 'due:paid:aaaa1111', 'due:paid:bbbb2222',
    `due:partial:${JOB}`, 'due:partial:aaaa1111', 'due:partial:bbbb2222'].sort());
  assert.match(json(messages), /"inputOption":"openKeyboard"/);
  // An instalment gets ได้รับแล้ว and ยังไม่ได้ only.
  const instalment = findJobsNeedingAttention([{ ...installments(), status: 'pending' }] as never, now);
  const instalmentData = [...json(buildMorningMessages({ payments: instalment }).messages).matchAll(/"data":"(due:[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(instalmentData.sort(), [`due:later:${JOB}:installment-1-0`, `due:paid:${JOB}:installment-1-0`]);
  // The fallback if LINE ever refuses the buttons: the same card and words without them.
  const plain = buildMorningMessages({ payments: rows, buttons: false, now }).messages;
  assert.equal(/"data":"due:/.test(json(plain)), false);
  assert.match(json(plain[0]), /อัปเดตสถานะในแอปได้เลย/);
  // The Settings test sends the same after a note that it is a test; its buttons only answer with a sample notice.
  const test = buildReminderTestMessages(now);
  assert.match((test[0] as { text: string }).text, /^ข้อความทดสอบครับ/);
  assert.match(json(test[1]), /ทดสอบแจ้งเตือน/);
  assert.match(json(test), /due:paid:demo-today/);
  assert.ok(test.length <= 5);
});

test('work to deliver, late money and money due share one push: past 5 the last message counts the rest', async () => {
  const { findDeliveriesDue } = await import('../shared/dueJobs');
  const now = new Date('2026-10-22T01:00:00Z');
  const pay = findJobsNeedingAttention([
    ...Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `เงิน ${i}`, client: '', status: 'pending', pending: 1000, payDate: '2026-10-22' })),
    { id: 'late1', name: 'เงินเลย', client: '', status: 'pending', pending: 500, payDate: '2026-10-20' },
  ] as never, now);
  const deliver = findDeliveriesDue(Array.from({ length: 3 }, (_, i) => ({ id: `d${i}`, name: `ส่ง ${i}`, client: '', status: 'pending', pending: 0, payDate: null, isPosted: false, postDate: '2026-10-22', value: 1000 })), now);
  const { messages, insightsShown } = buildMorningMessages({ deliveries: deliver, payments: pay, insights: [{ kind: 'cash_short', title: 'x', lines: [], link: { path: '/dashboard', label: 'ดูภาพรวม' } }], now });
  const words = messages.map(message => (message as { altText?: string; text?: string }).altText ?? (message as { text?: string }).text);
  assert.equal(messages.length, 5);
  assert.deepEqual(words, ['วันนี้ต้องส่ง ส่ง 0 นะครับ', 'วันนี้ต้องส่ง ส่ง 1 นะครับ', 'เงินเลยกำหนด 1 รายการ รวม ฿500', 'วันนี้ครบกำหนดรับเงิน เงิน 0 ฿1,000 นะครับ',
    'และยังมีงานที่ต้องส่งอีก 1 งาน และเงินรอรับอีก 3 รายการ ดูในแอปได้ครับ']);
  assert.deepEqual(insightsShown, [], 'no room left for เลขาชวนดู: it waits for another morning');
});

test('a button press reaches the assistant and is recorded without the model', async () => {
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: `due:paid:${JOB}` } }), `due:paid:${JOB}`);
  const calls: string[] = [];
  const user: UserRow = { user_id: 'u1', jobs: [], goals: [], settings: {}, expenses: [], statuses: [] };
  const deps: LineAssistantDependencies = {
    async findUserByLineId() { return { ...user }; },
    async checkLinkedAccountWriteAccess() { return { allowed: true as const }; },
    async isProUser() { return true; },
    async classifyMessage() { calls.push('model'); throw new Error('the model must not be asked'); },
    async handleDueAction(_user, action) { calls.push(`due:${action.kind}`); return { type: 'text', text: 'ok' }; },
  };
  const reply = await handleAssistantMessage('U1', `due:paid:${JOB}`, 'op-due', deps);
  assert.deepEqual(calls, ['due:paid']);
  assert.equal((reply?.[0] as { text?: string })?.text, 'ok');
  // An expired account still gets the renewal prompt first.
  const expired = await handleAssistantMessage('U1', `due:paid:${JOB}`, 'op-due-2', { ...deps, async isProUser() { return false; } });
  assert.match(json(expired), /แพ็กเกจของบัญชีนี้หมดอายุ/);
  assert.deepEqual(calls, ['due:paid']);
});

// Owner, 2026-11-27 (payment reminders, step 1): after ยังไม่ได้, เลขา offers a reminder with quick replies for the ending;
// the reminder comes back as its own message to forward from the person's own LINE. Nothing is sent to the client.
test('ยังไม่ได้ offers a payment reminder; the quick reply writes it from the saved job, ready to forward', async () => {
  const { handleDueDraftText } = await import('../backend/src/services/lineCollectionDraft');
  const { parseDraftRequest } = await import('../backend/src/services/lineDuePayments');
  const { deps } = fakeStore(job());
  const reply = await handleDueAction({ user_id: 'u1' }, { kind: 'later', ref: { jobId: JOB } }, deps) as { text: string; quickReply?: { items: { action: { label: string; text: string } }[] } };
  const code = dueShortRef({ jobId: JOB });
  assert.match(reply.text, /ให้ผมร่างข้อความทวงลูกค้าตัวอย่างไว้ส่งต่อให้ไหมครับ/);
  assert.deepEqual(reply.quickReply!.items.map(item => item.action.text), [`ร่างข้อความทวง ครับ #${code}`, `ร่างข้อความทวง ค่ะ #${code}`, 'ไม่ต้องร่างข้อความ']);
  assert.ok(reply.quickReply!.items.every(item => item.action.label.length <= 20), 'LINE quick reply labels are 20 characters at most');
  assert.deepEqual(parseDraftRequest(`ร่างข้อความทวง ค่ะ #${code}`), { particle: 'ค่ะ', shortRef: code });
  assert.equal(parseDraftRequest('ร่างข้อความทวงหน่อย'), null);

  const user = { user_id: 'u1', jobs: [job({ payDate: '2026-10-15' })], statuses: [] } as unknown as UserRow;
  const drafted = handleDueDraftText(user, `ร่างข้อความทวง ค่ะ #${code}`)!;
  assert.equal(drafted.length, 2);
  assert.match((drafted[0] as { text: string }).text, /กดค้างที่ข้อความถัดไป แล้วเลือก "ส่งต่อ"/);
  const words = (drafted[1] as { text: string }).text;
  assert.match(words, /^สวัสดีค่ะ คุณลูกค้าตัวอย่าง/);
  assert.match(words, /9,700 บาท/);
  assert.doesNotMatch(words, /ครับ/);
  // A job already paid, or a wrong code: said plainly, nothing invented.
  assert.match((handleDueDraftText({ ...user, jobs: [job({ pending: 0 })] } as UserRow, `ร่างข้อความทวง ครับ #${code}`)![0] as { text: string }).text, /ไม่พบงานที่ยังรอรับเงิน/);
  assert.match((handleDueDraftText(user, 'ไม่ต้องร่างข้อความ')![0] as { text: string }).text, /ไม่ร่างให้/);
  assert.equal(handleDueDraftText(user, 'สวัสดี'), null);
});
