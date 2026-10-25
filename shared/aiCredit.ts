// AI credit and reserve for the owner (2026-10-25): shared by the server that works it out (backend/src/services/aiCredit.ts)
// and the admin page. Dollars are millionths (integers); null means not known, never 0.

export type CreditProvider = 'anthropic' | 'google';
export interface CreditStatus {
  provider: CreditProvider;
  /** The balance the owner last recorded from the provider's console. */
  recorded: { balanceMicro: number; at: string; note: string | null } | null;
  /** Measured spend at this provider since that record. */
  spentSinceMicro: number | null;
  /** Recorded balance − measured spend since; an estimate, null without a record. */
  remainingMicro: number | null;
  /** The pace used: the last 7 full days' average, or today's spend so far when higher. */
  dailyMicro: number;
  todayMicro: number;
  spend7Micro: number;
  spend30Micro: number;
  requests30: number;
  runwayDays: number | null;
  /** The Bangkok day it would run out at this pace. */
  runOutOn: string | null;
  /** 30 days at this pace, plus 30%. */
  reserve30Micro: number;
  /** What to add so the reserve is there; null without a record. */
  topUpMicro: number | null;
  status: 'ok' | 'watch' | 'low' | 'out' | 'unknown';
  /** Billing answers from this provider in the last 24 hours. */
  issues: { issue: string; times: number; lastAt: string }[];
}
export interface AiCreditSnapshot {
  generatedAt: string;
  /** Baht per dollar × 10,000 (the report's rate), or null. */
  rate4: number | null;
  dailyCapUsd: number;
  providers: CreditStatus[];
  /** The most AI could cost in a month: every paying member using all their tokens, and the app's daily cap × 30. */
  ceiling: { payingMembers: number | null; worstMonthlyMicro: number | null; capMonthlyMicro: number };
  issuesRead: boolean;
  /** The Pro token allowance, for the page's worst case (the API adds it): the default one, and the sum of the paid
   * plans' allowances with how many accounts it covers (shared/proTokens.ts), when the orders could be read. */
  allowance?: { proTokens: number; tokenUsd: number; planTokens?: number; planAccounts?: number };
}
