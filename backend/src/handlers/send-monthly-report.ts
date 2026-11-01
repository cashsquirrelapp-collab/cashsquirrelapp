import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';
import { inFreeTrial } from '../../../shared/trial.js';
import { stagingRecipientAllowed } from '../security/staging.js';
import { randomUUID } from 'node:crypto';
import { ensurePrivateReportBucket, REPORTS_BUCKET } from '../services/reportStorage.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';
import { patchPrivate } from '../repositories/accounts.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '../config/supabase.js';
import { appOrigin } from '../config/env.js';
import { sendGmailEmailOutcome } from '../services/gmail.js';
import { sendLineMessageToEmailOutcome } from '../services/line.js';
import { attemptDelivery, notificationOutcomeCounts, recordChannelOutcome, type DeliveryOutcome } from '../services/notificationOutcome.js';
import type { LineMessage } from '../services/line.js';
import { lineAppLink, LINE_CARD_COLORS, LINE_CARD_THEMES } from '../services/lineCards.js';
import { buildLineCashSummary, formatMonthlyMoney, monthlyProfitNote } from '../services/lineCashSummary.js';
import { monthlyProfitSummary } from '../../../shared/monthlySummary.js';
import { roundMoney } from '../../../shared/wht.js';
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
} from '../services/monthlySummary.js';


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

// The email is the LINE card in email form (owner, 2026-11-01: the email's net profit and amounts did not match the
// LINE card): the same three numbers (รายรับ, รายจ่ายรวม, กำไรสุทธิ = รายรับ − รายจ่าย), the same words, the brand band
// with the official symbol and the report mascot. Email clients get tables and inline styles.
// Dark mode (owner, the same day: the words disappeared on a too-dark background): Gmail on iPhone turns colours round
// but never pictures, so a gradient band stayed dark while its white words were turned dark. The band is one solid
// brand colour, every text colour is solid (no see-through white), and every block with words sets its own background,
// so a mail app that turns colours round turns each background and its words together. Apple Mail is asked to keep
// the email light (color-scheme: light only).
function emailOrigin(): string | null {
  try { return appOrigin(); } catch { return null; }
}

