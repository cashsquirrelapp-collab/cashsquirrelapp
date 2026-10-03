import type { UsageAnalyticsSnapshot, UsageFeatureKey } from '../../../shared/usageAnalytics';
import { apiJson } from './api';

export const usageAnalyticsApi = {
  recordFeatureView(account: string, feature: UsageFeatureKey) {
    return apiJson<{ ok: true }>('/api/usage-analytics', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify({ feature }),
    });
  },
  adminSnapshot(account: string, signal?: AbortSignal) {
    return apiJson<UsageAnalyticsSnapshot>('/api/usage-analytics', {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
};
