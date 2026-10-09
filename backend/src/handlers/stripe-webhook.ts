import type Stripe from 'stripe';
import { stripe } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { required } from '../config/env.js';
import { withGuard, readRawBody, HttpError } from '../http/guard.js';
import { subscriptionIdFromInvoice, subscriptionRecord } from '../services/stripeSubscriptions.js';

export const config = { api: { bodyParser: false } };
const handled = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export default withGuard(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') throw new HttpError(400, 'Missing signature');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await readRawBody(req), signature, required('STRIPE_WEBHOOK_SECRET'));
  } catch {
    throw new HttpError(400, 'Invalid webhook signature');
  }
  if (!handled.has(event.type)) {
    res.json({ received: true });
    return;
  }

  let subscription: Stripe.Subscription | null = null;
  let fallbackUserId: string | null = null;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== 'subscription') {
      res.json({ received: true, ignored: true });
      return;
    }
    fallbackUserId = session.client_reference_id;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subscriptionId) throw new HttpError(400, 'Missing subscription reference');
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (!subscription.metadata.app_user_id && fallbackUserId) {
      subscription = await stripe.subscriptions.update(subscription.id, {
        metadata: {
          ...subscription.metadata,
          app_user_id: fallbackUserId,
          workspace_type: 'personal',
          workspace_id: fallbackUserId,
        },
      });
    }
  } else if (event.type.startsWith('customer.subscription.')) {
    subscription = event.data.object as Stripe.Subscription;
  } else {
    const subscriptionId = subscriptionIdFromInvoice(event.data.object as Stripe.Invoice);
    if (!subscriptionId) {
      res.json({ received: true, ignored: true });
      return;
    }
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  const record = subscriptionRecord(subscription, fallbackUserId);
  if (!record) {
    res.json({ received: true, ignored: true });
    return;
  }
  const saved = await getSupabaseAdmin().rpc('cashflow_sync_subscription', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_object_id: subscription.id,
    p_user_id: record.userId,
    p_workspace_id: record.workspaceId,
    p_customer_id: record.customerId,
    p_subscription_id: record.subscriptionId,
    p_price_id: record.priceId,
    p_status: record.status,
    p_period_end: record.currentPeriodEnd,
    p_cancel_at_period_end: record.cancelAtPeriodEnd,
  });
  if (saved.error) throw saved.error;
  res.json({ received: true });
});
