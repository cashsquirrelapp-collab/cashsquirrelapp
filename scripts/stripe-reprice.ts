// Makes the Stripe catalog hold the prices in shared/proPricing.ts for both dates (owner, 2026-10-25): until 30 Nov 2569
// ฿177 / ฿895 / ฿1,562 (the customer pays the card fee), and from 1 Dec 2569 ฿271 a month (฿249 + the fee) under its own
// lookup key, so checkout switches by itself at midnight. Checkout only sells a price that matches the screen to the
// satang (validPrepaidPrice / validRecurringPrice), so until this runs, that price stays closed instead of charging
// another amount.
//
// The owner runs it, with the owner's own key in the environment (never shown to anyone, never saved):
//   STRIPE_SECRET_KEY=sk_test_… node --import tsx scripts/stripe-reprice.ts            (shows what it would do)
//   STRIPE_SECRET_KEY=sk_test_… node --import tsx scripts/stripe-reprice.ts --apply    (creates the new prices)
// Test mode first (sk_test_…), then live (sk_live_…). For each lookup key that exists at another amount, it creates the
// new price on the same product with the same metadata and moves the lookup key to it; a lookup key that does not exist
// yet (the price from 1 Dec) is made from the same kind of price sold before it. Existing subscriptions keep their price.
import Stripe from 'stripe';
import { pathToFileURL } from 'node:url';
import { PRO_MONTH_REGULAR_FROM, PRO_PERIODS, proPricing, type ProPeriod } from '../shared/proPricing';
import { PREPAID_OFFER, prepaidLookup, validPrepaidPrice } from '../backend/src/services/prepaidPlans';
import { recurringLookup, recurringProductId, validRecurringPrice } from '../backend/src/services/cardPlans';

type Kind = 'one_time' | 'recurring';
export interface PlannedPrice { kind: Kind; period: ProPeriod; lookupKey: string; from: string; currentAmount: number | null; newAmount: number; action: 'create' | 'ok' | 'missing'; params?: Stripe.PriceCreateParams }

type PriceReader = { prices: { list(params: Stripe.PriceListParams): Promise<{ data: Stripe.Price[] }> } };
/** The moments whose prices Stripe must hold: the last moment of the promotion and the first of the regular price. */
export const PRICE_MOMENTS = [PRO_MONTH_REGULAR_FROM - 1, PRO_MONTH_REGULAR_FROM] as const;
const lookupOf = (kind: Kind, period: ProPeriod, at: number) => (kind === 'one_time' ? prepaidLookup(period, at) : recurringLookup(period, at));

function createParams(kind: Kind, period: ProPeriod, at: number, base: Stripe.Price, lookupKey: string): Stripe.PriceCreateParams {
  const { months, total } = proPricing(at)[period];
  const product = typeof base.product === 'string' ? base.product : base.product.id;
  return {
    product: kind === 'recurring' ? recurringProductId() : product,
    currency: 'thb', unit_amount: total * 100, lookup_key: lookupKey, transfer_lookup_key: true,
    nickname: `Krarok Pro ${period} ฿${total.toLocaleString('en-US')} (card fee included, from ${new Date(at + 7 * 3600_000).toISOString().slice(0, 10)})`,
    metadata: kind === 'one_time' ? { ...base.metadata, offer_version: PREPAID_OFFER, period, months: String(months) } : { ...base.metadata },
    ...(base.tax_behavior && base.tax_behavior !== 'unspecified' ? { tax_behavior: base.tax_behavior } : {}),
    ...(kind === 'recurring' ? { recurring: months === 12 ? { interval: 'year', interval_count: 1, usage_type: 'licensed' } : { interval: 'month', interval_count: months, usage_type: 'licensed' } } : {}),
  };
}

/** What to create so every price sold on either date exists at the price on screen. Changes nothing by itself. */
export async function planReprice(stripe: PriceReader, livemode: boolean, moments: readonly number[] = PRICE_MOMENTS): Promise<PlannedPrice[]> {
  const plan: PlannedPrice[] = [];
  const seen = new Set<string>();
  const read = async (lookupKey: string) => (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 2 })).data;
  for (const at of moments) for (const period of PRO_PERIODS) {
    const { total } = proPricing(at)[period];
    for (const kind of ['one_time', 'recurring'] as const) {
      const lookupKey = lookupOf(kind, period, at);
      if (seen.has(lookupKey)) continue;
      seen.add(lookupKey);
      const found = await read(lookupKey);
      const current = found[0];
      const row: PlannedPrice = { kind, period, lookupKey, from: new Date(at + 7 * 3600_000).toISOString().slice(0, 10),
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

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || !/^sk_(test|live)_/.test(key)) {
    console.log('Set STRIPE_SECRET_KEY to your sk_test_… or sk_live_… key in this terminal first (it is not printed or saved).');
    process.exitCode = 1;
    return;
  }
  const livemode = key.startsWith('sk_live_');
  const apply = process.argv.includes('--apply');
  const stripe = new Stripe(key);
  console.log(`Stripe ${livemode ? 'LIVE' : 'test'} mode. ${apply ? 'Creating the new prices.' : 'Dry run: nothing is changed (add --apply to create).'}`);
  const plan = await planReprice(stripe, livemode);
  for (const row of plan) {
    const now = row.currentAmount === null ? 'none' : `฿${row.currentAmount}`;
    console.log(`  ${row.lookupKey.padEnd(48)} ${row.kind.padEnd(9)} from ${row.from} now ${now.padEnd(8)} → ฿${row.newAmount}  ${row.action === 'ok' ? 'already right' : row.action === 'missing' ? 'not in this account (left alone)' : apply ? 'creating' : 'would create'}`);
  }
  if (!apply) return;
  for (const row of plan) if (row.action === 'create' && row.params) await stripe.prices.create(row.params);
  // Read back what checkout will read, with the same checks.
  const after = await planReprice(stripe, livemode);
  const wrong = after.filter(row => row.action === 'create');
  console.log(wrong.length ? `Not right yet: ${wrong.map(row => row.lookupKey).join(', ')}` : 'Done: every price on screen, until 30 Nov and from 1 Dec, exists in Stripe.');
  if (wrong.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => {
  console.error('Stopped:', (error as Error).message);
  process.exitCode = 1;
});
