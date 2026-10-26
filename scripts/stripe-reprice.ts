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
import { planReprice } from '../backend/src/services/stripeCatalog';

// The planner lives with the server (the admin page's payment check uses it too); the script keeps its own names.
export { planReprice, PRICE_MOMENTS, type PlannedPrice } from '../backend/src/services/stripeCatalog';

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
