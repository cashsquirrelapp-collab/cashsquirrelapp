import test from 'node:test';
import assert from 'node:assert/strict';
import { bangkokToday, buildCreditRadar, radarCards } from '../frontend/src/features/receivables/radar/radarData.ts';
import type { Job } from '../shared/types.ts';

// The Credit Radar (owner's brief, 2026-10-30) reads the jobs with the receivables page's rules; green only for money
// that really came in; days on the Bangkok calendar.

const job = (over: Partial<Job>): Job => ({
  id: 'x', name: 'งาน', value: 1000, received: 0, pending: 1000, client: 'ลูกค้า', type: 'Design', status: 'pending',
  creditTerm: 30, note: '', payDate: null, isPosted: true, paymentStatus: 'unpaid', ...over,
} as Job);

test('Bangkok today: 23:30 UTC on 30 Oct is already 31 Oct in Bangkok', () => {
  assert.equal(bangkokToday(new Date('2026-10-30T23:30:00Z')), '2026-10-31');
  assert.equal(bangkokToday(new Date('2026-10-30T10:00:00Z')), '2026-10-30');
});

test('overdue, due soon, later and just paid are told apart; received money is never owed', () => {
  const today = '2026-10-30';
  const data = buildCreditRadar([
    job({ id: 'late', pending: 45000, payDate: '2026-09-08', postDate: '2026-08-09' }),
    job({ id: 'today', pending: 3000, payDate: '2026-10-30' }),
    job({ id: 'soon', pending: 12500, payDate: '2026-11-06' }),
    job({ id: 'later', pending: 6000, payDate: '2026-11-20' }),
    job({ id: 'paid', pending: 0, received: 8600, value: 8600, paymentStatus: 'paid', status: 'done', payDate: '2026-10-25' }),
    job({ id: 'paid-long-ago', pending: 0, received: 5000, paymentStatus: 'paid', status: 'done', payDate: '2026-09-01' }),
    job({ id: 'not-sent', pending: 9000, payDate: '2026-09-01', isPosted: false }),
    job({ id: 'partial-paid-flag', pending: 500, paymentStatus: 'paid', payDate: '2026-10-29' }),
  ], today);
  // A job still owing money is owed, whatever its flag says ("partial-paid-flag", one day late).
  assert.deepEqual(data.overdue.map(item => [item.id, item.days]), [['late', 52], ['partial-paid-flag', 1]]);
  assert.deepEqual(data.soon.map(item => [item.id, item.days]), [['today', 0], ['soon', 7]]);
  assert.deepEqual(data.later.map(item => item.id), ['later']);
  // Paid in the last 7 days only; a job not sent yet is not on the radar.
  assert.deepEqual(data.received.map(item => [item.id, item.amount, item.days]), [['paid', 8600, 5]]);
  assert.equal(data.totals.outstanding, 45000 + 3000 + 12500 + 6000 + 500);
  assert.equal(data.totals.overdue, 45500);
  assert.equal(data.totals.soon, 15500);
  assert.equal(data.totals.followUp, 4);
  assert.equal(data.totals.received, 8600);
});

test('cards come in order of what needs a look first, and only as many as fit', () => {
  const data = buildCreditRadar([
    job({ id: 'later', payDate: '2026-12-01' }),
    job({ id: 'paid', pending: 0, received: 100, paymentStatus: 'paid', payDate: '2026-10-29' }),
    job({ id: 'soon', payDate: '2026-11-02' }),
    job({ id: 'late', payDate: '2026-10-01' }),
  ], '2026-10-30');
  assert.deepEqual(radarCards(data, 10).map(item => item.id), ['late', 'soon', 'paid', 'later']);
  assert.deepEqual(radarCards(data, 2).map(item => item.id), ['late', 'soon']);
});
