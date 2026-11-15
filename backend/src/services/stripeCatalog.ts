// The Stripe prices checkout sells, planned against what the Stripe catalog holds (owner, 2026-10-25): until 30 Nov 2569
// ฿177 / ฿895 / ฿1,562 (the customer pays the card fee), and from 1 Dec 2569 ฿188 a month (฿169 + the fee; ฿271 was planned
// before 2026-11-15) under its own lookup key, so checkout switches by itself at midnight. Plus (owner, 2026-11-15) is
// ฿115 a month (฿99 + the fee) on its own product (prepaidPlans.PLUS_PRODUCT_ID), which the create button makes first. Checkout only sells a price that matches the screen to the
// satang (validPrepaidPrice / validRecurringPrice). Used by scripts/stripe-reprice.ts (the owner's terminal) and by the
// admin page's payment check (services/paymentReadiness.ts). Planning reads only; creating is the caller's choice.
import type Stripe from 'stripe';
import { PRO_MONTH_REGULAR_FROM, PRO_PERIODS, type ProPeriod } from '../../../shared/proPricing.js';
import type { PaidTier } from '../../../shared/plans.js';
import { PREPAID_OFFER, planPriceAt, plusProductId, prepaidLookup, validPrepaidPrice } from './prepaidPlans.js';
import { recurringLookup, recurringProductId, validRecurringPrice } from './cardPlans.js';

export type PriceKind = 'one_time' | 'recurring';
export interface PlannedPrice { kind: PriceKind; tier: PaidTier; period: ProPeriod; lookupKey: string; from: string; at: number; currentAmount: number | null; newAmount: number; action: 'create' | 'ok' | 'missing'; params?: Stripe.PriceCreateParams }

export type PriceReader = { prices: { list(params: Stripe.PriceListParams): Promise<{ data: Stripe.Price[] }> } };
/** The moments whose prices Stripe must hold: the last moment of the promotion and the first of the regular price. */
export const PRICE_MOMENTS = [PRO_MONTH_REGULAR_FROM - 1, PRO_MONTH_REGULAR_FROM] as const;
/** The moments that still matter at `now`: both before 1 Dec 2569, only the regular price from then on. */
export const priceMomentsFrom = (now: number): readonly number[] => (now < PRO_MONTH_REGULAR_FROM ? PRICE_MOMENTS : [now]);
const lookupOf = (kind: PriceKind, period: ProPeriod, at: number, tier: PaidTier = 'pro') => (kind === 'one_time' ? prepaidLookup(period, at, tier) : recurringLookup(period, at, tier));
/** The Bangkok date of a moment, "2026-12-01". */
const bangkokDay = (at: number) => new Date(at + 7 * 3600_000).toISOString().slice(0, 10);

function createParams(kind: PriceKind, period: ProPeriod, at: number, base: Stripe.Price, lookupKey: string): Stripe.PriceCreateParams {
  const { months, total } = planPriceAt('pro', period, at)!;
  const product = typeof base.product === 'string' ? base.product : base.product.id;
  return {
    product: kind === 'recurring' ? recurringProductId() : product,
    currency: 'thb', unit_amount: total * 100, lookup_key: lookupKey, transfer_lookup_key: true,
    nickname: `Krarok Pro ${period} ฿${total.toLocaleString('en-US')} (card fee included, from ${bangkokDay(at)})`,
    metadata: kind === 'one_time' ? { ...base.metadata, offer_version: PREPAID_OFFER, period, months: String(months) } : { ...base.metadata },
    ...(base.tax_behavior && base.tax_behavior !== 'unspecified' ? { tax_behavior: base.tax_behavior } : {}),
    ...(kind === 'recurring' ? { recurring: months === 12 ? { interval: 'year', interval_count: 1, usage_type: 'licensed' } : { interval: 'month', interval_count: months, usage_type: 'licensed' } } : {}),
  };
}

/** Plus's price of a kind, made from nothing (no earlier Plus price to copy): on Plus's own product. */
function plusParams(kind: PriceKind, lookupKey: string): Stripe.PriceCreateParams {
  const { months, total } = planPriceAt('plus', 'month')!;
  return {
    product: plusProductId(), currency: 'thb', unit_amount: total * 100, lookup_key: lookupKey, transfer_lookup_key: true,
    nickname: `Krarok Plus month ฿${total.toLocaleString('en-US')} (card fee included)`,
    metadata: kind === 'one_time' ? { offer_version: PREPAID_OFFER, period: 'month', months: String(months), tier: 'plus' } : { tier: 'plus', period: 'month' },
    ...(kind === 'recurring' ? { recurring: { interval: 'month', interval_count: months, usage_type: 'licensed' } } : {}),
  };
}

/** Plus's two prices (one-time and auto-renewal), checked and planned like Pro's. Changes nothing by itself. */
export async function planPlusPrices(stripe: PriceReader, livemode: boolean, now: number = Date.now()): Promise<PlannedPrice[]> {
  const plan: PlannedPrice[] = [];
  for (const kind of ['one_time', 'recurring'] as const) {
    const lookupKey = lookupOf(kind, 'month', now, 'plus');
    const found = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 2 })).data;
    const current = found[0];
    const row: PlannedPrice = { kind, tier: 'plus', period: 'month', lookupKey, from: bangkokDay(now), at: now,
      currentAmount: current ? (current.unit_amount ?? 0) / 100 : null, newAmount: planPriceAt('plus', 'month')!.total, action: 'create', params: plusParams(kind, lookupKey) };
    const valid = current && (kind === 'one_time' ? validPrepaidPrice(current, 'month', livemode, now, 'plus') : validRecurringPrice(current, 'month', livemode, now, 'plus'));
    plan.push(valid && found.length === 1 ? { ...row, action: 'ok', params: undefined } : row);
  }
  return plan;
}

/** What to create so every price sold on these dates exists at the price on screen. Changes nothing by itself. */
export async function planReprice(stripe: PriceReader, livemode: boolean, moments: readonly number[] = PRICE_MOMENTS, periods: readonly ProPeriod[] = PRO_PERIODS): Promise<PlannedPrice[]> {
  const plan: PlannedPrice[] = [];
  const seen = new Set<string>();
  const read = async (lookupKey: string) => (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 2 })).data;
  for (const at of moments) for (const period of periods) {
    const { total } = planPriceAt('pro', period, at)!;
    for (const kind of ['one_time', 'recurring'] as const) {
      const lookupKey = lookupOf(kind, period, at);
      if (seen.has(lookupKey)) continue;
      seen.add(lookupKey);
      const found = await read(lookupKey);
      const current = found[0];
      const row: PlannedPrice = { kind, tier: 'pro', period, lookupKey, from: bangkokDay(at), at,
        currentAmount: current ? (current.unit_amount ?? 0) / 100 : null, newAmount: total, action: 'missing' };
      if (!current) {
        // A lookup key new on this date: made from the same kind of price sold on the first date, if that one exists.
        const earlier = lookupOf(kind, period, moments[0]);
        const base = earlier !== lookupKey ? (await read(earlier))[0] : undefined;
        plan.push(base ? { ...row, action: 'create', params: createParams(kind, period, at, base, lookupKey) } : row);
        continue;
      }
      const valid = kind === 'one_time' ? validPrepaidPrice(current, period, livemode, at) : validRecurringPrice(current, period, livemode, at);
      if (valid && found.length === 1) { plan.push({ ...row, action: 'ok' }); continue; }
      plan.push({ ...row, action: 'create', params: createParams(kind, period, at, current, lookupKey) });
    }
  }
  return plan;
}
