import test from 'node:test';
import assert from 'node:assert/strict';
import type { Goal, GoalTransaction } from '../shared/types';
import { applyGoalTransaction, applyGoalTransfer, canDeleteGoalTransactionHistoryOnly, hasLinkedGoalTransactions, undoGoalTransaction } from '../shared/goalLedger';

const goal = (id: string, current: number, history: GoalTransaction[] = []): Goal => ({
  id,
  name: id,
  type: 'save',
  target: 100_000,
  current,
  deadline: '',
  emoji: '🎯',
  bg: '#fff',
  acc: '#000',
  history,
});

const transaction = (overrides: Partial<GoalTransaction> = {}): GoalTransaction => ({
  id: 'tx-1',
  type: 'withdraw',
  amount: 100,
  date: '2026-10-10',
  reason: 'test',
  createdAt: '2026-10-10T12:00:00.000Z',
  ...overrides,
});

test('an oversized withdrawal records only the balance actually removed, so undo cannot mint money', () => {
  const original = [goal('reserve', 100)];
  const applied = applyGoalTransaction(original, 'reserve', transaction({ amount: 150 }));
  assert.equal(applied.ok, true);
  if (!applied.ok) return;

  assert.equal(applied.transaction.amount, 100);
  assert.equal(applied.transaction.balanceBefore, 100);
  assert.equal(applied.goalAfter.current, 0);
  assert.equal(applied.goalAfter.history?.[0].amount, 100);

  const undone = undoGoalTransaction(applied.goals, 'reserve', applied.transaction.id);
  assert.equal(undone.ok, true);
  if (!undone.ok) return;
  assert.equal(undone.goalAfter.current, 100);
  assert.deepEqual(undone.goalAfter.history, []);
});

test('withdrawing from an empty goal is rejected without writing history', () => {
  const original = [goal('empty', 0)];
  const applied = applyGoalTransaction(original, 'empty', transaction({ amount: 50 }));
  assert.equal(applied.ok, false);
  if (applied.ok) return;
  assert.equal(applied.reason, 'insufficient-balance');
  assert.strictEqual(applied.goals, original);
});

test('history-only deletion cannot reopen cash already allocated into a goal', () => {
  const allocated = transaction({
    id: 'allocated',
    type: 'deposit',
    amount: 400,
    deductedFromCash: true,
  });
  const current = [goal('reserve', 400, [allocated])];

  const cleanup = undoGoalTransaction(current, 'reserve', allocated.id, false);
  assert.equal(canDeleteGoalTransactionHistoryOnly(current, 'reserve', allocated.id), false);
  assert.equal(cleanup.ok, false);
  if (cleanup.ok) return;
  assert.equal(cleanup.reason, 'history-only-not-allowed');
  assert.strictEqual(cleanup.goals, current);
  assert.equal(cleanup.goals[0].current, 400);
  assert.equal(cleanup.goals[0].history?.[0].deductedFromCash, true);
});

test('an ambiguous pre-fix withdrawal cannot mint money and supports history-only cleanup', () => {
  const legacyOverdraw = transaction({ amount: 150, balanceBefore: undefined });
  const current = [goal('reserve', 0, [legacyOverdraw])];

  const unsafeUndo = undoGoalTransaction(current, 'reserve', legacyOverdraw.id);
  assert.equal(canDeleteGoalTransactionHistoryOnly(current, 'reserve', legacyOverdraw.id), true);
  assert.equal(unsafeUndo.ok, false);
  if (unsafeUndo.ok) return;
  assert.equal(unsafeUndo.reason, 'ambiguous-legacy-withdrawal');
  assert.strictEqual(unsafeUndo.goals, current);

  const cleanup = undoGoalTransaction(current, 'reserve', legacyOverdraw.id, false);
  assert.equal(cleanup.ok, true);
  if (!cleanup.ok) return;
  assert.equal(cleanup.goalAfter.current, 0);
  assert.deepEqual(cleanup.goalAfter.history, []);
});

function transferredGoals() {
  return applyGoalTransfer([goal('from', 1_000), goal('to', 500)], {
    fromGoalId: 'from',
    toGoalId: 'to',
    amount: 250,
    date: '2026-10-10',
    createdAt: '2026-10-10T12:00:00.000Z',
    transferId: 'transfer-1',
    withdrawTransactionId: 'withdraw-1',
    depositTransactionId: 'deposit-1',
  });
}

