import type Stripe from 'stripe';
import { required } from '../config/env.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function id(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id || null;
}

export type StripeSubscriptionRecord = {
  userId: string;
  workspaceId: string;
  customerId: string | null;
  subscriptionId: string;
  priceId: string;
  status: Stripe.Subscription.Status;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export function subscriptionRecord(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null,
): StripeSubscriptionRecord | null {
  const expectedPrice = required('STRIPE_PRO_PRICE_ID');
  const item = subscription.items.data.find(candidate => {
    const price = candidate.price;
    return price.id === expectedPrice
      && price.currency === 'thb'
      && price.unit_amount === 14900
      && price.recurring?.interval === 'month'
      && price.recurring.interval_count === 1;
  });
  if (!item) return null;

  const metadataUser = subscription.metadata.app_user_id;
  const userId = uuid.test(metadataUser || '') ? metadataUser : fallbackUserId;
  if (!userId || !uuid.test(userId)) return null;
  const workspaceType = subscription.metadata.workspace_type || 'personal';
  const workspaceId = subscription.metadata.workspace_id || userId;
  if (workspaceType !== 'personal' || workspaceId !== userId || !uuid.test(workspaceId)) return null;

  const periodEnd = typeof item.current_period_end === 'number'
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  return {
    userId,
    workspaceId,
    customerId: id(subscription.customer),
    subscriptionId: subscription.id,
    priceId: item.price.id,
    status: subscription.status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const reference = (invoice as any).parent?.subscription_details?.subscription;
  return id(reference);
}
