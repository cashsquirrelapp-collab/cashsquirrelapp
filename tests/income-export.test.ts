import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomeRowsForMonth, incomeRowsForYear, sumIncome } from '../shared/incomeExport';

const base = { type: 'Sponsored Post', status: 'done', paymentStatus: 'paid', creditTerm: 0, note: '', isPosted: true } as any;

test('each payment is a row on the date the money arrived, with its share of the withholding tax', () => {
  const jobs = [
    { ...base, id: 'a', name: 'Full pay', client: 'A', value: 10000, whtRate: 3, whtAmount: 300, received: 9700, pending: 0, payDate: '2026-10-05' },
    // deposit in September, the rest in October
    { ...base, id: 'b', name: 'Deposit job', client: 'B', value: 20000, whtRate: 3, whtAmount: 600, received: 19400, pending: 0, depositAmount: 9700, depositDate: '2026-09-20', payDate: '2026-10-10' },
    // no money yet
    { ...base, id: 'c', name: 'Unpaid', client: 'C', value: 5000, whtRate: 0, received: 0, pending: 5000, status: 'pending', payDate: '2026-10-15' },
  ];
  const october = incomeRowsForMonth(jobs, '2026-10');
  assert.deepEqual(october.map(r => [r.date, r.jobName, r.received, r.wht, r.gross]), [
    ['2026-10-05', 'Full pay', 9700, 300, 10000],
    ['2026-10-10', 'Deposit job', 9700, 300, 10000],
  ]);
  assert.deepEqual(sumIncome(october), { gross: 20000, wht: 600, received: 19400 });
  const september = incomeRowsForMonth(jobs, '2026-09');
  assert.equal(september.length, 1);
  assert.equal(september[0].label, 'รับมัดจำ');
  const year = incomeRowsForYear(jobs, 2026);
  assert.equal(year.length, 3);
  assert.deepEqual(sumIncome(year), { gross: 30000, wht: 900, received: 29100 }); // matches both jobs' full values
});

test('installments count in the month each one was paid', () => {
  const job = { ...base, id: 'i', name: 'Installments', client: 'I', value: 3000, whtRate: 0, received: 2000, pending: 1000, status: 'installment',
    installments: [
      { id: 'i1', label: 'งวดที่ 1', amount: 1000, dueDate: '2026-08-01', status: 'paid', paidAt: '2026-08-03' },
      { id: 'i2', label: 'งวดที่ 2', amount: 1000, dueDate: '2026-09-01', status: 'paid', paidAt: '2026-09-02' },
      { id: 'i3', label: 'งวดที่ 3', amount: 1000, dueDate: '2026-10-01', status: 'pending' },
    ] };
  assert.deepEqual(incomeRowsForMonth([job], '2026-09').map(r => [r.label, r.received]), [['งวดที่ 2', 1000]]);
  assert.equal(incomeRowsForMonth([job], '2026-10').length, 0);
});
