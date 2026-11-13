import { safeLineDestination } from '../../../shared/lineDestination.js';
import type { LineMessage } from './line.js';
import { LINE_TITLE_FOLDER, LINE_TITLE_IMAGES, type LineTitleKey } from './lineTitleImages.js';

// Formal statement cards (owner, 2026-10-22: "clean แล้วก็ดูเป็นทางการ ... ไม่เอาน่ารักแล้ว", then "เพิ่ม
// ลิควิดการ์ด ... เกรเดียนต์ ... สีสันแบบทางการ", "รายจ่ายควรเป็นสีแดง", "มาสคอต ... ใช้ให้มันดูแบบคิวท์
// ทางการ"): a CI gradient header with the brand symbol, a category chip with an icon, the mascot as a
// standing free on the band (no frame), and the key amount, then white label/value rows.
// accent is the brand's deep orange, so white button text stays readable (about 4.9:1).
export const LINE_CARD_COLORS = {
  text: '#1C1917', muted: '#6B6560', accent: '#C24A16', positive: '#1D7347',
  negative: '#B42318', warning: '#A15C07', border: '#E7E5E4', subtle: '#F5F5F4', white: '#FFFFFF',
};
export type LineCardCharacter = 'expense' | 'income' | 'guide' | 'review' | 'working' | 'received' | 'spent' | 'cancelled' | 'saving' | 'withdraw' | 'report' | 'reminder' | 'urgent' | 'document' | 'welcome' | 'disconnected'
  | 'quotation' | 'invoice' | 'taxInvoice' | 'receipt' | 'receiptTaxInvoice';
export const MAX_LINE_ITEMS = 5;
const C = LINE_CARD_COLORS;
function excerpt(value: string, limit = 120): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export function lineDivider() { return { type: 'separator', color: C.border, margin: 'lg' }; }
/** Colours outside the card palette (older cards picked their own) fall back to the text colour. */
export function lineTone(color?: string): string {
  return color && [C.text, C.muted, C.positive, C.negative, C.warning, C.accent].includes(color) ? color : C.text;
}
export function lineSection(text: string) {
  return { type: 'text', text, size: 'xs', weight: 'bold', color: C.muted, wrap: true, margin: 'xl' };
}

/**
 * The size for a headline amount: large, never so large that it breaks across lines beside the mascot
 * on a phone (owner, 2026-10-22: "−฿ 1,810.91" split in two at 3xl). LINE sizes: xxl 29, xl 22, lg 19.
 */
export function lineAmountSize(value: string): string {
  return value.length <= 9 ? 'xxl' : value.length <= 13 ? 'xl' : 'lg';
}

export function lineValueRow(label: string, value: string, opts?: { color?: string; bold?: boolean; size?: string; caption?: string }) {
  // Statement rows: label left, value right on one line. Amounts keep their natural width; names and
  // other text get two thirds and wrap there (never clipped). Only very long text goes under its label.
  const amount = /^[+\-−฿\d]/.test(value);
  const stacked = value.length > 40;
  return {
    type: 'box', layout: stacked ? 'vertical' : 'horizontal', spacing: 'md', margin: 'md',
    contents: [
      // A caption explains the label under it, inside the row, so every row keeps one left edge.
      opts?.caption
        ? { type: 'box', layout: 'vertical', flex: 1, contents: [
          { type: 'text', text: label, size: 'xs', color: C.muted, wrap: true },
          { type: 'text', text: opts.caption, size: 'xxs', color: C.muted, wrap: true },
        ] }
        : { type: 'text', text: label, size: 'xs', color: C.muted, flex: 1, wrap: true },
      { type: 'text', text: excerpt(value || '—', 240), size: opts?.size || 'sm', color: lineTone(opts?.color),
        weight: opts?.bold === false ? 'regular' : 'bold', flex: stacked ? 1 : amount ? 0 : 2,
        align: stacked ? 'start' : 'end', wrap: true },
    ],
  };
}

export function lineJobItem(item: { name: string; client?: string; amount: string; meta?: string; metaColor?: string }) {
  return {
    type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs',
    contents: [
      { type: 'box', layout: item.amount.length > 14 ? 'vertical' : 'horizontal', spacing: 'sm', contents: [
        { type: 'text', text: excerpt(item.name || 'ไม่ระบุชื่องาน'), size: 'sm', weight: 'regular', color: C.text, wrap: true, maxLines: 2, flex: 1 },
        { type: 'text', text: item.amount, size: 'sm', weight: 'bold', color: C.text, align: item.amount.length > 14 ? 'start' : 'end', flex: 0, wrap: true },
      ] },
      ...(item.client ? [{ type: 'text', text: excerpt(item.client), size: 'xs', color: C.muted, wrap: true, maxLines: 1 }] : []),
      ...(item.meta ? [{ type: 'text', text: excerpt(item.meta), size: 'xs', color: item.metaColor ? lineTone(item.metaColor) : C.muted, wrap: true }] : []),
    ],
  };
}

