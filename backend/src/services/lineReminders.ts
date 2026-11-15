import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink, lineCard, lineJobItem } from './lineCards.js';
import { dueRefFromDigestId, encodeDueAction, partialPrompt } from './lineDuePayments.js';
import { encodeDeliverAction } from './lineDeliveryActions.js';
import type { MorningInsight } from './morningInsights.js';

/**
 * A rounded tap target under เลขา's message (a Flex box with a postback or link action). Owner, 2026-10-27 (chat cards direction A,
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

/** LINE takes 5 messages in one push and counts the push once: the morning never needs more than one. */
const PUSH_LIMIT = 5;
const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const baht = (amount: number) => `฿${amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

/** เลขา's words in a plain white bubble, with taps under them when there are any. */
function wordsBubble(sentence: string, taps: Record<string, unknown> | null): LineMessage {
  if (!taps) return { type: 'text', text: sentence };
  return {
    type: 'flex', altText: sentence.slice(0, 380),
    contents: { type: 'bubble', size: 'kilo', body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md', contents: [
      { type: 'text', text: sentence, size: 'sm', color: C.text, wrap: true },
      { ...taps, margin: 'lg' },
    ] } },
  } as LineMessage;
}

/** ส่งแล้ว / ยังไม่ส่ง under a job to deliver (lineDeliveryActions.ts). */
function deliverButtons(item: DeliveryDue) {
  const done = encodeDeliverAction('done', item.id);
  const later = encodeDeliverAction('later', item.id);
  if (!done || !later) return null;
  const name = clip(item.name || 'งาน', 120);
  return { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
    duePill('ส่งแล้ว', { data: done, displayText: `ส่งงานแล้ว · ${name}` }, true),
    duePill('ยังไม่ส่ง', { data: later, displayText: `ยังไม่ได้ส่ง · ${name}` }),
  ] };
}

function deliverySentence(d: DeliveryDue, call: string): string {
  const what = `${clip(d.name || 'งาน')}${d.client ? ` ให้${clip(d.client, 40)}` : ''}`;
  return d.diffDays < 0 ? `${call}${what} เลยกำหนดส่งมา ${-d.diffDays} วันแล้วนะครับ`
    : d.diffDays === 0 ? `${call}วันนี้ต้องส่ง ${what} นะครับ`
    : d.diffDays === 1 ? `${call}พรุ่งนี้ต้องส่ง ${what} นะครับ`
    : `${call}อีก ${d.diffDays} วันต้องส่ง ${what} นะครับ`;
}

function paymentSentence(job: JobWithDiff, call: string): string {
  const what = `${clip(job.name || 'งาน')}${job.client ? ` จาก${clip(job.client, 40)}` : ''} ${baht(job.pending)}`;
  return job.diffDays < 0 ? `${call}ยังไม่ได้รับเงิน ${what} เลยกำหนดมา ${-job.diffDays} วันแล้วนะครับ`
    : job.diffDays === 0 ? `${call}วันนี้ครบกำหนดรับเงิน ${what} นะครับ`
    : job.diffDays === 1 ? `${call}พรุ่งนี้ครบกำหนดรับเงิน ${what} ครับ`
    : `${call}อีก ${job.diffDays} วันครบกำหนดรับเงิน ${what} ครับ`;
}

/** "เลขาชวนดู" (morningInsights.ts): what เลขา noticed, in its words, with a tap to the page that deals with it. */
function insightBubble(insight: MorningInsight): LineMessage {
  const sentence = [`เลขาชวนดูครับ ${insight.title}`, ...insight.lines].join('\n');
  const link = lineAppLink(insight.link.path, insight.link.label);
  return wordsBubble(sentence, link ? { type: 'box', layout: 'horizontal', contents: [
    { ...duePill(insight.link.label, {}, true), action: { type: 'uri', label: insight.link.label.slice(0, 20), uri: link.uri } },
  ] } : null);
}

const MAX_CARD_ROWS = 3;
function shortDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
}

/**
 * เงินเลยกำหนด as one card (owner, 2026-11-15, choice 2 of 3: "เลยกำหนดเป็นการ์ด"): the total late on the coloured band,
 * the jobs most late first with ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ under each, up to 3 shown and the rest counted.
 */
export function buildOverdueCard(jobs: JobWithDiff[], options: { test?: boolean; now?: Date; buttons?: boolean } = {}): LineMessage {
  const late = [...jobs].filter(job => job.diffDays < 0).sort((a, b) => a.diffDays - b.diffDays || (a.dueDate || a.payDate || '').localeCompare(b.dueDate || b.payDate || ''));
  const shown = late.slice(0, MAX_CARD_ROWS);
  const total = late.reduce((sum, job) => sum + job.pending, 0);
  let hasButtons = false;
  const rows = shown.map(job => {
    const date = job.dueDate || job.payDate;
    const row = lineJobItem({
      name: job.name, client: job.client, amount: `฿ ${job.pending.toLocaleString('th-TH')}`,
      meta: `${date ? `กำหนด ${shortDate(date)} · ` : ''}เลย ${-job.diffDays} วัน`, metaColor: C.negative,
    });
    const buttons = options.buttons !== false ? dueButtons(job) : null;
    if (buttons) hasButtons = true;
    return buttons ? { type: 'box', layout: 'vertical', margin: 'md', contents: [{ ...row, margin: 'none' }, buttons] } : { ...row, margin: 'md' };
  });
  const body: any[] = [{
    type: 'box', layout: 'vertical', margin: 'md', contents: [
      { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [
        { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: C.negative, flex: 0, contents: [] },
        { type: 'text', text: `เลยกำหนด · ${late.length} รายการ`, size: 'xs', weight: 'bold', color: C.negative, wrap: true, flex: 1 },
      ] },
      ...rows,
    ],
  }];
  const hidden = late.length - shown.length;
  const note = options.test ? 'ข้อมูลตัวอย่างสำหรับทดสอบเท่านั้น\nไม่มีการเพิ่มงานหรือเปลี่ยนยอดเงินจริง'
    : `${hidden > 0 ? `แสดง ${shown.length} จาก ${late.length} รายการ · อีก ${hidden} รายการดูในแอป\n` : ''}${hasButtons ? 'รับเงินแล้ว? กดปุ่มใต้รายการ บันทึกให้ทันที' : 'รับเงินแล้ว? อัปเดตสถานะในแอปได้เลย'}`;
  return lineCard({
    compact: true, character: 'urgent', title: options.test ? 'ทดสอบแจ้งเตือน' : 'เตือนรับเงิน',
    subtitle: `เลยกำหนดชำระ · ${shortDate(todayInBangkok(options.now))}`,
    altText: `${options.test ? '[ทดสอบ] ' : ''}เงินเลยกำหนด ${late.length} รายการ รวม ฿${total.toLocaleString('th-TH')}`,
    metric: { label: options.test ? 'ยอดตัวอย่าง · ไม่ใช่ยอดจริง' : 'ยอดเลยกำหนดที่ต้องติดตาม', value: `฿ ${total.toLocaleString('th-TH')}`, note: `${late.length} รายการ · เลยนานที่สุดอยู่บน` },
    body, note, footer: lineAppLink('/receivables', 'ดูรายการรอรับเงิน'),
    footerStyle: hasButtons ? 'secondary' : 'primary',
  });
}

export interface MorningMessages { messages: LineMessage[]; /** The things เลขา noticed that made it into the push (the rest wait). */ insightsShown: MorningInsight[] }

/**
 * The 08:00 push (owner, 2026-11-15, with another assistant's chat as the example: plain messages "เหมือนคุยเลขาแบบชิวๆ",
 * "ส่งมาเป็นทีละข้อความดิ", buttons to confirm, "ไม่ต้องส่งมาเป็นการ์ด มันดูรกไป", then "เลยกำหนดเป็นการ์ด"): work to deliver
 * first, one message each from เลขา (ส่งแล้ว / ยังไม่ส่ง); then the money already late as one card (buildOverdueCard); then
 * money due today (ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ) and in the next 2 days (no buttons), one message each; then
 * เลขาชวนดู when there is room. The first message calls the person by the name they gave เลขา. One push holds 5 (LINE
 * counts it once): past that the last message counts the jobs that did not fit. `buttons: false` is the fallback if LINE
 * refuses the buttons.
 */
export function buildMorningMessages(input: {
  deliveries?: DeliveryDue[]; payments?: JobWithDiff[]; insights?: MorningInsight[]; name?: string | null; buttons?: boolean; intro?: string; test?: boolean; now?: Date;
}): MorningMessages {
  const deliveries = input.deliveries ?? [];
  const sorted = [...(input.payments ?? [])].sort((a, b) => a.diffDays - b.diffDays || (a.dueDate || a.payDate || '').localeCompare(b.dueDate || b.payDate || ''));
  const late = sorted.filter(job => job.diffDays < 0);
  const payments = sorted.filter(job => job.diffDays >= 0);
  const buttons = input.buttons !== false;
  const name = input.name?.trim().slice(0, 40);
  const room = PUSH_LIMIT - (input.intro ? 1 : 0) - (late.length ? 1 : 0);
  const total = deliveries.length + payments.length;
  let showD = deliveries.length;
  let showP = payments.length;
  if (total > room) {
    const slots = Math.max(0, room - 1);
    // Work to deliver comes first, so it gets the larger half; whatever one side leaves, the other uses.
    showD = Math.min(deliveries.length, Math.max(Math.ceil(slots / 2), slots - payments.length));
    showP = Math.min(payments.length, slots - showD);
    showD = Math.min(deliveries.length, slots - showP);
  }
  const messages: LineMessage[] = input.intro ? [{ type: 'text', text: input.intro }] : [];
  const first = () => messages.length === (input.intro ? 1 : 0);
  // The first of เลขา's own messages calls the person by name (the card in between has its own heading).
  let named = false;
  const call = () => { if (!name || named) return ''; named = true; return `คุณ${name} `; };
  for (const d of deliveries.slice(0, showD)) messages.push(wordsBubble(deliverySentence(d, call()), buttons ? deliverButtons(d) : null));
  if (late.length) messages.push(buildOverdueCard(late, { buttons, test: input.test, now: input.now }));
  for (const job of payments.slice(0, showP)) messages.push(wordsBubble(paymentSentence(job, call()), buttons && job.diffDays <= 0 ? dueButtons(job) : null));
  if (total > room) {
    const rest = [deliveries.length - showD ? `งานที่ต้องส่งอีก ${deliveries.length - showD} งาน` : '', payments.length - showP ? `เงินรอรับอีก ${payments.length - showP} รายการ` : ''].filter(Boolean);
    messages.push({ type: 'text', text: `${first() ? `${call()}มี` : 'และยังมี'}${rest.join(' และ')} ดูในแอปได้ครับ` });
  }
  const insightsShown = (input.insights ?? []).slice(0, Math.max(0, PUSH_LIMIT - messages.length));
  messages.push(...insightsShown.map(insightBubble));
  return { messages, insightsShown };
}

/** In-memory examples only, for ทดสอบแจ้งเตือนเข้า LINE in Settings: the same selection and words as the 08:00 push. */
export function buildReminderTestMessages(now = new Date()): LineMessage[] {
  const today = Date.parse(todayInBangkok(now) + 'T00:00:00Z');
  const samples: JobRow[] = [
    { id: 'demo-overdue', name: 'ออกแบบแพ็กเกจ', client: 'ลูกค้าตัวอย่าง A', status: 'pending', pending: 4500, payDate: new Date(today - 3 * 86400000).toISOString().slice(0, 10) },
    { id: 'demo-today', name: 'ถ่ายภาพสินค้า', client: 'ลูกค้าตัวอย่าง B', status: 'pending', pending: 3000, payDate: new Date(today).toISOString().slice(0, 10) },
    { id: 'demo-soon', name: 'ตัดต่อวิดีโอ', client: 'ลูกค้าตัวอย่าง C', status: 'pending', pending: 2500, payDate: new Date(today + 2 * 86400000).toISOString().slice(0, 10) },
  ];
  return buildMorningMessages({ payments: findJobsNeedingAttention(samples, now), test: true, now,
    intro: 'ข้อความทดสอบครับ แจ้งเตือนจริงหน้าตาแบบนี้ ข้อมูลเป็นตัวอย่าง กดปุ่มแล้วไม่บันทึกอะไร' }).messages;
}
