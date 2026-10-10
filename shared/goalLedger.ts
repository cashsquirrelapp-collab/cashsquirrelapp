import type { Goal, GoalTransaction } from './types';

type FailureReason =
  | 'goal-not-found'
  | 'invalid-amount'
  | 'insufficient-balance'
  | 'transaction-not-found'
  | 'missing-transfer-counterpart'
  | 'ambiguous-transfer-counterpart'
  | 'ambiguous-legacy-withdrawal'
  | 'history-only-not-allowed';

type Failure = { ok: false; reason: FailureReason; goals: Goal[] };

export type GoalTransactionResult = Failure | {
  ok: true;
  goals: Goal[];
  transaction: GoalTransaction;
  goalBefore: Goal;
  goalAfter: Goal;
};

export type GoalTransferResult = Failure | {
  ok: true;
  goals: Goal[];
  amount: number;
  fromGoal: Goal;
  toGoal: Goal;
};

export type GoalTransactionUndoResult = Failure | {
  ok: true;
  goals: Goal[];
  transaction: GoalTransaction;
  goalAfter: Goal;
  affectedGoalIds: string[];
};

/** True when deleting a goal would leave another goal with an orphaned transfer leg. */
export function hasLinkedGoalTransactions(goals: Goal[], goalId: string): boolean {
  return goals.some(goal => (goal.history || []).some(transaction => (
    (goal.id === goalId && Boolean(transaction.relatedGoalId || transaction.transferId))
    || transaction.relatedGoalId === goalId
  )));
}

/**
 * Apply a manual goal deposit/withdrawal while keeping the recorded transaction equal to the
 * balance change that actually happened. Callers normally reject an oversized withdrawal in the
 * UI; the clamp here is the last line of defence for stale state or another caller.
 */
export function applyGoalTransaction(
  goals: Goal[],
  goalId: string,
  transaction: GoalTransaction,
): GoalTransactionResult {
  const goal = goals.find(candidate => candidate.id === goalId);
  if (!goal) return { ok: false, reason: 'goal-not-found', goals };
  if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
    return { ok: false, reason: 'invalid-amount', goals };
  }

  const appliedAmount = transaction.type === 'withdraw'
    ? Math.min(transaction.amount, Math.max(0, goal.current))
    : transaction.amount;
  if (appliedAmount <= 0) return { ok: false, reason: 'insufficient-balance', goals };

  const appliedTransaction: GoalTransaction = {
    ...transaction,
    amount: appliedAmount,
    ...(transaction.type === 'withdraw' ? { balanceBefore: goal.current } : {}),
  };
  const nextCurrent = transaction.type === 'deposit'
    ? goal.current + appliedAmount
    : goal.current - appliedAmount;
  const goalAfter: Goal = {
    ...goal,
    current: nextCurrent,
    history: [appliedTransaction, ...(goal.history || [])],
  };

  return {
    ok: true,
    goals: goals.map(candidate => candidate.id === goalId ? goalAfter : candidate),
    transaction: appliedTransaction,
    goalBefore: goal,
    goalAfter,
  };
}

interface GoalTransferInput {
  fromGoalId: string;
  toGoalId: string;
  amount: number;
  date: string;
  createdAt: string;
  transferId: string;
  withdrawTransactionId: string;
  depositTransactionId: string;
  reason?: string;
}

/** Create both transfer legs in one immutable state transition and give them one correlation id. */
export function applyGoalTransfer(goals: Goal[], input: GoalTransferInput): GoalTransferResult {
  if (input.fromGoalId === input.toGoalId || !Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, reason: 'invalid-amount', goals };
  }
  const fromGoal = goals.find(goal => goal.id === input.fromGoalId);
  const toGoal = goals.find(goal => goal.id === input.toGoalId);
  if (!fromGoal || !toGoal) return { ok: false, reason: 'goal-not-found', goals };
  if (input.amount > fromGoal.current) return { ok: false, reason: 'insufficient-balance', goals };

  const withdrawTransaction: GoalTransaction = {
    id: input.withdrawTransactionId,
    type: 'withdraw',
    amount: input.amount,
    date: input.date,
    reason: input.reason || `โอนย้ายไปเป้าหมาย "${toGoal.name}"`,
    relatedGoalId: toGoal.id,
    relatedGoalName: toGoal.name,
    transferId: input.transferId,
    createdAt: input.createdAt,
  };
  const depositTransaction: GoalTransaction = {
    id: input.depositTransactionId,
    type: 'deposit',
    amount: input.amount,
    date: input.date,
    reason: input.reason || `โอนย้ายมาจากเป้าหมาย "${fromGoal.name}"`,
    relatedGoalId: fromGoal.id,
    relatedGoalName: fromGoal.name,
    transferId: input.transferId,
    createdAt: input.createdAt,
  };

  return {
    ok: true,
    goals: goals.map(goal => {
      if (goal.id === fromGoal.id) {
        return {
          ...goal,
          current: goal.current - input.amount,
          history: [withdrawTransaction, ...(goal.history || [])],
        };
      }
      if (goal.id === toGoal.id) {
        return {
          ...goal,
          current: goal.current + input.amount,
          history: [depositTransaction, ...(goal.history || [])],
        };
      }
      return goal;
    }),
    amount: input.amount,
    fromGoal,
    toGoal,
  };
}

