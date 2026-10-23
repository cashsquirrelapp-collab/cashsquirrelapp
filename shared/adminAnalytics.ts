import type { UsageFeatureKey } from './usageAnalytics.js';

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