for (const [label, goalId, transactionId] of [
  ['source', 'from', 'withdraw-1'],
  ['destination', 'to', 'deposit-1'],
] as const) {
  test(`undoing the ${label} transfer leg removes and reverses both legs atomically`, () => {
    const transferred = transferredGoals();
    assert.equal(transferred.ok, true);
    if (!transferred.ok) return;
    assert.equal(transferred.goals.reduce((sum, item) => sum + item.current, 0), 1_500);
    assert.equal(transferred.goals.find(item => item.id === 'from')?.history?.[0].transferId, 'transfer-1');
    assert.equal(transferred.goals.find(item => item.id === 'to')?.history?.[0].transferId, 'transfer-1');

    const undone = undoGoalTransaction(transferred.goals, goalId, transactionId);
    assert.equal(canDeleteGoalTransactionHistoryOnly(transferred.goals, goalId, transactionId), false);
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(undone.goals.find(item => item.id === 'from')?.current, 1_000);
    assert.equal(undone.goals.find(item => item.id === 'to')?.current, 500);
    assert.deepEqual(undone.goals.find(item => item.id === 'from')?.history, []);
    assert.deepEqual(undone.goals.find(item => item.id === 'to')?.history, []);
    assert.deepEqual(new Set(undone.affectedGoalIds), new Set(['from', 'to']));
    assert.equal(undone.goals.reduce((sum, item) => sum + item.current, 0), 1_500);
  });
}

test('undo also correlates transfer legs saved before transferId existed', () => {
  const createdAt = '2026-09-30T05:00:00.000Z';
  const legacyWithdraw = transaction({
    id: 'old-withdraw',
    type: 'withdraw',
    amount: 300,
    relatedGoalId: 'to',
    createdAt,
  });
  const legacyDeposit = transaction({
    id: 'old-deposit',
    type: 'deposit',
    amount: 300,
    relatedGoalId: 'from',
    createdAt,
  });
  const current = [goal('from', 700, [legacyWithdraw]), goal('to', 800, [legacyDeposit])];

  const undone = undoGoalTransaction(current, 'from', legacyWithdraw.id);
  assert.equal(undone.ok, true);
  if (!undone.ok) return;
  assert.equal(undone.goals.find(item => item.id === 'from')?.current, 1_000);
  assert.equal(undone.goals.find(item => item.id === 'to')?.current, 500);
  assert.deepEqual(undone.goals.flatMap(item => item.history || []), []);
});

test('a transfer undo is rejected as a whole when the destination no longer holds the money', () => {
  const transferred = transferredGoals();
  assert.equal(transferred.ok, true);
  if (!transferred.ok) return;
  const spent = transferred.goals.map(item => item.id === 'to' ? { ...item, current: 100 } : item);

  const undone = undoGoalTransaction(spent, 'from', 'withdraw-1');
  assert.equal(undone.ok, false);
  if (undone.ok) return;
  assert.equal(undone.reason, 'insufficient-balance');
  assert.strictEqual(undone.goals, spent);

  const historyOnly = undoGoalTransaction(spent, 'from', 'withdraw-1', false);
  assert.equal(historyOnly.ok, false);
  if (historyOnly.ok) return;
  assert.equal(historyOnly.reason, 'history-only-not-allowed');
});

test('a transfer undo never falls back to one-sided deletion when its counterpart is missing', () => {
  const loneLeg = transaction({
    id: 'lone',
    type: 'withdraw',
    relatedGoalId: 'missing',
    transferId: 'transfer-missing',
  });
  const current = [goal('from', 900, [loneLeg])];

  const undone = undoGoalTransaction(current, 'from', loneLeg.id);
  assert.equal(canDeleteGoalTransactionHistoryOnly(current, 'from', loneLeg.id), true);
  assert.equal(undone.ok, false);
  if (undone.ok) return;
  assert.equal(undone.reason, 'missing-transfer-counterpart');
  assert.strictEqual(undone.goals, current);

  const cleanup = undoGoalTransaction(current, 'from', loneLeg.id, false);
  assert.equal(cleanup.ok, true);
  if (!cleanup.ok) return;
  assert.equal(cleanup.goalAfter.current, 900);
  assert.deepEqual(cleanup.goalAfter.history, []);
});

test('a goal with either side of linked transfer history cannot be deleted into an orphaned ledger', () => {
  const transferred = transferredGoals();
  assert.equal(transferred.ok, true);
  if (!transferred.ok) return;
  assert.equal(hasLinkedGoalTransactions(transferred.goals, 'from'), true);
  assert.equal(hasLinkedGoalTransactions(transferred.goals, 'to'), true);
  assert.equal(hasLinkedGoalTransactions([...transferred.goals, goal('unrelated', 50)], 'unrelated'), false);

  const withoutSource = transferred.goals.filter(item => item.id !== 'from');
  assert.equal(hasLinkedGoalTransactions(withoutSource, 'from'), true);
});