export function buildReportHtml(monthLabel: string, s: MonthlySummary): string {
  const monthly = monthlyProfitSummary(s);
  const C = LINE_CARD_COLORS;
  const band = LINE_CARD_THEMES.brand.center;
  const origin = emailOrigin();
  const page = isPhaseOneFeatureAvailable('report', false) ? { path: '/report', label: 'ดูรายงานในแอป' } : { path: '/dashboard', label: 'ดูภาพรวมในแอป' };
  // Light text on the band, solid: about 5.8:1 for white and 5.1:1 for the soft line on #B8481A.
  const onBand = '#FFFFFF';
  const onBandSoft = '#FBEAE2';
  const symbol = origin ? `<img src="${origin}/brand/logo01-v1/symbol-white.png" alt="" width="18" height="18" style="vertical-align:middle;margin-right:6px;border:0" />` : '';
  const mascot = origin ? `<td valign="bottom" width="80" bgcolor="${band}" style="width:80px;padding:0;background-color:${band};"><img src="${origin}/line/mascot-v6-report.png" alt="" width="80" height="80" style="display:block;border:0" /></td>` : '';
  const row = (label: string, value: string, color: string, caption?: string) => `
            <tr>
              <td bgcolor="${C.white}" style="padding:8px 0;font-size:14px;line-height:1.5;color:${C.muted};background-color:${C.white};">${label}${caption ? `<div style="font-size:12px;line-height:1.5;color:${C.muted};">${caption}</div>` : ''}</td>
              <td align="right" valign="top" bgcolor="${C.white}" style="padding:8px 0;font-size:17px;line-height:1.5;font-weight:700;color:${color};background-color:${C.white};white-space:nowrap;">${value}</td>
            </tr>`;
  return `<!doctype html>
<html lang="th"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<style>:root { color-scheme: light only; supported-color-schemes: light only; }</style>
</head><body bgcolor="${C.subtle}" style="margin:0;padding:0;background-color:${C.subtle};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.subtle}" style="background-color:${C.subtle};">
    <tr><td bgcolor="${C.subtle}" style="padding:24px 12px;background-color:${C.subtle};font-family:'Noto Sans Thai',Arial,sans-serif;color:${C.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.white}" style="max-width:480px;margin:0 auto;background-color:${C.white};border:1px solid ${C.border};border-radius:18px;overflow:hidden;border-collapse:separate;">
    <tr>
      <td bgcolor="${band}" style="padding:20px 20px 0;background-color:${band};color:${onBand};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td bgcolor="${band}" style="font-size:13px;line-height:1.5;font-weight:700;color:${onBand};background-color:${band};">${symbol}กระรอกตุนเงิน</td>
            <td align="right" bgcolor="${band}" style="background-color:${band};"><span style="display:inline-block;padding:3px 10px;border-radius:10px;border:1px solid ${onBandSoft};font-size:11px;line-height:1.5;font-weight:700;color:${onBand};">รายงาน</span></td>
          </tr>
        </table>
        <div style="margin-top:16px;font-size:19px;line-height:1.45;font-weight:700;color:${onBand};">สรุปการเงินประจำเดือน</div>
        <div style="font-size:13px;line-height:1.5;color:${onBandSoft};">${monthLabel}</div>
        <div style="height:1px;line-height:1px;font-size:0;margin:16px 0 12px;background-color:${onBandSoft};">&nbsp;</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="bottom" bgcolor="${band}" style="padding:0 0 20px;background-color:${band};">
              <div style="font-size:13px;line-height:1.5;color:${onBandSoft};">กำไรสุทธิ</div>
              <div style="font-size:29px;line-height:1.45;font-weight:700;color:${onBand};">${formatMonthlyMoney(monthly.netProfit)}</div>
              <div style="font-size:12px;line-height:1.5;color:${onBandSoft};">รายรับ − รายจ่าย</div>
            </td>${mascot}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td bgcolor="${C.white}" style="padding:14px 20px 20px;background-color:${C.white};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row('รายรับ', formatMonthlyMoney(monthly.received), C.positive)}${row('รายจ่ายรวม', formatMonthlyMoney(monthly.totalExpense), C.negative, 'ประจำ + ทั่วไป')}
        </table>
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid ${C.border};font-size:12px;line-height:1.6;color:${C.muted};background-color:${C.white};">${monthlyProfitNote()}</div>${origin ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr><td align="center" bgcolor="${C.accent}" style="border-radius:10px;background-color:${C.accent};">
          <a href="${origin}${page.path}" style="display:block;padding:12px 16px;color:${C.white};text-align:center;text-decoration:none;font-size:14px;line-height:1.5;font-weight:700;">${page.label}</a>
        </td></tr></table>` : ''}
      </td>
    </tr>
  </table>
  <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.6;color:${C.muted};">แนบไฟล์ Excel สรุปรายรับและรายจ่ายของเดือนนี้มาด้วยแล้ว ตัวเลขชุดเดียวกับการ์ดสรุปใน LINE และหน้าภาพรวมในแอป ปิดการส่งสรุปนี้ได้ที่หน้าตั้งค่าในแอป</p>
    </td></tr>
  </table>
</body></html>`;
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
    isPhaseOneFeatureAvailable('split', false) ? 'รวมรายจ่ายประจำและรายจ่ายทั่วไป · กำไรก่อนแบ่งออม' : 'รวมรายจ่ายประจำและรายจ่ายทั่วไป',
    downloadUrl ? `ดาวน์โหลดไฟล์ Excel ฉบับเต็ม: ${downloadUrl}` : emailAccepted ? 'ไฟล์ Excel ฉบับเต็มส่งไปในอีเมลแล้ว' : (isPhaseOneFeatureAvailable('report', false) ? 'เปิดหน้ารายงานในแอปเพื่อดูรายละเอียด' : 'เปิดแอปเพื่อดูรายละเอียด'),
  ].join('\n');
}

// Keep the scheduled LINE report and the chat shortcut on the same three-number summary.
export function buildReportFlexMessage(monthLabel: string, s: MonthlySummary, downloadUrl: string | null): LineMessage {
  // The reports page is not open to every account yet; until it is, the link goes to the overview.
  let footer = isPhaseOneFeatureAvailable('report', false) ? lineAppLink('/report', 'ดูรายงานในแอป') : lineAppLink('/dashboard', 'ดูภาพรวมในแอป');
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
  // The same figures as the email and the LINE card, with the two kinds of expense that make up the total.
  const monthly = monthlyProfitSummary(s);
  const summaryRows: (string | number)[][] = [
    [`สรุปการเงินประจำเดือน ${monthLabel}`, ''],
    ['รายรับ', monthly.received],
    ['รายจ่ายประจำ', roundMoney(s.fixedExpenseCalculated)],
    ['รายจ่ายทั่วไป', roundMoney(s.variableExpense)],
    ['รายจ่ายรวม', monthly.totalExpense],
    ['กำไรสุทธิ (รายรับ − รายจ่าย)', monthly.netProfit]
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
    `[กระรอกตุนเงิน] สรุปการเงินประจำเดือน ${monthLabel}`,
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
  const isInFreeTrial = inFreeTrial(createdAt);

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
