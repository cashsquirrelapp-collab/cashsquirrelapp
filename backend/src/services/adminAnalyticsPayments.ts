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

type PaidInvoice = Pick<Stripe.Invoice, 'id' | 'customer' | 'status' | 'livemode' | 'currency' | 'amount_paid' | 'amount_paid_off_stripe' | 'status_transitions' | 'parent'>;

// Events have already passed the billing webhook's ownership/catalog checks.
// Retrieve the actual amount from Stripe; never infer revenue from the plan price.
export async function analyticsPayments(
  legacy: AnalyticsPaymentRow[],
  promptPay: AnalyticsPromptPayRow[],
  invoiceEvents: AnalyticsInvoiceEvent[],
  accounts: AnalyticsBillingAccount[],
  retrieveInvoice: (id: string) => Promise<PaidInvoice> = async id => {
    if (!configuredStripeLivemode()) throw new Error('Live payment analytics requires Stripe Live access');
    return stripe.invoices.retrieve(id, { expand: ['amount_paid_off_stripe'] });
  },
): Promise<AnalyticsPaymentRow[]> {
  const payments = new Map<string, AnalyticsPaymentRow>();
  for (const payment of legacy) payments.set(payment.payment_id, payment);
  for (const payment of promptPay) {
    if (!payment.livemode) continue;
    payments.set(payment.payment_intent_id, {
      payment_id: payment.payment_intent_id, user_id: payment.user_id,
      amount: Number(payment.amount), currency: payment.currency,
      paid_at: payment.paid_at, refunded: payment.refunded,
    });
  }
  const accountByCustomer = new Map(accounts
    .filter(account => account.stripe_customer_id && account.stripe_livemode !== false)
    .map(account => [account.stripe_customer_id!, account.user_id]));
  const invoiceIds = [...new Set(invoiceEvents.filter(event => event.livemode).map(event => event.object_id))];
  for (let offset = 0; offset < invoiceIds.length; offset += 6) {
    const invoices = await Promise.all(invoiceIds.slice(offset, offset + 6).map(retrieveInvoice));
    for (const invoice of invoices) {
      const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const userId = customer ? accountByCustomer.get(customer) : undefined;
      const paidAt = invoice.status_transitions.paid_at;
      if (!userId || invoice.parent?.subscription_details?.metadata?.app_user_id !== userId) {
        throw new Error('Analytics invoice ownership mismatch');
      }
      if (!invoice.livemode || invoice.status !== 'paid' || invoice.currency !== 'thb'
        || invoice.amount_paid_off_stripe !== 0 || !Number.isSafeInteger(invoice.amount_paid)
        || invoice.amount_paid < 0 || !paidAt) {
        throw new Error('Analytics invoice is not a verified Stripe payment');
      }
      if (!invoice.amount_paid) continue;
      payments.set(invoice.id, {
        payment_id: invoice.id, user_id: userId, amount: invoice.amount_paid,
        currency: invoice.currency, paid_at: new Date(paidAt * 1000).toISOString(), refunded: false,
      });
    }
  }
  return [...payments.values()].sort((a, b) => b.paid_at.localeCompare(a.paid_at));
}
