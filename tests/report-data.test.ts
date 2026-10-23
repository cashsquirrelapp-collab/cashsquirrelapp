import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import { buildReport, creditAging, jobsInBucket, periodStart } from '../frontend/src/features/report/reportData';

const job = (fields: Partial<Job>): Job => ({
  id: Math.random().toString(36).slice(2), name: 'งาน', type: 'Sponsored Post', client: 'A', value: 1000, received: 1000, pending: 0,
  status: 'paid', creditTerm: 0, payDate: null, note: '', startDate: '2026-01-01', ...fields,
});
const now = new Date(2026, 9, 2); // 2 Oct 2026

test('period start covers this month and the months before it', () => {
  assert.equal(periodStart('3', now), '2026-08-01');
  assert.equal(periodStart('12', now), '2025-11-01');
  assert.equal(periodStart('all', now), null);
});

test('income counts money received inside the period, ranked by client and type', () => {
  const jobs = [
    job({ client: 'DD', received: 3000, value: 3000, payDate: '2026-09-10', postDate: '2026-09-01' }),
    job({ client: 'DD', type: 'Video', received: 2000, value: 2000, payDate: '2026-10-01', postDate: '2026-09-20' }),
    job({ client: 'Skin', received: 1500, value: 1500, payDate: '2026-08-05', postDate: '2026-08-01' }),
    job({ client: 'Old', received: 9000, value: 9000, payDate: '2026-02-01', postDate: '2026-01-20' }),
  ];
  const r = buildReport(jobs, '3', now);
  assert.equal(r.totalReceived, 6500);
  assert.equal(r.jobCount, 3);
  assert.deepEqual(r.byClient.map(b => [b.key, b.received]), [['DD', 5000], ['Skin', 1500]]);
  assert.deepEqual(r.byType.map(b => [b.key, b.received, b.count]), [['Sponsored Post', 4500, 2], ['Video', 2000, 1]]);
  assert.deepEqual(r.months.map(m => [m.monthKey, m.received, m.paidJobs]), [['2026-08', 1500, 1], ['2026-09', 3000, 1], ['2026-10', 2000, 1]]);
  assert.ok(Math.abs(r.concentration - 5000 / 6500) < 1e-9);
  // Skin and DD both first appeared inside the period; nobody is a returning client here.
  assert.deepEqual(r.retention, { newClients: 2, newRevenue: 6500, repeatClients: 0, repeatRevenue: 0 });
  assert.equal(jobsInBucket(jobs, '3', 'client', 'DD', now).length, 2);
});

test('a client seen before the period counts as returning; all-time has no new/returning split', () => {
  const jobs = [
    job({ client: 'Old', received: 9000, payDate: '2026-02-01', postDate: '2026-01-20' }),
    job({ client: 'Old', received: 4000, payDate: '2026-09-15', postDate: '2026-09-10' }),
  ];
  assert.deepEqual(buildReport(jobs, '3', now).retention, { newClients: 0, newRevenue: 0, repeatClients: 1, repeatRevenue: 4000 });
  const all = buildReport(jobs, 'all', now);
  assert.equal(all.retention, null);
  assert.equal(all.months[0].monthKey, '2026-02');
  assert.equal(all.months.at(-1)?.monthKey, '2026-09');
});

test('an empty period reports zeros without dividing by zero', () => {
  const r = buildReport([], '6', now);
  assert.deepEqual([r.totalReceived, r.avgPerJob, r.avgPerClient, r.concentration, r.byClient.length], [0, 0, 0, 0, 0]);
  assert.equal(r.months.length, 6);
});

test('credit aging buckets money owed by due date and accounts for every baht', () => {
  const owed = (payDate: string | null, pending: number, extra: Partial<Job> = {}) =>
    job({ received: 0, pending, value: pending, payDate, postDate: payDate ?? undefined, status: 'pending', ...extra });
  const jobs = [
    owed('2026-09-20', 8000), owed('2026-10-02', 2500), owed('2026-10-08', 6000),
    owed('2026-10-15', 4500), owed('2026-10-30', 12000), owed('2026-12-01', 1000),
    owed('2026-10-05', 999, { isPosted: false }), // not delivered yet: not a receivable
  ];
  const a = creditAging(jobs, '2026-10-02');
  assert.deepEqual(a.buckets.map(b => [b.key, b.amount]), [
    ['overdue', 8000], ['today', 2500], ['within7', 6000], ['within14', 4500], ['within30', 12000], ['later', 1000],
  ]);
  assert.deepEqual([a.total, a.count], [34000, 6]);
});
