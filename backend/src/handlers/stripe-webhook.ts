import { syncAutoSubscription, applyAutoInvoice, applyAutoPayment } from '../services/cardRenewals.js';
import type Stripe from 'stripe';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { required } from '../config/env.js';
import { withGuard, readRawBody, HttpError } from '../http/guard.js';
import {
  getStripeBillingCatalog,
  invoiceIntroDiscount,
  paidPeriodFromInvoiceLines,
  PRO_OFFER_VERSION,
  PRO_STANDARD_OFFER_VERSION,
  subscriptionIdFromInvoice,
  subscriptionRecord,
  validatePaidInvoicePrice,
} from '../services/stripeSubscriptions.js';
import { promptPayCheckoutRecord, validatePromptPayLineItems } from '../services/promptPay.js';

import { applyPrepaidSession, retrieveAndApplyPrepaid } from '../services/prepaidBilling.js';
import { retrieveAndApplyDirectQr } from '../services/directPromptPay.js';
import { PREPAID_OFFER } from '../services/prepaidPlans.js';

export const config = { api: { bodyParser: false } };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const handled = new Set([
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
]);

function id(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id || null;
}

function configuredLegacyPaymentLink(): string | null {
  return process.env.STRIPE_LEGACY_PAYMENT_LINK_ID?.trim() || null;
}

function isLegacySession(session: Stripe.Checkout.Session): boolean {
  const expectedLink = configuredLegacyPaymentLink();
  return Boolean(expectedLink)
    && id(session.payment_link) === expectedLink
    && session.mode === 'payment'
    && session.currency === 'thb'
    && session.amount_total === 14_900;
}

async function applyLegacyPayment(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  refund: boolean,
): Promise<boolean> {
  if (!isLegacySession(session)) return false;
  if (!refund && session.payment_status !== 'paid') return true;
  if (!session.client_reference_id || !uuid.test(session.client_reference_id)) {
    throw new HttpError(400, 'Invalid legacy account reference');
  }
  const paymentId = id(session.payment_intent);
  if (!paymentId) throw new HttpError(400, 'Missing legacy payment reference');
  const saved = await getSupabaseAdmin().rpc('cashflow_process_payment', {
    p_event_id: event.id,
    p_payment_id: paymentId,
    p_user_id: session.client_reference_id,
    p_amount: session.amount_total,
    p_currency: session.currency,
    p_paid_at: new Date(session.created * 1000).toISOString(),
    p_refund: refund,
  });
  if (saved.error) throw saved.error;
  if (!refund) {
    // A delayed legacy Payment Link success can race an already-reserved
    // recurring Checkout. Expire only a known, still-open Session; an
    // unknown-outcome reservation must remain recoverable by idempotent retry.
    const admin = getSupabaseAdmin();
    const pending = await admin
      .from('subscriptions')
      .select('stripe_customer_id,stripe_checkout_reservation_id,stripe_checkout_session_id,stripe_checkout_method')
      .eq('user_id', session.client_reference_id)
      .maybeSingle();
    if (pending.error) throw pending.error;
    const row = pending.data as {
      stripe_customer_id: string | null;
      stripe_checkout_reservation_id: string | null;
      stripe_checkout_session_id: string | null;
      stripe_checkout_method: 'card' | 'promptpay' | null;
    } | null;
    if (row?.stripe_checkout_session_id && row.stripe_checkout_reservation_id) {
      const recurring = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
      if (recurring.livemode !== configuredStripeLivemode()
        || recurring.mode !== ((recurring.metadata?.offer_version === PREPAID_OFFER && recurring.metadata?.auto_renew !== 'true') || row.stripe_checkout_method === 'promptpay' ? 'payment' : 'subscription')
        || recurring.client_reference_id !== session.client_reference_id
        || recurring.metadata?.app_user_id !== session.client_reference_id
        || recurring.metadata?.checkout_reservation_id !== row.stripe_checkout_reservation_id
        || id(recurring.customer) !== row.stripe_customer_id) {
        throw new Error('Pending recurring Checkout failed ownership validation');
      }
      if (recurring.status === 'open') {
        const expired = await stripe.checkout.sessions.expire(recurring.id);
        if (expired.status !== 'expired') throw new Error('Could not expire overlapping recurring Checkout');
      }
      if (recurring.status === 'open' || recurring.status === 'expired') {
        if (recurring.metadata?.offer_version === PREPAID_OFFER) {
          await retrieveAndApplyPrepaid(recurring.id);
        }
        const released = await admin.rpc('cashflow_release_billing_checkout', {
          p_user_id: session.client_reference_id,
          p_reservation_id: row.stripe_checkout_reservation_id,
        });
        if (released.error) throw released.error;
      }
    }
  }
  return true;
}

