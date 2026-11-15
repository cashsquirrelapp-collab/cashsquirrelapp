import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { findDeliveriesDue, DELIVERY_LATE_DAYS, type JobRow } from '../shared/dueJobs';
import { deliveryReminderOn } from '../shared/notifDefaults';
import { notificationPreferences } from '../shared/validation';

// เตือนส่งงาน (owner, 2026-11-15: "แจ้งเตือนเดดไลน์ในการส่งงาน แจ้งเตือนเดดไลน์ในการรับเงิน"): work still being done whose
// delivery date is late, today or within 2 days comes in the 08:00 reminder beside the money due, by LINE and email.
const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = 'https://preview.example.test';
after(() => { if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl; });

const now = new Date('2026-11-16T01:00:00Z'); // 08:00 in Bangkok
const job = (id: string, over: Partial<JobRow>): JobRow => ({ id, name: `งาน ${id}`, client: `ลูกค้า ${id}`, status: 'pending', pending: 5000, payDate: null, value: 5000, ...over });

test('which work is due: still being worked on, late up to 7 days, today or within 2 days; most urgent first', () => {
  const jobs = [
    job('soon', { isPosted: false, postDate: '2026-11-18' }),
    job('today', { isPosted: false, postDate: '2026-11-16' }),
    job('late', { isPosted: false, postDate: '2026-11-13' }),
    job('too-late', { isPosted: false, postDate: `2026-11-0${8 - 1}` }), // 9 days late: most likely delivered, never marked
    job('far', { isPosted: false, postDate: '2026-11-19' }),
    job('delivered', { isPosted: true, postDate: '2026-11-16' }),
    job('old-record', { postDate: '2026-11-16' }), // no isPosted: not a job in progress
    job('no-date', { isPosted: false }),
    job('bad-date', { isPosted: false, postDate: '2026-02-30' }),
  ];
  const due = findDeliveriesDue(jobs, now);
  assert.deepEqual(due.map(d => [d.id, d.diffDays]), [['late', -3], ['today', 0], ['soon', 2]]);
  assert.deepEqual(due[0], { id: 'late', name: 'งาน late', client: 'ลูกค้า late', value: 5000, postDate: '2026-11-13', diffDays: -3 });
  assert.equal(DELIVERY_LATE_DAYS, 7);
  assert.deepEqual(findDeliveriesDue([job('edge', { isPosted: false, postDate: '2026-11-09' })], now).map(d => d.diffDays), [-7]);
});

test('the switch follows the payment reminder until the account sets it, and is kept when settings are saved', () => {
  assert.equal(deliveryReminderOn(undefined), false);
  assert.equal(deliveryReminderOn({}), false);
  assert.equal(deliveryReminderOn({ dailyDigestEnabled: true }), true);
  assert.equal(deliveryReminderOn({ enabled: true }), true);
  assert.equal(deliveryReminderOn({ dailyDigestEnabled: true, deliveryReminderEnabled: false }), false);
  assert.equal(deliveryReminderOn({ dailyDigestEnabled: false, deliveryReminderEnabled: true }), true);
  assert.deepEqual(notificationPreferences.parse({ deliveryReminderEnabled: false }), { deliveryReminderEnabled: false });
});