interface LocatedTransaction {
  goal: Goal;
  transaction: GoalTransaction;
}

function legacyCounterpartMatches(
  selectedGoalId: string,
  selected: GoalTransaction,
  candidateGoal: Goal,
  candidate: GoalTransaction,
): boolean {
  // Transfers created before transferId was introduced already share the exact createdAt value.
  // Requiring it keeps a same-day, same-amount second transfer from being paired by guesswork.
  if (!selected.createdAt || candidate.createdAt !== selected.createdAt) return false;
  return candidateGoal.id === selected.relatedGoalId
    && candidate.relatedGoalId === selectedGoalId
    && candidate.type !== selected.type
    && candidate.amount === selected.amount
    && candidate.date === selected.date;
}

function findTransferCounterparts(
  goals: Goal[],
  selectedGoalId: string,
  selected: GoalTransaction,
): LocatedTransaction[] {
  const matches: LocatedTransaction[] = [];
  for (const goal of goals) {
    for (const transaction of goal.history || []) {
      if (goal.id === selectedGoalId && transaction.id === selected.id) continue;
      const matchesTransferId = Boolean(selected.transferId)
        && transaction.transferId === selected.transferId;
      const matchesLegacyPair = !selected.transferId
        && !transaction.transferId
        && legacyCounterpartMatches(selectedGoalId, selected, goal, transaction);
      if (matchesTransferId || matchesLegacyPair) matches.push({ goal, transaction });
    }
  }
  return matches;
}

/** Whether a row is corrupt/legacy enough that deleting its history cannot safely change money. */
export function canDeleteGoalTransactionHistoryOnly(
  goals: Goal[],
  goalId: string,
  transactionId: string,
): boolean {
  const selectedGoal = goals.find(goal => goal.id === goalId);
  const selected = selectedGoal?.history?.find(transaction => transaction.id === transactionId);
  if (!selected) return false;

  const standaloneWithdrawal = selected.type === 'withdraw' && !selected.relatedGoalId && !selected.transferId;
  if (standaloneWithdrawal) {
    return selected.balanceBefore === undefined || selected.amount > selected.balanceBefore;
  }
  if (!selected.relatedGoalId && !selected.transferId) return false;

  const counterparts = findTransferCounterparts(goals, goalId, selected);
  if (counterparts.length !== 1) return true;
  const counterpart = counterparts[0];
  return counterpart.goal.id !== selected.relatedGoalId
    || counterpart.transaction.relatedGoalId !== goalId
    || counterpart.transaction.type === selected.type
    || counterpart.transaction.amount !== selected.amount;
}

/**
 * Delete and undo a goal-history entry. A transfer is one logical ledger operation: both legs are
 * removed and both balances are reversed together, or no state changes at all.
 */
