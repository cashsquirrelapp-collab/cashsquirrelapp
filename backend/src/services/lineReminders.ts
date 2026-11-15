import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink, lineCard, lineJobItem } from './lineCards.js';
import { dueRefFromDigestId, encodeDueAction, partialPrompt } from './lineDuePayments.js';
import type { MorningInsight } from './morningInsights.js';

/**
 * A rounded tap target inside the card (a Flex box with a postback action). Owner, 2026-10-27 (chat cards direction A,
 * "ของไลน์เอาตามคำแนะนำ"): ได้รับแล้ว is the one orange button, the others are quiet grey, corners 10px as in the app.
 */
function duePill(label: string, action: Record<string, unknown>, primary = false) {
  return {
    type: 'box', layout: 'vertical', flex: 1, cornerRadius: '10px', paddingTop: '10px', paddingBottom: '10px',
    backgroundColor: primary ? C.accent : C.subtle, borderWidth: '1px', borderColor: primary ? C.accent : C.subtle,
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

export { findDeliveriesDue, findJobsNeedingAttention, todayInBangkok, type DeliveryDue, type JobRow, type JobWithDiff } from '../../../shared/dueJobs.js';
import { findJobsNeedingAttention, todayInBangkok, type DeliveryDue, type JobRow, type JobWithDiff } from '../../../shared/dueJobs.js';

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
/** "เลขาชวนดู": each thing เลขา noticed, its lines, and a quiet link to the page that deals with it. */
function insightRows(insights: MorningInsight[]): any[] {
  return insights.map((insight, at) => {
    const link = lineAppLink(insight.link.path, insight.link.label);
    return {
      type: 'box', layout: 'vertical', spacing: 'xs', margin: at ? 'lg' : 'md',
      contents: [
        { type: 'text', text: insight.title, size: 'sm', weight: 'bold', color: insight.kind === 'cash_short' ? C.negative : C.text, wrap: true },
        ...insight.lines.map(line => ({ type: 'text', text: line, size: 'xs', color: C.muted, wrap: true })),
        ...(link ? [{ type: 'text', text: `${link.label} ›`, size: 'xs', weight: 'bold', color: C.accent, margin: 'sm', action: { type: 'uri', label: link.label.slice(0, 20), uri: link.uri } }] : []),
      ],
    };
  });
}

/** The 08:00 message on a morning with nothing due: only what เลขา noticed (morningInsights.ts). */
export function buildInsightFlexMessage(insights: MorningInsight[], options: { now?: Date } = {}): LineMessage {
  const first = insights[0];
  return lineCard({
    compact: true, character: first.kind === 'cash_short' ? 'urgent' : 'reminder', title: 'เลขาชวนดู',
    subtitle: `คิดล่วงหน้าให้ · ${shortDate(todayInBangkok(options.now))}`,
    altText: `เลขาชวนดู: ${insights.map(insight => insight.title).join(' · ')}`.slice(0, 380),
    body: insightRows(insights), note: 'คิดจากข้อมูลที่บันทึกในแอป เรื่องเดิมจะเตือนซ้ำไม่เกินสัปดาห์ละครั้ง',
    footer: lineAppLink(first.link.path, first.link.label),
  });
}

export function buildDigestFlexMessage(jobs: JobWithDiff[], options: { test?: boolean; now?: Date; /** Payment buttons (default on); off is the fallback if LINE refuses them. */ buttons?: boolean;
  /** What เลขา noticed besides the money due (morningInsights.ts), under the jobs. */ insights?: MorningInsight[] } = {}): LineMessage {
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
  if (options.insights?.length) {
    body.push({ type: 'separator', color: C.border, margin: 'xl' });
    body.push({ type: 'text', text: 'เลขาชวนดู', size: 'xs', weight: 'bold', color: C.accent, margin: 'lg' });
    body.push(...insightRows(options.insights));
  }
  const hiddenCount = jobs.length - visible.size;
  const note = options.test ? 'ข้อมูลตัวอย่างสำหรับทดสอบเท่านั้น\nไม่มีการเพิ่มงานหรือเปลี่ยนยอดเงินจริง'
    : `${hiddenCount > 0 ? `แสดง ${visible.size} จาก ${jobs.length} รายการ · อีก ${hiddenCount} รายการดูในแอป\n` : ''}${hasButtons ? 'รับเงินแล้ว? กดปุ่มใต้รายการ บันทึกให้ทันที' : 'รับเงินแล้ว? อัปเดตสถานะในแอปได้เลย'}`;
  return lineCard({
    compact: true, character: groups[0].items.length ? 'urgent' : 'reminder', title: options.test ? 'ทดสอบแจ้งเตือน' : 'เตือนรับเงิน',
    subtitle: `เครดิตเทอม · ${shortDate(todayInBangkok(options.now))}`,
    altText: `${options.test ? '[ทดสอบ] ' : ''}เตือนรับเงิน: เลยกำหนด ${groups[0].items.length} · วันนี้ ${groups[1].items.length} · ใกล้ครบกำหนด ${groups[2].items.length} รายการ`,
    metric, body, note, footer: lineAppLink('/receivables', 'ดูรายการรอรับเงิน'),
    // With ได้รับแล้ว under the jobs, the link to the app is a quiet button: one kind of primary action per card.
    footerStyle: hasButtons ? 'secondary' : 'primary',
  });
}

const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const DELIVERY_TIP = 'ถ้าส่งไปแล้ว เปลี่ยนสถานะงานในแอปได้เลยครับ ผมจะได้ไม่เตือนซ้ำ';

/**
 * เตือนส่งงาน (owner, 2026-11-15, with another assistant's chat as the example: "เป็นข้อความธรรมดาเหมือนแบบคุยกับเพื่อน ...
 * คุยเหมือนคุยเลขาแบบชิวๆ", then "ส่งมาเป็นทีละข้อความดิ"): plain messages from เลขา, one per job, most urgent first, before
 * the เตือนรับเงิน card in the same 08:00 push. The first calls the person by the name they gave เลขา; a late job adds one
 * short tip at the end. A push carries 5 messages at most, so `room` says how many these may use: when the jobs do not
 * fit, the last message counts the rest instead (and the tip is left out).
 */
export function buildDeliveryTexts(deliveries: DeliveryDue[], options: { name?: string | null; room?: number } = {}): LineMessage[] {
  const room = Math.max(1, Math.min(5, options.room ?? 5));
  const name = options.name?.trim().slice(0, 40);
  const what = (d: DeliveryDue) => `${clip(d.name || 'งาน')}${d.client ? ` ให้${clip(d.client, 40)}` : ''}`;
  const sentence = (d: DeliveryDue, first: boolean) => {
    const call = first && name ? `คุณ${name} ` : '';
    return d.diffDays < 0 ? `${call}${what(d)} เลยกำหนดส่งมา ${-d.diffDays} วันแล้วนะครับ`
      : d.diffDays === 0 ? `${call}วันนี้ต้องส่ง ${what(d)} นะครับ`
      : d.diffDays === 1 ? `${call}พรุ่งนี้ต้องส่ง ${what(d)} นะครับ`
      : `${call}อีก ${d.diffDays} วันต้องส่ง ${what(d)} นะครับ`;
  };
  const late = deliveries.some(d => d.diffDays < 0);
  const fits = deliveries.length + (late ? 1 : 0) <= room;
  const shown = fits ? deliveries : deliveries.slice(0, room - 1);
  const texts = shown.map((d, at) => sentence(d, at === 0));
  if (!fits) texts.push(`${shown.length ? 'และยังมีงานที่ต้องส่งอีก' : `${name ? `คุณ${name} ` : ''}มีงานที่ต้องส่ง`} ${deliveries.length - shown.length} งาน ดูในแอปได้ครับ`);
  else if (late) texts.push(DELIVERY_TIP);
  return texts.map(text => ({ type: 'text', text }));
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

