import { lineAppLink, lineCard, lineValueRow, LINE_CARD_COLORS } from '../services/lineCards.js';
import type { LineMessage } from '../services/line.js';
import type { AssistantCard } from './types.js';
import { formatTHB } from './moneyChart.js';
import { featureNavigation, NAVIGATION_TOOLS } from './navigation.js';
import { OFFICIAL_LINKS, isOfficialUrl } from './accounting/officialLinks.js';

// เลขากระรอก answers in LINE (owner, 2026-10-24: "ส่วนของ LINE AI ยังไม่เชื่อม ทำให้มันเชื่อมด้วย"). LINE shows
// neither Markdown nor tables, so an answer becomes short plain lines, and the chat's cards become the app's own
// formal LINE cards. A confirmation card gets ยืนยัน / ยกเลิก buttons that come back as `ai:confirm:<id>` /
// `ai:cancel:<id>` postbacks; nothing is saved before the user presses ยืนยัน.

const LINE_MAX_MESSAGES = 5;
const LINE_TEXT_MAX = 4800;
// A Flex bubble is limited to 30 KB. Stay below it and keep a single review readable on a phone.
// https://developers.line.biz/en/reference/messaging-api/#bubble
const CONFIRM_MAX_BYTES = 24_000;
const CONFIRM_MAX_ROWS = 24;
const CONFIRM_MAX_TEXT = 2000;

const MONEY_CELL = /฿\s*-?[\d,]|-?[\d,]+(\.\d+)?\s*บาท$/;
const MAX_LIST_ITEMS = 5;

/** One table row as a LINE item, "• name · amount · the other cells" (itemLines lays it out for a phone). */
function rowItem(cells: string[]): string {
  const [name, ...rest] = cells;
  const moneyAt = rest.findIndex(cell => MONEY_CELL.test(cell));
  const money = moneyAt >= 0 ? rest.splice(moneyAt, 1)[0] : '';
  return `• ${[name, money, ...rest].filter(Boolean).join(' · ')}`;
}

// A list item laid out for a phone's LINE bubble (owner, 2026-11-06: "ฝากเรียงคำพูดในไลน์หน่อย ข้อความแต่ละอันบางทีแอบ
// อ่านยากมาก": "• ตัดคลิปคุณหมอ คลิป 2 · ฿1,000 · 7 พ.ย. 2569" wrapped in the middle of its date). The name stays on
// the item's own line; the amount and the rest go on indented lines below, as many to a line as fit; this year's
// dates drop the year. A LINE bubble holds about 30 Thai characters a line; 27 leaves room for the indent.
const ITEM_WIDTH = 27;
const ITEM_SEPARATOR = /\s+[·—–]\s+/;
const THAI_MONTH_DATE = /(\d{1,2}\s(?:ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)\.)\s?(25\d{2})/g;
/** How wide a line looks: Thai vowel and tone marks above or below a letter take no room of their own. */
const visibleLength = (text: string) => text.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length;
const itemMarker = (line: string) => /^(•|\d{1,2}[.)])\s/.exec(line)?.[0] ?? null;

function itemLines(line: string, continuation: string[], buddhistYear: number, split: boolean): string[] {
  const marker = itemMarker(line)!;
  const [name, ...details] = line.slice(marker.length).split(ITEM_SEPARATOR).map(part => part.trim()).filter(Boolean);
  const rest = [...details, ...continuation.map(text => text.trim())]
    .map(text => text.replace(THAI_MONTH_DATE, (whole, day: string, year: string) => (Number(year) === buddhistYear ? day : whole)));
  if (!rest.length || (!split && visibleLength(`${marker}${[name, ...rest].join(' · ')}`) <= ITEM_WIDTH)) {
    return [`${marker}${[name, ...rest].join(' · ')}`];
  }
  const packed: string[] = [];
  for (const part of rest) {
    const last = packed[packed.length - 1];
    if (last && visibleLength(`${last} · ${part}`) <= ITEM_WIDTH) packed[packed.length - 1] = `${last} · ${part}`;
    else packed.push(part);
  }
  return [`${marker}${name}`, ...packed.map(text => `   ${text}`)];
}

/** Lays out every list item. When one item of a list needs two lines, every item of it takes the same shape, with a
 *  blank line between them, so a list never mixes one-line and two-line items. */
