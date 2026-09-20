import { z } from 'zod';

export type SystemRole = 'admin' | 'user';
export type GroupRole = 'leader' | 'member';
export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  myRole: GroupRole | null;
  memberCount: number;
  leaderCount: number;
}
export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  email?: string;
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
  email: string;
  name: string;
  role: GroupRole;
  joinedAt: string;
}
export interface GroupDetail extends GroupSummary {
  members: GroupMember[];
  invitations: GroupInvitation[];
  activity: {
    id: string;
    action: string;
    actorEmail: string | null;
    targetEmail: string | null;
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
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
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
  email: string;
  role: SystemRole;
  createdAt: string;
}
export interface AdminAccounts {
  users: AdminAccount[];
  total: number;
  page: number;
}
export const systemRoleActionSchema = z
  .object({ userId: z.uuid(), role: z.enum(['admin', 'user']) })
  .strict();
