import { stagingRecipientAllowed } from '../security/staging.js';
import { randomUUID } from 'node:crypto';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';
import { patchPrivate } from '../repositories/accounts.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { supabaseAdmin } from '../config/supabase.js';
import { sendGmailEmailOutcome } from '../services/gmail.js';
import { sendLineMessageToEmailOutcome } from '../services/line.js';
import { attemptDelivery, notificationOutcomeCounts, recordChannelOutcome, type DeliveryOutcome } from '../services/notificationOutcome.js';
import { buildDigestFlexMessage, findJobsNeedingAttention, todayInBangkok, type JobRow, type JobWithDiff } from '../services/lineReminders.js';
export { buildDigestFlexMessage } from '../services/lineReminders.js';

const FREE_TRIAL_DAYS = 14;

interface NotifSettingsRow {
  enabled?: boolean;
  alertEmail?: string;
  dailyDigestEnabled?: boolean;
  lastDigestSentDate?: string;
  pendingQueue?: unknown[];
  lineUserId?: string;
}

function dueLabel(diffDays: number): string {
  if (diffDays < 0) return `เลยกำหนดมาแล้ว ${Math.abs(diffDays)} วัน`;
  if (diffDays === 0) return 'ครบกำหนดวันนี้';
  return `อีก ${diffDays} วัน`;
}