function layoutItems(lines: string[], now: Date): string[] {
  const buddhistYear = new Date(now.getTime() + 7 * 3600_000).getUTCFullYear() + 543;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!itemMarker(lines[i])) { out.push(lines[i]); continue; }
    const raw: { head: string; continuation: string[] }[] = [];
    while (i < lines.length && itemMarker(lines[i])) {
      const head = lines[i];
      const continuation: string[] = [];
      while (i + 1 < lines.length && isContinuation(lines[i + 1])) { continuation.push(lines[i + 1]); i += 1; }
      raw.push({ head, continuation });
      i += 1;
    }
    i -= 1;
    // "• …และอีก 3 รายการ ดูต่อในแอป" is the count of the rest, not an item to lay out.
    const shape = (split: boolean) => raw.map(item => (item.head.startsWith('• …') ? [item.head] : itemLines(item.head, item.continuation, buddhistYear, split)));
    const natural = shape(false);
    const spaced = natural.some(item => item.length > 1);
    const items = spaced ? shape(true) : natural;
    items.forEach((item, at) => { if (spaced && at > 0) out.push(''); out.push(...item); });
  }
  return out;
}

/** "1. ลูกค้าคือใคร  2. ส่งงานแล้วหรือยัง" written on one line becomes one question per line. */
function splitInlineList(line: string): string[] {
  if (!/(^|\s)1[.)]\s/.test(line) || !/\s2[.)]\s/.test(line)) return [line];
  // Split only where the numbering continues (2, 3, 4…), so "เครดิต 15, 30) วัน" stays whole.
  const parts: string[] = [];
  let expected = 2;
  let from = 0;
  for (const match of line.matchAll(/\s+(\d{1,2})[.)]\s/g)) {
    if (Number(match[1]) !== expected) continue;
    parts.push(line.slice(from, match.index));
    from = match.index! + match[0].length - match[0].trimStart().length;
    expected += 1;
  }
  parts.push(line.slice(from));
  // "ขอรายละเอียดครับ 1. ลูกค้า": the lead-in keeps its own line.
  const lead = /^(.*?\S)\s+(1[.)]\s.*)$/.exec(parts[0]);
  if (lead && !/^1[.)]\s/.test(parts[0])) parts.splice(0, 1, lead[1], lead[2]);
  return parts.map(part => part.trim()).filter(Boolean);
}

/** A long paragraph becomes one sentence per line (Thai has no full stop: split after ครับ/ค่ะ, ! or ?). */
function sentenceLines(line: string): string[] {
  if (line.length <= 90 || /^\s*(•|\d{1,2}[.)]\s)/.test(line)) return [line];
  return line.split(/(?<=ครับ|ค่ะ|คะ|[!?])\s+(?=\S)|(?<=[a-z0-9)]\.)\s+(?=[A-Z])/u).map(part => part.trim()).filter(Boolean);
}

const isItem = (line: string) => line.startsWith('• ');
const isContinuation = (line: string) => /^ {2,}\S/.test(line);

/** At most five items in a row (the rest is in the app), with a blank line around every list. */
function shapeLists(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!isItem(lines[i])) { out.push(lines[i]); continue; }
    const items: string[][] = [];
    while (i < lines.length && (isItem(lines[i]) || (items.length && isContinuation(lines[i])))) {
      if (isItem(lines[i])) items.push([lines[i]]); else items[items.length - 1].push(lines[i]);
      i += 1;
    }
    i -= 1;
    if (out.length && out[out.length - 1] !== '') out.push('');
    const shown = items.length > MAX_LIST_ITEMS + 1 ? items.slice(0, MAX_LIST_ITEMS) : items;
    out.push(...shown.flat());
    if (shown.length < items.length) out.push(`• …และอีก ${items.length - shown.length} รายการ ดูต่อในแอป`);
    if (i + 1 < lines.length && lines[i + 1] !== '') out.push('');
  }
  return out;
}

/** Plain LINE text from the model's Markdown, shaped for a phone (owner, 2026-10-24: "ยาวเหยียด ตัวหนังสือติดกัน"). */
export function markdownToLineText(markdown: string, now = new Date()): string {
  return layoutItems(shapedLines(markdown), now).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LINE_TEXT_MAX);
}

/** The answer as plain LINE lines (tables and Markdown gone, long lines split, lists capped), before items are laid out. */
function shapedLines(markdown: string): string[] {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    if (isRow) {
      const next = lines[i + 1] ?? '';
      // The header row (followed by |---|) only names the columns; the rows say enough on their own.
      if (/^\s*\|?\s*:?-{3,}/.test(next)) { i += 1; continue; }
      if (/^\s*\|?\s*:?-{3,}/.test(line)) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim().replace(/\*\*([^*]+)\*\*/g, '$1')).filter(cell => cell && cell !== '-');
      if (cells.length) out.push(...rowItem(cells).split('\n'));
      continue;
    }
    const plain = line
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*[-*]\s+/, '• ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trimEnd();
    for (const part of splitInlineList(plain)) out.push(...sentenceLines(part));
  }
  return shapeLists(out);
}

