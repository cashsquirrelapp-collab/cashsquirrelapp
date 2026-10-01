import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import { buildCashTimeline } from '../frontend/src/features/calendar/cashTimeline';

const job = (id: string, fields: Partial<Job>): Job => ({
  id, name: id, type: 'ยังไม่ระบุ', client: 'c', value: 10000, received: 0, pending: 10000,
  status: 'pending', creditTerm: 0, payDate: null, note: '', isPosted: true, ...fields,
});
const run = (jobs: Job[], months = 4) => buildCashTimeline(jobs, { todayKey: '2026-10-02', fromMonth: '2026-10', months });
const month = (t: ReturnType<typeof run>, key: string) => t.months.find(m => m.monthKey === key)!;

test('credit-term payment lands in its expected month with days to go', () => {
  const t = run([job('a', { postDate: '2026-09-28', creditTerm: 30, payDate: '2026-10-28', pending: 6665 })]);
  const oct = month(t, '2026-10');
  assert.equal(oct.expected, 6665);
  assert.equal(oct.items[0].status, 'expected');
  assert.equal(oct.items[0].days, 26);
});

test('0-day credit due today is due soon; overdue from last month carries into this month once', () => {
  const t = run([
    job('today', { postDate: '2026-10-02', payDate: '2026-10-02', pending: 1000 }),
    job('late', { postDate: '2026-09-20', payDate: '2026-09-20', pending: 2000 }),
  ], 2);
  const oct = month(t, '2026-10');
  assert.deepEqual(oct.items.map(i => [i.jobId, i.status, i.carriedOver]), [['late', 'overdue', true], ['today', 'dueSoon', false]]);
  assert.equal(oct.expected, 3000);
  assert.equal(t.months.flatMap(m => m.items).filter(i => i.jobId === 'late').length, 1);
});

test('fully paid money is received, not outstanding', () => {
  const t = run([job('paid', { status: 'done', received: 9700, pending: 0, payDate: '2026-10-05' })]);
  const oct = month(t, '2026-10');
  assert.equal(oct.received, 9700);
  assert.equal(oct.expected, 0);
  assert.equal(oct.items[0].status, 'received');
});

test('partial payment: deposit received on its date, only the remainder expected', () => {
  const t = run([job('p', { status: 'partial', received: 3000, pending: 7000, depositAmount: 3000, depositDate: '2026-10-01', payDate: '2026-11-15' })]);
  assert.equal(month(t, '2026-10').received, 3000);
  assert.equal(month(t, '2026-10').expected, 0);
  assert.equal(month(t, '2026-11').expected, 7000);
});

test('installments appear in their own months, never the whole contract up front', () => {
  const rows = [
    { id: 'i1', label: 'งวดที่ 1', amount: 10000, dueDate: '2026-10-10', paidAt: '2026-10-01', status: 'paid' as const },
    { id: 'i2', label: 'งวดที่ 2', amount: 10000, dueDate: '2026-11-10', paidAt: null, status: 'pending' as const },
    { id: 'i3', label: 'งวดที่ 3', amount: 10000, dueDate: '2026-12-10', paidAt: null, status: 'pending' as const },
  ];
  const t = run([job('web', { status: 'installment', value: 30000, received: 10000, pending: 20000, installments: rows, payDate: '2026-11-10' })]);
  assert.deepEqual(t.months.map(m => [m.monthKey, m.received, m.expected]), [
    ['2026-10', 10000, 0], ['2026-11', 0, 10000], ['2026-12', 0, 10000], ['2027-01', 0, 0],
  ]);
  assert.equal(month(t, '2026-11').items[0].part, 'งวดที่ 2');
});

test('WHT: the timeline uses the net amount stored on the job', () => {
  const t = run([job('wht', { value: 10000, whtRate: 3, whtAmount: 300, pending: 9700, payDate: '2026-10-20' })]);
  assert.equal(month(t, '2026-10').expected, 9700);
});

test('undelivered work without a delivery date is undated, not guessed from its start date', () => {
  const t = run([job('wip', { isPosted: false, startDate: '2026-09-01', postDate: undefined, pending: 5000 })]);
  assert.equal(t.months.every(m => m.items.length === 0), true);
  assert.deepEqual(t.undated, { count: 1, amount: 5000 });
});

test('months with nothing stay empty and totals never double count', () => {
  const t = run([job('a', { payDate: '2026-12-01', pending: 500 })]);
  assert.equal(month(t, '2026-11').items.length, 0);
  assert.equal(t.months.reduce((sum, m) => sum + m.total, 0), 500);
});
