// The monthly profit report's figures (owner's brief "KRAROK AI PROFIT INTELLIGENCE", 2026-10-25), shared by the
// server that works them out (backend/src/services/adminProfitReport.ts) and the admin page that shows them live.
// Money is in satang and dollars in millionths; null means not known, never 0.

export type Completeness = 'COMPLETE' | 'PARTIAL' | 'UNRECONCILED' | 'FAILED';
/** One row of cashflow_admin_ai_month's accounts (amounts as numeric text). */
export interface AiAccountRow {
  user_id: string; messages: number; failed_requests: number; gemini_messages: number; claude_messages: number; krarok_tokens: number;
  actual_usd: string; billable_usd: string; cache_overhead_usd: string; failed_attempt_usd: string; quota_overrun_usd: string;
  cache_saved_usd: string; escalated_usd: string; gemini_usd: string; claude_usd: string; other_usd: string;
  gemini_calls: number; claude_calls: number; gemini_failed_calls: number; claude_failed_calls: number;
  input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; thinking_tokens: number;
  rows_without_cost_split: number; cards_prepared: number; cards_confirmed: number; corrections: number;
  tokens_used_up: boolean; latest_cycle_used: number | null; latest_cycle_limit: number | null; is_admin: boolean;
}
export interface AiMonth {
  accounts: AiAccountRow[];
  coverage: { rows: number; with_routing: number; with_cost_split: number; cost_without_split_usd: string };
  days: { active: number; near_cap: number; at_cap: number; max_usd: string };
  reliability: { timeouts: number; errors: number; held_for_claude: number; gemini_took_over: number; escalations: number; provider_retries: number };
  feedback: { by_kind: Record<string, number>; top_questions: { question: string; times: number; accounts: number }[]; requested_features: { feature: string; times: number; accounts: number }[] };
}
export interface Change { current: number | null; previous: number | null; change: number | null; percentBp: number | null; kind: 'compare' | 'new' | 'same' | 'none' }
export interface ReportMetrics {
  month: string; generatedAt: string; status: Completeness;
  sections: Record<'revenue' | 'ai' | 'profit' | 'comparison', { status: Completeness; notes: string[] }>;
  members: { paidAtEnd: number; newPaying: number; ended: number; cancelling: number; trials: number; granted: number; payingThisMonth: number;
    /** Every account at the time of the report, and those that signed up in the month. */
    total?: number; signedUp?: number };
  revenue: { gross: number | null; refunds: number | null; net: number | null; fees: number | null; feesSource: 'stripe' | 'estimate' | 'mixed' | null;
    payments: number; appGross: number | null; stripeGross: number | null; difference: number | null; earned: number | null;
    /** Failed card charges in the month; null when Stripe could not be read. */
    failedPayments?: number | null; failedAmount?: number | null };
  ai: { requests: number; failedRequests: number; activeAccounts: number; usd: { total: number; gemini: number; claude: number; other: number; platform: number; cacheShared: number; failedAttempts: number; reportNotes: number; direct: number; quotaOverrun: number; cacheSaved: number };
    thb: { total: number; gemini: number; claude: number; platform: number; direct: number } | null;
    perMessage: number | null; perPaidMember: number | null; perActiveAccount: number | null;
    accountMax: number | null; accountMedian: number | null; accountP90: number | null;
    usedUpAccounts: number; paidMembersWithoutAi: number; daysNearCap: number; daysAtCap: number;
    coverage: AiMonth['coverage'] | null };
  quality: { prepared: number; confirmed: number; confirmRateBp: number | null; corrections: number; costPerConfirmed: number | null };
  feedback: AiMonth['feedback'] & { unanswered: number; requests: number; wrongAnswers: number };
  reliability: AiMonth['reliability'] & { geminiFailures: number; claudeFailures: number; confidentialBlocked?: number | null };
  profit: { revenue: number | null; fees: number | null; ai: number | null; platform: number | null; fixed: number; contribution: number | null;
    operating: number | null; marginBp: number | null; breakEvenMembers: number | null;
    positiveMembers: number; negativeMembers: number;
    /** Expected costs with no amount yet: the profit is before these. */
    unknownCosts?: string[] };
  comparison: Record<'gross' | 'net' | 'aiThb' | 'contribution' | 'operating' | 'paidAtEnd' | 'requests', Change>;
}
export interface AccountFigures {
  userId: string; plan: 'paid' | 'trial' | 'granted' | 'admin' | 'free';
  cashRevenue: number; refunds: number; fee: number | null; feeSource: 'stripe' | 'estimate' | null; earnedRevenue: number;
  messages: number; geminiMessages: number; claudeMessages: number; failedRequests: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
  krarokTokens: number; krarokTokensLeft: number | null; tokensUsedUp: boolean;
  aiUsd: number; directUsd: number; ownPlatformUsd: number; retryUsd: number; escalatedUsd: number; billableUsd: number;
  ai: number | null; directAi: number | null; allocatedPlatform: number | null;
  contribution: number | null; allocatedContribution: number | null; earnedContribution: number | null;
  cardsPrepared: number; cardsConfirmed: number; costPerConfirmed: number | null;
}

/** /api/admin-profit-live: a month's report worked out now (no AI note), for the admin page. */
export interface AdminProfitLive {
  month: string;
  /** The current Bangkok month: figures so far, refreshed while the page is open. */
  live: boolean;
  generatedAt: string;
  metrics: ReportMetrics;
  accounts: AccountFigures[];
  settings: { items: { key: string; label: string; kind: string; monthlySatang: number }[]; rate4: number | null; fixedMonthlySatang: number };
  /** Today's AI spend in Bangkok against the app's daily cap (current month only); null when it could not be read. */
  today: { usdMicro: number; capUsd: number; requests: number } | null;
}