/** The postback a confirmation card's buttons send, or null. Ids are checked again when the proposal is claimed. */
export function decodeAssistantAction(data: string): { action: 'confirm' | 'cancel'; proposalId: string } | null {
  const match = /^ai:(confirm|cancel):(p_[0-9a-f-]{36})$/.exec(data);
  return match ? { action: match[1] as 'confirm' | 'cancel', proposalId: match[2] } : null;
}
/** The text command a postback turns into (what the chat shows as the user's tap), and back. */
export const assistantCommand = (action: 'confirm' | 'cancel', proposalId: string) => `${action === 'confirm' ? 'ยืนยันรายการเลขา' : 'ยกเลิกรายการเลขา'} ${proposalId}`;
export function parseAssistantCommand(text: string): { action: 'confirm' | 'cancel'; proposalId: string } | null {
  const match = /^(ยืนยัน|ยกเลิก)รายการเลขา (p_[0-9a-f-]{36})$/.exec(text.trim());
  return match ? { action: match[1] === 'ยืนยัน' ? 'confirm' : 'cancel', proposalId: match[2] } : null;
}

type ConfirmationCard = Extract<AssistantCard, { kind: 'confirm' }>;
function confirmationPreview(card: ConfirmationCard): LineMessage {
  return lineCard({
    title: card.title.length > 160 ? `${card.title.slice(0, 159)}…` : card.title,
    subtitle: 'รายละเอียดแสดงไม่ครบ · ยังไม่บันทึก', character: 'review', compact: true,
    body: card.changes.slice(0, 4).map(row => lineValueRow(row.label.slice(0, 120), row.value, { bold: false })),
    note: 'รายการนี้ยาวเกินกว่าจะแสดงครบใน LINE จึงไม่มีปุ่มยืนยัน เปิดเลขาในแอปแล้วขอให้เตรียมรายการใหม่ เพื่อตรวจรายละเอียดครบก่อนยืนยัน',
    footer: lineAppLink('/assistant', 'เปิดเลขาในแอป'),
    altText: `ยังไม่บันทึก: ${card.title} · ต้องตรวจรายละเอียดครบในแอป`,
  });
}

function confirmationMessage(card: ConfirmationCard): LineMessage {
  if (!card.changes.length || card.changes.length > CONFIRM_MAX_ROWS || card.title.length > CONFIRM_MAX_TEXT
    || card.changes.some(row => row.label.length > CONFIRM_MAX_TEXT || row.value.length > CONFIRM_MAX_TEXT)) {
    return confirmationPreview(card);
  }
  const message = lineCard({
    title: card.title, subtitle: 'รอยืนยัน · ยังไม่บันทึก', character: 'review', compact: true,
    // The general statement-row helper truncates values at 240 characters. A confirmation must preserve
    // the exact complete proposed details, including line items, tax totals and recurring-list replacements.
    body: card.changes.map(row => ({ type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', contents: [
      { type: 'text', text: row.label || 'รายละเอียด', size: 'xs', color: LINE_CARD_COLORS.muted, wrap: true },
      { type: 'text', text: row.value || '—', size: 'sm', color: LINE_CARD_COLORS.text, wrap: true },
    ] })),
    note: 'ตรวจรายละเอียดทั้งหมดก่อนกดยืนยันภายใน 30 นาที ถ้ารายการถูกแก้จากที่อื่นก่อน ระบบจะไม่เขียนทับ',
    altText: `รอยืนยัน: ${card.title}`,
  }) as Extract<LineMessage, { type: 'flex' }>;
  message.contents = {
    ...(message.contents as object),
    footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '20px', paddingTop: '0px', contents: [
      { type: 'button', style: 'secondary', color: LINE_CARD_COLORS.subtle, height: 'sm', flex: 1,
        action: { type: 'postback', label: 'ยกเลิก', data: `ai:cancel:${card.id}`, displayText: 'ยกเลิกรายการ' } },
      { type: 'button', style: 'primary', color: LINE_CARD_COLORS.accent, height: 'sm', flex: 2,
        action: { type: 'postback', label: 'ยืนยัน', data: `ai:confirm:${card.id}`, displayText: 'ยืนยันรายการ' } },
    ] },
  };
  return new TextEncoder().encode(JSON.stringify(message.contents)).length <= CONFIRM_MAX_BYTES
    ? message : confirmationPreview(card);
}

