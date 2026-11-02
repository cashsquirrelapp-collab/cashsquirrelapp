import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { AnalyticsRange } from '../../../shared/adminAnalytics.js';
import { readActivity, summarizeActivity, bangkokDate, type StoredActivity } from '../../../shared/userActivity.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { canViewAdminAnalytics } from '../security/adminAnalyticsAccess.js';
import { planStatusOf } from './admin-analytics.js';

// The admin page's ผู้ใช้งาน view (owner, 2026-11-03): for every account, when it was last active, how long it has been
// away, how often and at what time of day it uses the app. The owner only, like the rest of the statistics. Read from
// what is already kept: the presence heartbeat, pages opened (cashflow_usage_daily), the visits the heartbeat keeps
// (shared/userActivity.ts) and the last sign-in.

const querySchema = z.object({ range: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30) });
type Db = ReturnType<typeof getSupabaseAdmin>;

async function loadAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 30_000; from += 1000) {
    const result = await fetchPage(from, from + 999);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error('Activity data exceeds the complete-report limit');
}

async function lastSignIns(db: Db): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) if (user.last_sign_in_at) found.set(user.id, user.last_sign_in_at);
    if (data.users.length < 1000) break;
  }
  return found;
}

export default withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  if (!canViewAdminAnalytics(user, await systemRole(user.id))) throw new HttpError(403, 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น');
  await rateLimit('admin-activity', user.id, 30, 60);
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'ช่วงเวลาสถิติไม่ถูกต้อง');
  const range = parsed.data.range as AnalyticsRange;
  const now = new Date();
  const today = bangkokDate(now.getTime());
  const from = new Date(`${today}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - (range - 1));
  const fromDate = from.toISOString().slice(0, 10);
  const db = getSupabaseAdmin();

  type Profile = { user_id: string; public_id: string; display_name: string; created_at: string };
  type Subscription = { user_id: string; status: string; plan: string | null; current_period_end: string | null };
  const [profiles, subscriptions, presence, usage, states, signIns] = await Promise.all([
    loadAll<Profile>((a, b) => db.from('cashflow_profiles').select('user_id,public_id,display_name,created_at').order('created_at', { ascending: false }).range(a, b) as never),
    loadAll<Subscription>((a, b) => db.from('subscriptions').select('user_id,status,plan,current_period_end').order('updated_at', { ascending: false }).range(a, b) as never),
    loadAll<{ user_id: string; last_seen_at: string }>((a, b) => db.from('cashflow_user_presence').select('user_id,last_seen_at').order('user_id').range(a, b) as never),
    loadAll<{ usage_date: string; user_key: string; last_seen_at: string }>((a, b) => db.from('cashflow_usage_daily').select('usage_date,user_key,last_seen_at').gte('usage_date', fromDate).lte('usage_date', today).order('usage_date').range(a, b) as never),
    loadAll<{ user_id: string; activity: unknown; statsOff: unknown }>((a, b) => db.from('cashflow_private_state').select('user_id,activity:data->activity,statsOff:data->statsOff').order('user_id').range(a, b) as never),
    // The last sign-in is context only: the view still loads without it.
    lastSignIns(db).catch(() => new Map<string, string>()),
  ]);

  const subscriptionBy = new Map<string, Subscription>();
  for (const row of subscriptions) if (!subscriptionBy.has(row.user_id)) subscriptionBy.set(row.user_id, row);
  const userIdByKey = new Map(profiles.map(profile => [createHmac('sha256', sessionSecret()).update(`usage:${profile.user_id}`).digest('hex'), profile.user_id] as const));
  const activity = new Map<string, StoredActivity>();
  const statsOff = new Set<string>();
  for (const row of states) {
    if (row.activity) activity.set(row.user_id, readActivity(row.activity));
    if (row.statsOff === true) statsOff.add(row.user_id);
  }
  const summary = summarizeActivity({
    profiles,
    plans: new Map(profiles.map(profile => [profile.user_id, planStatusOf(profile, subscriptionBy.get(profile.user_id), now.getTime())] as const)),
    presence: new Map(presence.map(row => [row.user_id, row.last_seen_at] as const)),
    usage: usage.flatMap(row => { const id = userIdByKey.get(row.user_key); return id ? [{ user_id: id, usage_date: row.usage_date, last_seen_at: row.last_seen_at }] : []; }),
    activity, statsOff, signIns, range, now,
  });
  res.json(summary);
});
