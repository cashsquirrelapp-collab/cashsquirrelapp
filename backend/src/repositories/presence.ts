import { getSupabaseAdmin } from '../config/supabase.js';

// Presence is a heartbeat: every open, visible app tab posts one about every 20 seconds
// (see the presence-heartbeat action in usage-analytics). An account counts as online while its
// latest heartbeat is newer than this window, which also smooths over brief network drops and
// keeps a user online as long as any one of their tabs is still open.
export const ONLINE_WINDOW_MS = 60 * 1000;

export async function loadPresenceByUserId(db: ReturnType<typeof getSupabaseAdmin>, userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const result = await db.from('cashflow_user_presence')
    .select('user_id,last_seen_at')
    .in('user_id', userIds);
  if (result.error) throw result.error;
  return new Map((result.data || []).map(row => [row.user_id, row.last_seen_at] as const));
}

export const isOnlineAt = (lastSeenAt: string | null | undefined, now = Date.now()) =>
  !!lastSeenAt && now - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