function cardMessage(card: AssistantCard): LineMessage | null {
  if (card.kind === 'official_link') {
    // An official website from the fixed list, looked up again by id: LINE shows it as text it links by itself.
    const site = OFFICIAL_LINKS[card.id];
    if (!site || !isOfficialUrl(site.url)) return null;
    return { type: 'text', text: `${site.title} (${site.org})\n${site.description}\nทำอะไร: ${site.todo}\n${site.url}` } as LineMessage;
  }
  if (card.kind === 'message_draft') {
    // The message by itself (no heading), so a long press copies or forwards exactly what the client should read.
    const text = card.text.trim().slice(0, 4800);
    return text ? { type: 'text', text } as LineMessage : null;
  }
  if (card.kind === 'sources') {
    // The pages a web answer cited (the provider's citations, checked in gateway.webSources): LINE links them by itself.
    const pages = card.items.filter(page => /^https?:\/\//i.test(page.url)).slice(0, 5);
    if (!pages.length) return null;
    return { type: 'text', text: ['แหล่งอ้างอิง', ...pages.map((page, at) => `${at + 1}. ${page.title}\n${page.url}`)].join('\n') } as LineMessage;
  }
  if (card.kind === 'navigation') {
    // The issuing navigation tool already checked the account's feature rights. Resolve the exact path
    // again against that server-owned catalog; neither model-provided labels nor arbitrary URLs are trusted.
    const choices = NAVIGATION_TOOLS[0]?.parameters.properties.feature as { enum?: unknown[] } | undefined;
    const destination = (choices?.enum || []).filter((feature): feature is string => typeof feature === 'string')
      .map(feature => featureNavigation(feature, { isAdmin: true }))
      .find(candidate => candidate?.kind === 'navigation' && candidate.path === card.path);
    if (!destination || destination.kind !== 'navigation') return null;
    const footer = lineAppLink(destination.path, `เปิด${destination.label}`);
    if (!footer) return null;
    return lineCard({ title: destination.label, subtitle: 'เปิดหน้าในแอป', character: 'guide', compact: true,
      body: [{ type: 'text', text: `กดปุ่มเพื่อเปิด${destination.label} แอปจะตรวจสิทธิ์บัญชีที่เข้าสู่ระบบ`, size: 'sm', color: LINE_CARD_COLORS.text, wrap: true }],
      altText: `เปิด${destination.label}ในแอป`, footer });
  }
  if (card.kind === 'money_chart') {
    // LINE draws no chart: each month as a row (the latest six), the totals for the whole period on top.
    const months = card.months.slice(-6);
    return lineCard({
      title: card.title, subtitle: card.period, character: 'report', compact: true,
      metric: { label: 'คงเหลือทั้งช่วง', value: formatTHB(card.totals.net) },
      body: [
        lineValueRow('รายรับรวม', formatTHB(card.totals.income), { color: LINE_CARD_COLORS.positive }),
        lineValueRow('รายจ่ายรวม', formatTHB(card.totals.expense), { color: LINE_CARD_COLORS.negative }),
        ...months.map(month => lineValueRow(`${month.label}${month.partial ? ' (ถึงวันนี้)' : ''}`, `รับ ${formatTHB(month.income)} · จ่าย ${formatTHB(month.expense)}`, { bold: false, size: 'xs' })),
      ],
      altText: `${card.title} ${card.period} รายรับ ${formatTHB(card.totals.income)} รายจ่าย ${formatTHB(card.totals.expense)} คงเหลือ ${formatTHB(card.totals.net)}`,
      footer: lineAppLink('/dashboard', 'ดูภาพรวมในแอป'),
    });
  }
  if (card.kind === 'summary') {
    return lineCard({
      title: 'สรุปการเงิน', subtitle: card.period, character: 'report', compact: true,
      metric: { label: 'เงินคงเหลือ', value: card.balance },
      body: [lineValueRow('รายรับ', card.income, { color: LINE_CARD_COLORS.positive }), lineValueRow('รายจ่าย', card.expense, { color: LINE_CARD_COLORS.negative })],
      altText: `สรุปการเงิน ${card.period} รายรับ ${card.income} รายจ่าย ${card.expense} คงเหลือ ${card.balance}`,
      footer: lineAppLink('/dashboard', 'ดูภาพรวมในแอป'),
    });
  }
  if (card.kind === 'document') {
    const link = `${card.path}${card.path.includes('?') ? '&' : '?'}from=line`;
    return lineCard({
      title: card.docType, subtitle: card.number, character: 'document', compact: true,
      body: [lineValueRow('ลูกค้า', card.client, { bold: false }), lineValueRow('ยอดเงิน', card.amount)],
      altText: `${card.docType} ${card.number} · ${card.client} · ${card.amount}`,
      footer: lineAppLink(link, 'เปิดเอกสาร / PDF'),
    });
  }
  if (card.kind === 'confirm') {
    return confirmationMessage(card);
  }
  if (card.kind === 'questions') {
    // LINE has no checkboxes or forms: the questions as short lines (a date to type, the credit terms the app offers,
    // the details to send), and the first one with choices as quick replies; the payment question's terms otherwise.
    const lines = card.questions.map((question, index) => {
      const head = `${index + 1}. ${question.text}`;
      if (question.kind === 'date') return `${head} (พิมพ์วันที่ เช่น 15 พ.ย.)`;
      if (question.kind === 'payment') return `${head}: ชำระวันไหน (พิมพ์วันที่ เช่น 15 พ.ย.) และมีเครดิตเทอมไหม (ไม่มี / ${(question.terms ?? []).map(term => `${term} วัน`).join(' / ')})`;
      if (question.kind === 'party') {
        const known = question.prefill?.name ? ` · ที่มีแล้ว: ${question.prefill.name}` : '';
        return `${head}: ชื่อ ที่อยู่ เลขประจำตัวผู้เสียภาษี โทรศัพท์ (พิมพ์มาได้เลย ไม่มีก็เว้นได้)${known}`;
      }
      return `${head}${question.options.length ? ` (${question.options.join(' / ')})` : ''}`;
    });
    const first = card.questions.find(question => (!question.kind || question.kind === 'choice') && question.options.length);
    const payment = card.questions.find(question => question.kind === 'payment');
    const prefix = (question: { text: string }) => (card.questions.length > 1 ? `${question.text.replace(/[?？]\s*$/, '').trim()}: ` : '');
    const replies = first ? first.options.map(option => ({ label: option, text: `${prefix(first)}${option}` }))
      : payment ? [{ label: 'ไม่มีเครดิตเทอม', text: `${prefix(payment)}ไม่มีเครดิตเทอม` },
        ...(payment.terms ?? []).map(term => ({ label: `เครดิตเทอม ${term} วัน`, text: `${prefix(payment)}เครดิตเทอม ${term} วัน` }))] : [];
    return { type: 'text', text: lines.join('\n'), ...(replies.length ? { quickReply: { items: replies.slice(0, 13).map(reply => ({
      type: 'action' as const, action: { type: 'message' as const, label: reply.label.slice(0, 20), text: reply.text },
    })) } } : {}) } as LineMessage;
  }
  return null;
}

const CAROUSEL_MAX_BUBBLES = 12;
const CAROUSEL_MAX_BYTES = 48_000; // LINE takes a carousel of up to 50 KB.
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * The cards as LINE messages: one card alone, several in swipeable carousels (up to 12 bubbles and 50 KB each), so
 * none is lost to LINE's five-message limit (owner, 2026-10-24: one card per job for a request about many jobs).
 * Every bubble keeps its own buttons. Returns how many did not fit.
 */
function cardMessages(cards: AssistantCard[], room: number): { messages: LineMessage[]; left: number } {
  const all = cards.map(cardMessage).filter((message): message is LineMessage => Boolean(message));
  if (all.length <= 1) return { messages: all.slice(0, room), left: Math.max(0, all.length - room) };
  const messages: LineMessage[] = [];
  let group: Extract<LineMessage, { type: 'flex' }>[] = [];
  let used = 0;
  const close = () => {
    if (!group.length) return;
    messages.push(group.length === 1 ? group[0] : {
      type: 'flex', altText: `${group.length} รายการ · ${group.map(message => message.altText).join(' · ')}`.slice(0, 400),
      contents: { type: 'carousel', contents: group.map(message => message.contents) },
    } as LineMessage);
    group = []; used = 0;
  };
  let placed = 0;
  for (const message of all) {
    if (message.type !== 'flex') { close(); if (messages.length >= room) break; messages.push(message); placed += 1; continue; }
    const size = jsonBytes(message.contents);
    if (group.length >= CAROUSEL_MAX_BUBBLES || (group.length && used + size > CAROUSEL_MAX_BYTES)) close();
    if (messages.length >= room) break;
    group.push(message); used += size; placed += 1;
  }
  close();
  return { messages: messages.slice(0, room), left: all.length - placed };
}

/** One LINE reply: the answer in at most two text bubbles, then the cards (carousels when there are several). */
// One LINE reply the way people text (owner, 2026-11-06: "ถ้าเป็นคำถามธรรมดา ... ส่งทีละประโยค ... เพื่อความเป็นธรรมชาติ
// ... ถ้าเป็นข้อมูลอ่ะส่งเป็นการ์ด ... ไม่ส่งเป็นข้อมูลแบบเยอะๆพูดๆไป"): everyday talk goes one sentence to a bubble;
// a list of records (items with an amount or details) becomes one CI card, between the sentence before it and the
// line after it. LINE takes at most five messages in one reply.

type ListItem = { name: string; amount?: string; meta?: string };
type Segment = { kind: 'text'; lines: string[] } | { kind: 'list'; items: ListItem[]; more?: string; raw: string[] };
const MONEY_TOKEN = /^(?:[+\-−]?฿\s*-?[\d,]+(?:\.\d+)?|[+\-−]?[\d,]+(?:\.\d+)?\s*บาท)$/;

function parseListItem(head: string, continuation: string[], buddhistYear: number): ListItem {
  const marker = itemMarker(head)!;
  const [name, ...rest] = [head.slice(marker.length), ...continuation.map(text => text.trim())].join(' · ')
    .split(ITEM_SEPARATOR).map(part => part.trim()).filter(Boolean);
  const details = rest.map(text => text.replace(THAI_MONTH_DATE, (whole, day: string, year: string) => (Number(year) === buddhistYear ? day : whole)));
  const moneyAt = details.findIndex(part => MONEY_TOKEN.test(part));
  const amount = moneyAt >= 0 ? details.splice(moneyAt, 1)[0] : undefined;
  return { name: name || '—', ...(amount ? { amount } : {}), ...(details.length ? { meta: details.join(' · ') } : {}) };
}

/** The answer's lines as text runs and lists. */
function segmentsOf(lines: string[], buddhistYear: number): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!itemMarker(lines[i])) {
      const last = out[out.length - 1];
      if (last?.kind === 'text') last.lines.push(lines[i]); else out.push({ kind: 'text', lines: [lines[i]] });
      continue;
    }
    const items: ListItem[] = [];
    const raw: string[] = [];
    let more: string | undefined;
    while (i < lines.length && itemMarker(lines[i])) {
      const head = lines[i];
      raw.push(head);
      const continuation: string[] = [];
      while (i + 1 < lines.length && isContinuation(lines[i + 1])) { continuation.push(lines[i + 1]); raw.push(lines[i + 1]); i += 1; }
      if (head.startsWith('• …')) more = head.slice(3).trim();
      else items.push(parseListItem(head, continuation, buddhistYear));
      i += 1;
    }
    i -= 1;
    out.push({ kind: 'list', items, raw, ...(more ? { more } : {}) });
  }
  return out;
}