test('the LINE messages: one per job from เลขา (owner: "ส่งมาเป็นทีละข้อความดิ"), by name, with ส่งแล้ว / ยังไม่ส่ง', async () => {
  const { buildMorningMessages } = await import('../backend/src/services/lineReminders.js');
  const say = (deliveries: ReturnType<typeof findDeliveriesDue>, name?: string) => buildMorningMessages({ deliveries, name }).messages;
  const words = (messages: { type: string; altText?: string; text?: string }[]) => messages.map(message => message.altText ?? message.text);
  const at = (postDate: string, over: Partial<JobRow> = {}) => findDeliveriesDue([job('x', { isPosted: false, postDate, name: 'ถ่ายภาพเมนูใหม่', client: 'ร้านตัวอย่าง', ...over })], now);
  assert.deepEqual(words(say(at('2026-11-16'), 'ปาร์ค')), ['คุณปาร์ค วันนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ร้านตัวอย่าง นะครับ']);
  assert.deepEqual(words(say(at('2026-11-17'))), ['พรุ่งนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ร้านตัวอย่าง นะครับ']);
  assert.deepEqual(words(say(at('2026-11-18', { client: '' }), '  ')), ['อีก 2 วันต้องส่ง ถ่ายภาพเมนูใหม่ นะครับ']);
  assert.deepEqual(words(say(at('2026-11-14'), 'ปาร์ค')), ['คุณปาร์ค ถ่ายภาพเมนูใหม่ ให้ร้านตัวอย่าง เลยกำหนดส่งมา 2 วันแล้วนะครับ']);
  // The message itself: the words in a plain bubble, ส่งแล้ว (CI orange) and ยังไม่ส่ง as buttons for this job; no card.
  const [one] = say(at('2026-11-16'));
  const json = JSON.stringify(one);
  assert.equal(one.type, 'flex');
  assert.ok(json.includes('"data":"deliver:done:x"') && json.includes('"data":"deliver:later:x"'));
  assert.ok(json.includes('"displayText":"ส่งงานแล้ว · ถ่ายภาพเมนูใหม่"'));
  assert.ok(json.includes('"text":"ส่งแล้ว"') && json.includes('"text":"ยังไม่ส่ง"'));
  assert.ok(!json.includes('"header"') && !json.includes('mascot-v6-'), 'no card header, no mascot');
  assert.ok(Buffer.byteLength(json) < 30_000);
  const many = findDeliveriesDue([
    job('late', { isPosted: false, postDate: '2026-11-15', name: 'ตัดต่อคลิปรีวิว', client: 'ลูกค้า D' }),
    job('today', { isPosted: false, postDate: '2026-11-16', name: 'ถ่ายภาพเมนูใหม่', client: 'ลูกค้า E' }),
    job('soon', { isPosted: false, postDate: '2026-11-18', name: 'ออกแบบโปสเตอร์', client: 'ลูกค้า F' }),
  ], now);
  // Most urgent first; only the first message carries the name.
  assert.deepEqual(words(say(many, 'ปาร์ค')), [
    'คุณปาร์ค ตัดต่อคลิปรีวิว ให้ลูกค้า D เลยกำหนดส่งมา 1 วันแล้วนะครับ',
    'วันนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ลูกค้า E นะครับ',
    'อีก 2 วันต้องส่ง ออกแบบโปสเตอร์ ให้ลูกค้า F นะครับ',
  ]);
  // A push holds 5 messages: past that, the last one counts the rest.
  const seven = findDeliveriesDue(Array.from({ length: 7 }, (_, i) => job(`j${i}`, { isPosted: false, postDate: '2026-11-17', name: i === 0 ? 'ก'.repeat(80) : `งาน ${i}`, client: '' })), now);
  const out = words(say(seven));
  assert.equal(out.length, 5);
  assert.equal(out[4], 'และยังมีงานที่ต้องส่งอีก 3 งาน ดูในแอปได้ครับ');
  assert.ok(out[0]!.includes(`${'ก'.repeat(59)}…`), 'long names are cut');
  assert.ok(out.every(text => !/[\u{1F300}-\u{1FAFF}]/u.test(text!)), 'no emoji');
});

test('ส่งแล้ว marks the job delivered as the Jobs page does; ยังไม่ส่ง and samples change nothing; a save race retries once', async () => {
  const { applyDelivered, decodeDeliverAction, encodeDeliverAction, handleDeliverAction } = await import('../backend/src/services/lineDeliveryActions.js');
  assert.equal(encodeDeliverAction('done', 'job-1'), 'deliver:done:job-1');
  assert.equal(encodeDeliverAction('done', 'a b'), null);
  assert.deepEqual(decodeDeliverAction('deliver:later:job-1'), { kind: 'later', jobId: 'job-1' });
  assert.equal(decodeDeliverAction('deliver:delete:job-1'), null);
  const working = { id: 'job-1', name: 'ถ่ายภาพเมนูใหม่', client: 'ร้าน', value: 10000, whtRate: 3, received: 0, pending: 0, status: 'pending', isPosted: false, postDate: '2026-11-16', payDate: '2026-12-16', creditTerm: 30, note: '', type: 'Photo' };
  const delivered = applyDelivered(working as never, '2026-11-16T01:00:00.000Z') as Record<string, unknown>;
  assert.equal(delivered.isPosted, true);
  assert.equal(delivered.pending, 9700, 'what is owed is worked out again (after 3% withholding)');
  assert.equal(delivered.postDate, '2026-11-16', 'its delivery date stays');
  assert.equal(delivered.payDate, '2026-12-16');
  assert.deepEqual(applyDelivered({ ...working, isPosted: true } as never, ''), { error: 'already_delivered' });
  assert.equal((applyDelivered({ ...working, status: 'done', received: 9700 } as never, '') as { pending: number }).pending, 0);

  const saved: unknown[] = [];
  let version = 3;
  const deps = {
    async loadJob() { return { data: working as never, version }; },
    async saveJob(_u: string, _id: string, v: number, data: unknown) { if (v !== 4) { version = 4; return false; } saved.push(data); return true; },
    today: () => '2026-11-16', now: () => new Date('2026-11-16T01:00:00Z'),
  };
  const reply = await handleDeliverAction({ user_id: 'u1' }, { kind: 'done', jobId: 'job-1' }, deps as never) as { text: string };
  assert.equal(reply.text, 'เรียบร้อยครับ เปลี่ยน "ถ่ายภาพเมนูใหม่" เป็นส่งแล้ว\nยอดรอรับ ฿9,700 ถึงวันรับเงินแล้วผมจะเตือนให้ครับ');
  assert.equal(saved.length, 1, 'saved on the second try, after another device saved first');
  const untouched = { async loadJob() { throw new Error('nothing is read'); }, async saveJob() { throw new Error('nothing is saved'); }, today: () => '', now: () => new Date() };
  assert.match((await handleDeliverAction({ user_id: 'u1' }, { kind: 'later', jobId: 'job-1' }, untouched as never) as { text: string }).text, /พรุ่งนี้ 08:00 ผมจะเตือนอีกครั้ง/);
  assert.match((await handleDeliverAction({ user_id: 'u1' }, { kind: 'done', jobId: 'demo-late' }, untouched as never) as { text: string }).text, /แจ้งเตือนตัวอย่าง/);
  const already = { ...deps, async loadJob() { return { data: { ...working, isPosted: true } as never, version: 1 }; } };
  assert.equal((await handleDeliverAction({ user_id: 'u1' }, { kind: 'done', jobId: 'job-1' }, already as never) as { text: string }).text, '"ถ่ายภาพเมนูใหม่" เปลี่ยนเป็นส่งแล้วไว้ก่อนแล้วครับ');
});

