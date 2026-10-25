import type { AdminProfitLive } from '../../../shared/adminProfit';
import { apiJson } from './api';

export const adminProfitLiveApi = {
  snapshot(account: string, month: string, signal?: AbortSignal) {
    return apiJson<AdminProfitLive>(`/api/admin-profit-live?month=${encodeURIComponent(month)}`, { signal, headers: { 'X-Account-ID': account } });
  },
};