/** A list of records: two or more items, most of them with an amount or details (steps and questions are not). */
const isRecordList = (segment: Segment): segment is Extract<Segment, { kind: 'list' }> =>
  segment.kind === 'list' && segment.items.length >= 2 && segment.items.filter(item => item.amount || item.meta).length * 2 >= segment.items.length;

const LIST_KINDS: { test: RegExp; title: string; character: Parameters<typeof lineCard>[0]['character']; total: string; path: string; link: string }[] = [
  { test: /ค้าง|ยังไม่(ได้)?(จ่าย|รับ|โอน)|รอรับ|เลยกำหนด|ครบกำหนด/, title: 'รอรับเงิน', character: 'reminder', total: 'ยอดค้างรับรวม', path: '/receivables', link: 'ดูเงินรอรับในแอป' },
  { test: /กำลัง(ทำ|ดำเนินการ)|ระหว่าง(ทำ|ดำเนินการ)|ยังไม่ส่ง/, title: 'งานที่กำลังทำ', character: 'working', total: 'มูลค่ารวม', path: '/jobs', link: 'ดูงานในแอป' },
  { test: /รายจ่าย|ค่าใช้จ่าย|จ่ายไป/, title: 'รายจ่าย', character: 'spent', total: 'รายจ่ายรวม', path: '/incomeExpense', link: 'ดูรายจ่ายในแอป' },
  { test: /รับเงิน|ได้รับ|เงินเข้า|รายรับ/, title: 'รับเงิน', character: 'received', total: 'รับเงินรวม', path: '/incomeExpense', link: 'ดูรายรับในแอป' },
  { test: /เอกสาร|ใบเสนอราคา|ใบแจ้งหนี้|ใบเสร็จ/, title: 'เอกสาร', character: 'document', total: 'ยอดรวม', path: '/invoice', link: 'ดูเอกสารในแอป' },
  { test: /งาน/, title: 'งาน', character: 'working', total: 'มูลค่ารวม', path: '/jobs', link: 'ดูงานในแอป' },
];
const TOTAL_IN_TEXT = /รวม(?:ทั้งหมด)?\s*(฿\s*-?[\d,]+(?:\.\d+)?|-?[\d,]+(?:\.\d+)?\s*บาท)/;

