import type {
  AdminDashboardStats,
  AdminDashboardDetails,
  AdminDashboardSection,
  AdminAccounts,
  AdminDeletionRequests,
  GroupAction,
  GroupDetail,
  GroupSnapshot,
  SystemRole,
  PublicProfile,
} from '../../../shared/groups';
import { apiJson } from './api';

export type AdminRecoveryLink = {
  id: string;
  url: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  recoveredUserId: string | null;
  recoveredEmail: string | null;
  recoveredPublicId: string | null;
  recoveredDisplayName: string | null;
};

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
  adminDashboard(account: string, signal?: AbortSignal) {
    return apiJson<AdminDashboardStats>('/api/admin-users?action=dashboard', {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
  adminDashboardDetails(
    account: string,
    section: AdminDashboardSection,
    page: number,
    signal?: AbortSignal,
  ) {
    return apiJson<AdminDashboardDetails>(
      `/api/admin-users?action=dashboard-details&section=${section}&page=${page}`,
      { signal, headers: { 'X-Account-ID': account } },
    );
  },
  accountDeletionRequests(account: string, signal?: AbortSignal) {
    return apiJson<AdminDeletionRequests>('/api/admin-users?action=deletion-requests', {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
  accountRecoveryLinks(account: string, includeUrls: boolean, signal?: AbortSignal) {
    return apiJson<{ links: AdminRecoveryLink[] }>(`/api/admin-users?action=recovery-links&includeUrls=${includeUrls ? '1' : '0'}`, {
      signal,
      headers: { 'X-Account-ID': account },
    });
  },
  createAccountRecoveryLink(account: string) {
    return apiJson<AdminRecoveryLink>('/api/admin-users', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify({ action: 'create-recovery-link' }),
    });
  },
  setRole(account: string, userId: string, role: SystemRole) {
    return apiJson<{ ok: true }>('/api/admin-users', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify({ userId, role }),
    });
  },
  setProAccess(account: string, userId: string, enabled: boolean) {
    return apiJson<{ ok: true }>('/api/admin-users', {
      method: 'POST',
      headers: { 'X-Account-ID': account },
      body: JSON.stringify({ action: 'set-pro-access', userId, enabled }),
    });
  },
};
