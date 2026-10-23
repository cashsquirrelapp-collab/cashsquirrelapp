import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink, lineCard, lineJobItem } from './lineCards.js';
import { dueRefFromDigestId, encodeDueAction, partialPrompt } from './lineDuePayments.js';

/** A rounded tap target inside the card (a Flex box with a postback action). */
function duePill(label: string, action: Record<string, unknown>, primary = false) {
  return {
    type: 'box', layout: 'vertical', flex: 1, cornerRadius: '6px', paddingTop: '8px', paddingBottom: '8px',
    backgroundColor: primary ? C.accent : C.white, borderWidth: '1px', borderColor: primary ? C.accent : '#D6D3D1',
    action: { type: 'postback', label, ...action },
    contents: [{ type: 'text', text: label, size: 'xs', weight: 'bold', color: primary ? C.white : C.text, align: 'center' }],
  };
}

/** ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ under a job that is due today or overdue (owner, 2026-10-22). */
function dueButtons(job: JobWithDiff) {
  const ref = dueRefFromDigestId(job.id);
  const paid = ref && encodeDueAction('paid', ref);
  const later = ref && encodeDueAction('later', ref);
  if (!ref || !paid || !later) return null;
  const partial = ref.installmentId ? null : encodeDueAction('partial', ref);
  const name = job.name.slice(0, 120);
  return {
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'md',
    contents: [
      duePill('ได้รับแล้ว', { data: paid, displayText: `ได้รับเงินแล้ว · ${name}` }, true),
      duePill('ยังไม่ได้', { data: later, displayText: `ยังไม่ได้รับเงิน · ${name}` }),
      // Opens the keyboard with the code filled in; the amount typed after it is recorded.
      ...(partial ? [duePill('ได้ไม่ครบ', { data: partial, inputOption: 'openKeyboard', fillInText: partialPrompt(ref) })] : []),
    ],
  };
}

export interface JobRow {
  id: string;
  name: string;
  client: string;
  status: string;
  pending: number;
  paymentStatus?: string;
  dueDate?: string | null;
  payDate: string | null;
  followUpCount?: number;
  lastFollowUpDate?: string;
  installments?: Array<{
    id: string;
    label: string;
    amount: number;
    dueDate: string | null;
    paidAt: string | null;
    status: 'pending' | 'paid';
  }>;
}

// Bangkok is UTC+7 with no DST; a fixed offset is enough to get "today" right locally.
export function todayInBangkok(now = new Date()): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkok.toISOString().split('T')[0];
}

// How many days until (positive) or since (negative) the job's due date. 0 = due today.
function diffDaysFromToday(target: string, today: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return Number.NaN;
  const parsed = new Date(target + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== target) return Number.NaN;
  return (parsed.getTime() - Date.parse(today + 'T00:00:00Z')) / 86400000;
}

export interface JobWithDiff extends JobRow {
  diffDays: number;
}

// Overdue jobs, jobs due today, and jobs due within the next 2 days -- catching it a day or two
// early is far more useful than only finding out once it's already overdue.
//
// Trust the recorded `pending` field as-is, same as Dashboard/Summary/Timeline -- don't also gate
// on status behavior or paymentStatus, or a job whose paid flag and pending amount have drifted
// out of sync silently skips the digest instead of surfacing as money still owed.
export function findJobsNeedingAttention(jobs: JobRow[], now = new Date()): JobWithDiff[] {
  const today = todayInBangkok(now);
  return jobs
    .flatMap((j) => {
      if (j.installments?.length) {
        return j.installments.flatMap((row) => {
          if (row.status === 'paid' || row.amount <= 0 || !row.dueDate) return [];
          const diffDays = diffDaysFromToday(row.dueDate, today);
          if (!Number.isFinite(diffDays) || diffDays > 2) return [];
          return [{
            ...j,
            id: `${j.id}:${row.id}`,
            name: `${j.name} • ${row.label}`,
            pending: row.amount,
            dueDate: row.dueDate,
            payDate: row.dueDate,
            diffDays,
          }];
        });
      }
      const targetDateStr = j.dueDate || j.payDate;
      if (j.pending <= 0 || !targetDateStr) return [];

      const diffDays = diffDaysFromToday(targetDateStr, today);
      if (!Number.isFinite(diffDays) || diffDays > 2) return [];
      return [{ ...j, diffDays }];
    })
    .filter((j): j is JobWithDiff => !!j);
}

const MAX_REMINDER_ITEMS = 3;
function shortDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok',
  });
}
function dueText(days: number): string {
  return days < 0 ? `เลย ${Math.abs(days)} วัน` : days === 0 ? 'วันนี้' : `อีก ${days} วัน`;
}