export function lineAppLink(path: string, label = 'ดูรายละเอียดในแอป'): { label: string; uri: string } | undefined {
  try {
    if (!process.env.APP_URL) return undefined;
    const origin = new URL(process.env.APP_URL);
    if (origin.protocol !== 'https:') return undefined;
    const target = new URL(path, origin.origin);
    if (target.origin !== origin.origin) return undefined;
    const destination = safeLineDestination(path);
    const liffId = process.env.LIFF_ID;
    if (destination && liffId && /^[A-Za-z0-9-]+$/.test(liffId)) {
      return { label, uri: `https://liff.line.me/${liffId}?openPath=${encodeURIComponent(destination)}` };
    }
    return { label, uri: target.href };
  } catch { return undefined; }
}

// One header per kind of event, all in the warm CI family (owner, 2026-11-14, after a first family in brick, caramel and green:
// "หลากสีจนไม่คุมธีม"): documents and notices on a deep header that steps from CI orange to rust to espresso
// (quotation → invoice → receipt), money in and out on a warm pastel. Flat, no gradients (2026-11-12). `amount` colours the
// key amount in the body; `tag` is the small status pill under the title. Every main button is CI orange (lineTone.ts).
export const LINE_CARD_THEMES = {
  brand: { center: '#C24A16', amount: '#C24A16', tagBg: '#FFD166', tagText: '#5A3A00' },
  // Rust: invoices and overdue notices.
  alert: { center: '#8A3315', amount: '#8A3315', tagBg: '#FFF1E8', tagText: '#8A3315' },
  // Espresso: receipts, money already in hand; the amount is the app's income green.
  espresso: { center: '#4E2A1C', amount: '#12804F', tagBg: '#FFD166', tagText: '#4E2A1C' },
  neutral: { center: '#3A302B', amount: '#1C1917', tagBg: '#FFFFFF', tagText: '#3A302B' },
  // Money out: a peach-pink header, a red pill and a red amount (owner: "รายจ่ายควรเป็นสีแดง", style A 2026-11-14).
  expense: { center: '#FCE1D9', amount: '#B3261E', tagBg: '#B3261E', tagText: '#FFFFFF' },
  // Money in: a warm pale green, a green pill and a green amount.
  positive: { center: '#E7EFD8', amount: '#12804F', tagBg: '#12804F', tagText: '#FFFFFF' },
} as const;
type LineCardTheme = keyof typeof LINE_CARD_THEMES;
/** The brick the greeting band (with its office buildings) and the monthly report email were approved in; they keep it. */
export const LINE_BRICK = '#B8481A';
const PASTEL: ReadonlySet<LineCardTheme> = new Set(['expense', 'positive']);
// One category per card: its theme, its title picture in the CI typeface (lineTitleImages.ts, made by
// scripts/render-line-titles.mjs), and `pose`, the official mascot picture when it differs from the card type. `same`
// lists titles that only repeat the title picture, so they are not written again under it.
type Category = { theme: LineCardTheme; title: LineTitleKey; pose?: string; same?: string[] };
const CATEGORIES: Record<Exclude<LineCardCharacter, 'income' | 'expense'>, Category> = {
  guide: { theme: 'brand', title: 'assistant', pose: 'review' },
  welcome: { theme: 'brand', title: 'line', pose: 'review' },
  disconnected: { theme: 'neutral', title: 'line', pose: 'cancelled' },
  review: { theme: 'brand', title: 'review' },
  working: { theme: 'brand', title: 'work', same: ['งาน'] },
  // Money in: the squirrel in sunglasses with a coin, the liveliest official picture (owner: "น้องหน้านิ่งเกิน").
  received: { theme: 'positive', title: 'income', pose: 'guide', same: ['รับเงิน', 'รายรับ'] },
  spent: { theme: 'expense', title: 'expense', same: ['รายจ่าย'] },
  cancelled: { theme: 'neutral', title: 'update' },
  saving: { theme: 'positive', title: 'saving' },
  withdraw: { theme: 'expense', title: 'withdraw' },
  report: { theme: 'brand', title: 'report', same: ['รายงาน'] },
  reminder: { theme: 'brand', title: 'reminder', same: ['แจ้งเตือน'] },
  urgent: { theme: 'alert', title: 'reminder', same: ['แจ้งเตือน'] },
  document: { theme: 'brand', title: 'document', same: ['เอกสาร'] },
  // Each document reads apart at a glance (owner, 2026-11-14: "ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ... ควรทำให้มันต่างกัน").
  quotation: { theme: 'brand', title: 'quotation', pose: 'document', same: ['ใบเสนอราคา'] },
  invoice: { theme: 'alert', title: 'invoice', pose: 'reminder', same: ['ใบแจ้งหนี้'] },
  taxInvoice: { theme: 'alert', title: 'tax-invoice', pose: 'document', same: ['ใบกำกับภาษี'] },
  receipt: { theme: 'espresso', title: 'receipt', pose: 'received', same: ['ใบเสร็จรับเงิน', 'ใบเสร็จ'] },
  receiptTaxInvoice: { theme: 'espresso', title: 'receipt-tax-invoice', pose: 'received', same: ['ใบเสร็จรับเงิน/ใบกำกับภาษี', 'ใบเสร็จ / ใบกำกับภาษี'] },
};
/** The card kind for an app document type. */
export function documentCharacter(type: string): LineCardCharacter {
  return type === 'quotation' || type === 'invoice' || type === 'taxInvoice' || type === 'receipt' || type === 'receiptTaxInvoice' ? type : 'document';
}
// Titles that are a status of the kind already shown by the title picture: they become the pill, not a second heading.
const STATUS_TAGS: Record<string, string> = {
  'รายจ่ายใหม่': 'บันทึกแล้ว', 'บันทึกรายจ่ายแล้ว': 'บันทึกแล้ว', 'รับเงินแล้ว': 'รับเงินแล้ว',
  'บันทึกรับเงินแล้ว': 'บันทึกแล้ว', 'บันทึกรับเงินบางส่วนแล้ว': 'รับบางส่วนแล้ว',
};
const ON_DARK = { text: '#FFFFFF', soft: '#FFFFFFD9', ring: '#FFFFFF14', dot: '#FFFFFF10' };
const ON_LIGHT = { text: LINE_CARD_COLORS.text, soft: LINE_CARD_COLORS.muted };

