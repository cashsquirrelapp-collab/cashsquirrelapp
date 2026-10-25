import { z } from 'zod';
import { aiConfig } from '../ai/config.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { canViewAdminAnalytics } from '../security/adminAnalyticsAccess.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { loadCostSettings } from '../services/adminProfitReportRun.js';
import { loadCreditSnapshot } from '../services/aiCredit.js';
import { proTokenLimits } from '../services/proTokens.js';

// The admin page's AI credit and reserve (owner, 2026-10-25). GET: each provider's estimated credit left, days left at
// the recent pace, the reserve for 30 days and what to top up. POST: the owner records the balance the provider's
// console shows now (after a top-up). Owner-only; nothing else is written.

const bodySchema = z.object({
  provider: z.enum(['anthropic', 'google']),
  balanceUsd: z.number().finite().min(0).max(999_999),
  note: z.string().trim().max(200).optional(),
}).strict();

export default withGuard(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  if (!canViewAdminAnalytics(user, await systemRole(user.id))) throw new HttpError(403, 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น');
  await rateLimit(req.method === 'POST' ? 'admin-ai-credit-save' : 'admin-ai-credit', user.id, req.method === 'POST' ? 10 : 30, 60);
  const db = getSupabaseAdmin();
  if (req.method === 'POST') {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'ยอดเครดิตไม่ถูกต้อง');
    const saved = await db.from('cashflow_admin_ai_credit').insert({
      provider: parsed.data.provider, balance_usd: parsed.data.balanceUsd.toFixed(4), note: parsed.data.note || null, created_by: user.id,
    });
    if (saved.error) throw new HttpError(503, saved.error.code === '42P01' || saved.error.code === 'PGRST205' ? 'ยังไม่ได้รัน SQL ของส่วนเครดิต AI' : 'บันทึกยอดเครดิตไม่สำเร็จ');
  }
  const settings = aiConfig(process.env);
  const rate4 = (await loadCostSettings(db).catch(() => null))?.settings.rate4 ?? null;
  try {
    const now = new Date();
    const [snapshot, limits] = await Promise.all([
      loadCreditSnapshot(db, now, { rate4, dailyCapUsd: settings.dailyCostCapUsd, payingMembers: null, proTokens: settings.proTokensPerCycle, tokenUsd: settings.tokenUsd }),
      proTokenLimits(db, now).catch(() => null),
    ]);
    // Members on a paid plan have that plan's tokens (shared/proTokens.ts); everyone else the default allowance.
    const planned = limits ? { planTokens: [...limits.values()].reduce((sum, tokens) => sum + tokens, 0), planAccounts: limits.size } : {};
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ...snapshot, allowance: { proTokens: settings.proTokensPerCycle, tokenUsd: settings.tokenUsd, ...planned } });
  } catch (error) {
    throw new HttpError(503, (error as Error).message === 'sql_not_run' ? 'ยังไม่ได้รัน SQL ของส่วนเครดิต AI' : 'อ่านข้อมูลเครดิต AI ไม่ได้ในตอนนี้');
  }
});
