import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLineInbox, inboxReply } from '../backend/src/ai/lineInbox';
import { dueShortRef } from '../backend/src/services/lineDuePayments';
import type { UserRow } from '../backend/src/services/lineAssistant';

// The app's "แจ้งเตือนอัตโนมัติ" thread is this account's own data, with LINE's rules (owner, 2026-10-24).

const NOW = new Date('2026-10-24T05:00:00Z'); // 12:00 in Bangkok
const job = (id: string, name: string, pending: number, payDate: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, name, client: 'ลูกค้าตัวอย่าง', type: 'งาน', note: '', value: pending, received: 0, pending, status: 'pending', creditTerm: 0, isPosted: true, postDate: '2026-10-01', payDate, ...extra });
const account = (over: Partial<UserRow> = {}): UserRow => ({
  user_id: '11111111-1111-4111-8111-111111111111', statuses: [], goals: [], expenses: [], settings: {},
  jobs: [
    job('job-late', 'ออกแบบโลโก้', 12000, '2026-10-20'),
    job('job-today', 'แบนเนอร์', 3500, '2026-10-24'),
    job('job-soon', 'เว็บไซต์', 19100, '2026-10-26'),
    job('job-later', 'ตัดต่อวิดีโอ', 8000, '2026-11-20'),
    job('job-paid', 'ถ่ายภาพ', 0, '2026-10-21', { received: 8000, value: 8000, status: 'done' }),
    job('job-wip', 'ออกแบบเมนู', 4500, null, { isPosted: false }),
  ] as any,
  notif_settings: { lineUserId: 'U-example', dailyDigestEnabled: true } as any,
  ...over,
});

test('the 08:00 reminder holds this account\'s overdue, due-today and soon jobs, with real payment buttons', () => {
  const inbox = buildLineInbox(account(), NOW);
  const reminder = inbox.notices.find(notice => notice.id === 'reminder-2026-10-24')!;
  assert.ok(reminder, 'a reminder for today');
  assert.equal(reminder.at, Date.parse('2026-10-24T01:00:00Z'), 'sent at 08:00 Bangkok');
  assert.equal(reminder.card.metric?.value, '฿ 34,600');
  const sections = reminder.card.blocks.filter(block => block.kind === 'section') as any[];
  assert.deepEqual(sections.map(section => section.title), ['เลยกำหนด · 1 รายการ', 'ครบกำหนดวันนี้ · 1 รายการ', 'ใกล้ครบกำหนด · 1 รายการ']);
  const [late, today, soon] = sections.map(section => section.items[0]);
  assert.deepEqual([late.id, late.due, today.due, soon.due], ['job-late', true, true, undefined], 'buttons only on money already due');
  assert.equal(late.prompt, `รับเงินบางส่วน #${dueShortRef({ jobId: 'job-late' })} ยอด `);
  assert.match(late.meta, /เลย 4 วัน/);
  assert.ok(!JSON.stringify(inbox).includes('ตัดต่อวิดีโอ') || !JSON.stringify(reminder).includes('ตัดต่อวิดีโอ'), 'a job due next month is not in the reminder');
  assert.deepEqual([inbox.lineLinked, inbox.reminderOn], [true, true]);
});

test('the monthly summary and the quick replies come from the same data', () => {
  const inbox = buildLineInbox(account(), NOW);
  assert.ok(inbox.notices.some(notice => notice.id === 'month-2026-09' && notice.card.title === 'สรุปการเงินประจำเดือน'));
  // Same rule as LINE's รอรับเงิน button: every job with money still owed, work in progress included, undated last.
  assert.equal(inbox.quick.unpaid.metric?.note, '5 งาน');
  assert.deepEqual((inbox.quick.unpaid.blocks[0] as any).items.map((item: any) => item.name), ['ออกแบบโลโก้', 'แบนเนอร์', 'เว็บไซต์', 'ตัดต่อวิดีโอ', 'ออกแบบเมนู']);
  assert.equal(inbox.quick.wip.metric?.value, '1 งาน');
  assert.equal(inbox.quick.month.title, 'สรุปเดือนนี้');
});

test('no money due: no reminder; LINE not linked: said so, the cards still show what LINE would send', () => {
  const inbox = buildLineInbox(account({ jobs: [job('job-later', 'ตัดต่อวิดีโอ', 8000, '2026-11-20')] as any, notif_settings: {} as any }), NOW);
  assert.ok(!inbox.notices.some(notice => notice.id.startsWith('reminder-')));
  assert.deepEqual([inbox.lineLinked, inbox.reminderOn], [false, false]);
});

test('a payment button answer becomes the receipt card, ได้ไม่ครบ gives the text to type the amount after', () => {
  const receipt = inboxReply({ kind: 'receipt', job: { id: 'job-late', name: 'ออกแบบโลโก้', client: 'ลูกค้าตัวอย่าง', value: 12000, received: 12000, pending: 0 } as any, amount: 12000, full: true });
  assert.equal(receipt.card?.title, 'บันทึกรับเงินแล้ว');
  assert.equal(receipt.card?.metric?.value, '฿ 12,000');
  const partial = inboxReply({ kind: 'text', text: 'พิมพ์ยอดที่ได้รับต่อท้ายข้อความนี้แล้วกดส่งครับ\nรับเงินบางส่วน #ABC123 ยอด 5000' });
  assert.deepEqual(partial, { text: 'พิมพ์ยอดที่ได้รับต่อท้ายข้อความนี้แล้วกดส่งครับ', prompt: 'รับเงินบางส่วน #ABC123 ยอด ' });
});
