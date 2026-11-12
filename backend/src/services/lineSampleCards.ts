// The LINE cards a Pro account receives, built by the same code as the real ones from sample data, for the owner to see
// in their own LINE (owner, 2026-11-03: a button on the admin page). Nothing here reads or writes an account.
import type { Job } from '../../../shared/types.js';
import { formatMonthKey } from '../../../shared/calendar.js';
import type { LineMessage } from './line.js';
import { buildLineStart, buildLineWelcome } from './lineLinkCards.js';
import { lineSignupOn } from './lineFirst.js';
import { buildDigestFlexMessage, buildInsightFlexMessage, findJobsNeedingAttention, todayInBangkok, type JobRow } from './lineReminders.js';
import { handleDueAction, type DuePaymentDependencies } from './lineDuePayments.js';
import { buildWht50ReminderMessage, findWaitingWht50Jobs } from './lineWht50Reminders.js';
import { computeMonthlySummary } from './monthlySummary.js';
import { buildTaxSeasonMessage, filingYear } from './taxSeason.js';

const DAY = 86_400_000;

export const LINE_SAMPLE_INTRO = 'การ์ดตัวอย่าง 7 แบบที่ลูกค้า Pro ได้รับใน LINE\nข้อมูลทั้งหมดเป็นตัวอย่าง ปุ่มในการ์ดไม่บันทึกอะไรในบัญชี';

/** The intro, then 7 cards in the order a customer meets them. Job ids start with "demo-": their buttons only answer
 *  that they are a sample (lineDuePayments.ts). */
export async function buildLineSampleCards(now = new Date()): Promise<LineMessage[]> {
  const today = Date.parse(`${todayInBangkok(now)}T00:00:00Z`);
  const day = (offset: number) => new Date(today + offset * DAY).toISOString().slice(0, 10);

  const due: JobRow[] = [
    { id: 'demo-overdue', name: 'ถ่ายภาพสินค้า ร้านตัวอย่าง', client: 'ลูกค้าตัวอย่าง A', status: 'pending', pending: 4500, payDate: day(-3) },
    { id: 'demo-today', name: 'ออกแบบโลโก้ ร้านตัวอย่าง', client: 'ลูกค้าตัวอย่าง B', status: 'pending', pending: 9700, payDate: day(0) },
    { id: 'demo-soon', name: 'ตัดต่อวิดีโอรีวิว', client: 'ลูกค้าตัวอย่าง C', status: 'pending', pending: 2500, payDate: day(2) },
  ];
  const digest = buildDigestFlexMessage(findJobsNeedingAttention(due, now), {
    now,
    insights: [{ kind: 'not_invoiced', title: 'งานส่งแล้ว 1 งาน ยังไม่ได้ออกใบแจ้งหนี้', lines: ['รีวิวสินค้า · ลูกค้าตัวอย่าง D · ฿12,000'], link: { path: '/invoice', label: 'ออกใบแจ้งหนี้' } }],
  } as Parameters<typeof buildDigestFlexMessage>[1]);

  // The reply to ได้รับแล้ว, from an in-memory job: no account is read or saved.
  const paidJob = { id: 'sample-paid', name: 'ออกแบบโลโก้ ร้านตัวอย่าง', client: 'ลูกค้าตัวอย่าง B', status: 'pending', pending: 9700, payDate: day(0), value: 10000, received: 0, whtRate: 3 } as unknown as Job;
  const memory: DuePaymentDependencies = {
    loadJob: async () => ({ data: paidJob, version: 1 }), saveJob: async () => true, today: () => day(0), now: () => now,
  } as unknown as DuePaymentDependencies;
  const paid = await handleDueAction({ user_id: 'sample' }, { kind: 'paid', ref: { jobId: 'sample-paid' } }, memory);

  const insightOnly = buildInsightFlexMessage([{ kind: 'cash_short', title: 'เงินอาจไม่พอจ่ายช่วงปลายเดือน', lines: ['รายจ่ายประจำ ฿18,000 ครบในอีก 3 สัปดาห์', 'เงินที่คาดว่าจะเข้าก่อนนั้น ฿9,700'], link: { path: '/calendar', label: 'ดูปฏิทินเงิน' } }] as Parameters<typeof buildInsightFlexMessage>[0], { now });

  const received = (id: string, name: string, client: string, value: number, daysAgo: number) => ({
    id, name, client, value, whtRate: 3, whtAmount: value * 0.03, received: value * 0.97, pending: 0,
    status: 'done', paymentStatus: 'paid', payDate: day(-daysAgo), depositDate: day(-daysAgo), isPosted: true,
  });
  const wht50 = buildWht50ReminderMessage(findWaitingWht50Jobs([
    received('demo-wht-1', 'โพสต์ IG ร้านกาแฟ', 'ร้านกาแฟตัวอย่าง', 8000, 20),
    received('demo-wht-2', 'คลิป TikTok', 'บริษัท ตัวอย่าง จำกัด', 12000, 17),
  ] as unknown as Job[], [], now));

  const lastMonth = new Date(Date.UTC(Number(todayInBangkok(now).slice(0, 4)), Number(todayInBangkok(now).slice(5, 7)) - 2, 1));
  const monthKey = lastMonth.toISOString().slice(0, 7);
  const monthJobs = [
    { id: 'demo-m1', name: 'รีวิวสินค้า', client: 'ลูกค้าตัวอย่าง A', status: 'done', value: 15000, received: 15000, pending: 0, payDate: `${monthKey}-10`, depositDate: `${monthKey}-10`, whtRate: 0 },
    { id: 'demo-m2', name: 'ถ่ายภาพ', client: 'ลูกค้าตัวอย่าง B', status: 'done', value: 9000, received: 9000, pending: 0, payDate: `${monthKey}-20`, depositDate: `${monthKey}-20`, whtRate: 0 },
  ];
  const monthExpenses = [{ id: 'demo-e1', name: 'ค่าอุปกรณ์', amount: 3500, date: `${monthKey}-08`, category: 'อุปกรณ์' }];
  const summary = computeMonthlySummary(monthJobs as never, monthExpenses as never, [], { monthlyExpense: 2000 } as never, monthKey);
  // Loaded here only: the report handler brings the spreadsheet library with it.
  const { buildReportFlexMessage } = await import('../handlers/send-monthly-report.js');
  const report = buildReportFlexMessage(formatMonthKey(monthKey), summary, null);

  // The season ahead: January–March files the year before (filingYear); from April the next season is for this year.
  const taxYear = Number(todayInBangkok(now).slice(5, 7)) <= 3 ? filingYear(now) : filingYear(now) + 1;
  const tax = buildTaxSeasonMessage({ taxYear, gross: 420000, withheld: 12600, receipts: 18 }, 'open');

  return [
    { type: 'text', text: LINE_SAMPLE_INTRO },
    buildLineWelcome({ pro: true }), digest, paid, insightOnly, wht50, report, tax,
    // While sign-up in LINE is on (services/lineFirst.ts): the card a new friend without an account gets.
    ...(lineSignupOn() ? [{ type: 'text', text: 'การ์ดสำหรับคนที่แอด LINE แต่ยังไม่มีบัญชี (กดเริ่มใช้งานแล้วจะเปิดหน้าสมัคร)' } as LineMessage, buildLineStart(process.env.LIFF_ID)] : []),
  ];
}
