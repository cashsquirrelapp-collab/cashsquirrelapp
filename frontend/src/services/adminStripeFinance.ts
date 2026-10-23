import type { AnalyticsRange } from '../../../shared/adminAnalytics';
import type { AdminStripeFinance as AdminStripeFinanceData } from '../../../shared/adminStripeFinance';
import { apiJson } from './api';

export const adminStripeFinanceApi = {
  snapshot(account: string, range: AnalyticsRange, signal?: AbortSignal) {
    return apiJson<AdminStripeFinanceData>(`/api/admin-stripe-finance?range=${range}`, {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
};
