import type {
  AdminAccounts,
  GroupAction,
  GroupDetail,
  GroupSnapshot,
  SystemRole,
  PublicProfile,
} from '../../../shared/groups';
import { apiJson } from './api';

// Bind requests to the account which opened this view, including confirmation
// callbacks. The backend rejects them if another account has since logged in.
export const groupApi = {
  snapshot(
    account: string,
    scope: 'mine' | 'all',
    page: number,
    signal?: AbortSignal,
  ) {
    return apiJson<GroupSnapshot>(`/api/groups?scope=${scope}&page=${page}`, {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
  detail(account: string, id: string, signal?: AbortSignal) {
    return apiJson<GroupDetail>(
      `/api/groups?groupId=${encodeURIComponent(id)}`,
      { signal, headers: { 'X-Account-ID': account } },
    );
  },
  searchUsers(account:string,groupId:string,query:string,signal?:AbortSignal) {
    return apiJson<{users:PublicProfile[]}>(`/api/groups?groupId=${encodeURIComponent(groupId)}&memberSearch=${encodeURIComponent(query)}`,{signal,headers:{'X-Account-ID':account}});
  },
  mutate(account: string, action: GroupAction) {
    return apiJson<{ ok: true; groupId: string }>('/api/groups', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify(action),
    });
  },
  accounts(
    account: string,
    search: string,
    page: number,
    signal?: AbortSignal,
  ) {
    return apiJson<AdminAccounts>(
      `/api/admin-users?search=${encodeURIComponent(search)}&page=${page}`,
      { signal, headers: { 'X-Account-ID': account } },
    );
  },
  setRole(account: string, userId: string, role: SystemRole) {
    return apiJson<{ ok: true }>('/api/admin-users', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify({ userId, role }),
    });
  },
};
