import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import {
  applyFullPayment, applyPartialPayment, decodeDueAction, dueRefFromDigestId, dueShortRef, encodeDueAction,
  handleDueAction, handleDuePartialText, parsePartialText, partialPrompt, type DuePaymentDependencies,
} from '../backend/src/services/lineDuePayments';
import { buildDigestFlexMessage, buildReminderTestMessage, findJobsNeedingAttention } from '../backend/src/services/lineReminders';
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

test('the 08:00 card puts the buttons under today\'s and overdue jobs only, inside the same single message', () => {
  const now = new Date('2026-10-22T01:00:00Z');
  const rows = findJobsNeedingAttention([
    { id: 'aaaa1111', name: 'งานเลยกำหนด', client: 'A', status: 'pending', pending: 4500, payDate: '2026-10-19' },
    { id: JOB, name: 'งานวันนี้', client: 'B', status: 'pending', pending: 9700, payDate: '2026-10-22' },
    { id: 'cccc3333', name: 'งานใกล้ครบ', client: 'C', status: 'pending', pending: 2500, payDate: '2026-10-24' },
  ] as never, now);
  const card = buildDigestFlexMessage(rows, { now });
  const data = [...json(card).matchAll(/"data":"(due:[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(data.sort(), [`due:later:${JOB}`, 'due:later:aaaa1111', `due:paid:${JOB}`, 'due:paid:aaaa1111', `due:partial:${JOB}`, 'due:partial:aaaa1111'].sort());
  assert.equal(data.some(value => value.includes('cccc3333')), false);
  assert.match(json(card), /"inputOption":"openKeyboard"/);
  assert.match(json(card), /กดปุ่มใต้รายการ/);
  assert.equal((card as { type: string }).type, 'flex');
  // An instalment gets ได้รับแล้ว and ยังไม่ได้ only.
  const instalment = findJobsNeedingAttention([{ ...installments(), status: 'pending' }] as never, now);
  const instalmentData = [...json(buildDigestFlexMessage(instalment, { now })).matchAll(/"data":"(due:[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(instalmentData.sort(), [`due:later:${JOB}:installment-1-0`, `due:paid:${JOB}:installment-1-0`]);
  // The fallback the 08:00 job sends if LINE ever refuses the card with buttons: the same card without them.
  const plain = buildDigestFlexMessage(rows, { now, buttons: false });
  assert.equal(/"data":"due:/.test(json(plain)), false);
  assert.match(json(plain), /อัปเดตสถานะในแอปได้เลย/);
  // The settings test message shows the buttons too; they only ever answer with a sample notice.
  assert.match(json(buildReminderTestMessage(now)), /due:paid:demo-today/);
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
  assert.match(json(expired), /Pro ของคุณหมดอายุ/);
  assert.deepEqual(calls, ['due:paid']);
});
