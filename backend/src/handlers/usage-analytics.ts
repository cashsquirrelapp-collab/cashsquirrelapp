import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { USAGE_FEATURE_KEYS } from '../../../shared/usageAnalytics.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError, withGuard } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { systemRole } from '../repositories/roles.js';
import { rateLimit } from '../security/rateLimit.js';

const recordSchema = z.object({ feature: z.enum(USAGE_FEATURE_KEYS) }).strict();

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
