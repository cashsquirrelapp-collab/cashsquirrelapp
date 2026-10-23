import type {
  FeedbackAdminListResponse,
  FeedbackBox,
  FeedbackKind,
  FeedbackCategory,
  FeedbackDetailResponse,
  FeedbackListResponse,
  FeedbackMutationResponse,
  FeedbackStatus,
} from '../../../shared/feedback';
import { apiJson } from './api';

export const feedbackApi = {
  list(account: string, options: { admin?: boolean; status?: FeedbackStatus; page?: number }, signal?: AbortSignal) {
    const query = new URLSearchParams({ scope: options.admin ? 'admin' : 'mine', page: String(options.page || 0) });
    if (options.status) query.set('status', options.status);
    return apiJson<FeedbackListResponse>(`/api/feedback?${query}`, { signal, headers: { 'X-Account-ID': account } });
  },
  adminList(account: string, options: { box: FeedbackBox; category?: FeedbackKind | null; page?: number }, signal?: AbortSignal) {
    const query = new URLSearchParams({ scope: 'admin', box: options.box, page: String(options.page || 0) });
    if (options.category) query.set('category', options.category);
    return apiJson<FeedbackAdminListResponse>(`/api/feedback?${query}`, { signal, headers: { 'X-Account-ID': account } });
  },
  detail(account: string, threadId: string, page = 0, signal?: AbortSignal) {
    const query = new URLSearchParams({ threadId, page: String(page) });
    return apiJson<FeedbackDetailResponse>(`/api/feedback?${query}`, { signal, headers: { 'X-Account-ID': account } });
  },
  create(account: string, body: string, category?: FeedbackCategory) {
    return apiJson<FeedbackMutationResponse>('/api/feedback', {
      method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'create', body, category }),
    });
  },
  reply(account: string, threadId: string, body: string) {
    return apiJson<FeedbackMutationResponse>('/api/feedback', {
      method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'reply', threadId, body }),
    });
  },
  status(account: string, threadId: string, status: FeedbackStatus) {
    return apiJson<FeedbackMutationResponse>('/api/feedback', {
      method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'status', threadId, status }),
    });
  },
};
