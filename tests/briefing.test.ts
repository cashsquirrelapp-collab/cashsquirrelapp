import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefing, financialRadar, markSeen, type BriefingInput } from '../shared/briefing';
import { findJobsNeedingAttention as sharedRule } from '../shared/dueJobs';
import { findJobsNeedingAttention as lineRule } from '../backend/src/services/lineReminders';
import type { Invoice, Job } from '../shared/types';

// Krarok Intelligence Briefing (owner's Master Product Backlog, Part 6, 2026-10-25): rules only, from saved data.
// Synthetic jobs; the clock is fixed at 22 Oct 2569 09:00 Bangkok.

const NOW = new Date('2026-10-22T02:00:00Z');
const job = (id: string, over: Partial<Job>): Job => ({ id, name: id, type: 'Other', client: 'ลูกค้าตัวอย่าง', value: 10_000, received: 0, pending: 10_000,
  status: 'pending', creditTerm: 30, payDate: null, note: '', ...over });
const base = (over: Partial<BriefingInput> = {}): BriefingInput => ({ jobs: [], expenses: [], now: NOW, ...over });

test('briefing: overdue, due today and due soon, in that order, with the LINE 08:00 rule', () => {
  const jobs = [
    job('โลโก้', { pending: 12_000, payDate: '2026-09-22' }), job('เว็บ', { pending: 30_000, payDate: '2026-10-22' }),
    job('วิดีโอ', { pending: 8_000, payDate: '2026-10-24' }), job('ไกล', { pending: 50_000, payDate: '2026-11-30' }),
    job('รับครบ', { pending: 0, received: 5_000, payDate: '2026-09-01' }),
  ];
  const { items, day } = buildBriefing(base({ jobs }));
  assert.equal(day, '2026-10-22');
  assert.deepEqual(items.map(item => [item.kind, item.count, item.amount]), [['overdue', 1, 12_000], ['due_today', 1, 30_000], ['due_soon', 1, 8_000]]);
  assert.equal(items[0].title, 'เลยกำหนดรับเงิน 1 รายการ');
  assert.equal(items[0].detail, 'รวม ฿12,000 · นานสุด 30 วัน (โลโก้)');
  assert.deepEqual(items[0].action, { label: 'ดูรายการรอรับเงิน', page: 'receivables' });
  assert.equal(lineRule, sharedRule, 'the briefing and the LINE reminder use one rule');
  assert.ok(items.length <= 3);
});

test('briefing: an installment counts on its own date; a seen item steps back the same day only', () => {
  const jobs = [job('ผ่อน', { pending: 20_000, installments: [
    { id: 'i1', label: 'งวด 1', amount: 10_000, dueDate: '2026-10-20', paidAt: null, status: 'pending' },
    { id: 'i2', label: 'งวด 2', amount: 10_000, dueDate: '2026-12-20', paidAt: null, status: 'pending' }] as Job['installments'] }),
    job('วันนี้', { pending: 3_000, payDate: '2026-10-22' })];
  const first = buildBriefing(base({ jobs }));
  assert.deepEqual(first.items.map(item => [item.kind, item.amount]), [['overdue', 10_000], ['due_today', 3_000]]);
  const seen = markSeen({ 'old:key': '2026-10-01' }, first);
  assert.deepEqual(Object.keys(seen).sort(), first.items.map(item => item.key).sort(), 'yesterday\'s keys are dropped');
  const again = buildBriefing(base({ jobs, seen: { [first.items[0].key]: '2026-10-22' } }));
  assert.equal(again.items[0].kind, 'due_today', 'already seen today: the next one leads');
  const tomorrow = buildBriefing(base({ jobs, seen: { [first.items[0].key]: '2026-10-22' }, now: new Date('2026-10-23T02:00:00Z') }));
  assert.equal(tomorrow.items[0].kind, 'overdue', 'a new day: shown again');
});

