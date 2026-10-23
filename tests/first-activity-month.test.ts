import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import { firstActivityMonth } from '../shared/monthlySummary';

const job = (fields: Partial<Job>): Job => ({
  id: 'j', name: 'งาน', type: 'ยังไม่ระบุ', client: '', value: 1000, received: 0, pending: 1000,
  status: 'pending', creditTerm: 0, payDate: null, note: '', ...fields,
});

test('fixed costs start from the earliest dated record', () => {
  assert.equal(firstActivityMonth([job({ startDate: '2026-08-12' })], [{ date: '2026-09-01' }]), '2026-08');
  assert.equal(firstActivityMonth([job({ postDate: '2026-09-30' })], [{ date: '2026-07-15' }]), '2026-07');
  assert.equal(firstActivityMonth([], []), null);
  assert.equal(firstActivityMonth([job({})], [{ date: '' }]), null);
});
