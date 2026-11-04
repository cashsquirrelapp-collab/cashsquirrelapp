import type { UsageFeatureKey } from './usageAnalytics.js';
import type { OnboardingAnalytics } from './onboarding.js';

export type AnalyticsRange = 7 | 30 | 90;
export type AccountPlanStatus = 'pro' | 'admin' | 'trial' | 'free' | 'expired';
export type AccountPersona = 'school' | 'university' | 'freelance' | 'employee' | 'unknown';

export interface AdminAnalyticsSummary {
  range: AnalyticsRange;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  /** Payment pulse taken before this snapshot was read; the page compares it to spot new payments. */
  liveSignature?: string;
  totals: {
    accounts: number;
    newAccounts: number;
    activeUsers: number;
    previousActiveUsers: number;
    pageViews: number;
    proAccounts: number;
    paidProAccounts: number;
    trialAccounts: number;
    freeAccounts: number;
    revenue: number;
    previousRevenue: number;
    paymentCount: number;
    conversionRate: number;
    averageRevenuePerPayer: number;
  };
  daily: {
    date: string;
    activeUsers: number;
    pageViews: number;
    revenue: number;
    payments: number;
  }[];
  features: {
    key: UsageFeatureKey;
    activeUsers: number;
    pageViews: number;
    freeUsers: number;
    proUsers: number;
    freeViews: number;
    proViews: number;
  }[];
  personas: {
    key: AccountPersona;
    accounts: number;
    activeUsers: number;
    proAccounts: number;
    revenue: number;
  }[];
  accounts: AdminAnalyticsAccount[];
  payments: AdminAnalyticsPayment[];
  /** Welcome Onboarding V1: who signs up, what they want, and what each group does (counts only). */
  onboarding?: OnboardingAnalytics;
  /** Sent to a team admin (not the owner): every money figure is 0 and the payments list is empty (withoutMoney). */
  moneyHidden?: true;
}

export interface AdminAnalyticsAccount {
  userId: string;
  publicId: string;
  displayName: string;
  createdAt: string;
  persona: AccountPersona;
  jobTypes: string[];
  planStatus: AccountPlanStatus;
  plan: string | null;
  currentPeriodEnd: string | null;
  totalSpent: number;
  paymentCount: number;
  lastPaymentAt: string | null;
  activeDays: number;
  pageViews: number;
  lastSeenAt: string | null;
  topFeatures: { key: UsageFeatureKey; pageViews: number }[];
}

export interface AdminAnalyticsPayment {
  id: string;
  userId: string;
  publicId: string;
  displayName: string;
  amount: number;
  currency: string;
  paidAt: string;
  refunded: boolean;
}

/**
 * The statistics as a team admin receives them (owner, 2026-11-04: "รายได้โปรแอดมินธรรมดาจะไม่มีสิทธิ์ในการเห็น ... กำไรต้นทุน
 * ... ภาพรวมของเงินสดอ่ะห้ามไม่เห็นเด็ดขาดนอกจากผู้ดูแล"). Removed on the server, so the figures never reach a team admin's
 * browser: revenue, payments and what each account paid. Accounts, activity, features and plans stay.
 */
export function withoutMoney(summary: AdminAnalyticsSummary): AdminAnalyticsSummary {
  const { liveSignature: _signature, ...rest } = summary;
  return {
    ...rest,
    totals: { ...summary.totals, revenue: 0, previousRevenue: 0, paymentCount: 0, averageRevenuePerPayer: 0 },
    daily: summary.daily.map(day => ({ ...day, revenue: 0, payments: 0 })),
    personas: summary.personas.map(persona => ({ ...persona, revenue: 0 })),
    accounts: summary.accounts.map(account => ({ ...account, totalSpent: 0, paymentCount: 0, lastPaymentAt: null })),
    payments: [],
    moneyHidden: true,
  };
}
