// The admin page's payment check (owner, 2026-10-27: "ทำระบบชำระเงินให้มันชำระได้ทั้งบัตรเครดิตแล้วก็ QR code ... เป็นยอด
// ใหม่ด้วยนะ"): whether a customer can pay for Pro by card and by PromptPay QR at the price on screen right now, and
// what is missing when not. The server reads Stripe with its own key; nothing secret is in this answer.
import type { ProPeriod } from './proPricing.js';

/** ok: checked and right · problem: checked and wrong · unknown: Stripe would not let the server read it. */
export type ReadinessState = 'ok' | 'problem' | 'unknown';

export interface ReadinessPrice {
  kind: 'one_time' | 'recurring';
  period: ProPeriod;
  /** The Bangkok day this price is sold from: today's prices, or the regular monthly price from 2026-12-01. */
  from: string;
  /** Sold only from a later day: needed by then, not for paying today. */
  later: boolean;
  /** What checkout charges, in baht. */
  expected: number;
  /** The amount under this price's lookup key in Stripe now, in baht; null when there is none. */
  current: number | null;
  state: 'ok' | 'missing' | 'wrong';
  /** The owner can create it from the admin page (Stripe holds a price of the same kind to copy). */
  creatable: boolean;
}

export interface PaymentReadiness {
  livemode: boolean;
  checkedAt: string;
  /** ready: card and QR work now · blocked: something below stops payments · unknown: a part could not be read. */
  status: 'ready' | 'blocked' | 'unknown';
  /** The prices for 1 Dec 2569 exist as well; null once that day has come (they are then today's prices). */
  nextPriceReady: boolean | null;
  server: { state: ReadinessState; prepaid: boolean; publishableKey: boolean };
  methods: { state: ReadinessState; card: boolean; promptpay: boolean; extra: string[]; permission?: string };
  prices: { state: ReadinessState; items: ReadinessPrice[]; permission?: string };
  /** Stripe tells this app about payments: a card payment turns into Pro only this way. */
  webhook: { state: ReadinessState; missingEvents: string[]; otherHosts: string[]; permission?: string };
  /** Prices the owner can create from the admin page now. */
  creatable: number;
}
