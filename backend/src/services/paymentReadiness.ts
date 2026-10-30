// Can a customer pay for Pro by card and by PromptPay QR right now, at the price on screen? (owner, 2026-10-27). The
// server answers with its own Stripe key and the same rules checkout uses: the switches, the payment methods Stripe
// shows (inspectPaymentMethods), the prices under each lookup key (planReprice with checkout's own price checks), and the
// webhook that turns a paid order into Pro. Reading changes nothing; creating the missing prices is the owner's button.
import type Stripe from 'stripe';
import { PRO_MONTH_REGULAR_FROM, PRO_PERIODS_ON_SALE } from '../../../shared/proPricing.js';
import type { PaymentReadiness, ReadinessPrice, ReadinessState } from '../../../shared/paymentReadiness.js';
import { trustedOrigins } from '../config/env.js';
import { HttpError } from '../http/guard.js';
import { inspectPaymentMethods, prepaidEnabled } from './prepaidBilling.js';
import { planReprice, priceMomentsFrom, type PlannedPrice } from './stripeCatalog.js';
import { STRIPE_PAYMENT_EVENTS, STRIPE_WEBHOOK_EVENTS } from './stripeWebhookEvents.js';

type StripeReader = Pick<Stripe, 'prices' | 'paymentMethodConfigurations' | 'webhookEndpoints'>;

/** A restricted key without this read: the section is unknown, never a guess. Stripe's message is not passed on (it names the key). */
const permissionDenied = (error: unknown) => {
  const value = error as { statusCode?: number; type?: string; code?: string } | null;
  return value?.statusCode === 403 || value?.type === 'StripePermissionError' || value?.code === 'permission_missing';
};
async function attempt<T>(read: () => Promise<T>, permission: string): Promise<{ value?: T; permission?: string }> {
  try { return { value: await read() }; }
  catch (error) { return permissionDenied(error) ? { permission } : {}; }
}

const priceItem = (row: PlannedPrice, now: number): ReadinessPrice => ({
  // Today's prices are planned at the promotion's last moment; only the regular price from 1 Dec 2569 is sold later.
  kind: row.kind, period: row.period, from: row.from, later: now < PRO_MONTH_REGULAR_FROM && row.at >= PRO_MONTH_REGULAR_FROM, expected: row.newAmount, current: row.currentAmount,
  state: row.action === 'ok' ? 'ok' : row.currentAmount === null ? 'missing' : 'wrong',
  creatable: row.action === 'create' && Boolean(row.params),
});

function webhookCheck(endpoints: Stripe.WebhookEndpoint[], livemode: boolean): Pick<PaymentReadiness['webhook'], 'state' | 'missingEvents' | 'otherHosts'> {
  // Any of the site's own addresses (krarok.com and workers.dev since 2026-10-31) is ours.
  const hosts = trustedOrigins().map(origin => new URL(origin).host);
  const ours = endpoints.filter(endpoint => {
    try { const url = new URL(endpoint.url); return hosts.includes(url.host) && url.pathname === '/api/stripe-webhook' && endpoint.livemode === livemode; } catch { return false; }
  });
  const enabled = ours.filter(endpoint => endpoint.status === 'enabled');
  const sends = (event: string) => enabled.some(endpoint => endpoint.enabled_events.includes('*') || endpoint.enabled_events.includes(event));
  const otherHosts = [...new Set(endpoints.filter(endpoint => endpoint.status === 'enabled' && endpoint.livemode === livemode && !ours.includes(endpoint))
    .map(endpoint => { try { return new URL(endpoint.url).host; } catch { return ''; } }).filter(Boolean))];
  const missingEvents = STRIPE_WEBHOOK_EVENTS.filter(event => !sends(event));
  return { state: enabled.length && STRIPE_PAYMENT_EVENTS.every(sends) ? 'ok' : 'problem', missingEvents, otherHosts };
}

export async function paymentReadiness(stripe: StripeReader, livemode: boolean, now = Date.now()): Promise<PaymentReadiness> {
  const publishableKey = (process.env.STRIPE_PUBLISHABLE_KEY || '').startsWith(livemode ? 'pk_live_' : 'pk_test_');
  const server = { state: (prepaidEnabled() && publishableKey ? 'ok' : 'problem') as ReadinessState, prepaid: prepaidEnabled(), publishableKey };
  const [configurations, plan, endpoints] = await Promise.all([
    attempt(() => stripe.paymentMethodConfigurations.list({ limit: 100 }).then(list => list.data), 'Payment Method Configurations: Read'),
    attempt(() => planReprice(stripe, livemode, priceMomentsFrom(now), PRO_PERIODS_ON_SALE), 'Prices: Read'),
    attempt(() => stripe.webhookEndpoints.list({ limit: 100 }).then(list => list.data), 'Webhook Endpoints: Read'),
  ]);

  const found = configurations.value ? inspectPaymentMethods(configurations.value, livemode) : null;
  const methods: PaymentReadiness['methods'] = found
    ? { state: found.usable && !found.extra.length ? 'ok' : 'problem', card: found.card, promptpay: found.promptpay, extra: found.extra }
    : { state: 'unknown', card: false, promptpay: false, extra: [], ...(configurations.permission ? { permission: configurations.permission } : {}) };

  const items = (plan.value || []).map(row => priceItem(row, now));
  const today = items.filter(item => !item.later);
  const prices: PaymentReadiness['prices'] = plan.value
    ? { state: today.length && today.every(item => item.state === 'ok') ? 'ok' : 'problem', items }
    : { state: 'unknown', items: [], ...(plan.permission ? { permission: plan.permission } : {}) };

  const webhook: PaymentReadiness['webhook'] = endpoints.value
    ? webhookCheck(endpoints.value, livemode)
    : { state: 'unknown', missingEvents: [], otherHosts: [], ...(endpoints.permission ? { permission: endpoints.permission } : {}) };

  const parts = [server.state, methods.state, prices.state, webhook.state];
  const later = items.filter(item => item.later);
  return {
    livemode, checkedAt: new Date(now).toISOString(),
    status: parts.includes('problem') ? 'blocked' : parts.includes('unknown') ? 'unknown' : 'ready',
    nextPriceReady: now >= PRO_MONTH_REGULAR_FROM ? null : plan.value ? later.length > 0 && later.every(item => item.state === 'ok') : false,
    server, methods, prices, webhook,
    creatable: items.filter(item => item.creatable).length,
  };
}

/**
 * The owner's button: create the prices that are missing or at another amount, for the periods on sale, today's and
 * 1 Dec's (each copied from a price of the same kind, its lookup key moved over; existing subscriptions keep theirs).
 * Nothing else in Stripe changes. The same request repeated creates nothing twice (idempotency key per price).
 */
export async function createMissingPrices(stripe: Pick<Stripe, 'prices'>, livemode: boolean, now = Date.now()): Promise<number> {
  const plan = await planReprice(stripe, livemode, priceMomentsFrom(now), PRO_PERIODS_ON_SALE);
  let created = 0;
  for (const row of plan) {
    if (row.action !== 'create' || !row.params) continue;
    try {
      await stripe.prices.create(row.params, { idempotencyKey: `krarok-price:${livemode ? 'live' : 'test'}:${row.lookupKey}:${row.params.unit_amount}` });
    } catch (error) {
      if (permissionDenied(error)) throw new HttpError(403, 'คีย์ Stripe ของเซิร์ฟเวอร์ไม่มีสิทธิ์สร้างราคา (Prices: Write)', 'stripe_permission');
      throw error;
    }
    created++;
  }
  return created;
}
