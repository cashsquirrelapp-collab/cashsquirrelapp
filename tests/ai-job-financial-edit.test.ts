import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateJobFinancialEdit } from '../backend/src/ai/jobFinancialEdit.js';
import { incomeRowsForYear, sumIncome } from '../shared/incomeExport.js';
import { getJobPaymentEntries } from '../shared/installmentPayments.js';
import { validateChanges } from '../shared/validation.js';
import type { Job, StatusOption } from '../shared/types.js';

const today = '2026-10-24';
const statuses: StatusOption[] = [
  { id: 'pending', label: 'รอรับ', behavior: 'pending' },
  { id: 'partial', label: 'รับบางส่วน', behavior: 'partial' },
  { id: 'done', label: 'รับครบ', behavior: 'done' },
];
const job = (overrides: Partial<Job> = {}): Job => ({ id: 'job-a', name: 'งานเดิม', client: 'ลูกค้า', type: 'บริการ', value: 10000,
  received: 0, pending: 9700, whtRate: 3, whtAmount: 300, status: 'pending', paymentStatus: 'unpaid',
  creditTerm: 30, postDate: '2026-10-20', isPosted: false, payDate: '2026-11-19', note: 'keep', installments: [], ...overrides });
function successful(source: Job, args: Record<string, unknown>, selected = statuses) {
  const before = structuredClone(source);
  const result = calculateJobFinancialEdit(source, selected, args, today);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(source, before, 'the authenticated snapshot is never mutated');
  const record = { ...source, ...result.patch };
  assert.equal(validateChanges([{ table: 'cashflow_jobs', id: source.id, op: 'set', version: 7, data: record }]).length, 1);
  return { ...result, record };
}
function refused(source: Job, args: Record<string, unknown>) {
  const before = structuredClone(source);
  const result = calculateJobFinancialEdit(source, statuses, args, today);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.deepEqual(source, before);
  if (result.ok) throw new Error('Expected refusal');
  assert.ok(result.error);
  return result;
}

test('no withholding and fully paid form one validated patch, preserving delivery and showing the financial consequences', () => {
  const result = successful(job(), { wht_rate: 0, payment_status: 'paid' });
  assert.deepEqual([result.record.whtRate, result.record.whtAmount, result.record.received, result.record.pending, result.record.status, result.record.paymentStatus, result.record.payDate], [0, 0, 10000, 0, 'done', 'paid', today]);
  assert.equal(result.record.isPosted, false);
  assert.equal(result.record.postDate, '2026-10-20');
  assert.equal(result.record.note, 'keep');
  assert.equal(result.patch.isPosted, undefined);
  assert.equal(result.patch.postDate, undefined);
  const review = JSON.stringify(result.changes);
  for (const text of ['3%', '0%', '฿300', '฿10,000', '฿9,700', 'ยอดรับสะสม', 'ยอดคงค้าง', today, 'รับครบแล้ว']) assert.ok(review.includes(text), text);
  assert.deepEqual(sumIncome(incomeRowsForYear([result.record], 2026)), { gross: 10000, received: 10000, wht: 0 });
});

test('gross value and custom WHT are recalculated together to satang before recording the full receipt', () => {
  const result = successful(job(), { value: 1234, wht_rate: 1.5, payment_status: 'paid', paid_date: '2026-10-23' });
  assert.deepEqual([result.record.value, result.record.whtAmount, result.record.received, result.record.payDate], [1234, 18.51, 1215.49, '2026-10-23']);
  assert.deepEqual(sumIncome(incomeRowsForYear([result.record], 2026)), { gross: 1234, received: 1215.49, wht: 18.51 });
});

