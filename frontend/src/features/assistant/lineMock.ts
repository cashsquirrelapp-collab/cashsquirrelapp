import { tr, T } from '../../i18n/tr';
import { dateLocale } from '../../utils';

// LINE inside เลขากระรอก (owner, 2026-10-23: "การแจ้งเตือน ... ให้มันเหมือน LINE ... เทมเพลตของมัน ... UI ของมัน").
// The automatic notifications the app really sends to LINE, drawn with the same template as
// backend/src/services/lineCards.ts (lineCard): the same gradient bands, category chips, official mascot
// poses, rows, buttons and wording. Screen only: everything here is labelled sample data, nothing is sent
// to LINE and no stored data changes.

/** The header bands of lineCards.ts (LINE_CARD_THEMES), colour for colour. */
export const LINE_THEMES = {
  brand: { start: '#8F3416', center: '#B8481A', end: '#E2672F' },
  positive: { start: '#0D4A2E', center: '#17663F', end: '#2F8A5B' },
  alert: { start: '#6E1A12', center: '#9A2A18', end: '#C4482B' },
  expense: { start: '#7A1426', center: '#B3261E', end: '#E0533F' },
  neutral: { start: '#1C1917', center: '#36302C', end: '#5A524C' },
} as const;
export type LineTheme = keyof typeof LINE_THEMES;

/** One category per card: chip label, band and the official mascot pose (/line/mascot-v6-*.png). */
export type LineCategory = 'reminder' | 'urgent' | 'received' | 'report' | 'working';
export const LINE_CATEGORIES: Record<LineCategory, { label: string; theme: LineTheme; icon: string; pose: string }> = {
  reminder: { label: T("แจ้งเตือน"), theme: 'brand', icon: 'reminder', pose: 'reminder' },
  urgent: { label: T("แจ้งเตือน"), theme: 'alert', icon: 'urgent', pose: 'urgent' },
  received: { label: T("รับเงิน"), theme: 'positive', icon: 'received', pose: 'received' },
  report: { label: T("รายงาน"), theme: 'brand', icon: 'report', pose: 'report' },
  working: { label: T("งาน"), theme: 'brand', icon: 'working', pose: 'working' },
};

export type LineTone = 'text' | 'muted' | 'positive' | 'negative' | 'warning';
export type LineRow = { label: string; value: string; tone?: LineTone; caption?: string; strong?: boolean };
/** A job in a reminder or list card; `due` buttons are the real ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ. */
export type LineItem = { id: string; name: string; client: string; amount: string; meta?: string; metaTone?: LineTone; due?: boolean };
export type LineBlock =
  | { kind: 'section'; title: string; tone: LineTone; items: LineItem[] }
  | { kind: 'items'; items: LineItem[] }
  | { kind: 'rows'; rows: LineRow[] }
  | { kind: 'divider' };
export type LineCardData = {
  category: LineCategory;
  title: string;
  subtitle?: string;
  metric?: { label: string; value: string; note?: string };
  blocks: LineBlock[];
  note?: string;
  footer?: { label: string; path: string };
  /** The line LINE shows in its push banner and chat list (the card's altText). */
  alt: string;
};
export type LineDueAction = 'paid' | 'later' | 'partial';