function listCard(list: Extract<Segment, { kind: 'list' }>, lead: string): LineMessage {
  const kind = LIST_KINDS.find(entry => entry.test.test(lead)) ?? { title: 'รายการ', character: 'report' as const, total: 'ยอดรวม', path: '/', link: 'เปิดแอป' };
  const moreCount = Number(/(\d+)/.exec(list.more ?? '')?.[1] ?? 0);
  const count = list.items.length + moreCount;
  const totalText = TOTAL_IN_TEXT.exec(lead)?.[1];
  const total = totalText ? (totalText.startsWith('฿') ? totalText.replace(/\s+/g, '') : `฿${totalText.replace(/\s*บาท$/, '')}`) : undefined;
  const C = LINE_CARD_COLORS;
  const rows = list.items.flatMap((item, at) => [
    ...(at > 0 ? [{ type: 'separator', color: C.border, margin: 'lg' }] : []),
    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
      { type: 'box', layout: 'horizontal', spacing: 'md', contents: [
        { type: 'text', text: item.name.slice(0, 120), size: 'sm', color: C.text, wrap: true, maxLines: 2, flex: 1 },
        ...(item.amount ? [{ type: 'text', text: item.amount.slice(0, 40), size: 'sm', weight: 'bold', color: C.text, align: 'end', flex: 0, wrap: true }] : []),
      ] },
      ...(item.meta ? [{ type: 'text', text: item.meta.slice(0, 160), size: 'xs', color: C.muted, wrap: true }] : []),
    ] },
  ]);
  return lineCard({
    title: kind.title, subtitle: `${count} รายการ`, character: kind.character,
    altText: lead || `${kind.title} ${count} รายการ${total ? ` รวม ${total}` : ''}`,
    ...(total ? { metric: { label: kind.total, value: total } } : {}),
    body: rows,
    ...(list.more ? { note: list.more } : {}),
    ...(lineAppLink(kind.path, kind.link) ? { footer: lineAppLink(kind.path, kind.link)! } : {}),
  });
}

