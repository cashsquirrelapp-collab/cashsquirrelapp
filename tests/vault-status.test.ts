import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import type { VaultFile, VaultKind } from '../shared/vault';
import { paidYearOf, wht50Files, wht50StatusOf } from '../frontend/src/features/vault/vaultStatus';

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

test('tax year uses the latest paid installment and falls back to the job dates', () => {
  assert.equal(paidYearOf(job({
    installments: [
      { id: 'first', label: 'งวดแรก', amount: 4_000, dueDate: '2025-12-01', paidAt: '2025-12-10', status: 'paid' },
      { id: 'last', label: 'งวดสุดท้าย', amount: 6_000, dueDate: '2026-01-01', paidAt: '2026-01-05', status: 'paid' },
    ],
  })), 2026);
  assert.equal(paidYearOf(job({ payDate: null, postDate: '2024-02-01' })), 2024);
  assert.equal(paidYearOf(job({ payDate: null, postDate: 'not-a-date' })), null);
});
