import type { User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sendSignupWelcomeEmail } from './gmail.js';

const pendingKey = 'cashflow_signup_welcome_pending';
const sentKey = 'cashflow_signup_welcome_sent_at';

export async function markSignupWelcomePending(user: User): Promise<boolean> {
  try {
    const updated = await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, [pendingKey]: true },
    });
    if (!updated.error) return true;
  } catch {
    // Account creation has already succeeded; confirmation must still be sent.
  }
  console.error('Could not mark signup welcome email pending');
  return false;
}

export async function sendPendingSignupWelcome(user: User, allowUnmarked = false): Promise<void> {
  if (!user.email || !user.email_confirmed_at || user.app_metadata?.[sentKey]) return;
  if (!allowUnmarked && user.app_metadata?.[pendingKey] !== true) return;

  const displayName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name : undefined;
  if (!await sendSignupWelcomeEmail(user.email, displayName)) {
    console.error('Confirmed signup welcome email delivery failed');
    return;
  }
  try {
    const updated = await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, [pendingKey]: false, [sentKey]: new Date().toISOString() },
    });
    if (updated.error) console.error('Could not record signup welcome email delivery');
  } catch {
    console.error('Could not record signup welcome email delivery');
  }
}
