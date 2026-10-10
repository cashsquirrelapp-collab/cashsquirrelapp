import { HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';

export type StripeBillingState = {
  stripe_subscription_id?: string | null;
  stripe_subscription_status?: string | null;
  /** Effective entitlement status; it must never substitute for Stripe state. */
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  stripe_checkout_pending_until?: string | null;
};

export type StripeBillingClosureBlock = 'checkout_pending' | 'subscription_open' | null;

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired']);

/**
 * Account access must remain available while a hosted Checkout can still
 * complete or a Stripe subscription is nonterminal. This deliberately blocks
 * an end-of-period cancellation until Stripe confirms the terminal state: a
 * closed account could no longer open Customer Portal to inspect or change it.
 *
 * Legacy one-time ฿149 entitlements have no Stripe subscription ID and are not
 * blocked by this rule.
 */
export function stripeBillingClosureBlock(
  billing: StripeBillingState | null | undefined,
  now = Date.now(),
): StripeBillingClosureBlock {
  if (!billing) return null;
  if (billing.stripe_checkout_pending_until) {
    const pendingUntil = Date.parse(billing.stripe_checkout_pending_until);
    // A malformed server timestamp is safer treated as open than ignored.
    if (!Number.isFinite(pendingUntil) || pendingUntil > now) return 'checkout_pending';
  }
  if (
    billing.stripe_subscription_id
    && !TERMINAL_SUBSCRIPTION_STATUSES.has(billing.stripe_subscription_status ?? '')
  ) return 'subscription_open';
  return null;
}

export function assertStripeBillingClosed(
  billing: StripeBillingState | null | undefined,
  operation: 'account-closure' | 'admin-override' = 'account-closure',
  now = Date.now(),
): void {
  const block = stripeBillingClosureBlock(billing, now);
  if (!block) return;
  if (operation === 'admin-override') {
    throw new HttpError(
      409,
      block === 'checkout_pending'
        ? 'เปลี่ยนสิทธิ์ Pro ไม่ได้ขณะที่บัญชีมี Stripe Checkout ที่ยังไม่หมดอายุ กรุณารอให้ Checkout สิ้นสุดก่อน'
        : 'เปลี่ยนสิทธิ์ Pro ด้วยผู้ดูแลไม่ได้ขณะที่การสมัครสมาชิก Stripe ยังไม่สิ้นสุด ให้ผู้ใช้จัดการผ่าน Customer Portal และรอให้ Stripe ยืนยันสถานะยกเลิกก่อน',
      'STRIPE_BILLING_OPEN',
    );
  }
  throw new HttpError(
    409,
    block === 'checkout_pending'
      ? 'ยังพักหรือปิดบัญชีไม่ได้ เพราะมี Stripe Checkout ที่ยังไม่หมดอายุ กรุณากลับไปทำรายการให้เสร็จหรือรอให้ Checkout หมดอายุแล้วลองอีกครั้ง'
      : 'ยังพักหรือปิดบัญชีไม่ได้ เพราะการสมัครสมาชิก Stripe ยังไม่สิ้นสุด กรุณาไปที่แพ็กเกจของคุณ เปิด Customer Portal และยกเลิกก่อน แล้วรอจนสิ้นรอบที่ชำระและ Stripe ยืนยันสถานะยกเลิก จึงลองอีกครั้ง',
    'STRIPE_BILLING_OPEN',
  );
}

async function readStripeBillingState(userId: string): Promise<StripeBillingState | null> {
  const result = await getSupabaseAdmin().from('subscriptions')
    .select('stripe_subscription_id,stripe_subscription_status,status,cancel_at_period_end,stripe_checkout_pending_until')
    .eq('user_id', userId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function ensureStripeBillingClosed(
  userId: string,
  operation: 'account-closure' | 'admin-override' = 'account-closure',
): Promise<void> {
  assertStripeBillingClosed(await readStripeBillingState(userId), operation);
}

/**
 * Atomically blocks new Checkout reservations before a destructive local
 * mutation. Re-reading after the advisory-lock RPC catches webhook state that
 * may have landed between the caller's first validation and this claim.
 */
export async function beginStripeBillingClosure(
  userId: string,
  operation: 'account-closure' | 'admin-override' = 'account-closure',
): Promise<void> {
  const claimed = await getSupabaseAdmin().rpc('cashflow_begin_billing_closure', {
    p_user_id: userId,
  });
  if (claimed.error) throw claimed.error;
  if (claimed.data !== true) {
    assertStripeBillingClosed({
      // Use a comfortably future timestamp: a one-millisecond sentinel could
      // expire between construction and the assertion on a busy event loop.
      stripe_checkout_pending_until: new Date(Date.now() + 60_000).toISOString(),
    }, operation);
  }
  await ensureStripeBillingClosed(userId, operation);
}
