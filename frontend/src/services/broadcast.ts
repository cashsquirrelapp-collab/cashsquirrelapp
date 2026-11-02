import type { AdminBroadcastResponse, BroadcastNotice } from '../../../shared/broadcast';
import type { AdminActivitySummary } from '../../../shared/userActivity';
import type { AnalyticsRange } from '../../../shared/adminAnalytics';
import { apiJson } from './api';

// The team's message to everyone and its answers (shared/broadcast.ts), and the admin page's ผู้ใช้งาน view
// (shared/userActivity.ts).
const post = <T>(account: string, body: unknown) => apiJson<T>('/api/broadcast', { method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify(body) });

export const broadcastApi = {
  current(account: string, signal?: AbortSignal) {
    return apiJson<{ broadcast: BroadcastNotice | null }>('/api/broadcast', { signal, headers: { 'X-Account-ID': account } });
  },
  seen: (account: string, id: string) => post<{ ok: true }>(account, { action: 'seen', id }),
  dismiss: (account: string, id: string) => post<{ ok: true }>(account, { action: 'dismiss', id }),
  answer: (account: string, id: string, reply: string, rating?: number) =>
    post<{ ok: true; threadId: string | null }>(account, { action: 'answer', id, reply, ...(rating ? { rating } : {}) }),
  results(account: string, signal?: AbortSignal) {
    return apiJson<AdminBroadcastResponse>('/api/broadcast?scope=admin', { signal, headers: { 'X-Account-ID': account } });
  },
  send: (account: string, body: string, askRating: boolean) => post<{ ok: true; id: string }>(account, { action: 'send', body, askRating }),
  end: (account: string, id: string) => post<{ ok: true }>(account, { action: 'end', id }),
};

export const adminActivityApi = {
  summary(account: string, range: AnalyticsRange, signal?: AbortSignal) {
    return apiJson<AdminActivitySummary>(`/api/admin-activity?range=${range}`, { signal, headers: { 'X-Account-ID': account } });
  },
};