test('a tax edit alone changes the outstanding balance without inventing receipts or a payment status', () => {
  const result = successful(job({ received: 2000, pending: 7700, status: 'partial', paymentStatus: 'partial', depositAmount: 2000, depositDate: '2026-09-01' }), { wht_rate: 0 });
  assert.equal(result.record.pending, 8000);
  assert.equal(result.record.received, 2000);
  assert.equal(result.record.depositDate, '2026-09-01');
  assert.equal(result.record.payDate, '2026-11-19');
  assert.equal(result.patch.status, undefined);
  assert.equal(result.patch.paymentStatus, undefined);
  assert.equal(result.patch.received, undefined);
});

test('fully paid keeps an old deposit in its original year and dates only the remaining receipt today', () => {
  for (const depositAmount of [2000, undefined]) {
    const result = successful(job({ received: 2000, pending: 7700, status: 'partial', paymentStatus: 'partial', depositDate: '2025-12-31', depositAmount }), { wht_rate: 0, payment_status: 'paid' });
    assert.equal(result.record.depositAmount, 2000);
    assert.deepEqual(getJobPaymentEntries(result.record).map(({ date, amount }) => ({ date, amount })), [{ date: '2025-12-31', amount: 2000 }, { date: today, amount: 8000 }]);
    assert.equal(sumIncome(incomeRowsForYear([result.record], 2025)).received, 2000);
    assert.equal(sumIncome(incomeRowsForYear([result.record], 2026)).received, 8000);
    assert.ok(JSON.stringify(result.changes).includes('2025-12-31'));
    assert.equal(result.changes.find(change => change.label === 'วันที่รับยอดครบ')?.value, today, 'the deposit date is preserved, not presented as a replaced final receipt date');
  }
});

