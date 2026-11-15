import type { LineMessage } from '../services/line.js';
import { LINE_CARD_COLORS as C, LINE_CARD_THEMES } from '../services/lineCards.js';
import { QUESTION_DATE_DATA } from '../services/lineJobQuestions.js';
import { KIND_WORDS, type EntryKind, type PreparedEntry } from './batchEntries.js';
import type { EntryTurn } from './batchTurn.js';

// A paste of many records in LINE (batchEntries.ts). The questions come one at a time with taps; then, in the order the owner
// asked for (2026-11-16: "สรุปให้เขาก่อน ... แล้วก็ค่อยให้การ์ดมา"; "อันไหนที่เป็นรายจ่ายกับรายรับอ่ะมึงแยกกันหน่อย ... ลูกค้ามา
// เลื่อนดูสุดท้ายตาลายเอง"): the summary in words, one card per kind side by side (รายรับ · รายจ่าย · งานรอรับเงิน) each with
// its own ยืนยัน, and ยืนยันทั้งหมด last. Flat, the warm CI family, every button CI orange.

const KIND_COLOR: Record<EntryKind, string> = { income: LINE_CARD_THEMES.positive.amount, expense: LINE_CARD_THEMES.expense.amount, job: LINE_CARD_THEMES.brand.center };
const ROWS_PER_CARD = 10;
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const baht = (value: number) => `฿${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function day(value: string | null, today: string): string {
  if (!value) return '';
  if (value === today) return 'วันนี้';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]) + 543;
  return `${Number(match[3])} ${THAI_MONTHS[Number(match[2]) - 1]}${year === Number(today.slice(0, 4)) + 543 ? '' : ` ${year}`}`;
}

/** One question with its taps (a calendar for a day). "ไม่บันทึกรายการนี้" and ยกเลิกทั้งหมด are always there. */
export function entryQuestionMessages(turn: EntryTurn): LineMessage[] {
  const question = turn.questions[0];
  if (!question) return [];
  const tap = (option: string) => ({ type: 'action', action: { type: 'message', label: clip(option, 20), text: option.slice(0, 300) } });
  const items = [
    ...question.options.map(tap),
    ...(question.date ? [{ type: 'action', action: { type: 'datetimepicker', label: 'เลือกวันที่', data: QUESTION_DATE_DATA, mode: 'date', initial: turn.batch.today, max: turn.batch.today } }] : []),
    tap('ยกเลิกทั้งหมด'),
  ].slice(0, 13);
  const after = turn.left - 1;
  const text = `${question.text}${question.typed ? '' : ''}${after > 0 ? `\n\n(หลังจากนี้อีก ${after} ข้อ)` : ''}`;
  return [
    ...(turn.text ? [{ type: 'text', text: turn.text } as LineMessage] : []),
    { type: 'text', text: text.slice(0, 4800), quickReply: { items } } as LineMessage,
  ];
}

/** What a row says under its name: the day, the client, and for a job what is still to come. */
function rowDetail(item: PreparedEntry, today: string): { line: string; note: string | null } {
  const entry = item.entry;
  const parts = [day(entry.date, today)];
  if (entry.kind !== 'expense') parts.push(entry.client || 'ไม่ระบุลูกค้า');
  if (entry.kind === 'expense' && entry.category) parts.push(entry.category);
  if (entry.kind === 'job') parts.push(entry.delivered ? `ส่งแล้ว ${day(entry.deliveredOn ?? entry.date, today)}` : 'ยังไม่ส่งงาน', `เครดิต ${entry.creditDays ?? 0} วัน`);
  if (entry.kind === 'income' && entry.jobId) parts.push('เงินของงานที่รอรับอยู่');
  if (entry.kind === 'income' && entry.total) parts.push(`มัดจำของงาน ${baht(entry.total)}`);
  if (entry.whtRate) parts.push(`หัก ณ ที่จ่าย ${entry.whtRate}%`);
  // A missing client is said once in the summary above, not on every row.
  return { line: parts.filter(Boolean).join(' · '), note: null };
}

function kindBubble(groupId: string, kind: EntryKind, items: PreparedEntry[], all: PreparedEntry[], part: { at: number; of: number }, today: string) {
  const color = KIND_COLOR[kind];
  const count = all.length;
  const total = all.reduce((sum, item) => sum + (item.entry.amount ?? 0), 0);
  const rows = items.flatMap((item, index) => {
    const detail = rowDetail(item, today);
    return [
      ...(index ? [{ type: 'separator', color: C.border, margin: 'md' }] : []),
      { type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', contents: [
        { type: 'box', layout: 'horizontal', spacing: 'md', contents: [
          { type: 'text', text: `${item.entry.line}. ${clip(item.entry.name, 80)}`, size: 'sm', weight: 'bold', color: C.text, wrap: true, flex: 1 },
          { type: 'text', text: baht(item.entry.amount ?? 0), size: 'sm', weight: 'bold', color, align: 'end', flex: 0, wrap: false },
        ] },
        { type: 'text', text: clip(detail.line, 160), size: 'xs', color: C.muted, wrap: true },
        ...(detail.note ? [{ type: 'text', text: detail.note, size: 'xxs', color: C.warning, wrap: true }] : []),
      ] },
    ];
  });
  const last = part.at === part.of;
  // The total and the button in the footer: side by side, LINE makes the cards one height, so every button lines up.
  return {
    type: 'bubble', size: 'mega',
    body: { type: 'box', layout: 'horizontal', paddingAll: '0px', contents: [
      { type: 'box', layout: 'vertical', width: '6px', flex: 0, backgroundColor: color, contents: [] },
      { type: 'box', layout: 'vertical', flex: 1, paddingAll: '18px', contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [
          { type: 'text', text: `${KIND_WORDS[kind]} ${count} รายการ${part.of > 1 ? ` (${part.at}/${part.of})` : ''}`, size: 'md', weight: 'bold', color, flex: 1, wrap: true },
          { type: 'box', layout: 'vertical', flex: 0, cornerRadius: '999px', backgroundColor: C.subtle, paddingStart: '8px', paddingEnd: '8px', paddingTop: '2px', paddingBottom: '2px',
            contents: [{ type: 'text', text: 'รอยืนยัน', size: 'xxs', color: C.muted, wrap: false }] },
        ] },
        ...rows,
      ] },
    ] },
    footer: { type: 'box', layout: 'vertical', paddingAll: '18px', paddingTop: '0px', spacing: 'md', contents: [
      { type: 'separator', color: C.border },
      last ? { type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: `รวม${KIND_WORDS[kind]}`, size: 'sm', color: C.muted, flex: 1 },
        { type: 'text', text: baht(total), size: 'md', weight: 'bold', color, align: 'end', flex: 0 },
      ] } : { type: 'text', text: `ต่อในการ์ดถัดไป (${part.at}/${part.of})`, size: 'xs', color: C.muted, wrap: true },
      ...(last ? [{ type: 'button', style: 'primary', height: 'sm', color: C.accent,
        action: { type: 'postback', label: `ยืนยัน${KIND_WORDS[kind]} ${count} รายการ`.slice(0, 40), data: `ai:confirmkind:${groupId}:${kind}`, displayText: `ยืนยัน${KIND_WORDS[kind]} ${count} รายการ` } }] : []),
    ] },
    styles: { body: { backgroundColor: C.white }, footer: { backgroundColor: C.white } },
  };
}

/** ยืนยันทั้งหมด last: the count, each kind's total, and ดูทีละใบ for a card to check or change on its own. */
function confirmAllBubble(groupId: string, prepared: PreparedEntry[], kinds: { kind: EntryKind; count: number; total: number }[]) {
  const ready = prepared.filter(item => item.proposalId).length;
  const button = (label: string, action: string, primary: boolean) => ({ type: 'button', style: primary ? 'primary' : 'secondary', height: 'sm', flex: 1,
    color: primary ? C.accent : C.subtle, action: { type: 'postback', label, data: `ai:${action}:${groupId}`, displayText: label } });
  return {
    type: 'flex', altText: `ยืนยันทั้งหมด ${ready} รายการ`,
    contents: {
      type: 'bubble', size: 'mega',
      body: { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm', contents: [
        { type: 'text', text: `ยืนยันทั้งหมด ${ready} รายการ`, size: 'md', weight: 'bold', color: C.text, wrap: true },
        ...kinds.map(row => ({ type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: `${KIND_WORDS[row.kind]} ${row.count} รายการ`, size: 'sm', color: C.muted, flex: 1 },
          { type: 'text', text: baht(row.total), size: 'sm', weight: 'bold', color: KIND_COLOR[row.kind], align: 'end', flex: 0 },
        ] })),
        { type: 'text', text: 'ยังไม่ได้บันทึก กดยืนยันทีละกลุ่มด้านบน หรือยืนยันทั้งหมดที่นี่ การ์ดหมดเวลาใน 30 นาที', size: 'xs', color: C.muted, wrap: true, margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', paddingTop: '0px', contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [button('ยกเลิกทั้งหมด', 'cancelall', false), button('ยืนยันทั้งหมด', 'confirmall', true)] },
        { type: 'button', style: 'link', height: 'sm', color: C.accent, action: { type: 'postback', label: 'ดูและแก้ทีละใบ', data: `ai:showall:${groupId}`, displayText: 'ดูและแก้ทีละใบ' } },
      ] },
    },
  } as LineMessage;
}

/** The summary in words, the cards by kind side by side, then ยืนยันทั้งหมด. */
export function entryReviewMessages(groupId: string, turn: EntryTurn): LineMessage[] {
  const prepared = turn.prepared ?? [];
  const today = turn.batch.today;
  const ready = prepared.filter(item => item.proposalId && item.entry.kind);
  const kinds = (['income', 'expense', 'job'] as const).map(kind => {
    const items = ready.filter(item => item.entry.kind === kind);
    return { kind, items, count: items.length, total: items.reduce((sum, item) => sum + (item.entry.amount ?? 0), 0) };
  }).filter(row => row.count > 0);
  const bubbles = kinds.flatMap(row => {
    const parts = Math.ceil(row.items.length / ROWS_PER_CARD);
    return Array.from({ length: parts }, (_, at) => kindBubble(groupId, row.kind, row.items.slice(at * ROWS_PER_CARD, (at + 1) * ROWS_PER_CARD), row.items, { at: at + 1, of: parts }, today));
  });
  const messages: LineMessage[] = [{ type: 'text', text: turn.text.slice(0, 4800) }];
  if (bubbles.length) {
    messages.push({ type: 'flex', altText: `${kinds.map(row => `${KIND_WORDS[row.kind]} ${row.count} รายการ ${baht(row.total)}`).join(' · ')}`.slice(0, 400),
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles.slice(0, 12) } } as LineMessage);
    if (ready.length >= 2) messages.push(confirmAllBubble(groupId, prepared, kinds));
  }
  return messages;
}
