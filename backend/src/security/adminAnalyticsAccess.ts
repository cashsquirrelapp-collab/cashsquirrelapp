import type { User } from '@supabase/supabase-js';
import type { SystemRole } from '../../../shared/groups.js';
import type { AdminLevel } from '../../../shared/adminLevel.js';

/** The owner's own account (ผู้ดูแล): the only one that sees money and gives admin rights or tokens. */
const OWNER_EMAIL = 'heidnsko1234@gmail.com';

/** Whether this provider-verified user is the owner's account, whatever its role. */
export function isOwnerAccount(user: Pick<User, 'email' | 'email_confirmed_at'>): boolean {
  return !!user.email_confirmed_at && user.email?.trim().toLowerCase() === OWNER_EMAIL;
}

// Use only the provider-verified user returned by requireUser, never request
// parameters, display names, or user-editable metadata.
export function canViewAdminAnalytics(
  user: Pick<User, 'email' | 'email_confirmed_at'>,
  role: SystemRole,
): boolean {
  return role === 'admin' && isOwnerAccount(user);
}

/**
 * Two levels (owner, 2026-11-04): ผู้ดูแล (the owner) sees everything and alone gives admin rights and tokens; แอดมิน (a team
 * member the owner made admin) sees accounts, activity, features, new users and messages, answers messages and sends a
 * message to everyone, but never revenue, Pro payments, profit and AI cost, or the cash overview.
 */
export function adminLevel(user: Pick<User, 'email' | 'email_confirmed_at'>, role: SystemRole): AdminLevel {
  if (role !== 'admin') return null;
  return isOwnerAccount(user) ? 'owner' : 'admin';
}
