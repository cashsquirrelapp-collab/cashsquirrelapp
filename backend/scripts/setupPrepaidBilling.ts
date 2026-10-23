/**
 * Dry-run by default. Set STRIPE_SECRET_KEY and STRIPE_MODE in the process environment.
 * npm run billing:setup -- --apply creates/annotates this offer only; never charges anyone.
 * Live operations are restricted to the owner's approved Vispark account.
 */
import Stripe from 'stripe';
import { PRO_PERIODS, PRO_PRICING } from '../../shared/proPricing.js';
import { PREPAID_OFFER, prepaidLookup, validPrepaidPrice } from '../src/services/prepaidPlans.js';
import { stripeLivemodeForKey } from '../src/config/stripe.js';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Set STRIPE_SECRET_KEY in the environment; never paste it into source code.');
const live = stripeLivemodeForKey(key);
if (process.env.STRIPE_MODE !== (live ? 'live' : 'test')) throw new Error('STRIPE_MODE must match the key.');
const apply = process.argv.includes('--apply');
const stripe = new Stripe(key, { maxNetworkRetries: 2 });
const account = await stripe.rawRequest('GET', '/v1/account');
if (live && account.id !== 'acct_1TeotMC4uZ5mcDl1') throw new Error('Wrong live account. Expected approved Vispark account.');
console.log(JSON.stringify({ account: account.id, mode: live ? 'live' : 'test', apply }));

let productId: string | undefined;
const report: Record<string, unknown>[] = [];
let ready = true;
for (const period of PRO_PERIODS) {
  const plan = PRO_PRICING[period];
  const lookup = prepaidLookup(period);
  const metadata = { offer_version: PREPAID_OFFER, period, months: String(plan.months) };
  const matches = await stripe.prices.list({ lookup_keys: [lookup], limit: 2 });
  if (matches.data.length > 1) throw new Error(`Ambiguous price ${lookup}`);
  let price = matches.data[0];
  if (price) {
    // Metadata may be filled after Dashboard creation; economic terms must already match.
    if (!validPrepaidPrice({ ...price, metadata }, period, live)) throw new Error(`Mismatched price ${price.id}; refusing to replace it.`);
    if (apply && !validPrepaidPrice(price, period, live)) {
      price = await stripe.prices.update(price.id, { metadata });
    }
  } else if (apply) {
    if (!productId) {
      const products = await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 });
      const ours = products.filter(p => p.metadata.offer_version === PREPAID_OFFER);
      if (ours.length > 1) throw new Error('Duplicate products for this offer.');
      productId = ours[0]?.id || (await stripe.products.create({
        name: 'krarok.com Pro',
        description: 'Pro จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ',
        metadata: { offer_version: PREPAID_OFFER, app: 'krarok.com' },
      }, { idempotencyKey: `${PREPAID_OFFER}:product` })).id;
    }
    price = await stripe.prices.create({
      product: productId, currency: 'thb', unit_amount: plan.total * 100,
      lookup_key: lookup, metadata,
      nickname: `Pro ${plan.months} เดือน ฿${plan.total} จ่ายครั้งเดียว`,
    }, { idempotencyKey: `${lookup}:price` });
  }
  const valid = Boolean(price && validPrepaidPrice(price, period, live));
  ready &&= valid;
  report.push({ period, months: plan.months, thb: plan.total, price: price?.id ?? null, valid });
}
console.table(report);
const configurations = await stripe.paymentMethodConfigurations.list({ limit: 100 });
const config = configurations.data.find(c => c.id === process.env.KRAROK_PAYMENT_CONFIGURATION)
  || configurations.data.find(c => !process.env.KRAROK_PAYMENT_CONFIGURATION && c.is_default);
const methodsReady = Boolean(config?.active && config.livemode === live
  && config.card?.available && config.card.display_preference.value === 'on'
  && config.promptpay?.available && config.promptpay.display_preference.value === 'on');
const extraMethods = Object.entries(config || {}).filter(([name, value]) =>
  value && typeof value === 'object' && 'display_preference' in value
  && !['card','promptpay','apple_pay','google_pay'].includes(name)
  && (value as {display_preference?: {value?: string}}).display_preference?.value === 'on').map(([name]) => name);
const requiredEvents = ['checkout.session.completed','checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed','checkout.session.expired','charge.refunded',
  'charge.dispute.created','charge.dispute.closed'];
const url = process.env.KRAROK_WEBHOOK_URL || 'https://kraroktunngern.cashsquirrelapp.workers.dev/api/stripe-webhook';
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const endpoint = endpoints.data.find(e => e.url === url && e.status === 'enabled' && e.livemode === live);
const missing = endpoint?.enabled_events.includes('*') ? [] : requiredEvents.filter(e => !endpoint?.enabled_events.includes(e as never));
console.log(JSON.stringify({ configuration: config?.id, methodsReady, extraMethods,
  webhook: endpoint?.id, missingEvents: missing,
  next: 'Apply the reviewed SQL migration, verify signed test webhooks, then set KRAROK_PREPAID_ENABLED=true.' }, null, 2));
// This script never changes webhook secrets, endpoint destinations, or payment configuration.
if (!ready || !methodsReady || extraMethods.length || !endpoint || missing.length) process.exitCode = 2;
