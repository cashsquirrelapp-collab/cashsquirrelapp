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

/** The admin menu's count of conversations waiting for the team (useFeedbackWaiting) follows the inbox and its answers. */
export const FEEDBACK_WAITING_EVENT = 'krarok:feedback-waiting';
export const FEEDBACK_CHANGED_EVENT = 'krarok:feedback-changed';
const announce = (name: string, detail?: number) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* no window */ } };
const changed = <T,>(result: T) => { announce(FEEDBACK_CHANGED_EVENT); return result; };

export const feedbackApi = {
  list(account: string, options: { admin?: boolean; status?: FeedbackStatus; page?: number }, signal?: AbortSignal) {
    const query = new URLSearchParams({ scope: options.admin ? 'admin' : 'mine', page: String(options.page || 0) });
    if (options.status) query.set('status', options.status);
    return apiJson<FeedbackListResponse>(`/api/feedback?${query}`, { signal, headers: { 'X-Account-ID': account } });
  },
  adminList(account: string, options: { box: FeedbackBox; category?: FeedbackKind | null; page?: number }, signal?: AbortSignal) {
    const query = new URLSearchParams({ scope: 'admin', box: options.box, page: String(options.page || 0) });
    if (options.category) query.set('category', options.category);
    return apiJson<FeedbackAdminListResponse>(`/api/feedback?${query}`, { signal, headers: { 'X-Account-ID': account } }).then(result => {
      if (typeof result?.counts?.waiting === 'number') announce(FEEDBACK_WAITING_EVENT, result.counts.waiting);
      return result;
    });
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
    }).then(changed);
  },
  status(account: string, threadId: string, status: FeedbackStatus) {
    return apiJson<FeedbackMutationResponse>('/api/feedback', {
      method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'status', threadId, status }),
    }).then(changed);
  },
};
