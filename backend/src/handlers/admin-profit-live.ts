import { z } from 'zod';
import { aiConfig } from '../ai/config.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { canViewAdminAnalytics } from '../security/adminAnalyticsAccess.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { bangkokMonth, microUsd } from '../services/adminProfitReport.js';
import { buildReport } from '../services/adminProfitReportRun.js';
import type { AdminProfitLive } from '../../../shared/adminProfit.js';

// The admin page's live profit and AI cost (owner, 2026-10-25: "คำนวณต้นทุน AI ... แบบเรียลไทม์ ... เหมือนของ
// Stripe"). The same engine as the monthly LINE report (adminProfitReport.ts), worked out on request for this
// month so far or a past month, without the AI note (no AI cost). Owner-only, read-only: nothing is saved or sent.

const querySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });
type Db = ReturnType<typeof getSupabaseAdmin>;

/** Today's AI spend (Bangkok day) from the usage rows, the figure the daily cap is checked against. */
export async function loadTodayAi(db: Db, now: Date, capUsd: number): Promise<AdminProfitLive['today']> {
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - 7 * 3600_000).toISOString();
  let usdMicro = 0; let requests = 0;
  for (let from = 0; from < 50_000; from += 1000) {
    const page = await db.from('cashflow_ai_usage').select('cost_usd').gte('created_at', start).order('created_at').range(from, from + 999);
    if (page.error) return null;
    const rows = (page.data ?? []) as { cost_usd: string | number | null }[];
    for (const row of rows) { usdMicro += microUsd(row.cost_usd); requests++; }
    if (rows.length < 1000) return { usdMicro, capUsd, requests };
  }
  return null;
}

export default withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  if (!canViewAdminAnalytics(user, await systemRole(user.id))) throw new HttpError(403, 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น');
  await rateLimit('admin-profit-live', user.id, 30, 60);
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'เดือนไม่ถูกต้อง');
  const now = new Date();
  const current = bangkokMonth(now);
  const month = parsed.data.month ?? current;
  if (month > current) throw new HttpError(400, 'เดือนไม่ถูกต้อง');
  const db = getSupabaseAdmin();
  const settings = aiConfig(process.env);
  // Checked as the owner before anything account-wide is read.
  const built = await buildReport(month, { db, stripe: process.env.STRIPE_SECRET_KEY ? stripe : null, stripeLive: configuredStripeLivemode(), ai: settings, now }, { note: false });
  const live = month === current;
  const body: AdminProfitLive = {
    month, live, generatedAt: now.toISOString(), metrics: built.metrics, accounts: built.accounts, settings: built.settings,
    today: live ? await loadTodayAi(db, now, settings.dailyCostCapUsd).catch(() => null) : null,
  };
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(body);
});
