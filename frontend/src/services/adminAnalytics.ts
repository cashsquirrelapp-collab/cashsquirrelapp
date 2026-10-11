import type { AdminAnalyticsSummary, AnalyticsRange } from '../../../shared/adminAnalytics';
import { apiJson } from './api';

export const adminAnalyticsApi = {
  snapshot(account: string, range: AnalyticsRange, signal?: AbortSignal) {
    return apiJson<AdminAnalyticsSummary>(`/api/admin-analytics?range=${range}`, {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
};
