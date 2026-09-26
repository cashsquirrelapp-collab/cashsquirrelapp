import { ensurePrivateReportBucket, REPORTS_BUCKET } from '../services/reportStorage.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';
import { patchPrivate } from '../repositories/accounts.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '../config/supabase.js';
import { sendGmailEmail } from '../services/gmail.js';
import { sendLineMessageToEmail } from '../services/line.js';
import type { LineMessage } from '../services/line.js';
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

function buildReportHtml(monthLabel: string, s: MonthlySummary): string {
  const totalExpense = s.fixedExpenseCalculated + s.variableExpense;
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
          <div style="font-size:11px;color:#DC2626;font-weight:bold;">รายจ่ายจริง (EXPENSES)</div>
          <div style="font-size:22px;color:#B91C1C;font-weight:900;margin-top:4px;">${formatCurrency(totalExpense)}</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:12px;padding:16px;background:#EEF2FF;border-radius:12px;text-align:center;">
      <div style="font-size:11px;color:#4338CA;font-weight:bold;">กระแสเงินสดสุทธิคงเหลือ (NET CASH FLOW)</div>
      <div style="font-size:26px;color:#3730A3;font-weight:900;margin-top:4px;">${formatCurrency(Math.max(0, s.netFlow))}</div>
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

// Condensed plain-text version for LINE -- same numbers as the email. downloadUrl is null when
// APP_URL isn't configured or the Storage upload failed, in which case this just points back to
// the email instead of claiming a link exists.
function buildReportLineText(monthLabel: string, s: MonthlySummary, downloadUrl: string | null): string {
  const totalExpense = s.fixedExpenseCalculated + s.variableExpense;
  return [
    `📊 สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`,
    '',
    `รายรับจริง: ${formatCurrency(s.received)}`,
    `รายจ่ายจริง: ${formatCurrency(totalExpense)}`,
    `กระแสเงินสดสุทธิคงเหลือ: ${formatCurrency(Math.max(0, s.netFlow))}`,
    '',
    'รายละเอียด:',
    `• มูลค่ารวมสัญญาดีลทั้งหมด: ${formatCurrency(s.income)}`,
    `• ยอดโอนรับแล้วจริง: ${formatCurrency(s.received)}`,
    `• หัก ค่าใช้จ่ายคงที่รายเดือน: ${formatCurrency(s.fixedExpenseCalculated)}`,
    `• ค่าใช้จ่ายผันแปร: ${formatCurrency(s.variableExpense)}`,
    '',
    downloadUrl
      ? `ดาวน์โหลดไฟล์ Excel ฉบับเต็ม: ${downloadUrl}`
      : 'ไฟล์ Excel ฉบับเต็มส่งไปในอีเมลแล้ว เปิดแอปกระรอกตุนเงินเพื่อดูรายละเอียดเพิ่มเติม',
  ].join('\n');
}

// LINE's Flex bubble version of the same card, with a real tappable download button instead of a
// bare URL in a text bubble -- same cream "receipt" visual language as the rest of the app's LINE
// cards (see api/_lineAssistant.ts's buildReceiptCard/buildStatementRow, not reused directly here
// since this file has no other reason to depend on that module).
function buildReportFlexMessage(monthLabel: string, s: MonthlySummary, downloadUrl: string | null): LineMessage {
  const totalExpense = s.fixedExpenseCalculated + s.variableExpense;
  const row = (label: string, value: string, color: string) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#7A5C43', flex: 2 },
      { type: 'text', text: value, size: 'sm', color, weight: 'bold', flex: 3, align: 'end' },
    ],
  });

  const contents: any = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FBF2E4',
      borderWidth: '1px',
      borderColor: '#D8CBB8',
      paddingAll: '20px',
      spacing: 'md',
      contents: [
        { type: 'text', text: `สรุปงบเดือน ${monthLabel}`, weight: 'bold', size: 'md', color: '#4338CA' },
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        row('รายรับจริง', formatCurrency(s.received), '#0E9F6E'),
        row('รายจ่ายจริง', formatCurrency(totalExpense), '#A63F1B'),
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        row('กระแสเงินสดสุทธิ', formatCurrency(Math.max(0, s.netFlow)), '#3D2314'),
      ],
    },
  };

  if (downloadUrl) {
    contents.footer = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        { type: 'button', style: 'primary', color: '#4338CA', action: { type: 'uri', label: '📥 ดาวน์โหลดไฟล์ Excel', uri: downloadUrl } },
      ],
    };
  }

  return { type: 'flex', altText: `สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`, contents };
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
  } catch (err) {
    console.error(`uploadReportAndGetLink failed for user ${userId}:`, err);
    return null;
  }
}

