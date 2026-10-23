import test from 'node:test';
import assert from 'node:assert/strict';
import type { Goal } from '../shared/types';
import { allocationsFitAvailable, percentageAllocationPool, proportionalSplit } from '../frontend/src/features/goals/SplitTab';

const goal = (id: string, pct: number, current = 0, target = 100000): Goal =>
  ({ id, name: id, type: 'save', target, current, deadline: '', emoji: '🎯', bg: '#fff', acc: '#000', allocatedPercentage: pct } as Goal);

test('configured percentages are absolute and leave the unconfigured share available', () => {
  const r = proportionalSplit([goal('save', 25), goal('invest', 15)], 5150);
  assert.deepEqual(r.allocations, { save: 1288, invest: 772 });
  assert.equal(Object.values(r.allocations).reduce((sum, amount) => sum + amount, 0), 2060);
  assert.equal(r.remainder, 3090);
});

test('a legacy accumulated remainder never duplicates the live unallocated share', () => {
  const first = proportionalSplit([goal('save', 25), goal('invest', 15)], 5150);
  assert.equal(first.remainder, 3090);
  assert.equal(percentageAllocationPool(first.remainder, first.remainder), 3090);
  assert.notEqual(percentageAllocationPool(first.remainder, first.remainder), 6180);
});

test('allocation is stable when goals are reordered', () => {
  const forward = proportionalSplit([goal('save', 25), goal('invest', 15)], 5150);
  const reverse = proportionalSplit([goal('invest', 15), goal('save', 25)], 5150);
  assert.deepEqual(reverse, forward);
});

test('a goal is capped at its target without inflating another goal percentage', () => {
  const r = proportionalSplit([goal('almost', 50, 99000), goal('other', 50)], 4000);
  assert.equal(r.allocations.almost, 1000);
  assert.equal(r.allocations.other, 2000);
  assert.equal(r.remainder, 1000);
});

test('legacy ratios over 100% are scaled and editable totals cannot exceed available cash', () => {
  const scaled = proportionalSplit([goal('save', 60), goal('invest', 60)], 1_000);
  assert.deepEqual(scaled.allocations, { save: 500, invest: 500 });
  assert.equal(scaled.remainder, 0);
  assert.equal(allocationsFitAvailable(scaled.allocations, 1_000), true);
  assert.equal(allocationsFitAvailable({ save: 700, invest: 400 }, 1_000), false);
  assert.equal(allocationsFitAvailable({ save: Number.NaN }, 1_000), false);
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