test('a ส่งแล้ว press reaches the assistant after the account and Pro checks, without the model', async () => {
  const { lineEventCommand } = await import('../backend/src/handlers/line-webhook.js');
  const { handleAssistantMessage } = await import('../backend/src/services/lineAssistant.js');
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: 'deliver:done:job-1' } } as never), 'deliver:done:job-1');
  const calls: string[] = [];
  const deps = {
    async findUserByLineId() { return { user_id: 'u1', jobs: [], goals: [], settings: {}, expenses: [], statuses: [] }; },
    async checkLinkedAccountWriteAccess() { return { allowed: true as const }; },
    async isProUser() { return true; },
    async classifyMessage() { calls.push('model'); throw new Error('the model must not be asked'); },
    async handleDeliverAction(_user: unknown, action: { kind: string }) { calls.push(`deliver:${action.kind}`); return { type: 'text', text: 'ok' }; },
  };
  const reply = await handleAssistantMessage('U1', 'deliver:done:job-1', 'op-deliver', deps as never);
  assert.deepEqual(calls, ['deliver:done']);
  assert.equal((reply?.[0] as { text?: string })?.text, 'ok');
  const expired = await handleAssistantMessage('U1', 'deliver:done:job-1', 'op-deliver-2', { ...deps, async isProUser() { return false; } } as never);
  assert.match(JSON.stringify(expired), /แพ็กเกจของบัญชีนี้หมดอายุ/);
  assert.deepEqual(calls, ['deliver:done']);
});

test('the email: work to deliver above the money due; a morning with only deliveries has its own heading and subject', async () => {
  const { buildDigestHtml, digestSubject } = await import('../backend/src/handlers/send-overdue-digest.js');
  const deliveries = findDeliveriesDue([job('late', { isPosted: false, postDate: '2026-11-14', name: 'ตัดต่อ <คลิป>' })], now);
  const only = buildDigestHtml([], deliveries);
  assert.ok(only.includes('งานที่ต้องส่งลูกค้า'));
  assert.ok(only.includes('📝 งานที่ต้องส่ง (1 งาน)'));
  assert.ok(only.includes('เลยกำหนดส่ง 2 วัน'));
  assert.ok(only.includes('ตัดต่อ &lt;คลิป&gt;'), 'names are escaped');
  assert.ok(!only.includes('OVERDUE CREDIT ALERT'));
  assert.equal(digestSubject([], deliveries), 'งานเลยกำหนดส่ง 1 งาน - กระรอกตุนเงิน');
  assert.equal(digestSubject([], findDeliveriesDue([job('s', { isPosted: false, postDate: '2026-11-17' })], now)), 'งานที่ต้องส่งเร็ว ๆ นี้ 1 งาน - กระรอกตุนเงิน');
  const money = [{ ...job('pay', { payDate: '2026-11-15' }), diffDays: -1 }];
  const both = buildDigestHtml(money, deliveries);
  assert.ok(both.includes('OVERDUE CREDIT ALERT'));
  assert.ok(both.indexOf('งานที่ต้องส่ง') < both.indexOf('เกินกำหนดชำระเงินแล้ว'), 'deliveries come first');
  assert.equal(digestSubject(money, deliveries), 'สรุปงานค้างชำระเลยกำหนด 1 รายการ - กระรอกตุนเงิน');
});
