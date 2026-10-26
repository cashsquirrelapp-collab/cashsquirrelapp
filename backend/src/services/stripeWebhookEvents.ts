// The Stripe events /api/stripe-webhook acts on. The admin page's payment check reads this list to see that Stripe sends
// them to this app (services/paymentReadiness.ts).
export const STRIPE_WEBHOOK_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.finalization_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const;
/** Without these a paid order never turns into Pro: a card payment only arrives this way, a renewal too. */
export const STRIPE_PAYMENT_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded', 'invoice.paid'] as const;
