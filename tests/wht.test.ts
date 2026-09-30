import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidWhtRate, whtAmountFor, jobWhtAmount, jobNetReceivable } from '../shared/wht';
import { validateChanges } from '../shared/validation';

test('custom WHT rates allow up to two decimals within 0–100%', () => {
  for (const rate of [0, 1, 3, 5, 1.5, 2.25, 0.01, 100, 1.15]) assert.equal(isValidWhtRate(rate), true, String(rate));
  for (const rate of [-1, 100.01, 1.234, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(isValidWhtRate(rate), false, String(rate));
});

test('WHT is calculated to satang', () => {
  assert.equal(whtAmountFor(1234, 1.5), 18.51);
  assert.equal(whtAmountFor(10000, 3), 300);
  assert.equal(whtAmountFor(10000, 0), 0);
  assert.equal(jobNetReceivable({ value: 1234, whtRate: 1.5, whtAmount: 18.51 }), 1215.49);
});

test('a saved WHT amount wins over recomputing from the rate', () => {
  assert.equal(jobWhtAmount({ value: 1234, whtRate: 3, whtAmount: 37 }), 37);
  assert.equal(jobWhtAmount({ value: 1234, whtRate: 3 }), 37.02);
  assert.equal(jobNetReceivable({ value: 5000 }), 5000);
});

test('job saves accept custom rates and reject more than two decimals', () => {
  const job = (whtRate: number) => [{
    table: 'cashflow_jobs', id: 'j1', op: 'set', version: null,
    data: { id: 'j1', name: 'งาน', value: 1234, received: 0, pending: 1215.49, client: '', type: 'ยังไม่ระบุ', status: 'pending', creditTerm: 0, note: '', payDate: null, whtRate, whtAmount: 18.51 },
  }];
  assert.doesNotThrow(() => validateChanges(job(1.5)));
  assert.throws(() => validateChanges(job(1.555)));
  assert.throws(() => validateChanges(job(101)));
});
