import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { USAGE_FEATURE_KEYS } from '../../../shared/usageAnalytics.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError, withGuard } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { systemRole } from '../repositories/roles.js';
import { rateLimit } from '../security/rateLimit.js';
import { patchPrivate } from '../repositories/accounts.js';
import { heartbeatChangesVisits, readActivity, recordHeartbeat } from '../../../shared/userActivity.js';

const recordSchema = z.object({ feature: z.enum(USAGE_FEATURE_KEYS) }).strict();
const presenceHeartbeatSchema = z.object({ action: z.literal('presence-heartbeat') }).strict();
/** The browser's cookie choice, sent once it is signed in (frontend/src/services/cookieConsent.ts). */
const statsChoiceSchema = z.object({ action: z.literal('stats-choice'), stats: z.boolean() }).strict();

// The visits the admin page shows (shared/userActivity.ts): written at most once every few minutes per account, and
// never in the way of the heartbeat itself.
async function recordVisit(db: ReturnType<typeof getSupabaseAdmin>, userId: string, now: Date) {
  const current = await db.from('cashflow_private_state').select('activity:data->activity').eq('user_id', userId).maybeSingle();
  if (current.error) throw current.error;
  const next = recordHeartbeat(readActivity((current.data as { activity?: unknown } | null)?.activity), now);
  await patchPrivate(userId, { activity: next });
}

function bangkokDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  const db = getSupabaseAdmin();

  if (req.method === 'POST') {
    if (presenceHeartbeatSchema.safeParse(req.body).success) {
      await rateLimit('presence-heartbeat', user.id, 30, 60);
      const now = new Date();
      const before = await db.from('cashflow_user_presence').select('last_seen_at').eq('user_id', user.id).maybeSingle();
      const heartbeat = await db.from('cashflow_user_presence').upsert({
        user_id: user.id,
        last_seen_at: now.toISOString(),
      }, { onConflict: 'user_id' });
      if (heartbeat.error) throw heartbeat.error;
      if (!before.error && heartbeatChangesVisits((before.data as { last_seen_at?: string } | null)?.last_seen_at, now)) {
        await recordVisit(db, user.id, now).catch(error => console.warn('usage: visit not recorded', (error as Error)?.message));
      }
      res.json({ ok: true });
      return;
    }
    const choice = statsChoiceSchema.safeParse(req.body);
    if (choice.success) {
      // Essential cookies only: the admin page says so instead of showing the account as gone, and the visits kept so
      // far are removed. Accepting again only clears the mark.
      await rateLimit('usage-stats-choice', user.id, 10, 60);
      await patchPrivate(user.id, choice.data.stats ? {} : { statsOff: true }, choice.data.stats ? ['statsOff'] : ['activity']);
      res.json({ ok: true });
      return;
    }
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'ข้อมูลการใช้งานไม่ถูกต้อง');
    await rateLimit('usage-record', user.id, 180, 60);
    const result = await db.rpc('cashflow_record_usage', {
      p_user_key: createHmac('sha256', sessionSecret()).update(`usage:${user.id}`).digest('hex'),
      p_feature_key: parsed.data.feature,
    });
    if (result.error) throw result.error;
    res.json({ ok: true });
    return;
  }

  if ((await systemRole(user.id)) !== 'admin') throw new HttpError(403, 'เฉพาะ admin เท่านั้น');
  await rateLimit('usage-analytics-read', user.id, 30, 60);
  const today = bangkokDate(new Date());
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const fromDate = start.toISOString().slice(0, 10);
  const result = await db.rpc('cashflow_usage_analytics', {
    p_from_date: fromDate,
    p_to_date: today,
  });
  if (result.error) throw result.error;
  res.json(result.data);
});
