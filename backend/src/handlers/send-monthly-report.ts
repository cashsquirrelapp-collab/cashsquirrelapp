import { stagingRecipientAllowed } from '../security/staging.js';
import { randomUUID } from 'node:crypto';
import { ensurePrivateReportBucket, REPORTS_BUCKET } from '../services/reportStorage.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';
import { patchPrivate } from '../repositories/accounts.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '../config/supabase.js';
import { sendGmailEmailOutcome } from '../services/gmail.js';
import { sendLineMessageToEmailOutcome } from '../services/line.js';
import { attemptDelivery, notificationOutcomeCounts, recordChannelOutcome, type DeliveryOutcome } from '../services/notificationOutcome.js';
import type { LineMessage } from '../services/line.js';
import { lineAppLink } from '../services/lineCards.js';
import { buildLineCashSummary, formatMonthlyMoney } from '../services/lineCashSummary.js';
import { monthlyProfitSummary } from '../../../shared/monthlySummary.js';
import { formatMonthKey } from '../../../shared/calendar.js';
import {
  JobRow,
  ExpenseRow,
  GoalRow,
  SettingsRow,
  MonthlySummary,
  nowInBangkok,
  jobsInMonth,
  expensesInMonth,
  computeMonthlySummary,
  formatCurrency,
} from '../services/monthlySummary.js';

const FREE_TRIAL_DAYS = 14;

interface NotifSettingsRow {
  alertEmail?: string;
  monthlyReportEnabled?: boolean;
  lastMonthlyReportSentMonth?: string;
  lineUserId?: string;
  [key: string]: unknown;
}

