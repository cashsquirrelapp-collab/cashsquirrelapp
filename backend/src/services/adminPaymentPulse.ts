import type { SupabaseClient } from '@supabase/supabase-js';

// A cheap "did any payment arrive or get refunded?" check, so the admin page can show revenue live
// (owner, 2026-10-22) without rebuilding the whole analytics snapshot every few seconds.
// Count-only requests over the same live sources the analytics reads. Any change in any count
// changes the signature; the page then reloads the full snapshot once.
export async function paymentPulse(db: SupabaseClient): Promise<string> {
  const head = { count: 'exact' as const, head: true };
  const counts = await Promise.all([
    db.from('cashflow_prepaid_orders').select('id', head).eq('livemode', true).in('status', ['paid', 'refunded']),
    db.from('cashflow_prepaid_orders').select('id', head).eq('livemode', true).eq('status', 'refunded'),
    db.from('cashflow_stripe_events').select('object_id', head).eq('object_kind', 'invoice').eq('event_type', 'invoice.paid').eq('livemode', true),
    db.from('cashflow_card_cycles').select('invoice_id', head).eq('refunded', true),
    db.from('cashflow_promptpay_payments').select('payment_intent_id', head).eq('livemode', true),
    db.from('cashflow_promptpay_payments').select('payment_intent_id', head).eq('livemode', true).eq('refunded', true),
    db.from('cashflow_payments').select('payment_id', head),
    db.from('cashflow_payments').select('payment_id', head).eq('refunded', true),
  ]);
  for (const result of counts) {
    if (result.error) throw result.error;
    if (typeof result.count !== 'number') throw new Error('Payment pulse count unavailable');
  }
  return counts.map(result => result.count).join('.');
}
