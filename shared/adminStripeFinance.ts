import type { AnalyticsRange } from './adminAnalytics.js';

// Money values are integer Stripe minor units, grouped by settlement currency.
export type StripeFinanceError = {
  code: 'permission_missing' | 'provider_unavailable' | 'incomplete' | 'not_live';
  message: string;
  permission?: string;
};

export type StripeFinanceSection<T> = {
  status: 'ready' | 'unavailable';
  complete: boolean;
  data: T | null;
  error: StripeFinanceError | null;
};

export type StripeFinanceBalance = {
  currencies: { currency: string; available: number; pending: number }[];
};

export type StripeFinanceSummary = {
  currencies: {
    currency: string;
    gross: number;
    refunds: number;
    fees: number;
    net: number;
    paymentCount: number;
    effectiveFeePercent: number | null;
  }[];
  transactionCount: number;
};

export type StripeFinancePayment = {
  id: string;
  paymentIntentId: string | null;
  createdAt: string;
  amount: number;
  currency: string;
  amountRefunded: number;
  status: 'paid' | 'partially_refunded' | 'refunded';
  paymentMethod: string | null;
  appPayment: boolean;
  // Original payment settlement, before subsequent refunds. Never a bank arrival date.
  settlement: {
    amount: number;
    currency: string;
    fee: number;
    net: number;
    effectiveFeePercent: number | null;
    availableOn: string;
    status: 'pending' | 'available';
  } | null;
  // The bank payout that carried this payment, when Stripe lists it among the recent automatic
  // payouts (owner, 2026-10-22). Absent or null: not confirmed, so no bank date is shown.
  payout?: { id: string; arrivalDate: string; status: StripeFinancePayout['status'] } | null;
};

export type StripeFinancePayout = {
  id: string;
  createdAt: string;
  arrivalDate: string;
  amount: number;
  currency: string;
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled' | 'unknown';
  automatic: boolean;
  method: string;
};

export type AdminStripeFinance = {
  range: AnalyticsRange;
  fromDate: string;
  toDate: string;
  timezone: 'Asia/Bangkok';
  generatedAt: string;
  livemode: boolean;
  scope: 'stripe_account';
  balance: StripeFinanceSection<StripeFinanceBalance>;
  summary: StripeFinanceSection<StripeFinanceSummary>;
  payments: StripeFinanceSection<{ items: StripeFinancePayment[]; hasMore: boolean }>;
  payouts: StripeFinanceSection<{
    items: StripeFinancePayout[];
    nextPayouts: StripeFinancePayout[];
    nextPayoutsComplete: boolean;
    hasMore: boolean;
  }>;
};
