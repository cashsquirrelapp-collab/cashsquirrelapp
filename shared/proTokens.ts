import { PRO_MONTH_RENEWAL_STEP, proMonthPromoRunning, type ProPeriod } from './proPricing.js';
import { PLAN_LIMITS, type PaidTier } from './plans.js';

// Krarok Tokens a month for paid Pro (owner, 2026-10-25). The owner's profit rule is at least 70% when every member uses
// all of it ("กรณีแย่สุดขั้นต่ำก็คือ 70%"), 75–80% on average; for the November promotion the owner accepted 54% so that
// every member gets the same allowance ("กูยอมกำไรแค่ 54% ก็ได้"), and long-plan buyers must never get fewer tokens than
// a month ("คนที่ซื้อรายปีเขาต้องอยากได้อะไรที่มันคุ้มกว่า ... จะไปลดโทเค็นเขามันไม่ได้"). Worst case, at 500 members,
// ฿33.50 a dollar, 1 token = $0.001, 7% VAT on the AI bills, the last message's overrun (100 tokens) and about ฿10.41 a
// member of running costs (Cloudflare, Supabase, LINE OA, domain, tools, shared AI cache):
//   ฿249 a month (planned from 1 Dec 2569; ฿169 since the owner's 2026-11-15 plan, still 1,650 tokens)  1,650 → 70.6%   (half use 83.9%)
//   ฿159 a month (promotion to 30 Nov)   1,650 → 54.0%   (half use 74.9%)
//   6 months and a year: not on sale for now (shared/proPricing.ts); members who have one also get 1,650.
// Tokens still renew every month on the renewal day, for every plan.

export type ProTokenPlan = 'month' | 'monthPromo' | 'halfYear' | 'year';
export const PRO_PLAN_TOKENS: Readonly<Record<ProTokenPlan, number>> = { month: 1650, monthPromo: 1650, halfYear: 1650, year: 1650 };

/** A paid stretch: a one-time order (its charged amount is known) or one card renewal cycle (amount by date), of Pro or
 *  Plus (shared/plans.ts; orders before Plus are Pro). */
export interface PaidStretch { period: ProPeriod; chargedBaht: number | null; start: number; end: number; tier?: PaidTier }

/** The token plan of a paid stretch. A month is the regular plan when the regular charge (฿188 from 1 Dec 2569; ฿271 was
 * planned) or more was paid, or, for a card renewal, when the cycle starts on or after 1 Dec 2569. */
export function proTokenPlan(stretch: Pick<PaidStretch, 'period' | 'chargedBaht' | 'start'>): ProTokenPlan {
  if (stretch.period === 'halfYear' || stretch.period === 'year') return stretch.period;
  if (stretch.chargedBaht !== null) return stretch.chargedBaht >= PRO_MONTH_RENEWAL_STEP.total ? 'month' : 'monthPromo';
  return stretch.start >= PRO_MONTH_RENEWAL_STEP.from ? 'month' : 'monthPromo';
}

/** Tokens a month for a paid stretch. Owner, 2026-10-25 ("ให้ทุกคนได้ 1,650"): every Pro account at once, also periods
 * paid before, owner grants and older subscriptions (their default, AI_PRO_TOKENS_PER_CYCLE, is 1,650 too). */
export function proTokensFor(stretch: Pick<PaidStretch, 'period' | 'chargedBaht' | 'start' | 'tier'>): number {
  // Plus: 650 a month (owner, 2026-11-15); Pro by its plan, 1,650.
  if (stretch.tier === 'plus') return PLAN_LIMITS.plus.tokens!;
  return PRO_PLAN_TOKENS[proTokenPlan(stretch)];
}

/** The paid stretch that covers this moment: Pro before Plus when both do (the database names the plan the same way),
 *  then the latest one when two overlap. */
export function coveringStretch(stretches: readonly PaidStretch[], now: number): PaidStretch | undefined {
  return stretches.filter(item => item.start <= now && now < item.end)
    .sort((a, b) => Number(a.tier === 'plus') - Number(b.tier === 'plus') || b.start - a.start)[0];
}

/** What a period sold now gives a month, for the plans page (the same amounts the server applies). */
export function proTokensOnSale(period: ProPeriod, now: Date | number = Date.now()): number {
  if (period === 'month') return PRO_PLAN_TOKENS[proMonthPromoRunning(now) ? 'monthPromo' : 'month'];
  return PRO_PLAN_TOKENS[period];
}
