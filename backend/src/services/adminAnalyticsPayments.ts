import type Stripe from 'stripe';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';

export type AnalyticsPaymentRow = {
  payment_id: string; user_id: string; amount: number; currency: string; paid_at: string; refunded: boolean;
};
export type AnalyticsPromptPayRow = Omit<AnalyticsPaymentRow, 'payment_id'> & {
  payment_intent_id: string; livemode: boolean;
};
export type AnalyticsInvoiceEvent = { object_id: string; livemode: boolean };
export type AnalyticsBillingAccount = { user_id: string; stripe_customer_id?: string | null; stripe_livemode?: boolean | null };
export type AnalyticsPrepaidOrderRow = {
  payment_id: string | null; user_id: string; amount: number; paid_at: string | null;
  status: string; livemode: boolean;
};
export type AnalyticsCardCycleRow = {
  invoice_id: string; payment_id: string; user_id: string; refunded: boolean;
  cashflow_prepaid_orders: { livemode: boolean };
};

type PaidInvoice = Pick<Stripe.Invoice, 'id' | 'customer' | 'status' | 'livemode' | 'currency' | 'amount_paid' | 'amount_paid_off_stripe' | 'status_transitions' | 'parent'>;
type AdditionalPaymentSources = {
  prepaid?: AnalyticsPrepaidOrderRow[];
  cardCycles?: AnalyticsCardCycleRow[];
  retrieveInvoice?: (id: string) => Promise<PaidInvoice>;
};

async function retrievePaidInvoice(id: string): Promise<PaidInvoice> {
  if (!configuredStripeLivemode()) throw new Error('Live payment analytics requires Stripe Live access');
  return stripe.invoices.retrieve(id, { expand: ['amount_paid_off_stripe'] });
}

// Events have already passed the billing webhook's ownership/catalog checks.
// Retrieve the actual amount from Stripe; never infer revenue from the plan price.
export async function analyticsPayments(
  legacy: AnalyticsPaymentRow[],
  promptPay: AnalyticsPromptPayRow[],
  invoiceEvents: AnalyticsInvoiceEvent[],
  accounts: AnalyticsBillingAccount[],
  { prepaid = [], cardCycles = [], retrieveInvoice = retrievePaidInvoice }: AdditionalPaymentSources = {},
): Promise<AnalyticsPaymentRow[]> {
  const payments = new Map<string, AnalyticsPaymentRow>();
  const recordPayment = (payment: AnalyticsPaymentRow) => {
    const existing = payments.get(payment.payment_id);
    if (existing && (existing.user_id !== payment.user_id || Number(existing.amount) !== Number(payment.amount)
      || existing.currency !== payment.currency)) throw new Error('Analytics payment identity mismatch');
    payments.set(payment.payment_id, { ...payment, refunded: payment.refunded || Boolean(existing?.refunded) });
  };
  for (const payment of legacy) recordPayment(payment);
  for (const payment of promptPay) {
    if (!payment.livemode) continue;
    recordPayment({
      payment_id: payment.payment_intent_id, user_id: payment.user_id,
      amount: Number(payment.amount), currency: payment.currency,
      paid_at: payment.paid_at, refunded: payment.refunded,
    });
  }
  // Fulfillment validates Stripe's paid amount before storing these service-only orders.
  // Direct QR and one-time Checkout do not write either of the older payment tables.
  for (const order of prepaid) {
    if (!order.livemode || !['paid', 'refunded'].includes(order.status)) continue;
    if (!order.payment_id?.startsWith('pi_') || !order.user_id || !order.paid_at
      || !Number.isFinite(Date.parse(order.paid_at)) || !Number.isSafeInteger(Number(order.amount))
      || Number(order.amount) <= 0) throw new Error('Analytics prepaid payment is incomplete');
    recordPayment({
      payment_id: order.payment_id, user_id: order.user_id, amount: Number(order.amount),
      currency: 'thb', paid_at: order.paid_at, refunded: order.status === 'refunded',
    });
  }
  const cycleByInvoice = new Map(cardCycles
    .filter(cycle => cycle.cashflow_prepaid_orders?.livemode === true)
    .map(cycle => [cycle.invoice_id, cycle]));
  const accountByCustomer = new Map(accounts
    .filter(account => account.stripe_customer_id && account.stripe_livemode !== false)
    .map(account => [account.stripe_customer_id!, account.user_id]));
  // Auto-renewing card invoices have their own verified cycle ledger and bypass legacy events.
  const invoiceIds = [...new Set([
    ...invoiceEvents.filter(event => event.livemode).map(event => event.object_id),
    ...cycleByInvoice.keys(),
  ])];
  for (let offset = 0; offset < invoiceIds.length; offset += 6) {
    const invoices = await Promise.all(invoiceIds.slice(offset, offset + 6).map(retrieveInvoice));
    for (const invoice of invoices) {
      const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const userId = customer ? accountByCustomer.get(customer) : undefined;
      const cycle = cycleByInvoice.get(invoice.id);
      const paidAt = invoice.status_transitions.paid_at;
      if (!userId || invoice.parent?.subscription_details?.metadata?.app_user_id !== userId
        || (cycle && (cycle.user_id !== userId || !cycle.payment_id.startsWith('pi_')))) {
        throw new Error('Analytics invoice ownership mismatch');
      }
      if (!invoice.livemode || invoice.status !== 'paid' || invoice.currency !== 'thb'
        || invoice.amount_paid_off_stripe !== 0 || !Number.isSafeInteger(invoice.amount_paid)
        || invoice.amount_paid < 0 || !Number.isSafeInteger(paidAt) || !paidAt || paidAt < 0) {
        throw new Error('Analytics invoice is not a verified Stripe payment');
      }
      if (!invoice.amount_paid) continue;
      if (cycle) payments.delete(invoice.id);
      recordPayment({
        payment_id: cycle?.payment_id || invoice.id, user_id: userId, amount: invoice.amount_paid,
        currency: invoice.currency, paid_at: new Date(paidAt * 1000).toISOString(), refunded: cycle?.refunded || false,
      });
    }
  }
  return [...payments.values()].sort((a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at));
}