const DAY = 86_400_000;
const baht = (amount: number) => `฿ ${amount.toLocaleString('th-TH')}`;
/** "23 ต.ค. 69", as the real cards write dates. */
export const lineShortDate = (at: number) => new Intl.DateTimeFormat(`${dateLocale()}-u-ca-buddhist`, { day: 'numeric', month: 'short', year: '2-digit' }).format(at);
const lineMonth = (at: number) => new Intl.DateTimeFormat(`${dateLocale()}-u-ca-buddhist`, { month: 'long', year: 'numeric' }).format(at);
const at = (dayStart: number, hours: number, minutes = 0) => dayStart + (hours * 60 + minutes) * 60_000;
const startOfDay = (now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The 08:00 reminder (lineReminders.ts buildDigestFlexMessage) with the jobs it really groups. */
export function reminderCard(now: number): LineCardData {
  const today = startOfDay(now);
  const overdue: LineItem = { id: 'due-a', name: tr("ถ่ายภาพสินค้า ร้านตัวอย่าง"), client: tr("ลูกค้าตัวอย่าง A"), amount: baht(4500), meta: tr("กำหนด {0} · เลย {1} วัน", lineShortDate(today - 3 * DAY), 3), metaTone: 'negative', due: true };
  const dueToday: LineItem = { id: 'due-b', name: tr("ออกแบบโลโก้ ร้านตัวอย่าง"), client: tr("ลูกค้าตัวอย่าง B"), amount: baht(9700), meta: tr("กำหนด {0} · วันนี้", lineShortDate(today)), metaTone: 'warning', due: true };
  const soon: LineItem = { id: 'due-c', name: tr("ตัดต่อวิดีโอรีวิว"), client: tr("ลูกค้าตัวอย่าง C"), amount: baht(2500), meta: tr("กำหนด {0} · อีก {1} วัน", lineShortDate(today + 2 * DAY), 2), metaTone: 'muted' };
  return {
    category: 'urgent', title: tr("เตือนรับเงิน"), subtitle: tr("เครดิตเทอม · {0}", lineShortDate(today)),
    metric: { label: tr("ยอดรอรับที่ต้องติดตาม"), value: baht(16700), note: tr("{0} รายการ · ด่วนที่สุดอยู่บน", 3) },
    blocks: [
      { kind: 'section', title: tr("เลยกำหนด · {0} รายการ", 1), tone: 'negative', items: [overdue] },
      { kind: 'divider' },
      { kind: 'section', title: tr("ครบกำหนดวันนี้ · {0} รายการ", 1), tone: 'warning', items: [dueToday] },
      { kind: 'divider' },
      { kind: 'section', title: tr("ใกล้ครบกำหนด · {0} รายการ", 1), tone: 'muted', items: [soon] },
    ],
    note: tr("รับเงินแล้ว? กดปุ่มใต้รายการ บันทึกให้ทันที"),
    footer: { label: tr("ดูรายการรอรับเงิน"), path: '/receivables' },
    alt: tr("เตือนรับเงิน: เลยกำหนด {0} · วันนี้ {1} · ใกล้ครบกำหนด {2} รายการ", 1, 1, 1),
  };
}

/** After ได้รับแล้ว (lineDuePayments.ts receipt). */
export function receiptCard(item: Pick<LineItem, 'name' | 'client' | 'amount'>): LineCardData {
  return {
    category: 'received', title: tr("บันทึกรับเงินแล้ว"), subtitle: tr("จากปุ่มในแจ้งเตือน"),
    metric: { label: item.name, value: item.amount },
    blocks: [{ kind: 'rows', rows: [
      { label: tr("ลูกค้า"), value: item.client },
      { label: tr("ยังค้างรับ"), value: tr("ไม่มี รับครบแล้ว"), tone: 'positive', strong: true },
    ] }],
    note: tr("กดผิดหรือยอดไม่ตรง แก้ไขได้ในแอป"),
    footer: { label: tr("ดูงานในแอป"), path: '/jobs' },
    alt: tr("บันทึกรับเงินแล้ว {0} · {1}", item.amount, item.name),
  };
}

/** The 1st of the month (send-monthly-report.ts, lineCashSummary.ts). */
export function monthlyCard(monthStart: number, title = tr("สรุปการเงินประจำเดือน"), footer = { label: tr("ดูรายงานในแอป"), path: '/report' }): LineCardData {
  return {
    category: 'report', title, subtitle: lineMonth(monthStart),
    metric: { label: tr("กำไรสุทธิ"), value: baht(18450), note: tr("รายรับ − รายจ่าย") },
    blocks: [{ kind: 'rows', rows: [
      { label: tr("รายรับ"), value: baht(32500), tone: 'positive', strong: true },
      { label: tr("รายจ่ายรวม"), value: baht(14050), tone: 'negative', strong: true, caption: tr("ประจำ + ทั่วไป") },
    ] }],
    note: tr("กำไรของเดือนนี้ ก่อนแบ่งออมเข้าเป้าหมาย"),
    footer,
    alt: tr("{0} ({1}) · กำไรสุทธิ {2}", title, lineMonth(monthStart), baht(18450)),
  };
}

/** "รอรับเงิน" (lineAssistant.ts buildUnpaidJobsMessage). */
function unpaidCard(now: number): LineCardData {
  const today = startOfDay(now);
  return {
    category: 'reminder', title: tr("รอรับเงิน"), subtitle: tr("ติดตามยอดที่ยังไม่ได้รับจากลูกค้า"),
    metric: { label: tr("ยอดรอรับทั้งหมด"), value: baht(16700), note: tr("{0} งาน", 3) },
    blocks: [{ kind: 'items', items: [
      { id: 'u-a', name: tr("ถ่ายภาพสินค้า ร้านตัวอย่าง"), client: tr("ลูกค้าตัวอย่าง A"), amount: baht(4500), meta: tr("กำหนดรับ {0}", tr("เลยกำหนด {0} วัน", 3)), metaTone: 'negative' },
      { id: 'u-b', name: tr("ออกแบบโลโก้ ร้านตัวอย่าง"), client: tr("ลูกค้าตัวอย่าง B"), amount: baht(9700), meta: tr("กำหนดรับ {0}", lineShortDate(today)), metaTone: 'muted' },
      { id: 'u-c', name: tr("ตัดต่อวิดีโอรีวิว"), client: tr("ลูกค้าตัวอย่าง C"), amount: baht(2500), meta: tr("กำหนดรับ {0}", lineShortDate(today + 2 * DAY)), metaTone: 'muted' },
    ] }],
    footer: { label: tr("ดูงานรอรับเงินทั้งหมด"), path: '/receivables' },
    alt: tr("รอรับเงิน {0} งาน · รวม {1}", 3, baht(16700)),
  };
}

/** "กำลังดำเนินงาน" (lineAssistant.ts buildWipJobsMessage). */
function wipCard(): LineCardData {
  return {
    category: 'working', title: tr("กำลังดำเนินงาน"), subtitle: tr("งานที่ยังอยู่ระหว่างดำเนินการ"),
    metric: { label: tr("งานระหว่างดำเนินการ"), value: tr("{0} งาน", 2) },
    blocks: [{ kind: 'items', items: [
      { id: 'w-a', name: tr("ถ่ายภาพแคมเปญ"), client: tr("บริษัท ตัวอย่าง จำกัด"), amount: baht(8000) },
      { id: 'w-b', name: tr("ออกแบบแพ็กเกจ"), client: tr("ร้านตัวอย่าง"), amount: baht(6500) },
    ] }],
    footer: { label: tr("ดูงานทั้งหมด"), path: '/jobs' },
    alt: tr("กำลังดำเนินงาน {0} งาน", 2),
  };
}

/** What LINE answers when a quick reply message is sent (lineAssistant.ts QUICK_ACTIONS). */
export function lineReplyFor(text: string, now: number): LineCardData | null {
  const said = text.trim();
  const is = (...keys: string[]) => keys.some(key => said === key || said === tr(key));
  if (is(T("รอรับเงิน"), 'งานค้างจ่าย')) return unpaidCard(now);
  if (is(T("สรุปเดือนนี้"))) { const d = new Date(now); return monthlyCard(new Date(d.getFullYear(), d.getMonth(), 1).getTime(), tr("สรุปเดือนนี้"), { label: tr("ดูรายงานฉบับเต็ม"), path: '/report' }); }
  if (is(T("กำลังดำเนินการ"), T("กำลังดำเนินงาน"), 'งานสต็อก')) return wipCard();
  return null;
}

/** The real replies to the reminder buttons (lineDuePayments.ts). */
export const dueDisplayText = (action: LineDueAction, item: LineItem) =>
  action === 'paid' ? tr("ได้รับเงินแล้ว · {0}", item.name) : tr("ยังไม่ได้รับเงิน · {0}", item.name);
export const laterReply = (item: LineItem) => tr("รับทราบครับ ยังไม่บันทึกรับเงิน \"{0}\" ถ้ายังไม่ได้รับ พรุ่งนี้ 08:00 กระรอกจะเตือนอีกครั้ง", item.name);
/** "ได้ไม่ครบ" opens the keyboard with this filled in, as LINE does (lineDuePayments.ts partialPrompt). */
export const partialPrompt = (item: LineItem) => tr("รับเงินบางส่วน #{0} ยอด ", item.id.toUpperCase());

/** Quick replies under the composer in the LINE thread, the same messages LINE's menu sends. */
export const LINE_QUICK_REPLIES = [T("รอรับเงิน"), T("สรุปเดือนนี้"), T("กำลังดำเนินการ")];

/** The automatic notifications thread: what arrived over the last weeks, oldest first. */
export function sampleLineNotices(now: number): { id: string; from: 'me' | 'bot'; text: string; at: number; line?: LineCardData }[] {
  const today = startOfDay(now);
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const paidItem = { name: tr("ออกแบบแพ็กเกจ"), client: tr("ลูกค้าตัวอย่าง D"), amount: baht(6000) };
  return [
    { id: 'n-monthly', from: 'bot', text: '', at: at(monthStart, 9), line: monthlyCard(lastMonth) },
    { id: 'n-paid-q', from: 'me', text: tr("ได้รับเงินแล้ว · {0}", paidItem.name), at: at(today - DAY, 8, 4) },
    { id: 'n-paid', from: 'bot', text: '', at: at(today - DAY, 8, 4), line: receiptCard(paidItem) },
    { id: 'n-reminder', from: 'bot', text: '', at: at(today, 8), line: reminderCard(now) },
  ];
}

/** A notification that arrives while the chat is open (the "แจ้งเตือนเข้า" preview): the overdue follow-up. */
export function arrivingNotice(now: number): LineCardData {
  const today = startOfDay(now);
  return {
    category: 'urgent', title: tr("เตือนรับเงิน"), subtitle: tr("เครดิตเทอม · {0}", lineShortDate(today)),
    metric: { label: tr("ยอดรอรับที่ต้องติดตาม"), value: baht(4500), note: tr("{0} รายการ · ด่วนที่สุดอยู่บน", 1) },
    blocks: [{ kind: 'section', title: tr("เลยกำหนด · {0} รายการ", 1), tone: 'negative', items: [
      { id: 'due-a', name: tr("ถ่ายภาพสินค้า ร้านตัวอย่าง"), client: tr("ลูกค้าตัวอย่าง A"), amount: baht(4500), meta: tr("กำหนด {0} · เลย {1} วัน", lineShortDate(today - 3 * DAY), 3), metaTone: 'negative', due: true },
    ] }],
    note: tr("รับเงินแล้ว? กดปุ่มใต้รายการ บันทึกให้ทันที"),
    footer: { label: tr("ดูรายการรอรับเงิน"), path: '/receivables' },
    alt: tr("เตือนรับเงิน: เลยกำหนด {0} · วันนี้ {1} · ใกล้ครบกำหนด {2} รายการ", 1, 0, 0),
  };
}