async function retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  // Product scope is includable separately from the Coupon object.
  return stripe.subscriptions.retrieve(subscriptionId, { expand: ['discounts.source.coupon.applies_to'] });
}

async function retrieveInvoiceLines(invoice: Stripe.Invoice): Promise<Stripe.InvoiceLineItem[]> {
  if (!invoice.lines.has_more) return invoice.lines.data;
  const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 })
    .autoPagingToArray({ limit: 101 });
  if (lines.length > 100) throw new Error('Stripe Invoice has too many lines to validate safely');
  return lines;
}

function paymentStateForEvent(eventType: string): string | null {
  if (eventType === 'invoice.payment_failed') return 'payment_failed';
  if (eventType === 'invoice.payment_action_required') return 'payment_action_required';
  if (eventType === 'invoice.finalization_failed') return 'finalization_failed';
  return null;
}

export default withGuard(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') throw new HttpError(400, 'Missing signature');
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await readRawBody(req), signature, required('STRIPE_WEBHOOK_SECRET'));
  } catch {
    throw new HttpError(400, 'Invalid webhook signature');
  }
  const expectedLivemode = configuredStripeLivemode();
  if (event.livemode !== expectedLivemode) throw new HttpError(400, 'Stripe event mode mismatch');
  if (!handled.has(event.type)) {
    res.json({ received: true });
    return;
  }

  if (event.type.startsWith('payment_intent.')) {
    await retrieveAndApplyDirectQr((event.data.object as Stripe.PaymentIntent).id);
    res.json({ received: true }); return;
  }
  if (event.type.startsWith('customer.subscription.') && await syncAutoSubscription((event.data.object as Stripe.Subscription).id)) { res.json({ received: true }); return; }
  if (event.type.startsWith('invoice.') && await applyAutoInvoice((event.data.object as Stripe.Invoice).id)) { res.json({ received: true }); return; }
  if (event.type.startsWith('charge.dispute.')) {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = id(dispute.charge);
    if (!chargeId) throw new Error('Missing disputed charge');
    const charge = await stripe.charges.retrieve(chargeId);
    const pi = id(charge.payment_intent);
    if (pi) {
      if (await retrieveAndApplyDirectQr(pi) || await applyAutoPayment(pi)) { res.json({ received: true }); return; }
      const sessions = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 100 });
      for (const candidate of sessions.data.filter(s => s.metadata?.offer_version === PREPAID_OFFER)) {
        await retrieveAndApplyPrepaid(candidate.id);
      }
    }
    res.json({ received: true }); return;
  }
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    if (!charge.payment_intent) {
      res.json({ received: true, ignored: true });
      return;
    }
    const paymentIntent = id(charge.payment_intent);
    if (!paymentIntent) {
      res.json({ received: true, ignored: true });
      return;
    }
    if (await retrieveAndApplyDirectQr(paymentIntent) || await applyAutoPayment(paymentIntent)) { res.json({ received: true }); return; }
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 100 });
    const prepaid = sessions.data.find(candidate => candidate.metadata?.offer_version === PREPAID_OFFER);
    if (prepaid) {
      await retrieveAndApplyPrepaid(prepaid.id);
      res.json({ received: true }); return;
    }
    if (!charge.refunded) { res.json({ received: true, ignored: true }); return; }
    const promptpay = sessions.data.find(candidate => candidate.mode === 'payment'
      && candidate.metadata?.billing_method === 'promptpay');
    if (promptpay) {
      if (charge.amount_refunded !== charge.amount) {
        res.json({ received: true, ignored: true });
        return;
      }
      const cycle = Number(promptpay.metadata?.intro_cycle);
      const userId = promptpay.metadata?.app_user_id;
      const customerId = id(promptpay.customer);
      const reservationId = promptpay.metadata?.checkout_reservation_id;
      if (!userId || !uuid.test(userId) || !customerId || !reservationId
        || !Number.isInteger(cycle) || cycle < 1 || cycle > 4
        || promptpay.livemode !== expectedLivemode
        || promptpay.client_reference_id !== userId
        || promptpay.metadata?.workspace_type !== 'personal'
        || promptpay.metadata?.workspace_id !== userId
        || id(promptpay.payment_intent) !== paymentIntent
        || id(charge.customer) !== customerId || charge.currency !== 'thb') {
        throw new Error('Refunded PromptPay charge failed ownership validation');
      }
      const saved = await getSupabaseAdmin().rpc('cashflow_apply_promptpay_event', {
        p_event_id: event.id,
        p_event_type: event.type,
        p_event_created: event.created,
        p_event_livemode: event.livemode,
        p_expected_livemode: expectedLivemode,
        p_user_id: userId,
        p_customer_id: customerId,
        p_reservation_id: reservationId,
        p_session_id: promptpay.id,
        p_payment_intent_id: paymentIntent,
        p_amount: charge.amount,
        p_currency: charge.currency,
        p_paid_at: new Date(charge.created * 1000).toISOString(),
        p_intro_cycle: cycle,
        p_refund: true,
      });
      if (saved.error) throw saved.error;
      res.json({ received: true, result: saved.data });
      return;
    }
    if (!configuredLegacyPaymentLink()) {
      res.json({ received: true, ignored: true });
      return;
    }
    const legacy = sessions.data.find(isLegacySession);
    if (!legacy || !await applyLegacyPayment(event, legacy, true)) {
      res.json({ received: true, ignored: true });
      return;
    }
    res.json({ received: true });
    return;
  }

  let session: Stripe.Checkout.Session | null = null;
  if (event.type.startsWith('checkout.session.')) {
    const delivered = event.data.object as Stripe.Checkout.Session;
    session = await stripe.checkout.sessions.retrieve(delivered.id, {
      expand: ['payment_intent.payment_method', 'payment_intent.latest_charge', 'line_items'],
    });
    if (session.livemode !== expectedLivemode) throw new HttpError(400, 'Stripe Checkout mode mismatch');
    if (await applyPrepaidSession(session, event.type)) { res.json({ received: true }); return; }
    if (session.mode === 'payment') {
      if (session.metadata?.billing_method === 'promptpay') {
        const sessionUserId = session.metadata.app_user_id;
        const reservationId = session.metadata.checkout_reservation_id;
        if (!sessionUserId || !uuid.test(sessionUserId) || !reservationId) {
          throw new Error('PromptPay Checkout metadata is invalid');
        }
        if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
          const released = await getSupabaseAdmin().rpc('cashflow_release_billing_checkout', {
            p_user_id: sessionUserId,
            p_reservation_id: reservationId,
          });
          if (released.error) throw released.error;
          res.json({ received: true });
          return;
        }
        if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') {
          res.json({ received: true, pending: true });
          return;
        }
        const paymentIntent = session.payment_intent;
        if (!paymentIntent || typeof paymentIntent === 'string') {
          throw new Error('Paid PromptPay Checkout is missing its expanded PaymentIntent');
        }
        const lines = session.line_items?.data || [];
        const record = promptPayCheckoutRecord(session, paymentIntent, expectedLivemode);
        if (!record || !validatePromptPayLineItems(session, lines)) {
          throw new Error('Paid PromptPay Checkout failed canonical validation');
        }
        const saved = await getSupabaseAdmin().rpc('cashflow_apply_promptpay_event', {
          p_event_id: event.id,
          p_event_type: event.type,
          p_event_created: event.created,
          p_event_livemode: event.livemode,
          p_expected_livemode: expectedLivemode,
          p_user_id: record.userId,
          p_customer_id: record.customerId,
          p_reservation_id: record.reservationId,
          p_session_id: record.sessionId,
          p_payment_intent_id: record.paymentIntentId,
          p_amount: record.amount,
          p_currency: record.currency,
          p_paid_at: record.paidAt,
          p_intro_cycle: record.introCycle,
          p_refund: false,
        });
        if (saved.error) throw saved.error;
        res.json({ received: true, result: saved.data });
        return;
      }
      if (event.type === 'checkout.session.async_payment_failed') {
        res.json({ received: true, ignored: true });
        return;
      }
      if (await applyLegacyPayment(event, session, false)) {
        res.json({ received: true });
        return;
      }
      res.json({ received: true, ignored: true });
      return;
    }
    if (session.mode !== 'subscription') {
      res.json({ received: true, ignored: true });
      return;
    }
    const sessionUserId = session.metadata?.app_user_id || session.client_reference_id;
    const reservationId = session.metadata?.checkout_reservation_id;
    if (!sessionUserId || !uuid.test(sessionUserId) || !reservationId) {
      res.json({ received: true, ignored: true });
      return;
    }
    if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
      const released = await getSupabaseAdmin().rpc('cashflow_release_billing_checkout', {
        p_user_id: sessionUserId,
        p_reservation_id: reservationId,
      });
      if (released.error) throw released.error;
      res.json({ received: true });
      return;
    }
  }

  const catalog = await getStripeBillingCatalog();
  let subscription: Stripe.Subscription;
  let invoice: Stripe.Invoice | null = null;
  let objectKind: 'checkout' | 'subscription' | 'invoice';
  let objectId: string;

  if (session) {
    const subscriptionId = id(session.subscription);
    if (!subscriptionId) throw new HttpError(400, 'Missing subscription reference');
    subscription = await retrieveSubscription(subscriptionId);
    objectKind = 'checkout';
    objectId = session.id;
  } else if (event.type.startsWith('customer.subscription.')) {
    const delivered = event.data.object as Stripe.Subscription;
    subscription = await retrieveSubscription(delivered.id);
    objectKind = 'subscription';
    objectId = delivered.id;
  } else {
    const delivered = event.data.object as Stripe.Invoice;
    invoice = await stripe.invoices.retrieve(delivered.id, {
      // Stripe marks amount_paid_off_stripe as includable. It must be present
      // so an invoice manually marked paid outside Stripe cannot grant access.
      expand: ['discounts.source.coupon.applies_to', 'amount_paid_off_stripe'],
    });
    if (invoice.livemode !== expectedLivemode) throw new HttpError(400, 'Stripe Invoice mode mismatch');
    const subscriptionId = subscriptionIdFromInvoice(invoice);
    if (!subscriptionId) {
      res.json({ received: true, ignored: true });
      return;
    }
    subscription = await retrieveSubscription(subscriptionId);
    objectKind = 'invoice';
    objectId = invoice.id;
  }

  const record = subscriptionRecord(subscription, catalog);
  const appearsOwned = Boolean(subscription.metadata.app_user_id || session?.metadata?.app_user_id);
  if (!record) {
    if (appearsOwned) throw new Error('Cash Squirrel Stripe subscription failed catalog or ownership validation');
    res.json({ received: true, ignored: true });
    return;
  }
  if (session) {
    if (session.client_reference_id !== record.userId
      || session.metadata?.app_user_id !== record.userId
      || session.metadata?.workspace_id !== record.workspaceId
      || id(session.customer) !== record.customerId) {
      throw new Error('Stripe Checkout ownership does not match its subscription');
    }
    const offerVersion = session.metadata?.offer_version;
    if (session.metadata?.workspace_type !== 'personal'
      || ![PRO_OFFER_VERSION, PRO_STANDARD_OFFER_VERSION].includes(offerVersion || '')) {
      throw new Error('Stripe Checkout offer metadata is invalid');
    }
    const expectedIntro = offerVersion === PRO_OFFER_VERSION;
    const checkoutIntroCycles = Number(session.metadata?.intro_cycles_remaining || '0');
    if (!Number.isInteger(checkoutIntroCycles) || checkoutIntroCycles < 0 || checkoutIntroCycles > 3
      || expectedIntro !== (checkoutIntroCycles > 0)
      || record.introCouponMonths !== (checkoutIntroCycles || null)) {
      throw new Error('Stripe Checkout introductory discount does not match the reserved offer');
    }
  }
  if (invoice && id(invoice.customer) !== record.customerId) {
    throw new Error('Stripe Invoice customer does not match its subscription');
  }
  if (invoice) {
    const invoiceMetadata = invoice.parent?.subscription_details?.metadata;
    if (invoiceMetadata?.app_user_id !== record.userId
      || invoiceMetadata.workspace_type !== 'personal'
      || invoiceMetadata.workspace_id !== record.workspaceId
      || ![PRO_OFFER_VERSION, PRO_STANDARD_OFFER_VERSION].includes(invoiceMetadata.offer_version || '')) {
      throw new Error('Stripe Invoice subscription metadata is invalid');
    }
  }
  const checkoutOffer = session?.metadata?.offer_version || null;
  const invoiceOffer = invoice?.parent?.subscription_details?.metadata?.offer_version || null;
  const objectOffer = checkoutOffer || invoiceOffer;
  const invoiceDiscount = invoice
    ? invoiceIntroDiscount(invoice, catalog, record.subscriptionId, record.subscriptionStart)
    : null;
  if (invoice && !invoiceDiscount) {
    throw new Error('Stripe Invoice discount source or window is invalid');
  }
  if (invoiceOffer === PRO_STANDARD_OFFER_VERSION && invoiceDiscount?.applied) {
    throw new Error('Standard Stripe offer unexpectedly has the introductory coupon');
  }

  let paidThrough: string | null = null;
  let invoicePeriodStart: string | null = null;
  let invoicePeriodEnd: string | null = null;
  let paymentState = invoice ? paymentStateForEvent(event.type) : null;
  // Completing Checkout can still leave the first invoice unpaid/incomplete.
  // Consume the once-per-account offer only after a validated paid intro invoice.
  let introRedeemed = false;

  if (invoice?.status === 'paid') {
    const lines = await retrieveInvoiceLines(invoice);
    const pricing = validatePaidInvoicePrice(invoice, lines, catalog);
    const paidPeriod = paidPeriodFromInvoiceLines(lines, catalog, record.subscriptionId);
    paidThrough = paidPeriod?.end || null;
    if (!pricing.paid || !paidPeriod || !paidThrough) {
      throw new Error('Paid Stripe Invoice does not match the Cash Squirrel recurring price');
    }
    if (pricing.introDiscountApplied !== invoiceDiscount?.applied) {
      throw new Error('Paid Stripe Invoice discount does not match its expanded Discount');
    }
    invoicePeriodStart = paidPeriod.start;
    invoicePeriodEnd = paidPeriod.end;
    paymentState = 'paid';
    if (pricing.introDiscountApplied && invoiceOffer !== PRO_OFFER_VERSION) {
      throw new Error('Paid introductory invoice does not match its subscription discount');
    }
    if (invoice.billing_reason === 'subscription_create'
      && invoiceOffer === PRO_OFFER_VERSION
      && !pricing.introDiscountApplied) {
      throw new Error('First introductory invoice did not apply the configured coupon');
    }
    introRedeemed = pricing.introDiscountApplied;
    if (record.status !== 'active') paidThrough = null;
  } else if (event.type === 'invoice.paid') {
    throw new Error('invoice.paid did not retrieve as a paid invoice');
  }

  const saved = await getSupabaseAdmin().rpc('cashflow_apply_stripe_subscription_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_event_livemode: event.livemode,
    p_expected_livemode: expectedLivemode,
    p_object_kind: objectKind,
    p_object_id: objectId,
    p_user_id: record.userId,
    p_workspace_id: record.workspaceId,
    p_customer_id: record.customerId,
    p_subscription_id: record.subscriptionId,
    p_subscription_created: record.subscriptionCreated,
    p_price_id: record.priceId,
    p_status: record.status,
    p_billing_period_end: record.billingPeriodEnd,
    p_cancel_at_period_end: record.cancelAtPeriodEnd,
    p_paid_through: paidThrough,
    p_payment_state: paymentState,
    p_intro_redeemed: introRedeemed,
    p_checkout_session_id: session?.id || null,
    p_checkout_reservation_id: session?.metadata?.checkout_reservation_id || null,
    p_invoice_period_start: invoicePeriodStart,
    p_invoice_period_end: invoicePeriodEnd,
    p_invoice_billing_reason: invoice?.billing_reason || null,
    p_offer_version: objectOffer,
    p_intro_discount_applied: session
      ? record.introCouponMonths !== null
      : invoiceDiscount?.applied || false,
    p_intro_discount_start: invoiceDiscount?.start || null,
    p_intro_discount_end: invoiceDiscount?.end || null,
  });
  if (saved.error) throw saved.error;
  if (invoice?.status === 'paid') {
    const paidCycle = await getSupabaseAdmin().rpc('cashflow_record_subscription_paid_cycle', {
      p_user_id: record.userId,
      p_invoice_id: invoice.id,
      p_paid_at: new Date((invoice.status_transitions?.paid_at || event.created) * 1000).toISOString(),
      p_intro_discounted: introRedeemed,
    });
    if (paidCycle.error) throw paidCycle.error;
  }

  // Stripe event timestamps have one-second precision and distinct events can
  // be delivered concurrently. Re-read after the event write, then reconcile
  // the row from Stripe's canonical Subscription snapshot.
  const canonicalSubscription = await retrieveSubscription(record.subscriptionId);
  const canonical = subscriptionRecord(canonicalSubscription, catalog);
  if (!canonical
    || canonical.userId !== record.userId
    || canonical.workspaceId !== record.workspaceId
    || canonical.customerId !== record.customerId) {
    throw new Error('Canonical Stripe subscription failed ownership validation');
  }
  const reconciled = await getSupabaseAdmin().rpc('cashflow_reconcile_stripe_subscription_state', {
    p_event_id: event.id,
    p_user_id: canonical.userId,
    p_workspace_id: canonical.workspaceId,
    p_customer_id: canonical.customerId,
    p_subscription_id: canonical.subscriptionId,
    p_subscription_created: canonical.subscriptionCreated,
    p_price_id: canonical.priceId,
    p_livemode: catalog.livemode,
    p_status: canonical.status,
    p_billing_period_end: canonical.billingPeriodEnd,
    p_cancel_at_period_end: canonical.cancelAtPeriodEnd,
  });
  if (reconciled.error) throw reconciled.error;
  res.json({ received: true, result: saved.data });
});