export function lineCard(opts: {
  title: string; subtitle?: string; altText: string; body: any[];
  character?: LineCardCharacter;
  compact?: boolean;
  metric?: { label: string; value: string; note?: string; color?: string };
  footer?: { label: string; uri: string }; note?: string;
  /** The status pill under the title, e.g. แบบร่าง, สร้างแล้ว, บันทึกแล้ว. */
  tag?: string;
  /** 'secondary' when the card already has its own primary buttons (the 08:00 reminder). */
  footerStyle?: 'primary' | 'secondary';
}): LineMessage {
  const requested = opts.character || 'guide';
  // Legacy draft kinds do not imply that money has already changed hands.
  const character = requested === 'income' || requested === 'expense' ? 'review' : requested;
  const category = CATEGORIES[character];
  const themeKey = category.theme;
  const theme = LINE_CARD_THEMES[themeKey];
  const pastel = PASTEL.has(themeKey);
  const ink = pastel ? ON_LIGHT : ON_DARK;
  // The official brand symbol: white on a deep header, CI orange on a pastel one.
  const symbol = lineAppLink(pastel ? '/brand/logo01-v1/symbol-ci.png' : '/brand/logo01-v1/symbol-white.png')?.uri;
  // The official mascot in the pose made for this event (/line/mascot-v6-*.png, never redrawn), standing large on the
  // header's right; the header's edge crops its feet, like a product photo.
  const mascot = lineAppLink(`/line/mascot-v6-${category.pose || character}.png`)?.uri;
  // The kind of card in the CI typeface, as a picture; in its words when pictures have no address (tests, local runs).
  const picture = LINE_TITLE_IMAGES[category.title];
  const titleUrl = lineAppLink(`${LINE_TITLE_FOLDER}/${category.title}.png`)?.uri;
  const kind = titleUrl
    ? { type: 'image', url: titleUrl, size: `${Math.round(picture.width * 34 / 65)}px`, aspectRatio: `${picture.width}:${picture.height}`, aspectMode: 'fit', align: 'start', flex: 0 }
    : { type: 'text', text: picture.words, size: 'xl', weight: 'bold', color: ink.text, wrap: true };
  // A title that only repeats the picture is not written again; a status title becomes the pill.
  const statusTag = STATUS_TAGS[opts.title];
  const tag = opts.tag || statusTag;
  const repeats = !!statusTag || category.same?.includes(opts.title) || picture.words === opts.title
    || (!!opts.tag && opts.title.includes(picture.words));
  const brand = { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [
    ...(symbol ? [{ type: 'image', url: symbol, size: '16px', aspectRatio: '1:1', aspectMode: 'fit', flex: 0 }] : []),
    { type: 'text', text: 'กระรอกตุนเงิน', size: 'xxs', weight: 'bold', color: ink.soft, flex: 1, wrap: false },
  ] };
  const words = { type: 'box', layout: 'vertical', flex: 1, spacing: 'sm', paddingBottom: '18px', contents: [
    brand,
    kind,
    ...(repeats ? [] : [{ type: 'text', text: opts.title, size: 'md', weight: 'bold', color: ink.text, wrap: true }]),
    ...(opts.subtitle ? [{ type: 'text', text: opts.subtitle, size: 'xs', color: ink.soft, wrap: true }] : []),
    ...(tag ? [{ type: 'box', layout: 'horizontal', contents: [
      { type: 'box', layout: 'vertical', flex: 0, cornerRadius: '999px', backgroundColor: theme.tagBg, paddingStart: '10px', paddingEnd: '10px', paddingTop: '3px', paddingBottom: '3px',
        contents: [{ type: 'text', text: tag, size: 'xs', weight: 'bold', color: theme.tagText, wrap: false }] },
    ] }] : []),
  ] };
  // Soft rings behind a deep header (translucent white, no gradient); kept inside the header, which crops them.
  const rings = pastel ? [] : [
    { type: 'box', layout: 'vertical', position: 'absolute', width: '170px', height: '170px', cornerRadius: '999px', backgroundColor: ON_DARK.ring, offsetTop: '24px', offsetStart: '56%', contents: [] },
    { type: 'box', layout: 'vertical', position: 'absolute', width: '56px', height: '56px', cornerRadius: '999px', backgroundColor: ON_DARK.dot, offsetTop: '10px', offsetStart: '40%', contents: [] },
  ];
  const metric = opts.metric ? [
    { type: 'box', layout: 'vertical', spacing: 'xs', contents: [
      { type: 'text', text: opts.metric.label, size: 'xs', color: C.muted, wrap: true },
      // The key amount in the card's own colour; its sign tells in or out.
      { type: 'text', text: opts.metric.value, size: lineAmountSize(opts.metric.value), weight: 'bold', color: opts.metric.color ? lineTone(opts.metric.color) : theme.amount, wrap: true },
      ...(opts.metric.note ? [{ type: 'text', text: opts.metric.note, size: 'xs', color: C.muted, wrap: true }] : []),
    ] },
    { type: 'separator', color: C.border, margin: 'lg' },
  ] : [];
  const rest = opts.body[0]?.type === 'separator' ? opts.body.slice(1) : opts.body;
  return { type: 'flex', altText: opts.altText.slice(0, 400), contents: {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingAll: '18px', paddingBottom: '0px', backgroundColor: theme.center, contents: [
      ...rings,
      { type: 'box', layout: 'horizontal', alignItems: 'flex-end', contents: [
        mascot ? words : { ...words, paddingBottom: '18px' },
        ...(mascot ? [{ type: 'box', layout: 'vertical', width: '104px', height: '96px', flex: 0, contents: [
          { type: 'box', layout: 'vertical', height: '96px', contents: [] },
          { type: 'image', url: mascot, size: '104px', aspectRatio: '1:1', aspectMode: 'fit', position: 'absolute', offsetTop: '0px', offsetStart: '0px' },
        ] }] : []),
      ] },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', paddingTop: '16px', contents: [
      ...metric,
      ...rest,
      ...(opts.note ? [{ type: 'separator', color: C.border, margin: 'xl' }, { type: 'text', text: opts.note, size: 'xs', color: C.muted, wrap: true, margin: 'lg' }] : []),
    ] },
    ...(opts.footer ? { footer: { type: 'box', layout: 'vertical', paddingAll: '20px', paddingTop: '0px', contents: [
      opts.footerStyle === 'secondary'
        ? { type: 'button', style: 'secondary', color: C.subtle, height: 'sm', action: { type: 'uri', ...opts.footer } }
        : { type: 'button', style: 'primary', color: C.accent, height: 'sm', action: { type: 'uri', ...opts.footer } },
    ] } } : {}),
    styles: { header: { backgroundColor: theme.center }, body: { backgroundColor: C.white }, footer: { backgroundColor: C.white } },
  } };
}
