import type { User } from '@supabase/supabase-js';
import type { SystemRole } from '../../../shared/groups.js';

// Use only the provider-verified user returned by requireUser, never request
// parameters, display names, or user-editable metadata.
export function canViewAdminAnalytics(
  user: Pick<User, 'email' | 'email_confirmed_at'>,
  role: SystemRole,
): boolean {
  return role === 'admin'
    && !!user.email_confirmed_at
    && user.email?.trim().toLowerCase() === 'heidnsko1234@gmail.com';
}