test('an explicit correction to a paid job preserves its original receipt date unless a new date was supplied', () => {
  const source = job({ received: 9700, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2025-12-15' });
  const kept = successful(source, { wht_rate: 0, payment_status: 'paid' });
  assert.equal(kept.record.payDate, '2025-12-15');
  assert.equal(sumIncome(incomeRowsForYear([kept.record], 2025)).received, 10000);
  const changed = successful(source, { wht_rate: 0, payment_status: 'paid', paid_date: '2026-10-22' });
  assert.equal(changed.record.payDate, '2026-10-22');
  assert.ok(JSON.stringify(changed.changes).includes('2025-12-15 → 2026-10-22'));
  const legacy = successful({ ...source, payDate: null, dueDate: '2025-12-15' }, { wht_rate: 0, payment_status: 'paid' });
  assert.equal(legacy.record.payDate, '2025-12-15');
});

test('custom verified status behaviors are preserved or selected, instead of inventing a mismatched status', () => {
  const custom: StatusOption[] = [{ id: 'waiting', label: 'รอ', behavior: 'pending' }, { id: 'settled', label: 'เรียบร้อย', behavior: 'done' }];
  assert.equal(successful(job({ status: 'waiting' }), { wht_rate: 0, payment_status: 'paid' }, custom).record.status, 'settled');
  assert.equal(successful(job({ status: 'settled', received: 9700, pending: 0, payDate: '2026-10-01' }), { wht_rate: 0, payment_status: 'paid' }, custom).record.status, 'settled');
});

test('financial edits never reduce recorded cash, erase a receipt, or silently reopen a paid job', () => {
  const paid = job({ received: 9700, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2026-10-01' });
  refused(paid, { value: 9000, payment_status: 'paid' });
  refused(paid, { payment_status: 'unpaid' });
  assert.deepEqual(refused(paid, { wht_rate: 0 }).missing, ['สถานะการชำระ']);
  refused(paid, { wht_rate: 0, payment_status: 'partial', received_amount: 9700 });
  const partial = job({ received: 2000, pending: 7700, status: 'partial', paymentStatus: 'partial' });
  refused(partial, { payment_status: 'partial', received_amount: 1500 });
  refused(partial, { payment_status: 'unpaid' });
  assert.deepEqual(refused(partial, { value: 2000, wht_rate: 0 }).missing, ['สถานะการชำระ']);
});

test('missing or conflicting historical receipt dates are actionable failures rather than silently moved income', () => {
  const partial = job({ received: 2000, pending: 7700, status: 'partial', paymentStatus: 'partial' });
  refused(partial, { wht_rate: 0, payment_status: 'paid' });
  refused({ ...partial, depositDate: '2026-09-01', depositAmount: 1000 }, { payment_status: 'paid' });
  refused({ ...partial, depositDate: '2026-09-01', depositAmount: 3000 }, { payment_status: 'paid' });
  refused({ ...partial, depositDate: '2026-09-01', depositAmount: 2000 }, { payment_status: 'paid', paid_date: '2026-08-31' });
  assert.deepEqual(refused(job({ received: 9700, pending: 0, status: 'done', paymentStatus: 'paid', payDate: null }), { wht_rate: 0, payment_status: 'paid' }).missing, ['วันที่รับเงินจริง']);
});

test('first partial receipt has explicit cumulative semantics and preserves the due date', () => {
  assert.deepEqual(refused(job(), { payment_status: 'partial' }).missing, ['ยอดรับสะสมทั้งหมด']);
  const result = successful(job(), { wht_rate: 0, payment_status: 'partial', received_amount: 2500, paid_date: '2026-10-23' });
  assert.deepEqual([result.record.received, result.record.pending, result.record.depositAmount, result.record.depositDate, result.record.payDate], [2500, 7500, 2500, '2026-10-23', '2026-11-19']);
  assert.equal(sumIncome(incomeRowsForYear([result.record], 2026)).received, 2500);
  refused(job(), { payment_status: 'partial', received_amount: 9700 });
});

test('same-day partial totals can be updated, but different-day transfers cannot overwrite single-deposit history', () => {
  const partial = job({ received: 2000, pending: 7700, status: 'partial', paymentStatus: 'partial', depositDate: '2026-10-23', depositAmount: 2000 });
  const same = successful(partial, { payment_status: 'partial', received_amount: 3000, paid_date: '2026-10-23' });
  assert.equal(same.record.depositAmount, 3000);
  assert.equal(same.record.depositDate, '2026-10-23');
  assert.equal(successful(partial, { wht_rate: 0, payment_status: 'partial', received_amount: 2000 }).record.depositDate, '2026-10-23');
  refused(partial, { payment_status: 'partial', received_amount: 3000 });
  refused(partial, { payment_status: 'partial', received_amount: 3000, paid_date: '2026-10-24' });
});

test('installment schedules require their own amounts and dates, and cannot be silently marked paid at aggregate level', () => {
  const source = job({ status: 'installment', installments: [{ id: 'first', label: 'งวด 1', amount: 9700, status: 'pending', dueDate: '2026-11-01', paidAt: null }] });
  assert.match(refused(source, { wht_rate: 0, payment_status: 'paid' }).error, /แต่ละงวด/);
  assert.match(refused(source, { value: 11000 }).error, /ประวัติ/);
});

test('invalid money, rates, statuses and dates fail without a patch; the no-financial-fields path is a no-op', () => {
  for (const args of [
    { wht_rate: -1 }, { wht_rate: 100.01 }, { wht_rate: 1.001 }, { wht_rate: '0' },
    { value: 0 }, { value: 0.001 }, { value: Infinity }, { value: '100' },
    { payment_status: 'fully_paid' }, { payment_status: 'paid', received_amount: 9700 },
    { payment_status: 'paid', paid_date: '2026-02-30' }, { payment_status: 'paid', paid_date: '2569-10-24' },
    { payment_status: 'paid', paid_date: '2026-10-25' }, { paid_date: today },
  ]) refused(job(), args);
  assert.deepEqual(calculateJobFinancialEdit(job(), statuses, { note: 'unchanged here' }, today), { ok: true, patch: {}, changes: [] });
  const unpaid = successful(job(), { wht_rate: 0, payment_status: 'unpaid' });
  assert.deepEqual([unpaid.record.received, unpaid.record.pending, unpaid.record.status], [0, 10000, 'pending']);
});