// The month this cron should report on: the previous calendar month relative to Bangkok "today".
function targetMonthKey(): string {
  const bkk = nowInBangkok();
  const d = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildReportHtml(monthLabel: string, s: MonthlySummary): string {
  const totalExpense = s.fixedExpenseCalculated + s.variableExpense;
  const netFlowColor = s.netFlow < 0 ? '#B91C1C' : '#3730A3';
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#3D2314;">
    <span style="display:inline-block;background:#ECFDF5;color:#059669;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:6px;">MONTHLY FINANCIAL REPORT</span>
    <h2 style="color:#059669;margin:12px 0 4px;">สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}</h2>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tr>
        <td style="width:50%;padding:16px;background:#ECFDF5;border-radius:12px 0 0 12px;text-align:center;">
          <div style="font-size:11px;color:#059669;font-weight:bold;">รายรับจริง (RECEIVED)</div>
          <div style="font-size:22px;color:#047857;font-weight:900;margin-top:4px;">${formatCurrency(s.received)}</div>
        </td>
        <td style="width:50%;padding:16px;background:#FEF2F2;border-radius:0 12px 12px 0;text-align:center;">
          <div style="font-size:11px;color:#DC2626;font-weight:bold;">รายจ่ายและงบประจำ</div>
          <div style="font-size:22px;color:#B91C1C;font-weight:900;margin-top:4px;">${formatCurrency(totalExpense)}</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:12px;padding:16px;background:#EEF2FF;border-radius:12px;text-align:center;">
      <div style="font-size:11px;color:#4338CA;font-weight:bold;">กระแสเงินสดสุทธิคงเหลือ (NET CASH FLOW)</div>
      <div style="font-size:26px;color:${netFlowColor};font-weight:900;margin-top:4px;">${formatCurrency(s.netFlow)}</div>
    </div>
    <div style="margin-top:20px;padding:16px;background:#FDF6EC;border-radius:12px;">
      <div style="font-size:12px;font-weight:bold;color:#3D2314;margin-bottom:8px;">รายละเอียดการเงินแยกตามส่วน</div>
      <table style="width:100%;font-size:13px;">
        <tr><td style="padding:4px 0;color:#7A5C43;">มูลค่ารวมสัญญาดีลทั้งหมด</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${formatCurrency(s.income)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">ยอดโอนรับแล้วจริง</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#059669;">${formatCurrency(s.received)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">หัก ค่าใช้จ่ายคงที่รายเดือน</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#DC2626;">${formatCurrency(s.fixedExpenseCalculated)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">ค่าใช้จ่ายผันแปร</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#DC2626;">${formatCurrency(s.variableExpense)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">ยอดออมสะสมโดยประมาณ</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${formatCurrency(s.actualSavings)}</td></tr>
      </table>
    </div>
    <p style="color:#7A5C43;font-size:12px;margin-top:24px;">แนบไฟล์ Excel สรุปรายรับ-รายจ่ายของเดือนนี้มาด้วยแล้ว ตัวเลขชุดนี้คำนวณจากข้อมูลเดียวกับที่แสดงในแอปกระรอกตุนเงินเสมอ ปิดการแจ้งเตือนได้ที่หน้ารายงานในแอป</p>
  </div>`;
}

// Same income, total expenses and profit as the dashboard. downloadUrl is null when
// APP_URL isn't configured or the Storage upload failed, in which case this just points back to
// the email instead of claiming a link exists.
export function buildReportLineText(monthLabel: string, s: MonthlySummary, downloadUrl: string | null, emailAccepted = true): string {
  const monthly = monthlyProfitSummary(s);
  return [
    `สรุปการเงิน ${monthLabel}`,
    '',
    `รายรับ: ${formatMonthlyMoney(s.received)}`,
    `รายจ่ายรวม: ${formatMonthlyMoney(monthly.totalExpense)}`,
    `กำไรสุทธิ: ${formatMonthlyMoney(monthly.netProfit)}`,
    '',
    'รวมรายจ่ายประจำและรายจ่ายทั่วไป · กำไรก่อนแบ่งออม',
    downloadUrl ? `ดาวน์โหลดไฟล์ Excel ฉบับเต็ม: ${downloadUrl}` : emailAccepted ? 'ไฟล์ Excel ฉบับเต็มส่งไปในอีเมลแล้ว' : 'เปิดหน้ารายงานในแอปเพื่อดูรายละเอียด',
  ].join('\n');
}

// Keep the scheduled LINE report and the chat shortcut on the same three-number summary.
export function buildReportFlexMessage(monthLabel: string, s: MonthlySummary, downloadUrl: string | null): LineMessage {
  let footer = lineAppLink('/report', 'ดูรายงานในแอป');
  if (downloadUrl) {
    try {
      if (new URL(downloadUrl).protocol === 'https:') footer = { label: 'ดาวน์โหลดไฟล์ Excel', uri: downloadUrl };
    } catch { /* An invalid report URL must not turn the entire LINE message invalid. */ }
  }
  return buildLineCashSummary({
    title: 'สรุปการเงินประจำเดือน', monthLabel, summary: s, footer,
  });
}


// Uploads the report to a private Supabase Storage bucket and returns a link through this app's
// own /api/download-report proxy (see that file for why -- a raw *.supabase.co signed URL pasted
// into a LINE message reads as an unfamiliar, suspicious link; this app's own domain doesn't).
// Returns null on any failure, which callers treat as "fall back to email-only wording" rather
// than a hard error -- a broken upload should never take down the rest of the digest run.
async function uploadReportAndGetLink(userId: string, monthKey: string, excelBase64: string): Promise<string | null> {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return null;

  try {
    const buffer = Buffer.from(excelBase64, 'base64');
    const path = `${userId}/${monthKey}.xlsx`;

    await ensurePrivateReportBucket();
    const { error: uploadErr } = await supabaseAdmin.storage.from(REPORTS_BUCKET).upload(path, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
      cacheControl: '0',
    });
    if (uploadErr) throw uploadErr;

    return `${appUrl.replace(/\/$/, '')}/api/download-report?month=${encodeURIComponent(monthKey)}&account=${encodeURIComponent(userId)}`;
  } catch {
    console.error('Monthly report storage upload failed');
    return null;
  }
}

// Same 3-sheet shape as the Tax tab's Excel export (src/components/TaxTab.tsx handleExportExcel),
// scoped to just the target month instead of a whole tax year.
export function buildMonthlyExcelBase64(monthLabel: string, s: MonthlySummary, jobs: JobRow[], expenses: ExpenseRow[]): string {
  const summaryRows: (string | number)[][] = [
    [`สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`, ''],
    ['มูลค่ารวมสัญญาดีลทั้งหมด', s.income],
    ['ยอดโอนรับแล้วจริง', s.received],
    ['หัก ค่าใช้จ่ายคงที่รายเดือน', s.fixedExpenseCalculated],
    ['ค่าใช้จ่ายผันแปร', s.variableExpense],
    ['กระแสเงินสดสุทธิคงเหลือ', s.netFlow],
    ['ยอดออมสะสมโดยประมาณ', s.actualSavings]
  ];

  const incomeHeaders = [
    'ชื่อโปรเจกต์', 'ประเภทงาน', 'ลูกค้า', 'งวดชำระ', 'สถานะงวด', 'วันที่รับเงินจริง', 'มูลค่ารวม (บาท)', 'หัก ณ ที่จ่าย (%)',
    'จำนวนภาษีหัก ณ ที่จ่าย (บาท)', 'ยอดได้รับแล้ว (บาท)', 'ยอดค้างชำระ (บาท)',
    'สถานะโครงการ', 'เครดิตเทอม (วัน)', 'วันเริ่มงาน', 'วันดีล/วันเผยแพร่', 'กำหนดชำระเงิน', 'หมายเหตุ'
  ];
  const incomeRows = jobs.flatMap((j) => {
    let statusText = j.status;
    if (j.status === 'done') statusText = 'จ่ายแล้ว';
    else if (j.status === 'partial' || j.status === 'installment') statusText = j.status === 'installment' ? 'แบ่งชำระเป็นงวด' : 'มัดจำ/จ่ายบางส่วน';
    else if (j.status === 'pending') statusText = 'ยังไม่จ่าย';
    if (!j.installments?.length) {
      return [[
        j.name, j.type || 'ทั่วไป', j.client || '-', '-', '-', '-', j.value || 0, j.whtRate || 0,
        j.whtAmount || 0, j.received || 0, j.pending || 0, statusText || '-',
        j.creditTerm || 0, j.startDate || '-', j.postDate || '-', j.payDate || '-', j.note || ''
      ]];
    }
    return j.installments.map((row, index) => {
      const ratio = j.value > 0 ? row.amount / j.value : 0;
      return [
        j.name, j.type || 'ทั่วไป', j.client || '-', row.label,
        row.status === 'paid' ? 'รับเงินแล้ว' : 'รอรับเงิน', row.paidAt || '-',
        index === 0 ? j.value || 0 : 0, j.whtRate || 0,
        Math.round((j.whtAmount || 0) * ratio * 100) / 100,
        row.status === 'paid' ? row.amount : 0,
        row.status === 'pending' ? row.amount : 0,
        statusText || '-', j.creditTerm || 0, j.startDate || '-', j.postDate || '-',
        row.dueDate || '-', j.note || ''
      ];
    });
  });

  const expenseHeaders = ['ชื่อรายการ', 'หมวดหมู่', 'จำนวนเงิน (บาท)', 'วันที่', 'หมายเหตุ'];
  const expenseRows = expenses.map((e) => [e.name || '-', e.category || '-', e.amount || 0, e.date || '-', e.note || '']);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'สรุปเดือน');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeRows]), 'รายรับ');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseRows]), 'รายจ่าย');

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

async function sendReportEmail(
  to: string,
  monthLabel: string,
  summary: MonthlySummary,
  excelBase64: string
): Promise<DeliveryOutcome> {
  return sendGmailEmailOutcome(
    to,
    `[กระรอกตุนเงิน] สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`,
    buildReportHtml(monthLabel, summary),
    [
      {
        filename: `บัญชีเดือน_${monthLabel.replace(/\s+/g, '_')}_กระรอกตุนเงิน.xlsx`,
        content: excelBase64,
      },
    ]
  );
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
    const monthKey = targetMonthKey();
    const monthLabel = formatMonthKey(monthKey);

    const [{ data: rows, error: rowsErr }, { data: subs, error: subsErr }, createdAtByUserId] = await Promise.all([
      supabaseAdmin.from('cashflow_account_snapshot').select('user_id, email, jobs, goals, settings, expenses, notif_settings'),
      supabaseAdmin.from('subscriptions').select('user_id, status, plan, current_period_end'),
      listAllAuthUsers(),
    ]);

    if (rowsErr) throw rowsErr;
    if (subsErr) throw subsErr;

    const subscriptionByUserId = new Map((subs || []).map((s) => [s.user_id, { status: s.status, plan: s.plan, current_period_end: s.current_period_end }] as const));

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
      if (!notifSettings.monthlyReportEnabled) {
        skipped += 1;
        continue;
      }
      if (notifSettings.lastMonthlyReportSentMonth === monthKey) {
        skipped += 1;
        continue;
      }

      const deliveryKey = `report:${row.user_id}:${monthKey}`;
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
        const expenses: ExpenseRow[] = row.expenses || [];
        const goals: GoalRow[] = row.goals || [];
        const settings: SettingsRow = row.settings || {};

        const summary = computeMonthlySummary(jobs, expenses, goals, settings, monthKey);

        if (summary.received === 0 && summary.variableExpense === 0) {
          skipped += 1;
          continue;
        }

        const recipient = notifSettings.alertEmail || row.email;
        if (!recipient) {
          skipped += 1;
          continue;
        }
        claimed = await claimDelivery(deliveryKey);
        if (!claimed) { skipped += 1; continue; }

        const monthJobs = jobsInMonth(jobs, monthKey);
        const monthExpenses = expensesInMonth(expenses, monthKey);

        const excelBase64 = buildMonthlyExcelBase64(monthLabel, summary, monthJobs, monthExpenses);

        const emailOutcome = await attemptDelivery(() => sendReportEmail(recipient, monthLabel, summary, excelBase64));
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
          const downloadUrl = await uploadReportAndGetLink(row.user_id, monthKey, excelBase64);
          const lineMessage = downloadUrl
            ? buildReportFlexMessage(monthLabel, summary, downloadUrl)
            : { type: 'text' as const, text: buildReportLineText(monthLabel, summary, null, emailOutcome === 'accepted') };
          lineOutcome = await attemptDelivery(() => sendLineMessageToEmailOutcome(row.email, lineMessage, notifSettings.lineUserId, randomUUID()));
        }
        record('line', lineOutcome);

        // Only skip the lastMonthlyReportSentMonth update when BOTH channels failed -- gating on
        // emailOk alone (as it used to be) meant an account relying only on LINE never got this
        // tracked, even on a month LINE delivered fine.
        if (!accepted) {
          // Retain the claim when acceptance is unknown; a retry could send twice.
          if (!uncertain) { await releaseDelivery(deliveryKey); claimed = false; }
          if (emailOutcome === 'skipped' && lineOutcome === 'skipped') skipped += 1;
          continue;
        }

        marking = true;
        await patchPrivate(row.user_id, { lastMonthlyReportSentMonth: monthKey });
      } catch {
        if (marking) outcomes.markerFailed += 1;
        else if (!failureCounted) outcomes.failed += 1;
        // Before any possible acceptance a failed preparation can safely be retried.
        if (claimed && !accepted && !uncertain) {
          try { await releaseDelivery(deliveryKey); } catch { console.error('Monthly report claim release failed'); }
        }
        console.error('Monthly report account processing failed', { accepted, uncertain });
      }
    }

    res.status(200).json({ processed, sent, skipped, monthKey, ...outcomes });
  } catch {
    console.error('Monthly report account listing failed');
    res.status(500).json({ error: 'Monthly report job failed' });
  }
}
