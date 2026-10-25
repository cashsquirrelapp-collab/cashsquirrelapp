import { getSupabaseAdmin } from '../config/supabase.js';
import { claimDelivery } from '../repositories/deliveries.js';
import type { BillingIssue } from '../ai/billing.js';
import { sendLineMessagePayloadOutcome } from './line.js';
import type { DeliveryDeps } from './adminProfitReportRun.js';
import { issueAlerts, sendCreditAlerts } from './aiCredit.js';

// LINE messages to the owner (the system admins who linked LINE; ADMIN_REPORT_EMAILS narrows it), the same delivery the
// monthly report uses. Each message is claimed once (cashflow_delivery_claims), so a busy hour never sends it twice.

export function ownerDeliveryDeps(now = new Date()): DeliveryDeps {
  const db = getSupabaseAdmin();
  const allowEmails = (process.env.ADMIN_REPORT_EMAILS || '').split(/[,\s]+/).map(email => email.trim().toLowerCase()).filter(email => email.includes('@'));
  return {
    db, token: process.env.LINE_CHANNEL_ACCESS_TOKEN, now, claim: claimDelivery,
    push: (lineUserId, message, key) => sendLineMessagePayloadOutcome(lineUserId, message, key),
    allowEmails, emailOf: async userId => (await db.auth.admin.getUserById(userId)).data.user?.email ?? null,
  };
}

/** A provider just answered "out of credit" or "over quota": tell the owner now (at most once a day per problem). */
export function notifyBillingIssues(issues: BillingIssue[], now = new Date()) {
  return sendCreditAlerts(issueAlerts(issues, now), ownerDeliveryDeps(now));
}
