import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import { sortJobs, groupsByMonth } from '../frontend/src/features/jobs/jobSort';

const job = (id: string, fields: Partial<Job>): Job => ({
  id, name: id, type: 'ยังไม่ระบุ', client: '', value: 1000, received: 0, pending: 1000,
  status: 'pending', creditTerm: 0, payDate: null, note: '', ...fields,
});

// List order as the app stores it: newest added first.
const jobs: Job[] = [
  job('net-jun', { postDate: '2026-06-03' }),
  job('today-added-last', { postDate: '2026-09-30' }),
  job('no-date', {}),
  job('skin-jul', { postDate: '2026-07-29' }),
  job('mae-sep', { postDate: '2026-09-30' }),
  job('dna-jul', { postDate: '2026-07-16' }),
  job('start-only-aug', { startDate: '2026-08-20' }),
  job('aug-early', { postDate: '2026-08-03' }),
  job('sep-early', { postDate: '2026-09-02' }),
];

test('ล่าสุด orders by the job date, current month first, newest day first, undated last', () => {
  assert.deepEqual(sortJobs(jobs, 'recent', 'all').map(j => j.id), [
    'today-added-last', 'mae-sep', 'sep-early',
    'start-only-aug', 'aug-early',
    'skin-jul', 'dna-jul',
    'net-jun',
    'no-date',
  ]);
});

test('เก่าสุด reverses the dates but still keeps undated jobs at the end', () => {
  const ids = sortJobs(jobs, 'oldest', 'all').map(j => j.id);
  assert.equal(ids[0], 'net-jun');
  assert.equal(ids.at(-1), 'no-date');
});

test('sorting only reorders the already-filtered list', () => {
  const filtered = jobs.filter(j => j.id.includes('jul') || j.id.includes('sep'));
  assert.deepEqual(sortJobs(filtered, 'recent', 'all').map(j => j.id), ['mae-sep', 'sep-early', 'skin-jul', 'dna-jul']);
});

test('รอรับเงิน orders by payment urgency, not by job month', () => {
  const awaiting = [
    job('due-later', { postDate: '2026-09-29', payDate: '2026-11-15' }),
    job('overdue', { postDate: '2026-06-01', payDate: '2026-09-01' }),
    job('due-soon', { postDate: '2026-05-01', payDate: '2026-10-02' }),
    job('no-due', {}),
  ];
  assert.deepEqual(sortJobs(awaiting, 'recent', 'waiting_payment').map(j => j.id), ['overdue', 'due-soon', 'due-later', 'no-due']);
  assert.equal(groupsByMonth('recent', 'waiting_payment'), false);
  assert.equal(groupsByMonth('recent', 'all'), true);
});

test('amount sorts ignore dates', () => {
  const byValue = [job('a', { value: 500 }), job('b', { value: 9000, postDate: '2020-01-01' }), job('c', { value: 3000 })];
  assert.deepEqual(sortJobs(byValue, 'amountDesc', 'all').map(j => j.id), ['b', 'c', 'a']);
  assert.deepEqual(sortJobs(byValue, 'amountAsc', 'all').map(j => j.id), ['a', 'c', 'b']);
});