test('radar: received, overdue, expected in 30 days and recurring costs, a forecast; unknown without cash', () => {
  const jobs = [
    job('รับแล้ว', { received: 7_000, pending: 0, payDate: '2026-10-05' }),
    job('เลย', { pending: 4_000, payDate: '2026-10-01' }),
    job('รอ', { pending: 6_000, payDate: '2026-11-10' }),
    job('ไกล', { pending: 9_000, payDate: '2026-12-01' }),
  ];
  const fixedExpenseItems = [{ id: 'f1', name: 'ค่าห้อง', amount: 5_000 }, { id: 'f2', name: 'ค่าเน็ต', amount: 600 }];
  const expenses = [{ id: 'e1', name: 'ค่าเน็ต', category: 'Fixed', amount: 600, date: '2026-10-03' }];
  const radar = financialRadar(base({ jobs, expenses, fixedExpenseItems, monthlyExpense: 5_600 }));
  // 22 Oct + 29 days = 20 Nov: this month's rent (internet already paid) + all of November's recurring costs.
  assert.deepEqual([radar.receivedThisMonth, radar.overdue, radar.expected30, radar.knownCosts30, radar.cashNow, radar.projected30, radar.risk, radar.forecast],
    [7_000, 4_000, 6_000, 10_600, null, null, 'unknown', true]);
  assert.equal(financialRadar(base({ jobs, expenses, fixedExpenseItems, cashNow: 20_000 })).risk, 'ok');
  assert.deepEqual([financialRadar(base({ jobs, expenses, fixedExpenseItems, cashNow: 8_000 })).risk, financialRadar(base({ jobs, expenses, fixedExpenseItems, cashNow: 1_000 })).risk], ['watch', 'short']);
});

test('briefing: money that may run short is a forecast and leads; fixed costs are never asked again; quotations waiting a week', () => {
  const fixedExpenseItems = [{ id: 'f1', name: 'ค่าห้อง', amount: 8_000 }];
  const short = buildBriefing(base({ jobs: [job('วันนี้', { pending: 2_000, payDate: '2026-10-22' })], fixedExpenseItems, cashNow: 1_000 }));
  // Owner, 2026-10-28: fixed costs entered in Settings already count in the month, so there is no "not recorded" item.
  assert.deepEqual(short.items.map(item => item.kind), ['cash_short', 'due_today']);
  assert.equal(short.items.some(item => /ยังไม่บันทึก/.test(item.title)), false);
  assert.equal(short.items[0].forecast, true);
  assert.match(short.items[0].detail, /^คาดการณ์: เงินในแอป ฿1,000 \+ รอรับ ฿2,000 − รายจ่ายประจำ ฿16,000 = −฿13,000$/);
  assert.equal(buildBriefing(base({ fixedExpenseItems, now: new Date('2026-10-28T02:00:00Z') })).items.length, 0, 'late in the month: still nothing to record');

  const doc = (id: string, createdDate: string, over: Partial<Invoice> = {}) => ({ id, documentType: 'quotation', documentNo: id, createdDate, ...over }) as Invoice;
  const invoices = [doc('QT-1', '2026-10-01'), doc('QT-2', '2026-10-20'), doc('QT-3', '2026-10-02', { responseDate: '2026-10-05' }), doc('QT-4', '2026-10-03'),
    { ...doc('INV-1', '2026-10-06'), documentType: 'invoice', linkedFromId: 'QT-4' } as Invoice];
  const quotes = buildBriefing(base({ invoices })).items;
  assert.deepEqual(quotes.map(item => [item.kind, item.count, item.detail]), [['quote_waiting', 1, 'ฉบับที่รอนานสุด 21 วัน']]);
  assert.deepEqual(quotes[0].action, { label: 'เปิดใบเสนอราคา', page: 'quotation' });
  assert.deepEqual(buildBriefing(base()).items, [], 'nothing to say: nothing shown');
});
