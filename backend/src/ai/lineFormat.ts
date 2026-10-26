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

/** One table row as a LINE item: "• name · amount", the other cells on a second, indented line. */
function rowItem(cells: string[]): string {
  const [name, ...rest] = cells;
  const moneyAt = rest.findIndex(cell => MONEY_CELL.test(cell));
  const money = moneyAt >= 0 ? rest.splice(moneyAt, 1)[0] : '';
  const head = `• ${name}${money ? ` · ${money}` : ''}`;
  return rest.length ? `${head}\n   ${rest.join(' · ')}` : head;
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
export function markdownToLineText(markdown: string): string {
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
  return shapeLists(out).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LINE_TEXT_MAX);
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
export function lineAssistantReply(text: string, cards: AssistantCard[]): LineMessage[] {
  const plain = markdownToLineText(text);
  const parts = plain ? plain.split(/\n{2,}/).map(part => part.trim()).filter(Boolean) : [];
  const bubbles = parts.length > 2 ? [parts[0], parts.slice(1).join('\n\n')] : parts;
  const { messages: cardsOut, left } = cardMessages(cards, LINE_MAX_MESSAGES - bubbles.length - 1);
  if (left > 0) bubbles.push(`มีอีก ${left} รายการ เปิดดูในเลขาในแอปได้ครับ`);
  const messages: LineMessage[] = [...bubbles.map(part => ({ type: 'text' as const, text: part })), ...cardsOut];
  return messages.length ? messages.slice(0, LINE_MAX_MESSAGES) : [{ type: 'text', text: 'ขออภัยครับ ตอนนี้ยังตอบไม่ได้ ลองพิมพ์ใหม่อีกครั้งนะครับ' }];
}
