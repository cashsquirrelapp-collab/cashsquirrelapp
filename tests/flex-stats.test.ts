import test from 'node:test';
import assert from 'node:assert/strict';
import { achievements, growth, receivedByMonth, shiftMonthKey, wrapped } from '../shared/flexStats';
import type { Invoice, Job } from '../shared/types';

// Flex Display and Story Flex figures (Master Backlog Part 7–8): saved data only, nothing estimated.
// Synthetic jobs; the clock is 22 Oct 2569 09:00 Bangkok.

const NOW = new Date('2026-10-22T02:00:00Z');
const job = (id: string, over: Partial<Job>): Job => ({ id, name: id, type: 'Other', client: 'ลูกค้า A', value: 0, received: 0, pending: 0,
  status: 'done', creditTerm: 0, payDate: null, note: '', ...over });
const paid = (id: string, amount: number, date: string, client = 'ลูกค้า A') => job(id, { value: amount, received: amount, pending: 0, payDate: date, client });

test('months: received per Bangkok month, oldest first; months roll over the year', () => {
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(shiftMonthKey('2026-11', 2), '2027-01');
  const jobs = [paid('a', 5_000, '2026-09-30'), paid('b', 7_000, '2026-10-01'), paid('c', 1_000, '2026-04-30'), job('owed', { value: 9_000, pending: 9_000, payDate: '2026-10-10' })];
  assert.deepEqual(receivedByMonth(jobs, 3, NOW), [{ month: '2026-08', amount: 0 }, { month: '2026-09', amount: 5_000 }, { month: '2026-10', amount: 7_000 }]);
});

test('growth: percent against last month, streak, best month; nothing to compare is null, never 0%', () => {
  const rising = [paid('m', 4_000, '2026-08-10'), paid('s', 5_000, '2026-09-10'), paid('o', 6_900, '2026-10-10'), paid('may', 9_000, '2026-05-10')];
  const g = growth(rising, NOW);
  assert.deepEqual([g.amount, g.previous, g.percent, g.streak, g.best, g.monthsWithData], [6_900, 5_000, 38, 3, false, 4], 'May was higher: not the best month');
  assert.equal(growth([paid('s', 5_000, '2026-09-10'), paid('o', 6_900, '2026-10-10')], NOW).best, true);
  const fresh = growth([paid('o', 6_900, '2026-10-10')], NOW);
  assert.deepEqual([fresh.percent, fresh.streak, fresh.monthsWithData], [null, 1, 1]);
  assert.equal(growth([paid('s', 5_000, '2026-09-10')], NOW).percent, -100);
});

test('wrapped: jobs paid in full this month, distinct clients, payments, quotations; unknown documents stay unknown', () => {
  const jobs = [paid('a', 3_000, '2026-10-02', 'ร้าน ก'), paid('b', 2_000, '2026-10-03', 'ร้าน ก '), paid('c', 4_000, '2026-10-05', 'ร้าน ข'),
    paid('old', 9_000, '2026-09-05'), job('part', { value: 10_000, received: 4_000, pending: 6_000, depositAmount: 4_000, depositDate: '2026-10-07', payDate: '2026-11-07', client: 'ร้าน ค' })];
  const docs = [{ id: 'q1', documentType: 'quotation', createdDate: '2026-10-01' }, { id: 'q2', documentType: 'quotation', createdDate: '2026-09-30' },
    { id: 'i1', documentType: 'invoice', createdDate: '2026-10-02' }] as Invoice[];
  const w = wrapped(jobs, docs, NOW);
  assert.deepEqual([w.month, w.jobsDone, w.clients, w.payments, w.received, w.quotations], ['2026-10', 3, 3, 4, 13_000, 1]);
  assert.equal(wrapped(jobs, null, NOW).quotations, null);
});

test('achievements: the day ฿10K and ฿100K were first reached, the 10th job paid off, the best month; nothing not yet reached', () => {
  const jobs = Array.from({ length: 10 }, (_, i) => paid(`j${i}`, 12_000, `2026-0${Math.min(9, 1 + Math.floor(i / 2))}-1${i % 2}`));
  const found = achievements(jobs, NOW);
  assert.deepEqual(found.map(a => [a.kind, a.date, a.amount]), [
    ['received_10k', '2026-01-10', 10_000], ['received_100k', '2026-05-10', 100_000], ['jobs_10', '2026-05-11', null], ['best_month', '2026-05-01', 24_000],
  ]);
  assert.deepEqual(achievements([paid('a', 3_000, '2026-10-01')], NOW), [], 'one small month: nothing to celebrate yet');
  assert.deepEqual(achievements([paid('future', 50_000, '2026-12-01')], NOW), [], 'a date after today is not reached');
});