/** Short messages, one sentence to a bubble; a list (steps, questions) stays whole with the line before it. */
function talkBubbles(lines: string[], now: Date, max: number): string[] {
  const units: string[] = [];
  const paragraphs = layoutItems(lines, now).join('\n').replace(/\n{3,}/g, '\n\n').trim().split(/\n{2,}/).filter(part => part.trim());
  for (const paragraph of paragraphs) {
    const rows = paragraph.split('\n');
    if (rows.some(row => itemMarker(row) || isContinuation(row))) {
      // The sentence that introduces a list goes with it.
      const last = units.length && !itemMarker(rows[0]) ? null : units.pop();
      units.push([...(last ? [last] : []), paragraph].join('\n'));
    } else units.push(...rows.map(row => row.trim()).filter(Boolean));
  }
  if (units.length <= max) return units;
  return [...units.slice(0, Math.max(0, max - 1)), units.slice(Math.max(0, max - 1)).join('\n')];
}

// Several pictures read at once (owner, 2026-11-06: "ส่งหลายรูปพร้อมกันให้รวมเป็นการ์ดเดียว", then "การ์ดเดียว + บันทึก
// ทั้งหมด"): one CI card with a row per card เลขา prepared (name, amount, what it is and its date), the total when they are
// all the same kind, and three buttons: บันทึกทั้งหมด, ดูทีละใบ (the separate cards, to change one) and ยกเลิกทั้งหมด.
type ConfirmCardLike = Extract<AssistantCard, { kind: 'confirm' }>;
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function shortThaiDate(value: string, now: Date): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const year = Number(match[1]) + 543;
  const thisYear = new Date(now.getTime() + 7 * 3600_000).getUTCFullYear() + 543;
  return `${Number(match[3])} ${THAI_MONTHS[Number(match[2]) - 1] ?? ''}${year === thisYear ? '' : ` ${year}`}`;
}
const changeOf = (card: ConfirmCardLike, labels: string[]) => card.changes.find(change => labels.includes(change.label))?.value;