/** One compact digest, with a visible example from every urgency group and complete totals. */
export function buildDigestFlexMessage(jobs: JobWithDiff[], options: { test?: boolean; now?: Date; /** Payment buttons (default on); off is the fallback if LINE refuses them. */ buttons?: boolean } = {}): LineMessage {
  const sorted = [...jobs].sort((a, b) => a.diffDays - b.diffDays || (a.dueDate || a.payDate || '').localeCompare(b.dueDate || b.payDate || ''));
  const groups = [
    { title: 'เลยกำหนด', color: C.negative, items: sorted.filter(j => j.diffDays < 0) },
    { title: 'ครบกำหนดวันนี้', color: C.warning, items: sorted.filter(j => j.diffDays === 0) },
    { title: 'ใกล้ครบกำหนด', color: C.muted, items: sorted.filter(j => j.diffDays > 0) },
  ];
  // Reserve one slot per group so a large overdue backlog cannot hide today's or upcoming money.
  const visible = new Set(groups.flatMap(group => group.items.slice(0, 1)));
  for (const job of sorted) {
    if (visible.size >= MAX_REMINDER_ITEMS) break;
    visible.add(job);
  }
  const total = jobs.reduce((sum, job) => sum + job.pending, 0);
  // The total goes on the coloured band of the card (lineCard metric); the groups follow below.
  const metric = {
    label: options.test ? 'ยอดตัวอย่าง · ไม่ใช่ยอดจริง' : 'ยอดรอรับที่ต้องติดตาม',
    value: `฿ ${total.toLocaleString('th-TH')}`,
    note: `${jobs.length} รายการ · ด่วนที่สุดอยู่บน`,
  };
  const body: any[] = [];
  let hasButtons = false;
  for (const group of groups) {
    if (!group.items.length) continue;
    // A plain heading with a small status mark, rows under it, a hairline between groups.
    if (body.length) body.push({ type: 'separator', color: C.border, margin: 'xl' });
    body.push({
      type: 'box', layout: 'vertical', margin: body.length ? 'lg' : 'md',
      contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [
          { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: group.color, flex: 0, contents: [] },
          { type: 'text', text: `${group.title} · ${group.items.length} รายการ`, size: 'xs', weight: 'bold', color: group.color, wrap: true, flex: 1 },
        ] },
        ...group.items.filter(job => visible.has(job)).map(job => {
          const date = job.dueDate || job.payDate;
          const row = lineJobItem({
            name: job.name, client: job.client,
            amount: `฿ ${job.pending.toLocaleString('th-TH')}`,
            meta: `${date ? `กำหนด ${shortDate(date)} · ` : ''}${dueText(job.diffDays)}`,
            metaColor: group.color,
          });
          const buttons = options.buttons !== false && job.diffDays <= 0 ? dueButtons(job) : null;
          if (buttons) hasButtons = true;
          return buttons ? { type: 'box', layout: 'vertical', margin: 'md', contents: [{ ...row, margin: 'none' }, buttons] } : { ...row, margin: 'md' };
        }),
      ],
    });
  }
  const hiddenCount = jobs.length - visible.size;
  const note = options.test ? 'ข้อมูลตัวอย่างสำหรับทดสอบเท่านั้น\nไม่มีการเพิ่มงานหรือเปลี่ยนยอดเงินจริง'
    : `${hiddenCount > 0 ? `แสดง ${visible.size} จาก ${jobs.length} รายการ · อีก ${hiddenCount} รายการดูในแอป\n` : ''}${hasButtons ? 'รับเงินแล้ว? กดปุ่มใต้รายการ บันทึกให้ทันที' : 'รับเงินแล้ว? อัปเดตสถานะในแอปได้เลย'}`;
  return lineCard({
    compact: true, character: groups[0].items.length ? 'urgent' : 'reminder', title: options.test ? 'ทดสอบแจ้งเตือน' : 'เตือนรับเงิน',
    subtitle: `เครดิตเทอม · ${shortDate(todayInBangkok(options.now))}`,
    altText: `${options.test ? '[ทดสอบ] ' : ''}เตือนรับเงิน: เลยกำหนด ${groups[0].items.length} · วันนี้ ${groups[1].items.length} · ใกล้ครบกำหนด ${groups[2].items.length} รายการ`,
    metric, body, note, footer: lineAppLink('/receivables', 'ดูรายการรอรับเงิน'),
  });
}

/** In-memory examples only. Use the same date selection and card builder as the scheduled digest. */
export function buildReminderTestMessage(now = new Date()): LineMessage {
  const today = Date.parse(todayInBangkok(now) + 'T00:00:00Z');
  const samples: JobRow[] = [
    { id: 'demo-overdue', name: 'ออกแบบแพ็กเกจ', client: 'ลูกค้าตัวอย่าง A', status: 'pending', pending: 4500, payDate: new Date(today - 3 * 86400000).toISOString().slice(0, 10) },
    { id: 'demo-today', name: 'ถ่ายภาพสินค้า', client: 'ลูกค้าตัวอย่าง B', status: 'pending', pending: 3000, payDate: new Date(today).toISOString().slice(0, 10) },
    { id: 'demo-soon', name: 'ตัดต่อวิดีโอ', client: 'ลูกค้าตัวอย่าง C', status: 'pending', pending: 2500, payDate: new Date(today + 2 * 86400000).toISOString().slice(0, 10) },
  ];
  return buildDigestFlexMessage(findJobsNeedingAttention(samples, now), { test: true, now });
}

