import type { LineCardData, LineInbox, LineItem, LineTone } from '../../../shared/lineInbox.js';
import { monthlyProfitSummary } from '../../../shared/monthlySummary.js';
import { launched } from './knowledgeBase.js';
import { buildDataSnapshot, type UserRow } from '../services/lineAssistant.js';
import { dueRefFromDigestId, partialPrompt, type DueOutcome } from '../services/lineDuePayments.js';
import { findJobsNeedingAttention, todayInBangkok, type JobRow, type JobWithDiff } from '../services/lineReminders.js';

// The app's "แจ้งเตือนอัตโนมัติ" thread, built from the account's own data (owner, 2026-10-24: "ต้องเอาเป็นของ
// ยูสเซอร์ account นั้น"). The same rules and wording as what LINE sends: the 08:00 reminder
// (lineReminders.buildDigestFlexMessage), the monthly summary (the 1st, 09:00) and the quick replies. Nothing
// is stored: the thread shows what those messages say for this account today.

const BKK = 7 * 3600_000;
const baht = (amount: number) => `฿ ${Number(amount || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
const monthName = (monthKey: string) => new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
const dueText = (days: number) => (days < 0 ? `เลย ${Math.abs(days)} วัน` : days === 0 ? 'วันนี้' : `อีก ${days} วัน`);
/** A Bangkok wall-clock time on a Bangkok date, as epoch ms. */
const bangkokAt = (date: string, hours: number) => Date.parse(`${date}T00:00:00Z`) - BKK + hours * 3600_000;

const MAX_REMINDER_ITEMS = 3;
const MAX_LIST_ITEMS = 5;

/** The 08:00 reminder card with today's jobs (overdue, due today, due within two days). */
export function reminderCard(jobs: JobWithDiff[], today: string): LineCardData | null {
  if (!jobs.length) return null;
  const sorted = [...jobs].sort((a, b) => a.diffDays - b.diffDays || (a.dueDate || a.payDate || '').localeCompare(b.dueDate || b.payDate || ''));
  const groups: { title: string; tone: LineTone; items: JobWithDiff[] }[] = [
    { title: 'เลยกำหนด', tone: 'negative', items: sorted.filter(job => job.diffDays < 0) },
    { title: 'ครบกำหนดวันนี้', tone: 'warning', items: sorted.filter(job => job.diffDays === 0) },
    { title: 'ใกล้ครบกำหนด', tone: 'muted', items: sorted.filter(job => job.diffDays > 0) },
  ];
  // Same as LINE: one slot per group first, so a long overdue list cannot hide today's or upcoming money.
  const visible = new Set(groups.flatMap(group => group.items.slice(0, 1)));
  for (const job of sorted) { if (visible.size >= MAX_REMINDER_ITEMS) break; visible.add(job); }
  const item = (job: JobWithDiff, tone: LineTone): LineItem => {
    const date = job.dueDate || job.payDate;
    const ref = dueRefFromDigestId(job.id);
    return {
      id: job.id, name: job.name, client: job.client || '', amount: baht(job.pending),
      meta: `${date ? `กำหนด ${shortDate(date)} · ` : ''}${dueText(job.diffDays)}`, metaTone: tone,
      ...(job.diffDays <= 0 && ref ? { due: true, ...(ref.installmentId ? {} : { prompt: partialPrompt(ref) }) } : {}),
    };
  };
  const blocks: LineCardData['blocks'] = [];
  for (const group of groups) {
    if (!group.items.length) continue;
    if (blocks.length) blocks.push({ kind: 'divider' });
    blocks.push({ kind: 'section', title: `${group.title} · ${group.items.length} รายการ`, tone: group.tone, items: group.items.filter(job => visible.has(job)).map(job => item(job, group.tone)) });
  }
  const hidden = jobs.length - visible.size;
  const total = jobs.reduce((sum, job) => sum + (job.pending || 0), 0);
  return {
    category: groups[0].items.length ? 'urgent' : 'reminder', title: 'เตือนรับเงิน', subtitle: `เครดิตเทอม · ${shortDate(today)}`,
    metric: { label: 'ยอดรอรับที่ต้องติดตาม', value: baht(total), note: `${jobs.length} รายการ · ด่วนที่สุดอยู่บน` },
    blocks,
    note: `${hidden > 0 ? `แสดง ${visible.size} จาก ${jobs.length} รายการ · อีก ${hidden} รายการดูในแอป\n` : ''}รับเงินแล้ว? กดปุ่มใต้รายการ บันทึกให้ทันที`,
    footer: { label: 'ดูรายการรอรับเงิน', path: '/receivables' },
    alt: `เตือนรับเงิน: เลยกำหนด ${groups[0].items.length} · วันนี้ ${groups[1].items.length} · ใกล้ครบกำหนด ${groups[2].items.length} รายการ`,
  };
}

function monthCard(summary: Parameters<typeof monthlyProfitSummary>[0] & { monthKey: string }, title: string, footerLabel: string): LineCardData {
  const profit = monthlyProfitSummary(summary);
  return {
    category: 'report', title, subtitle: monthName(summary.monthKey),
    metric: { label: 'กำไรสุทธิ', value: baht(profit.netProfit), note: 'รายรับ − รายจ่าย' },
    blocks: [{ kind: 'rows', rows: [
      { label: 'รายรับ', value: baht(profit.received), tone: 'positive', strong: true },
      { label: 'รายจ่ายรวม', value: baht(profit.totalExpense), tone: 'negative', strong: true, caption: 'ประจำ + ทั่วไป' },
    ] }],
    note: launched('split') ? 'กำไรของเดือนนี้ ก่อนแบ่งออมเข้าเป้าหมาย' : 'รายรับที่ได้จริง หักรายจ่ายของเดือนนี้',
    footer: launched('report') ? { label: footerLabel, path: '/report' } : { label: 'ดูภาพรวมในแอป', path: '/dashboard' },
    alt: `${title} (${monthName(summary.monthKey)}) · กำไรสุทธิ ${baht(profit.netProfit)}`,
  };
}

/** The whole thread for one account, as of `now`. */
export function buildLineInbox(user: UserRow, now = new Date()): LineInbox {
  const snapshot = buildDataSnapshot(user);
  const today = todayInBangkok(now);
  const notices: LineInbox['notices'] = [];
  const monthStart = `${today.slice(0, 7)}-01`;
  notices.push({ id: `month-${snapshot.lastMonth.monthKey}`, at: Math.min(now.getTime(), bangkokAt(monthStart, 9)), card: monthCard(snapshot.lastMonth, 'สรุปการเงินประจำเดือน', 'ดูรายงานในแอป') });
  const reminder = reminderCard(findJobsNeedingAttention((user.jobs || []) as JobRow[], now), today);
  if (reminder) notices.push({ id: `reminder-${today}`, at: Math.min(now.getTime(), bangkokAt(today, 8)), card: reminder });

  const unpaid = [...snapshot.unpaid].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const overdue = (text: string) => text.includes('เลยกำหนด');
  const quick: LineInbox['quick'] = {
    unpaid: {
      category: 'reminder', title: 'รอรับเงิน', subtitle: 'ติดตามยอดที่ยังไม่ได้รับจากลูกค้า',
      metric: { label: 'ยอดรอรับทั้งหมด', value: baht(snapshot.totalPendingAllTime), note: `${unpaid.length} งาน` },
      blocks: [{ kind: 'items', items: unpaid.slice(0, MAX_LIST_ITEMS).map((job, index) => ({
        id: `unpaid-${index}`, name: job.name, client: job.client, amount: baht(job.pending),
        meta: job.dueDate ? `กำหนดรับ ${job.dueText}` : 'ยังไม่ระบุวันรับเงิน', metaTone: overdue(job.dueText) ? 'negative' : 'muted',
      })) }],
      ...(unpaid.length > MAX_LIST_ITEMS ? { note: `แสดง ${MAX_LIST_ITEMS} จาก ${unpaid.length} งาน · อีก ${unpaid.length - MAX_LIST_ITEMS} งานดูได้ในแอป` } : !unpaid.length ? { note: 'ไม่มีงานรอรับเงินในขณะนี้' } : {}),
      footer: { label: 'ดูงานรอรับเงินทั้งหมด', path: '/receivables' },
      alt: `รอรับเงิน ${unpaid.length} งาน · รวม ${baht(snapshot.totalPendingAllTime)}`,
    },
    month: monthCard(snapshot.thisMonth, 'สรุปเดือนนี้', 'ดูรายงานฉบับเต็ม'),
    wip: {
      category: 'working', title: 'กำลังดำเนินงาน', subtitle: 'งานที่ยังอยู่ระหว่างดำเนินการ',
      metric: { label: 'งานระหว่างดำเนินการ', value: `${snapshot.wip.length} งาน` },
      blocks: [{ kind: 'items', items: snapshot.wip.slice(0, MAX_LIST_ITEMS).map((job, index) => ({ id: `wip-${index}`, name: job.name, client: job.client, amount: baht(job.value) })) }],
      ...(snapshot.wip.length > MAX_LIST_ITEMS ? { note: `แสดง ${MAX_LIST_ITEMS} จาก ${snapshot.wip.length} งาน` } : !snapshot.wip.length ? { note: 'ไม่มีงานที่กำลังทำอยู่' } : {}),
      footer: { label: 'ดูงานทั้งหมด', path: '/jobs' },
      alt: `กำลังดำเนินงาน ${snapshot.wip.length} งาน`,
    },
  };
  const settings = (user.notif_settings || {}) as { lineUserId?: string | null; dailyDigestEnabled?: boolean };
  return { notices, quick, lineLinked: Boolean(settings.lineUserId), reminderOn: Boolean(settings.lineUserId && settings.dailyDigestEnabled) };
}

/** A payment button's result in the thread: the receipt card or the message, as LINE answers. */
export function inboxReply(outcome: DueOutcome): { text?: string; card?: LineCardData; prompt?: string } {
  if (outcome.kind === 'text') {
    const prompt = /\n(รับเงินบางส่วน #[0-9A-F]{6} ยอด )\d*$/.exec(outcome.text)?.[1];
    return prompt ? { text: outcome.text.split('\n')[0], prompt } : { text: outcome.text };
  }
  const pending = outcome.job.pending || 0;
  return { card: {
    category: 'received', title: outcome.full ? 'บันทึกรับเงินแล้ว' : 'บันทึกรับเงินบางส่วนแล้ว', subtitle: 'จากปุ่มในแจ้งเตือน',
    metric: { label: outcome.job.name || 'งาน', value: baht(outcome.amount) },
    blocks: [{ kind: 'rows', rows: [
      ...(outcome.job.client ? [{ label: 'ลูกค้า', value: outcome.job.client }] : []),
      ...(outcome.installmentLabel ? [{ label: 'งวด', value: outcome.installmentLabel }] : []),
      { label: 'ยังค้างรับ', value: pending > 0 ? baht(pending) : 'ไม่มี รับครบแล้ว', tone: pending > 0 ? 'text' as const : 'positive' as const, strong: true },
    ] }],
    note: 'กดผิดหรือยอดไม่ตรง แก้ไขได้ในแอป',
    footer: { label: 'ดูงานในแอป', path: '/jobs' },
    alt: `${outcome.full ? 'บันทึกรับเงินแล้ว' : 'บันทึกรับเงินบางส่วนแล้ว'} ${baht(outcome.amount)} · ${outcome.job.name || 'งาน'}`,
  } };
}