export function cardGroupMessage(groupId: string, cards: AssistantCard[], files: number, now = new Date()): LineMessage {
  const C = LINE_CARD_COLORS;
  const confirms = cards.filter((card): card is ConfirmCardLike => card.kind === 'confirm');
  const items = confirms.map(card => {
    const amount = changeOf(card, ['จำนวนเงิน', 'ยอดรับ', 'ยอดเงิน', 'มูลค่า', 'มูลค่างาน']) ?? card.changes.find(change => /฿/.test(change.value))?.value;
    const date = changeOf(card, ['วันที่', 'วันที่รับเงิน', 'วันรับเงิน']);
    return { name: changeOf(card, ['รายการ', 'งาน', 'ชื่องาน', 'ชื่อรายการ']) ?? card.title, amount, meta: [card.title, date ? shortThaiDate(date, now) : ''].filter(Boolean).join(' · ') };
  });
  const amounts = items.map(item => Number(String(item.amount ?? '').replace(/[^\d.-]/g, '')));
  const total = new Set(confirms.map(card => card.title)).size === 1 && amounts.every(Number.isFinite) && amounts.length ? formatTHB(amounts.reduce((sum, value) => sum + value, 0)) : undefined;
  const rows = items.flatMap((item, at) => [
    ...(at > 0 ? [{ type: 'separator', color: C.border, margin: 'lg' }] : []),
    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: [
      { type: 'box', layout: 'horizontal', spacing: 'md', contents: [
        { type: 'text', text: item.name.slice(0, 120), size: 'sm', color: C.text, wrap: true, maxLines: 2, flex: 1 },
        ...(item.amount ? [{ type: 'text', text: item.amount.slice(0, 40), size: 'sm', weight: 'bold', color: C.text, align: 'end', flex: 0, wrap: true }] : []),
      ] },
      ...(item.meta ? [{ type: 'text', text: item.meta.slice(0, 160), size: 'xs', color: C.muted, wrap: true }] : []),
    ] },
  ]);
  const message = lineCard({
    title: `บันทึก ${confirms.length} รายการ`, subtitle: `จากรูปที่ส่งมา ${files} รูป`, character: 'review',
    altText: `บันทึก ${confirms.length} รายการจากรูปที่ส่งมา${total ? ` รวม ${total}` : ''} · กดบันทึกทั้งหมด หรือดูทีละใบ`,
    ...(total ? { metric: { label: 'ยอดรวม', value: total } } : {}),
    body: rows, note: 'รูปทั้งหมดเก็บไว้ในคลังเอกสารแล้ว',
  }) as LineMessage & { contents: Record<string, unknown> };
  const button = (label: string, action: string, primary = false) => ({ type: 'button', style: primary ? 'primary' : 'secondary', height: 'sm',
    color: primary ? C.accent : C.subtle, action: { type: 'postback', label, data: `ai:${action}:${groupId}`, displayText: label } });
  message.contents.footer = { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px', paddingTop: '0px', contents: [
    button('บันทึกทั้งหมด', 'confirmall', true),
    { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [button('ดูทีละใบ', 'showall'), button('ยกเลิกทั้งหมด', 'cancelall')] },
  ] };
  return message;
}

export function lineAssistantReply(text: string, cards: AssistantCard[], now = new Date()): LineMessage[] {
  const buddhistYear = new Date(now.getTime() + 7 * 3600_000).getUTCFullYear() + 543;
  const segments = segmentsOf(shapedLines(text), buddhistYear);
  const recordAt = segments.findIndex(isRecordList);
  const textOf = (part: Segment[]) => part.flatMap(segment => (segment.kind === 'text' ? segment.lines : segment.raw));
  const out: LineMessage[] = [];
  if (recordAt >= 0) {
    const before = textOf(segments.slice(0, recordAt));
    const after = textOf(segments.slice(recordAt + 1));
    const lead = before.join(' ').trim();
    out.push(...talkBubbles(before, now, 2).map(part => ({ type: 'text' as const, text: part })));
    out.push(listCard(segments[recordAt] as Extract<Segment, { kind: 'list' }>, lead));
    const tail = talkBubbles(after, now, 1);
    out.push(...tail.map(part => ({ type: 'text' as const, text: part })));
  } else {
    out.push(...talkBubbles(textOf(segments), now, cards.length ? 2 : 4).map(part => ({ type: 'text' as const, text: part.slice(0, LINE_TEXT_MAX) })));
  }
  const { messages: cardsOut, left } = cardMessages(cards, LINE_MAX_MESSAGES - out.length - 1);
  const messages: LineMessage[] = [...out, ...cardsOut];
  if (left > 0) messages.push({ type: 'text', text: `มีอีก ${left} รายการ เปิดดูในเลขาในแอปได้ครับ` });
  return messages.length ? messages.slice(0, LINE_MAX_MESSAGES) : [{ type: 'text', text: 'ขออภัยครับ ตอนนี้ยังตอบไม่ได้ ลองพิมพ์ใหม่อีกครั้งนะครับ' }];
}