export function undoGoalTransaction(
  goals: Goal[],
  goalId: string,
  transactionId: string,
  revertBalance = true,
): GoalTransactionUndoResult {
  const selectedGoal = goals.find(goal => goal.id === goalId);
  if (!selectedGoal) return { ok: false, reason: 'goal-not-found', goals };
  const selected = (selectedGoal.history || []).find(transaction => transaction.id === transactionId);
  if (!selected) return { ok: false, reason: 'transaction-not-found', goals };

  // Before the fix, an overdraw stored the requested amount even though the balance was clamped
  // to zero. There is no reliable way to distinguish that row from a valid old withdrawal which
  // happened to empty the goal. Never add an unverified legacy amount back into the balance;
  // revertBalance=false remains a safe, user-confirmed history-only cleanup path.
  const standaloneWithdrawal = selected.type === 'withdraw' && !selected.relatedGoalId && !selected.transferId;
  const ambiguousStandaloneWithdrawal = standaloneWithdrawal
    && (selected.balanceBefore === undefined || selected.amount > selected.balanceBefore);
  if (
    revertBalance
    && ambiguousStandaloneWithdrawal
  ) {
    return { ok: false, reason: 'ambiguous-legacy-withdrawal', goals };
  }

  // History is part of the cash ledger: removing a normal `deductedFromCash` deposit without
  // reversing its balance would make that cash look unallocated and allow it to be spent again.
  // The no-balance cleanup path exists only for rows whose balance effect cannot be reconstructed.
  if (!revertBalance && !ambiguousStandaloneWithdrawal && !selected.relatedGoalId && !selected.transferId) {
    return { ok: false, reason: 'history-only-not-allowed', goals };
  }

  let legs: LocatedTransaction[] = [{ goal: selectedGoal, transaction: selected }];
  if (selected.relatedGoalId || selected.transferId) {
    const counterparts = findTransferCounterparts(goals, goalId, selected);
    if (counterparts.length === 0) {
      if (!revertBalance) {
        const goalAfter = {
          ...selectedGoal,
          history: (selectedGoal.history || []).filter(transaction => transaction.id !== transactionId),
        };
        return {
          ok: true,
          goals: goals.map(goal => goal.id === goalId ? goalAfter : goal),
          transaction: selected,
          goalAfter,
          affectedGoalIds: [goalId],
        };
      }
      return { ok: false, reason: 'missing-transfer-counterpart', goals };
    }
    if (counterparts.length !== 1) {
      if (!revertBalance) {
        const goalAfter = {
          ...selectedGoal,
          history: (selectedGoal.history || []).filter(transaction => transaction.id !== transactionId),
        };
        return {
          ok: true,
          goals: goals.map(goal => goal.id === goalId ? goalAfter : goal),
          transaction: selected,
          goalAfter,
          affectedGoalIds: [goalId],
        };
      }
      return { ok: false, reason: 'ambiguous-transfer-counterpart', goals };
    }
    const counterpart = counterparts[0];
    if (
      counterpart.goal.id !== selected.relatedGoalId
      || counterpart.transaction.relatedGoalId !== goalId
      || counterpart.transaction.type === selected.type
      || counterpart.transaction.amount !== selected.amount
    ) {
      if (!revertBalance) {
        const goalAfter = {
          ...selectedGoal,
          history: (selectedGoal.history || []).filter(transaction => transaction.id !== transactionId),
        };
        return {
          ok: true,
          goals: goals.map(goal => goal.id === goalId ? goalAfter : goal),
          transaction: selected,
          goalAfter,
          affectedGoalIds: [goalId],
        };
      }
      return { ok: false, reason: 'missing-transfer-counterpart', goals };
    }
    if (!revertBalance) return { ok: false, reason: 'history-only-not-allowed', goals };
    legs = [...legs, counterpart];
  }

  if (revertBalance) {
    const depositWithoutFunds = legs.some(({ goal, transaction }) => (
      transaction.type === 'deposit' && goal.current < transaction.amount
    ));
    if (depositWithoutFunds) return { ok: false, reason: 'insufficient-balance', goals };
  }

  const legByGoalId = new Map(legs.map(leg => [leg.goal.id, leg.transaction]));
  const nextGoals = goals.map(goal => {
    const transaction = legByGoalId.get(goal.id);
    if (!transaction) return goal;
    const nextCurrent = !revertBalance
      ? goal.current
      : transaction.type === 'deposit'
        ? goal.current - transaction.amount
        : goal.current + transaction.amount;
    return {
      ...goal,
      current: nextCurrent,
      history: (goal.history || []).filter(candidate => candidate.id !== transaction.id),
    };
  });
  const goalAfter = nextGoals.find(goal => goal.id === goalId) || selectedGoal;

  return {
    ok: true,
    goals: nextGoals,
    transaction: selected,
    goalAfter,
    affectedGoalIds: legs.map(leg => leg.goal.id),
  };
}