// Same 3-sheet shape as the Tax tab's Excel export (src/components/TaxTab.tsx handleExportExcel),
// scoped to just the target month instead of a whole tax year.
function buildMonthlyExcelBase64(monthLabel: string, s: MonthlySummary, jobs: JobRow[], expenses: ExpenseRow[]): string {
  const summaryRows: (string | number)[][] = [
    [`สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`, ''],
    ['มูลค่ารวมสัญญาดีลทั้งหมด', s.income],
    ['ยอดโอนรับแล้วจริง', s.received],
    ['หัก ค่าใช้จ่ายคงที่รายเดือน', s.fixedExpenseCalculated],
    ['ค่าใช้จ่ายผันแปร', s.variableExpense],
    ['กระแสเงินสดสุทธิคงเหลือ', Math.max(0, s.netFlow)],
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
): Promise<boolean> {
  return sendGmailEmail(
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
  activeSubByUserId: Map<string, { current_period_end: string }>
): boolean {
  const createdAt = createdAtByUserId.get(userId);
  const isInFreeTrial = !!createdAt && new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 86400000 > Date.now();

  const sub = activeSubByUserId.get(userId);
  const isPaidActive = !!sub && new Date(sub.current_period_end).getTime() > Date.now();

  return isInFreeTrial || isPaidActive;
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
      supabaseAdmin.from('subscriptions').select('user_id, status, current_period_end').eq('status', 'active'),
      listAllAuthUsers(),
    ]);

    if (rowsErr) throw rowsErr;
    if (subsErr) throw subsErr;

    const activeSubByUserId = new Map((subs || []).map((s) => [s.user_id, { current_period_end: s.current_period_end }]));

    let processed = 0;
    let sent = 0;
    let skipped = 0;

    for (const row of rows || []) {
      processed += 1;
      const notifSettings: NotifSettingsRow = row.notif_settings || {};

      if (!isPro(row.user_id, createdAtByUserId, activeSubByUserId)) {
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

        const deliveryKey = `report:${row.user_id}:${monthKey}`;
        if (!await claimDelivery(deliveryKey)) { skipped += 1; continue; }
        const recipient = notifSettings.alertEmail || row.email;
        if (!recipient) {
          skipped += 1;
          continue;
        }

        const monthJobs = jobsInMonth(jobs, monthKey);
        const monthExpenses = expensesInMonth(expenses, monthKey);

        const excelBase64 = buildMonthlyExcelBase64(monthLabel, summary, monthJobs, monthExpenses);

        const emailOk = await sendReportEmail(recipient, monthLabel, summary, excelBase64);

        // Independent of the email outcome above -- LINE and email are separate channels, and
        // Gmail has repeatedly been the unreliable one in this app's history. Gating this behind
        // `emailOk` (as it used to be) meant a single Gmail hiccup silently swallowed the LINE
        // notification too, even for accounts with LINE properly linked. Best-effort in that a
        // failure here doesn't fail the whole request -- but it IS awaited: a fire-and-forget
        // promise (no `await`, just `.catch()`) has no guarantee of finishing before this
        // serverless function returns its response and gets frozen/torn down, which was silently
        // dropping the LINE push even when this code was reached.
        let lineOk = false;
        if (row.email) {
          const downloadUrl = await uploadReportAndGetLink(row.user_id, monthKey, excelBase64);
          const lineMessage = downloadUrl
            ? buildReportFlexMessage(monthLabel, summary, downloadUrl)
            : { type: 'text' as const, text: buildReportLineText(monthLabel, summary, null) };
          lineOk = await sendLineMessageToEmail(row.email, lineMessage, notifSettings.lineUserId).catch((err) => {
            console.error(`send-monthly-report: LINE send failed for ${row.email}:`, err);
            return false;
          });
        }

        // Only skip the lastMonthlyReportSentMonth update when BOTH channels failed -- gating on
        // emailOk alone (as it used to be) meant an account relying only on LINE never got this
        // tracked, even on a month LINE delivered fine.
        if (!emailOk && !lineOk) {
          await releaseDelivery(deliveryKey);
          skipped += 1;
          continue;
        }

        await patchPrivate(row.user_id, { lastMonthlyReportSentMonth: monthKey });

        sent += 1;
      } catch (perUserErr: any) {
        console.error(`send-monthly-report: failed for user ${row.user_id}:`, perUserErr);
        skipped += 1;
      }
    }

    res.status(200).json({ processed, sent, skipped, monthKey });
  } catch (err: any) {
    console.error('send-monthly-report handler error:', err);
    res.status(500).json({ error: 'Monthly report job failed' });
  }
}
