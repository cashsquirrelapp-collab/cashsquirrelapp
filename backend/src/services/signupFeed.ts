import { getSupabaseAdmin } from '../config/supabase.js';
import { countsAsSignup, isTestEmail, listedExclusions } from './signupCount.js';
import { safeAvatarUrl, type SignupFeed, type SignupFeedItem, type SignupVia } from '../../../shared/signupFeed.js';
import { LINE_ONLY_DOMAIN } from '../../../shared/lineAccount.js';

// The admin page's live sign-ups (owner, 2026-11-28: "เห็นผู้สมัครเข้ามาแบบ real time เหมือนด้านหน้า landing page"). The
// total and today's count follow the landing's rule (services/signupCount.ts), so the two numbers agree. The list shows
// the newest accounts, including ones that have not confirmed their email yet (marked as such), and never the team,
// test addresses or accounts on their way to deletion. Name and Public ID only: no email leaves the server.


type AuthUser = {
  id: string; email?: string | null; created_at?: string; is_anonymous?: boolean | null;
  email_confirmed_at?: string | null; confirmed_at?: string | null;
  app_metadata?: { provider?: string; signup_channel?: string } | null;
  user_metadata?: { avatar_url?: unknown; picture?: unknown } | null;
};

/** The Google picture and the sign-in address of an auth user (the address only when asked for, never a LINE inner one). */
export function personOf(user: AuthUser, withEmail: boolean): { avatarUrl: string | null; email: string | null } {
  const email = (user.email || '').trim().toLowerCase();
  return {
    avatarUrl: safeAvatarUrl(user.user_metadata?.avatar_url) ?? safeAvatarUrl(user.user_metadata?.picture),
    email: withEmail && email && !email.endsWith(`@${LINE_ONLY_DOMAIN}`) ? email : null,
  };
}

const bangkokDay = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

export function signupVia(user: AuthUser): SignupVia {
  if (user.app_metadata?.signup_channel === 'line') return 'line';
  const provider = user.app_metadata?.provider;
  return provider === 'google' ? 'google' : provider === 'email' ? 'email' : 'other';
}

/** Pure part: counts and the newest accounts from the auth users, given who is left out. */
export function summarizeSignups(users: AuthUser[], excluded: ReadonlySet<string>, now: Date, limit = 8, withEmail = false): Omit<SignupFeed, 'latest'> & { latest: Omit<SignupFeedItem, 'publicId' | 'displayName'>[] } {
  const today = bangkokDay(now.getTime());
  let total = 0; let todayCount = 0;
  const shown: AuthUser[] = [];
  for (const raw of users) {
    const user = { ...raw, id: String(raw.id).toLowerCase() };
    if (user.is_anonymous || isTestEmail(user.email) || excluded.has(user.id) || excluded.has((user.email || '').trim().toLowerCase())) continue;
    const created = Date.parse(user.created_at || '');
    if (!Number.isFinite(created)) continue;
    shown.push(user);
    if (countsAsSignup(user, excluded)) { total += 1; if (bangkokDay(created) === today) todayCount += 1; }
  }
  shown.sort((a, b) => Date.parse(b.created_at!) - Date.parse(a.created_at!));
  return {
    total, today: todayCount, at: now.toISOString(),
    latest: shown.slice(0, limit).map(user => ({
      userId: user.id, createdAt: new Date(Date.parse(user.created_at!)).toISOString(), via: signupVia(user),
      confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
      ...personOf(user, withEmail),
    })),
  };
}

export async function signupFeed(db = getSupabaseAdmin(), now = new Date(), withEmail = false): Promise<SignupFeed> {
  const [admins, leaving] = await Promise.all([
    db.from('cashflow_user_roles').select('user_id').eq('role', 'admin'),
    db.from('cashflow_account_pauses').select('user_id').eq('closure_kind', 'deletion').eq('state', 'paused'),
  ]);
  if (admins.error) throw admins.error;
  if (leaving.error) throw leaving.error;
  const excluded = new Set<string>([
    ...listedExclusions(),
    ...(admins.data || []).map(row => String((row as { user_id: string }).user_id).toLowerCase()),
    ...(leaving.data || []).map(row => String((row as { user_id: string }).user_id).toLowerCase()),
  ]);
  const users: AuthUser[] = [];
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = (data?.users || []) as AuthUser[];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  const summary = summarizeSignups(users, excluded, now, 8, withEmail);
  const ids = summary.latest.map(item => item.userId);
  const profiles = ids.length
    ? await db.from('cashflow_profiles').select('user_id,public_id,display_name').in('user_id', ids)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const byId = new Map((profiles.data || []).map(row => [String((row as { user_id: string }).user_id).toLowerCase(), row as { public_id: string | null; display_name: string | null }]));
  return {
    ...summary,
    latest: summary.latest.map(item => ({ ...item, publicId: byId.get(item.userId)?.public_id ?? null, displayName: byId.get(item.userId)?.display_name?.trim() || null })),
  };
}
