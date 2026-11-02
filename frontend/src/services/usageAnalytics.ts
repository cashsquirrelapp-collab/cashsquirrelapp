import type { UsageAnalyticsSnapshot, UsageFeatureKey } from '../../../shared/usageAnalytics';
import { apiJson } from './api';

export const usageAnalyticsApi = {
  presenceHeartbeat(account: string) {
    return apiJson<{ ok: true }>('/api/usage-analytics', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify({ action: 'presence-heartbeat' }),
    });
  },
  /** The browser's cookie choice, so the admin page can tell "chose no statistics" from "not using the app". */
  statsChoice(account: string, stats: boolean) {
    return apiJson<{ ok: true }>('/api/usage-analytics', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify({ action: 'stats-choice', stats }),
    });
  },
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
