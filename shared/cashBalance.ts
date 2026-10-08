import type { Expense, Job } from './types';
import { roundMoney } from './wht';

// "เงินที่มีตอนนี้": the app can't see a bank balance, so the user tells it what they hold at one
// moment (the anchor). From then on every change the app knows about moves the figure: money
// recorded as received on jobs comes in, recorded expenses go out. The anchor keeps the all-time
// totals at the moment it was set, so anything recorded later -- whatever date it carries --
// counts exactly once. Fixed monthly costs that were never recorded as paid are not counted.

export interface CashAnchor {
  amount: number; // what the user held when they set it
  at: string; // ISO time it was set
  baseReceived: number; // all-time money received on jobs at that moment
  baseSpent: number; // all-time recorded expenses at that moment
}

export const allTimeReceived = (jobs: Pick<Job, 'received'>[]) =>
  roundMoney(jobs.reduce((sum, j) => sum + (Number(j.received) || 0), 0));

export const allTimeSpent = (expenses: Pick<Expense, 'amount'>[]) =>
  roundMoney(expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

export function makeCashAnchor(amount: number, jobs: Pick<Job, 'received'>[], expenses: Pick<Expense, 'amount'>[], at = new Date()): CashAnchor {
  return { amount: roundMoney(amount), at: at.toISOString(), baseReceived: allTimeReceived(jobs), baseSpent: allTimeSpent(expenses) };
}

export function cashOnHand(anchor: CashAnchor, jobs: Pick<Job, 'received'>[], expenses: Pick<Expense, 'amount'>[]) {
  const receivedSince = roundMoney(allTimeReceived(jobs) - anchor.baseReceived);
  const spentSince = roundMoney(allTimeSpent(expenses) - anchor.baseSpent);
  return { balance: roundMoney(anchor.amount + receivedSince - spentSince), receivedSince, spentSince };
}
