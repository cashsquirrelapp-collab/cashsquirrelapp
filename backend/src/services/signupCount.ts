import { getSupabaseAdmin } from '../config/supabase.js';

// "มีผู้สมัครแล้ว {จำนวน} คน" on the landing (owner, 2026-10-29): the real number of accounts that signed up, each
// counted once. Not counted: accounts that never confirmed their email (they cannot sign in), guest sessions, the team
// (admin accounts, and the account that keeps reports from the public page), accounts on their way to deletion, and
// test accounts. Deleted accounts are gone from the system already. The system has no "test account" mark, so a test
// account is one on a reserved test domain (.test, .example, .invalid, .localhost, example.com/.net/.org), or one the
// owner lists in SIGNUP_COUNT_EXCLUDE (a Worker secret: account ids or emails, comma-separated; never in the repository).
// Only the total ever leaves the server.

export type AuthUserLike = { id: string; email?: string | null; is_anonymous?: boolean | null; email_confirmed_at?: string | null; confirmed_at?: string | null };

const TEST_DOMAIN = /(?:^|\.)(?:test|example|invalid|localhost)$|^example\.(?:com|net|org)$/i;

export function isTestEmail(email: string | null | undefined): boolean {
  const domain = (email || '').trim().toLowerCase().split('@')[1] || '';
  return !domain || TEST_DOMAIN.test(domain);
}

/** One account counts once: confirmed, not a guest, not on a test domain, and not on the excluded list. */
export function countsAsSignup(user: AuthUserLike, excluded: ReadonlySet<string>): boolean {
  if (user.is_anonymous) return false;
  if (!user.email_confirmed_at && !user.confirmed_at) return false;
  if (isTestEmail(user.email)) return false;
  return !excluded.has(user.id) && !excluded.has((user.email || '').trim().toLowerCase());
}

/** The owner's list (ids or emails) and the account the public page files reports under. */
export function listedExclusions(env: Record<string, string | undefined> = process.env): string[] {
  const listed = (env.SIGNUP_COUNT_EXCLUDE || '').split(/[,\s]+/).map(item => item.trim().toLowerCase()).filter(Boolean);
  const intake = env.FEEDBACK_PUBLIC_ACCOUNT_ID?.trim().toLowerCase();
  return intake ? [...listed, intake] : listed;
}

const PAGE = 1000;

/** Counts the signups now (reads the accounts with the server's own key; nothing of them is returned). */
export async function countSignups(db = getSupabaseAdmin()): Promise<number> {
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
  let total = 0;
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;
    const users = (data?.users || []) as AuthUserLike[];
    for (const user of users) if (countsAsSignup({ ...user, id: String(user.id).toLowerCase() }, excluded)) total++;
    if (users.length < PAGE) return total;
  }
  throw new Error('Too many accounts to count in one go');
}

/** The total kept for a minute, so visitors never each reach the database; one count at a time. */
export function signupCache(count: () => Promise<number>, ttlMs = 60_000, now = () => Date.now()) {
  let kept: { value: number; at: number } | null = null;
  let running: Promise<number> | null = null;
  return async function read(): Promise<{ signups: number; countedAt: number; fresh: boolean }> {
    if (kept && now() - kept.at < ttlMs) return { signups: kept.value, countedAt: kept.at, fresh: true };
    running ??= count().then(value => { kept = { value, at: now() }; return value; }).finally(() => { running = null; });
    try {
      await running;
      return { signups: kept!.value, countedAt: kept!.at, fresh: true };
    } catch (error) {
      // A failed count keeps the last real total (for a day); with none, the page shows no number at all.
      if (kept && now() - kept.at < 86_400_000) return { signups: kept.value, countedAt: kept.at, fresh: false };
      throw error;
    }
  };
}
