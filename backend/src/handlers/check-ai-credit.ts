import type { VercelRequest, VercelResponse } from '../http/types.js';
import { HttpError } from '../http/guard.js';
import { required } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { aiConfig } from '../ai/config.js';
import { loadCostSettings } from '../services/adminProfitReportRun.js';
import { issueAlerts, loadCreditSnapshot, lowAlerts, type BillingIssue } from '../services/aiCredit.js';
import { ownerDeliveryDeps } from '../services/ownerAlerts.js';
import { sendCreditAlerts } from '../services/aiCredit.js';

// Every day at 08:00 Bangkok (owner, 2026-10-25: warn before the AI credit runs out, not after): a provider with less than
// a week left at the recent pace, past its recorded balance, or that answered with a billing problem in the last 24 hours
// gets one LINE message to the owner that day. Read-only apart from the delivery claim.
const KNOWN: BillingIssue[] = ['anthropic_credit', 'gemini_billing', 'gemini_quota'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if (req.headers.authorization !== `Bearer ${required('CRON_SECRET')}`) throw new HttpError(401, 'Unauthorized');
  res.setHeader('Cache-Control', 'no-store');
  const now = new Date();
  const db = getSupabaseAdmin();
  const settings = aiConfig(process.env);
  const rate4 = (await loadCostSettings(db).catch(() => null))?.settings.rate4 ?? null;
  let snapshot;
  try {
    snapshot = await loadCreditSnapshot(db, now, { rate4, dailyCapUsd: settings.dailyCostCapUsd, payingMembers: null, proTokens: settings.proTokensPerCycle, tokenUsd: settings.tokenUsd });
  } catch (error) {
    // Before its SQL runs there is nothing to check: skipped, not failed.
    res.json({ reason: (error as Error).message, skipped: 1 });
    return;
  }
  const issues = snapshot.providers.flatMap(status => status.issues.map(item => item.issue)).filter((issue): issue is BillingIssue => KNOWN.includes(issue as BillingIssue));
  const alerts = [...issueAlerts(issues, now), ...lowAlerts(snapshot, now)];
  const result = await sendCreditAlerts(alerts, ownerDeliveryDeps(now));
  res.json({ processed: alerts.length, ...result });
}