function buildJobRows(jobs: JobWithDiff[], dateColor: string): string {
  return jobs
    .map(
      (j) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;">${escapeHtml(j.client || 'ไม่ระบุ')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;">${escapeHtml(j.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;text-align:right;">฿${j.pending.toLocaleString('th-TH')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;text-align:right;color:${dateColor};font-weight:bold;">${dueLabel(j.diffDays)}</td>
    </tr>`
    )
    .join('');
}

function buildSection(title: string, badgeBg: string, badgeColor: string, jobs: JobWithDiff[], dateColor: string): string {
  if (jobs.length === 0) return '';
  return `
    <div style="margin-top:20px;">
      <span style="display:inline-block;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:bold;padding:4px 10px;border-radius:6px;">${title} (${jobs.length} รายการ)</span>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
        <thead>
          <tr style="background:#FDF6EC;">
            <th style="padding:8px 12px;text-align:left;">ลูกค้า</th>
            <th style="padding:8px 12px;text-align:left;">งาน</th>
            <th style="padding:8px 12px;text-align:right;">ยอดค้าง</th>
            <th style="padding:8px 12px;text-align:right;">กำหนดชำระ</th>
          </tr>
        </thead>
        <tbody>${buildJobRows(jobs, dateColor)}</tbody>
      </table>
    </div>`;
}

function buildDigestHtml(jobs: JobWithDiff[]): string {
  const overdue = jobs.filter((j) => j.diffDays < 0);
  const dueToday = jobs.filter((j) => j.diffDays === 0);
  const dueSoon = jobs.filter((j) => j.diffDays > 0);

  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#3D2314;">
    <span style="display:inline-block;background:#FEF2F2;color:#DC2626;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:6px;">OVERDUE CREDIT ALERT</span>
    <h2 style="color:#E65F2B;margin:12px 0 4px;">🚨 สรุปดีลงานที่ต้องติดตามเครดิตเทอม</h2>
    <p style="margin-top:0;">ระบบตรวจพบดีลงานที่เลยกำหนด ครบกำหนดวันนี้ หรือใกล้ครบกำหนดใน 1-2 วัน ลองติดต่อทวงถามลูกค้าล่วงหน้าได้เลยครับ</p>

    ${buildSection('⚠️ เกินกำหนดชำระเงินแล้ว', '#FEF2F2', '#DC2626', overdue, '#DC2626')}
    ${buildSection('⏰ ครบกำหนดวันนี้', '#FEF9E7', '#B45309', dueToday, '#B45309')}
    ${buildSection('📅 ใกล้ครบกำหนด (1-2 วัน)', '#EEF2FF', '#4338CA', dueSoon, '#4338CA')}

    <div style="margin-top:24px;padding:16px;background:#FDF6EC;border-radius:12px;">
      <p style="font-size:12px;font-weight:bold;color:#3D2314;margin:0 0 8px;">💡 คำแนะนำในการดำเนินการทวงถาม</p>
      <ol style="font-size:12px;color:#7A5C43;margin:0;padding-left:18px;line-height:1.7;">
        <li>เปิดแอปธนาคารหรือเช็คสเตทเมนต์ของคุณ เพื่อยืนยันว่าไม่มียอดดังกล่าวโอนเข้ามาจริง ๆ</li>
        <li>ทักไปทวงถามลูกค้าอย่างสุภาพ พร้อมแนบใบแจ้งหนี้หรือหลักฐานงานที่ส่งไปแล้ว</li>
        <li>บันทึกไว้ในแอปทันทีที่ได้รับเงิน เพื่อให้ระบบหยุดแจ้งเตือนรายการนั้น</li>
      </ol>
    </div>

    <p style="color:#7A5C43;font-size:12px;margin-top:24px;">อีเมลนี้ส่งอัตโนมัติจากกระรอกตุนเงิน ปิดการแจ้งเตือนได้ที่หน้าตั้งค่าระบบในแอป</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function sendDigestEmail(to: string, jobs: JobWithDiff[]): Promise<DeliveryOutcome> {
  const overdueCount = jobs.filter((j) => j.diffDays < 0).length;
  const subject = overdueCount > 0
    ? `สรุปงานค้างชำระเลยกำหนด ${overdueCount} รายการ - กระรอกตุนเงิน`
    : `สรุปดีลงานที่ใกล้ครบกำหนดชำระเงิน ${jobs.length} รายการ - กระรอกตุนเงิน`;
  return sendGmailEmailOutcome(to, subject, buildDigestHtml(jobs));
}

async function listAllAuthUsers(): Promise<Map<string, string>> {
  const createdAtByUserId = new Map<string, string>();
  let page = 1;
  const perPage = 200;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      createdAtByUserId.set(u.id, u.created_at);
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return createdAtByUserId;
}

function isPro(
  userId: string,
  createdAtByUserId: Map<string, string>,
  subscriptionByUserId: Map<string, { status: string; plan: string | null; current_period_end: string | null }>
): boolean {
  const sub = subscriptionByUserId.get(userId);
  if (['admin_revoked', 'admin_removed'].includes(sub?.plan || '')) return false;
  const createdAt = createdAtByUserId.get(userId);
  const isInFreeTrial = !!createdAt && new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 86400000 > Date.now();

  const isAdminGrant = sub?.status === 'active' && sub.plan === 'admin_grant';
  const isPaidActive = sub?.status === 'active' && !!sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();

  return isInFreeTrial || isAdminGrant || isPaidActive;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({error:'Method not allowed'}); return; }
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const [{ data: rows, error: rowsErr }, { data: subs, error: subsErr }, createdAtByUserId] = await Promise.all([
      supabaseAdmin.from('cashflow_account_snapshot').select('user_id, email, jobs, notif_settings'),
      supabaseAdmin.from('subscriptions').select('user_id, status, plan, current_period_end'),
      listAllAuthUsers(),
    ]);

    if (rowsErr) throw rowsErr;
    if (subsErr) throw subsErr;

    const subscriptionByUserId = new Map((subs || []).map((s) => [s.user_id, { status: s.status, plan: s.plan, current_period_end: s.current_period_end }] as const));

    const todayStr = todayInBangkok();
    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const outcomes = notificationOutcomeCounts();

    for (const row of rows || []) {
      processed += 1;
      const notifSettings: NotifSettingsRow = row.notif_settings || {};
      if (!stagingRecipientAllowed(notifSettings.alertEmail || row.email, notifSettings.lineUserId)) { skipped += 1; continue; }

      if (!isPro(row.user_id, createdAtByUserId, subscriptionByUserId)) {
        skipped += 1;
        continue;
      }
      // Older settings screens saved the master switch as `enabled`; newer records use the
      // explicit `dailyDigestEnabled`. Supporting both connects existing users to the Gmail
      // delivery without forcing them to re-enter notification settings.
      const digestEnabled = notifSettings.dailyDigestEnabled ?? notifSettings.enabled ?? false;
      if (!digestEnabled) {
        skipped += 1;
        continue;
      }
      if (notifSettings.lastDigestSentDate === todayStr) {
        skipped += 1;
        continue;
      }

      const deliveryKey = `digest:${row.user_id}:${todayStr}`;
      let claimed = false;
      let accepted = false;
      let uncertain = false;
      let failureCounted = false;
      let marking = false;
      const record = (channel: 'email' | 'line', outcome: DeliveryOutcome) => {
        recordChannelOutcome(outcomes, channel, outcome);
        if (outcome === 'accepted' && !accepted) { accepted = true; sent += 1; }
        if (outcome === 'unknown' && !uncertain) { uncertain = true; outcomes.uncertain += 1; }
        if (outcome === 'rejected' && !failureCounted) { failureCounted = true; outcomes.failed += 1; }
      };
      try {
        const account = await supabaseAdmin.auth.admin.getUserById(row.user_id);
        if (account.error) throw account.error;
        if (account.data.user?.app_metadata?.account_paused === true) { skipped += 1; continue; }
        const jobs: JobRow[] = row.jobs || [];
        const attentionJobs = findJobsNeedingAttention(jobs);

        if (attentionJobs.length === 0) {
          skipped += 1;
          continue;
        }

        claimed = await claimDelivery(deliveryKey);
        if (!claimed) { skipped += 1; continue; }
        const recipient = notifSettings.alertEmail || row.email;
        const emailOutcome: DeliveryOutcome = recipient ? await attemptDelivery(() => sendDigestEmail(recipient, attentionJobs)) : 'skipped';
        record('email', emailOutcome);

        // Independent of the email outcome above -- LINE and email are separate channels, and
        // Gmail has repeatedly been the unreliable one in this app's history. Gating this behind
        // `emailOk` (as it used to be) meant a single Gmail hiccup silently swallowed the LINE
        // notification too, even for accounts with LINE properly linked. Best-effort in that a
        // failure here doesn't fail the whole request -- but it IS awaited: a fire-and-forget
        // promise (no `await`, just `.catch()`) has no guarantee of finishing before this
        // serverless function returns its response and gets frozen/torn down, which was silently
        // dropping the LINE push even when this code was reached.
        let lineOutcome: DeliveryOutcome = 'skipped';
        if (row.email) {
          lineOutcome = await attemptDelivery(() => sendLineMessageToEmailOutcome(row.email, buildDigestFlexMessage(attentionJobs), notifSettings.lineUserId, randomUUID()));
          // The payment buttons are new (2026-10-22): if LINE refuses that card, the reminder still
          // goes out, as the card without buttons.
          if (lineOutcome === 'rejected') {
            console.error('LINE refused the reminder with payment buttons; sending it without them');
            lineOutcome = await attemptDelivery(() => sendLineMessageToEmailOutcome(row.email, buildDigestFlexMessage(attentionJobs, { buttons: false }), notifSettings.lineUserId, randomUUID()));
          }
        }
        record('line', lineOutcome);

        // Only skip the follow-up-count/lastDigestSentDate update when BOTH channels failed --
        // gating on emailOk alone (as it used to be) meant an account relying only on LINE (no
        // working email, or Gmail having one of its outages) never got its followUpCount tracked
        // and lastDigestSentDate never advanced, even though the notification the user actually
        // sees (LINE) went out fine every single day.
        if (!accepted) {
          if (!uncertain) { await releaseDelivery(deliveryKey); claimed = false; }
          if (emailOutcome === 'skipped' && lineOutcome === 'skipped') skipped += 1;
          continue;
        }

        // Only count genuinely overdue items as a "follow-up" -- a heads-up for something due
        // in 1-2 days isn't a follow-up attempt yet.
        marking = true;
        const overdueIds = new Set(attentionJobs.filter((j) => j.diffDays < 0).map((j) => j.id));
        for (const id of overdueIds) {
          const result = await supabaseAdmin.rpc('cashflow_follow_up', { p_user_id: row.user_id, p_id: id, p_date: todayStr });
          if (result.error) throw result.error;
        }
        await patchPrivate(row.user_id, { lastDigestSentDate: todayStr });

      } catch {
        if (marking) outcomes.markerFailed += 1;
        else if (!failureCounted) outcomes.failed += 1;
        if (claimed && !accepted && !uncertain) {
          try { await releaseDelivery(deliveryKey); } catch { console.error('Digest claim release failed'); }
        }
        console.error('Digest account processing failed', { accepted, uncertain });
      }
    }

    console.log(`send-overdue-digest: processed=${processed} sent=${sent} skipped=${skipped}`);
    res.status(200).json({ processed, sent, skipped, ...outcomes });
  } catch {
    console.error('Digest account listing failed');
    res.status(500).json({ error: 'Digest job failed' });
  }
}
