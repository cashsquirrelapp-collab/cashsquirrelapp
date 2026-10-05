import { z } from 'zod';

export type SystemRole = 'admin' | 'user';
export type GroupRole = 'leader' | 'member';
export interface AdminDashboardStats {
  totalAccounts: number;
  adminAccounts: number;
  totalGroups: number;
  proAccounts: number;
  pendingInvitations: number;
  pausedAccounts: number;
  pendingDeletions: number;
}
export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  myRole: GroupRole | null;
  memberCount: number;
  leaderCount: number;
}
export type AdminDashboardSection =
  | 'accounts'
  | 'admins'
  | 'groups'
  | 'pro'
  | 'invitations'
  | 'paused'
  | 'deletions';
export interface AdminDashboardAccountDetail extends AdminAccount {
  plan?: string | null;
  currentPeriodEnd?: string | null;
  closureKind?: 'pause' | 'deletion';
  pausedAt?: string | null;
  deleteAfter?: string | null;
}
export interface AdminDashboardInvitationDetail {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}
export interface AdminDashboardDetails {
  section: AdminDashboardSection;
  total: number;
  page: number;
  pageSize: number;
  accounts?: AdminDashboardAccountDetail[];
  groups?: GroupSummary[];
  invitations?: AdminDashboardInvitationDetail[];
}
export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  publicId?: string;
  displayName?: string;
  expiresAt: string;
}
export interface GroupSnapshot {
  systemRole: SystemRole;
  groups: GroupSummary[];
  invitations: GroupInvitation[];
  total: number;
  page: number;
}
export interface GroupMember {
  userId: string;
  publicId: string;
  displayName: string;
  role: GroupRole;
  joinedAt: string;
  /** Heartbeat presence, only ever sent to people who can see this group. */
  isOnline?: boolean;
  lastSeenAt?: string | null;
}
export interface GroupDetail extends GroupSummary {
  members: GroupMember[];
  /** Server time the presence fields were read. */
  presenceAt?: string;
  invitations: GroupInvitation[];
  activity: {
    id: string;
    action: string;
    actorPublicId: string | null;
    actorDisplayName: string | null;
    targetPublicId: string | null;
    targetDisplayName: string | null;
    createdAt: string;
  }[];
}
const groupId = z.uuid();
const name = z.string().trim().min(1).max(80);
const description = z.string().trim().max(500).default('');
export const groupActionSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('create'), groupId, name, description })
    .strict(),
  z
    .object({ action: z.literal('rename'), groupId, name, description })
    .strict(),
  z
    .object({
      action: z.literal('invite'),
      groupId,
      userId: z.uuid(),
    })
    .strict(),
  z.object({ action: z.literal('accept'), invitationId: z.uuid() }).strict(),
  z.object({ action: z.literal('decline'), invitationId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('revoke-invite'),
      groupId,
      invitationId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('member-role'),
      groupId,
      userId: z.uuid(),
      role: z.enum(['leader', 'member']),
    })
    .strict(),
  z
    .object({ action: z.literal('transfer'), groupId, userId: z.uuid() })
    .strict(),
  z
    .object({ action: z.literal('remove-member'), groupId, userId: z.uuid() })
    .strict(),
  z.object({ action: z.literal('leave'), groupId }).strict(),
  z.object({ action: z.literal('delete'), groupId }).strict(),
]);
export type GroupAction = z.infer<typeof groupActionSchema>;
export interface AdminAccount {
  userId: string;
  publicId: string;
  displayName: string;
  role: SystemRole;
  createdAt: string;
  proStatus?: AdminProStatus;
  proExpiresAt?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
}
export interface PublicProfile { userId: string; publicId: string; displayName: string }
export interface AdminAccounts {
  users: AdminAccount[];
  total: number;
  page: number;
}
export type AdminProStatus = 'admin' | 'paid' | 'trial' | 'revoked' | 'none';
export interface AdminDeletionRequest {
  userId: string;
  email: string;
  requestedAt: string;
  expiresAt: string;
}
export interface AdminDeletionRequests {
  requests: AdminDeletionRequest[];
}
export const systemRoleActionSchema = z
  .object({ userId: z.uuid(), role: z.enum(['admin', 'user']) })
  .strict();
