import type Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { HttpError } from '../http/guard.js';
import { required } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { isStaging } from '../security/staging.js';
import { recurringLookup, renewalStepOf, validRecurringPrice } from '../services/cardPlans.js';
import { assertAutoSubscription } from '../services/cardRenewals.js';
import type { PrepaidOrder } from '../services/prepaidPlans.js';

// Owner, 2026-10-25: a monthly card renewal agreed to during the promotion "ขึ้นเป็น ฿271 เองตั้งแต่ ธ.ค.". Its consent
// (v4) says ฿177 a month until 30 Nov 2569, then ฿271 (฿249 + the payment fee). Every day at 09:00 Bangkok this moves
// such a subscription to the regular monthly price once its next renewal falls on or after 1 Dec 2569, with no
// proration: nothing is charged now, the next invoice is ฿271. Cancelled, ended or already moved ones are left alone.

const LIVE_STATES = ['active', 'trialing', 'past_due'];
type Row = { subscription_id: string; status: string; cashflow_prepaid_orders: PrepaidOrder };
export interface AdvanceDeps {
  rows: () => Promise<Row[]>;
  stripe: Pick<Stripe, 'subscriptions' | 'prices'>;
  livemode: boolean;
  dryRun: boolean;
}

export async function advanceCardRenewals(deps: AdvanceDeps) {
  const due = (await deps.rows()).filter(row => LIVE_STATES.includes(row.status) && renewalStepOf(row.cashflow_prepaid_orders));
  const result = { processed: due.length, sent: 0, skipped: 0, failed: 0, reason: undefined as string | undefined };
  if (!due.length) return result;
  const step = renewalStepOf(due[0].cashflow_prepaid_orders)!;
  const prices = await deps.stripe.prices.list({ lookup_keys: [recurringLookup('month', step.from)], active: true, limit: 2 });
  const regular = prices.data[0];
  if (prices.data.length !== 1 || !validRecurringPrice(regular, 'month', deps.livemode, step.from) || regular.unit_amount !== step.total * 100) {
    // The ฿271 price is not in Stripe yet (scripts/stripe-reprice.ts): nothing is moved; the job shows as failed.
    return { ...result, failed: due.length, reason: 'regular_price_missing' };
  }
  for (const row of due) {
    const order = row.cashflow_prepaid_orders;
    try {
      const sub = await deps.stripe.subscriptions.retrieve(row.subscription_id);
      assertAutoSubscription(sub, order);
      const item = sub.items.data[0];
      if (item.price.id === regular.id || item.price.id !== order.price_id || !LIVE_STATES.includes(sub.status)
        || sub.cancel_at_period_end || item.current_period_end * 1000 < step.from) { result.skipped += 1; continue; }
      if (!deps.dryRun) {
        await deps.stripe.subscriptions.update(sub.id, { items: [{ id: item.id, price: regular.id }], proration_behavior: 'none' },
          { idempotencyKey: `krarok-month-step-20261201:${sub.id}` });
      }
      result.sent += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if (req.headers.authorization !== `Bearer ${required('CRON_SECRET')}`) throw new HttpError(401, 'Unauthorized');
  res.setHeader('Cache-Control', 'no-store');
  const admin = getSupabaseAdmin();
  const result = await advanceCardRenewals({
    stripe, livemode: configuredStripeLivemode(), dryRun: isStaging(),
    rows: async () => {
      const read = await admin.from('cashflow_card_subscriptions').select('subscription_id,status,cashflow_prepaid_orders!inner(*)')
        .in('status', LIVE_STATES).eq('cashflow_prepaid_orders.period', 'month').limit(500);
      if (read.error) throw read.error;
      return (read.data ?? []) as unknown as Row[];
    },
  });
  res.json(result);
}
