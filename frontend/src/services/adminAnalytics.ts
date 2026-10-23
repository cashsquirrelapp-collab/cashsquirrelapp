import type { AdminAnalyticsSummary, AnalyticsRange } from '../../../shared/adminAnalytics';
import { apiJson } from './api';

export const adminAnalyticsApi = {
  /** Cheap check for new or refunded payments; changes whenever revenue changes. */
  pulse(account: string, signal?: AbortSignal) {
    return apiJson<{ signature: string; checkedAt: string }>('/api/admin-analytics?pulse=1', {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
  snapshot(account: string, range: AnalyticsRange, signal?: AbortSignal) {
    return apiJson<AdminAnalyticsSummary>(`/api/admin-analytics?range=${range}`, {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
};
