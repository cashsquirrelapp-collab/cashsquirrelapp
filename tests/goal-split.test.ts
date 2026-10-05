import test from 'node:test';
import assert from 'node:assert/strict';
import type { Goal } from '../shared/types';
import { proportionalSplit } from '../frontend/src/features/goals/SplitTab';

const goal = (id: string, pct: number, current = 0, target = 100000): Goal =>
  ({ id, name: id, type: 'save', target, current, deadline: '', emoji: '🎯', bg: '#fff', acc: '#000', allocatedPercentage: pct } as Goal);

// Pins today's behaviour (the preview on the page must match what the button does). Note each
// goal's share is taken from what is still left after the goals before it, so the result is not
// strictly proportional -- 30/50/10% of 9,000 gives 4,074 / 4,526 / 400, not 3,000 / 5,000 / 1,000.
test('everything is placed among goals that have a percentage (current sequential rule)', () => {
  const r = proportionalSplit([goal('save', 30), goal('invest', 50), goal('pc', 10)], 9000);
  assert.deepEqual(r.allocations, { save: 4074, invest: 4526, pc: 400 });
  assert.equal(r.remainder, 0);
});

test('a goal is capped at its target and the overflow goes to the others', () => {
  const r = proportionalSplit([goal('almost', 50, 99000), goal('other', 50)], 4000);
  assert.equal(r.allocations.almost, 1000);
  assert.equal(r.allocations.other, 3000);
  assert.equal(r.remainder, 0);
});

test('goals without a percentage or already full get nothing; what cannot be placed is returned', () => {
  const r = proportionalSplit([goal('none', 0), goal('full', 50, 100, 100)], 500);
  assert.deepEqual(r.allocations, { none: 0, full: 0 });
  assert.equal(r.remainder, 500);
});

test('history text from older versions is shown without emoji', async () => {
  const { stripEmoji } = await import('../frontend/src/features/goals/SplitParts');
  assert.equal(stripEmoji('โอนย้ายมาจากเป้าหมาย "เก็บเงิน" 🔄'), 'โอนย้ายมาจากเป้าหมาย "เก็บเงิน"');
  assert.equal(stripEmoji('🎯 ✈️ ทริป'), 'ทริป');
  assert.equal(stripEmoji('ฝากเงิน 1,000'), 'ฝากเงิน 1,000');
});
