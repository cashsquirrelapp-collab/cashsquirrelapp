import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import type { VaultFile, VaultKind } from '../shared/vault';
import {
  isWht50Trackable,
  paidYearOf,
  receivedPaymentDateOf,
  wht50Files,
  wht50StatusOf,
  wht50WaitingDays,
} from '../frontend/src/features/vault/vaultStatus';

const job = (patch: Partial<Job> = {}): Job => ({
  id: 'job-1',
  name: 'Campaign',
  type: 'Sponsored Post',
  client: 'Brand A',
  value: 10_000,
  received: 9_700,
  pending: 0,
  status: 'done',
  creditTerm: 0,
  payDate: '2026-10-01',
  paymentStatus: 'paid',
  note: '',
  whtRate: 3,
  whtAmount: 300,
  ...patch,
});

const file = (id: string, patch: Partial<VaultFile> = {}): VaultFile => ({
  id,
  kind: 'wht50' as VaultKind,
  jobId: 'job-1',
  jobName: 'Campaign',
  client: 'Brand A',
  fileName: `${id}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 100,
  createdAt: '2026-10-02T00:00:00Z',
  ...patch,
});

test('50 ทวิ status follows eligibility, payment, and linked certificate files', () => {
  assert.equal(wht50StatusOf(job({ whtRate: 0, whtAmount: 0 }), []), 'none');
  assert.equal(wht50StatusOf(job({ received: 0, pending: 9_700, paymentStatus: 'unpaid' }), []), 'notYet');
  assert.equal(wht50StatusOf(job(), []), 'waiting');
  assert.equal(wht50StatusOf(job(), [file('certificate')]), 'have');
});

test('only 50 ทวิ files linked to the exact job satisfy its tracking row', () => {
  const files = [
    file('one'),
    file('two'),
    file('other-job', { jobId: 'job-2' }),
    file('contract', { kind: 'contract' }),
  ];
  assert.deepEqual(wht50Files(job(), files).map(item => item.id), ['one', 'two']);
  assert.equal(wht50StatusOf(job(), files), 'have');
});

test('tax year uses only an actual received-payment date', () => {
  assert.equal(paidYearOf(job({
    installments: [
      { id: 'first', label: 'งวดแรก', amount: 4_000, dueDate: '2025-12-01', paidAt: '2025-12-10', status: 'paid' },
      { id: 'last', label: 'งวดสุดท้าย', amount: 6_000, dueDate: '2026-01-01', paidAt: '2026-01-05', status: 'paid' },
    ],
  })), 2026);
  assert.equal(paidYearOf(job()), 2026);
  assert.equal(paidYearOf(job({ payDate: null, postDate: '2024-02-01' })), null);
  assert.equal(paidYearOf(job({
    received: 3_000,
    pending: 7_000,
    paymentStatus: 'partial',
    depositDate: null,
    payDate: '2026-04-30',
    postDate: '2024-02-01',
  })), null);
  assert.equal(paidYearOf(job({ payDate: null, postDate: 'not-a-date' })), null);
});

test('waiting age uses the actual received-payment date, never a posting date', () => {
  const paid = job({ payDate: '2026-03-10', postDate: '2026-12-31' });
  assert.equal(receivedPaymentDateOf(paid), '2026-03-10');
  assert.equal(wht50WaitingDays(paid, '2026-03-20'), 10);

  const partial = job({
    received: 3_000,
    pending: 7_000,
    paymentStatus: 'partial',
    depositDate: '2026-02-04',
    payDate: '2026-04-30',
    postDate: '2026-01-01',
  });
  assert.equal(receivedPaymentDateOf(partial), '2026-02-04');
  assert.equal(wht50WaitingDays(partial, '2026-02-14'), 10);

  const unknown = job({
    received: 3_000,
    pending: 7_000,
    paymentStatus: 'partial',
    depositDate: null,
    payDate: '2026-04-30',
    postDate: '2026-01-01',
  });
  assert.equal(receivedPaymentDateOf(unknown), null);
  assert.equal(wht50WaitingDays(unknown, '2026-02-14'), null);

  const stalePaidLabel = job({
    received: 3_000,
    pending: 7_000,
    paymentStatus: 'paid',
    depositDate: null,
    payDate: '2026-04-30',
  });
  assert.equal(receivedPaymentDateOf(stalePaidLabel), null);
  assert.equal(paidYearOf(stalePaidLabel), null);
});

test('installment waiting age uses the latest paid-at date and ignores due dates', () => {
  const installmentJob = job({
    payDate: '2026-12-31',
    installments: [
      { id: 'first', label: 'งวดแรก', amount: 4_000, dueDate: '2026-01-01', paidAt: '2026-01-05', status: 'paid' },
      { id: 'last', label: 'งวดสุดท้าย', amount: 6_000, dueDate: '2026-03-01', paidAt: '2026-02-10', status: 'paid' },
      { id: 'future', label: 'งวดถัดไป', amount: 2_000, dueDate: '2026-04-01', paidAt: null, status: 'pending' },
    ],
  });
  assert.equal(receivedPaymentDateOf(installmentJob), '2026-02-10');
  assert.equal(wht50WaitingDays(installmentJob, '2026-02-25'), 15);
  assert.equal(wht50WaitingDays(installmentJob, '2026-02-01'), 0);
});

test('a fully withheld settled job still needs its certificate', () => {
  const fullyWithheld = job({
    value: 10_000,
    whtRate: 100,
    whtAmount: 10_000,
    received: 0,
    pending: 0,
    paymentStatus: 'paid',
    payDate: '2026-05-12',
  });
  assert.equal(isWht50Trackable(fullyWithheld), true);
  assert.equal(receivedPaymentDateOf(fullyWithheld), '2026-05-12');
  assert.equal(paidYearOf(fullyWithheld), 2026);
  assert.equal(wht50StatusOf(fullyWithheld, []), 'waiting');

  const notYetPaid = job({
    value: 10_000,
    whtRate: 100,
    whtAmount: 10_000,
    received: 0,
    pending: 0,
    paymentStatus: 'unpaid',
    payDate: '2026-12-31',
  });
  assert.equal(isWht50Trackable(notYetPaid), false);
  assert.equal(receivedPaymentDateOf(notYetPaid), null);
  assert.equal(paidYearOf(notYetPaid), null);
  assert.equal(wht50StatusOf(notYetPaid, []), 'notYet');
});
