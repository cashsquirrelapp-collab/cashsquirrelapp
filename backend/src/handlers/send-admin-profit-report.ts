import type { VercelRequest, VercelResponse } from '../http/types.js';
import { HttpError } from '../http/guard.js';
import { required } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { configuredStripeLivemode, stripe } from '../config/stripe.js';
import { aiConfig } from '../ai/config.js';
import { claimDelivery } from '../repositories/deliveries.js';
import { sendLineMessagePayloadOutcome } from '../services/line.js';
import { bangkokDay, bangkokMonth, shiftMonth } from '../services/adminProfitReport.js';
import { buildReport, DELIVERY_DAYS, deliverReport, loadStoredReport, saveReport, type ReportDeps } from '../services/adminProfitReportRun.js';

// The owner's monthly profit report (brief "KRAROK AI PROFIT INTELLIGENCE", 2026-10-25): at 08:00 Bangkok on the 1st
// it works out last month, saves it, and sends the totals to the system admins who linked LINE. If LINE fails, the
// saved report is sent again at 08:00 on the 2nd and 3rd; it is never sent twice. By hand (the owner, with
// CRON_SECRET): ?month=2026-10&send=0 works a past month out and saves it without sending.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if (req.headers.authorization !== `Bearer ${required('CRON_SECRET')}`) throw new HttpError(401, 'Unauthorized');
  res.setHeader('Cache-Control', 'no-store');
  const now = new Date();
  const asked = typeof req.query.month === 'string' ? req.query.month : undefined;
  if (asked !== undefined && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(asked) || asked >= bangkokMonth(now))) throw new HttpError(400, 'Invalid report month');
  const send = req.query.send !== '0';
  if (!asked && bangkokDay(now) > DELIVERY_DAYS) { res.json({ reason: 'not_report_day', skipped: 1 }); return; }
  const month = asked ?? shiftMonth(bangkokMonth(now), -1);
  const db = getSupabaseAdmin();
  const settings = aiConfig(process.env);
  const deps: ReportDeps = { db, stripe: process.env.STRIPE_SECRET_KEY ? stripe : null, stripeLive: configuredStripeLivemode(), ai: settings, now };
  let report = await loadStoredReport(db, month);
  if (report?.delivered_at) { res.json({ month, status: report.status, delivery: 'already', skipped: 1 }); return; }
  if (!report) report = await saveReport(db, month, await buildReport(month, deps));
  if (!send) { res.json({ month, status: report.status, delivery: 'not_sent', skipped: 1 }); return; }
  const allowEmails = (process.env.ADMIN_REPORT_EMAILS || '').split(/[,\s]+/).map(email => email.trim().toLowerCase()).filter(email => email.includes('@'));
  const delivery = await deliverReport(report, {
    db, token: process.env.LINE_CHANNEL_ACCESS_TOKEN, now, claim: claimDelivery,
    push: (lineUserId, message, retryKey) => sendLineMessagePayloadOutcome(lineUserId, message, retryKey),
    allowEmails, emailOf: async userId => (await db.auth.admin.getUserById(userId)).data.user?.email ?? null,
  });
  // The scheduled runner reads these counts: a report not delivered shows as a failed job in the Worker's logs.
  const sent = delivery === 'delivered' || delivery === 'partial' ? 1 : 0;
  const failed = delivery === 'failed' || delivery === 'quota' || delivery === 'no_recipients' ? 1 : 0;
  res.json({ month, status: report.status, delivery, sent, failed, skipped: sent || failed ? 0 : 1 });
}
