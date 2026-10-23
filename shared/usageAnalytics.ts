export const USAGE_FEATURE_KEYS = [
  'dashboard',
  'adminDashboard',
  'jobs',
  'tax',
  'split',
  'report',
  'settings',
  'invoice',
  'insight',
  'plans',
  'groups',
  'clients',
  'calendar',
  'receivables',
  'incomeExpense',
] as const;

export type UsageFeatureKey = (typeof USAGE_FEATURE_KEYS)[number];

export interface UsageAnalyticsSnapshot {
  fromDate: string;
  toDate: string;
  totals: {
    activeUsers: number;
    pageViews: number;
    activeUsersToday: number;
    pageViewsToday: number;
  };
  daily: {
    date: string;
    activeUsers: number;
    pageViews: number;
  }[];
  dailyFeatures: {
    date: string;
    key: UsageFeatureKey;
    activeUsers: number;
    pageViews: number;
  }[];
  features: {
    key: UsageFeatureKey;
    activeUsers: number;
    pageViews: number;
  }[];
}
