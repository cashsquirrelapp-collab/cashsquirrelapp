import test from 'node:test';
import assert from 'node:assert/strict';
import { isTesterPublicId, TESTER_BUCKET, TESTER_TOKENS } from '../backend/src/ai/testers';
import { allowance } from '../backend/src/ai/service';
import { aiConfig } from '../backend/src/ai/config';

// Friends trying เลขา (owner, 2026-11-04: "บัญชีละ 200 โทเคนเพื่อทดลองใช้เลขากระรอก ห้ามเกินเด็ดขาด"): the three accounts, 200
// tokens once, in a bucket of their own that never refills.
test('the three tester accounts get 200 tokens once, in their own bucket; nobody else does', () => {
  for (const id of ['SQ-6735AB827F', 'SQ-DB9332A652', 'SQ-C1AA5018EF', ' sq-6735ab827f ']) assert.equal(isTesterPublicId(id), true, id);
  for (const id of ['SQ-6735AB827E', 'SQ-0000000000', '', null, undefined]) assert.equal(isTesterPublicId(id), false, String(id));
  const limits = allowance({ plan: 'trial', tokens: TESTER_TOKENS, bucket: TESTER_BUCKET }, aiConfig({ AI_ENABLED: 'true' }), new Date('2026-12-15T05:00:00Z'));
  assert.deepEqual(limits, { cycle: '2026-11-04', resetsAt: null, tokenLimit: 200, requestLimit: null });
  // The usage table only takes 'YYYY-MM', 'YYYY-MM-DD' or 'trial' as its cycle key.
  assert.match(TESTER_BUCKET, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(TESTER_TOKENS, 200);
  // The old trial is unchanged.
  assert.equal(allowance({ plan: 'trial' }, aiConfig({ AI_ENABLED: 'true' })).cycle, 'trial');
});
