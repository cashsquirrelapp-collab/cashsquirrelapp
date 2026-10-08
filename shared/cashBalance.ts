import type { Expense, Goal, Job } from './types';
import { roundMoney } from './wht';

// เงินจริงที่มีอยู่ตอนนี้ -- the money the user actually holds now, which is not the same as the
// month's profit:
//   ยอดตั้งต้น (what they had before the app tracked anything)
//   + every payment actually received on jobs (job.received: net of withholding tax, the same
//     figure the dashboard counts; pending money and job value never count)
//   - every expense record
// Money put into goals is still the user's, so it never lowers the total; it only splits it into
// พร้อมใช้ (ready to spend) and กันไว้ในเป้าหมาย (set aside). Fixed monthly costs that were never
// recorded as an expense are not cash that left, so they don't count either.

export interface CashOpening {
  amount: number; // ยอดตั้งต้น
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export const allTimeReceived = (jobs: Pick<Job, 'received'>[]) =>
  roundMoney(jobs.reduce((sum, j) => sum + (Number(j.received) || 0), 0));

export const allTimeSpent = (expenses: Pick<Expense, 'amount'>[]) =>
  roundMoney(expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

/** Money currently sitting in goals (never below zero per goal). */
export const heldInGoals = (goals: Pick<Goal, 'current'>[]) =>
  roundMoney(goals.reduce((sum, g) => sum + Math.max(0, Number(g.current) || 0), 0));

export function currentCash(opening: Pick<CashOpening, 'amount'>, jobs: Pick<Job, 'received'>[], expenses: Pick<Expense, 'amount'>[], goals: Pick<Goal, 'current'>[] = []) {
  const received = allTimeReceived(jobs);
  const spent = allTimeSpent(expenses);
  const balance = roundMoney(opening.amount + received - spent);
  const inGoals = heldInGoals(goals);
  return { opening: roundMoney(opening.amount), received, spent, balance, inGoals, readyToSpend: roundMoney(balance - inGoals) };
}

/** The ยอดตั้งต้น that makes the current balance equal what the user says they hold now. */
export const openingForCurrent = (current: number, jobs: Pick<Job, 'received'>[], expenses: Pick<Expense, 'amount'>[]) =>
  roundMoney(current - allTimeReceived(jobs) + allTimeSpent(expenses));

export function saveOpening(amount: number, previous?: CashOpening | null, now = new Date()): CashOpening {
  const at = now.toISOString();
  return { amount: roundMoney(amount), createdAt: previous?.createdAt || at, updatedAt: at };
}
