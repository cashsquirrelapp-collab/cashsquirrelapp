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

test('the LINE messages: plain words from เลขา, one per job (owner: "ส่งมาเป็นทีละข้อความดิ"), by name, the work and the client', async () => {
  const { buildDeliveryTexts } = await import('../backend/src/services/lineReminders.js');
  const texts = (messages: { type: string; text?: string }[]) => messages.map(message => { assert.equal(message.type, 'text'); return message.text; });
  const at = (postDate: string, over: Partial<JobRow> = {}) => findDeliveriesDue([job('x', { isPosted: false, postDate, name: 'ถ่ายภาพเมนูใหม่', client: 'ร้านตัวอย่าง', ...over })], now);
  assert.deepEqual(texts(buildDeliveryTexts(at('2026-11-16'), { name: 'ปาร์ค' })), ['คุณปาร์ค วันนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ร้านตัวอย่าง นะครับ']);
  assert.deepEqual(texts(buildDeliveryTexts(at('2026-11-17'))), ['พรุ่งนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ร้านตัวอย่าง นะครับ']);
  assert.deepEqual(texts(buildDeliveryTexts(at('2026-11-18', { client: '' }), { name: '  ' })), ['อีก 2 วันต้องส่ง ถ่ายภาพเมนูใหม่ นะครับ']);
  assert.deepEqual(texts(buildDeliveryTexts(at('2026-11-14'), { name: 'ปาร์ค' })),
    ['คุณปาร์ค ถ่ายภาพเมนูใหม่ ให้ร้านตัวอย่าง เลยกำหนดส่งมา 2 วันแล้วนะครับ', 'ถ้าส่งไปแล้ว เปลี่ยนสถานะงานในแอปได้เลยครับ ผมจะได้ไม่เตือนซ้ำ']);
  const many = findDeliveriesDue([
    job('late', { isPosted: false, postDate: '2026-11-15', name: 'ตัดต่อคลิปรีวิว', client: 'ลูกค้า D' }),
    job('today', { isPosted: false, postDate: '2026-11-16', name: 'ถ่ายภาพเมนูใหม่', client: 'ลูกค้า E' }),
    job('soon', { isPosted: false, postDate: '2026-11-18', name: 'ออกแบบโปสเตอร์', client: 'ลูกค้า F' }),
  ], now);
  // Most urgent first; only the first message carries the name; the tip last.
  assert.deepEqual(texts(buildDeliveryTexts(many, { name: 'ปาร์ค', room: 4 })), [
    'คุณปาร์ค ตัดต่อคลิปรีวิว ให้ลูกค้า D เลยกำหนดส่งมา 1 วันแล้วนะครับ',
    'วันนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ลูกค้า E นะครับ',
    'อีก 2 วันต้องส่ง ออกแบบโปสเตอร์ ให้ลูกค้า F นะครับ',
    'ถ้าส่งไปแล้ว เปลี่ยนสถานะงานในแอปได้เลยครับ ผมจะได้ไม่เตือนซ้ำ',
  ]);
  // A push holds 5 messages and the เตือนรับเงิน card keeps one: with no room for all, the last one counts the rest.
  assert.deepEqual(texts(buildDeliveryTexts(many, { name: 'ปาร์ค', room: 3 })), [
    'คุณปาร์ค ตัดต่อคลิปรีวิว ให้ลูกค้า D เลยกำหนดส่งมา 1 วันแล้วนะครับ',
    'วันนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ลูกค้า E นะครับ',
    'และยังมีงานที่ต้องส่งอีก 1 งาน ดูในแอปได้ครับ',
  ]);
  const seven = findDeliveriesDue(Array.from({ length: 7 }, (_, i) => job(`j${i}`, { isPosted: false, postDate: '2026-11-17', name: i === 0 ? 'ก'.repeat(80) : `งาน ${i}`, client: '' })), now);
  const out = texts(buildDeliveryTexts(seven, { room: 4 }));
  assert.equal(out.length, 4);
  assert.equal(out[3], 'และยังมีงานที่ต้องส่งอีก 4 งาน ดูในแอปได้ครับ');
  assert.ok(out[0]!.includes(`${'ก'.repeat(59)}…`), 'long names are cut');
  assert.equal(buildDeliveryTexts(seven).length, 5, 'never more than a push holds');
  assert.ok(out.every(text => !/[\u{1F300}-\u{1FAFF}]/u.test(text!)), 'no emoji');
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
