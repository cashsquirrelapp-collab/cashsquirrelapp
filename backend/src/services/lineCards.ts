import { safeLineDestination } from '../../../shared/lineDestination.js';
import type { LineMessage } from './line.js';

// Formal statement cards (owner, 2026-10-22: "clean แล้วก็ดูเป็นทางการ ... ไม่เอาน่ารักแล้ว", then "เพิ่ม
// ลิควิดการ์ด ... เกรเดียนต์ ... สีสันแบบทางการ", "รายจ่ายควรเป็นสีแดง", "มาสคอต ... ใช้ให้มันดูแบบคิวท์
// ทางการ"): a CI gradient header with the brand symbol, a category chip with an icon, the mascot as a
// standing free on the band (no frame), and the key amount, then white label/value rows.
// accent is the brand's deep orange, so white button text stays readable (about 4.9:1).
export const LINE_CARD_COLORS = {
  text: '#1C1917', muted: '#6B6560', accent: '#C24A16', positive: '#1D7347',
  negative: '#B42318', warning: '#A15C07', border: '#E7E5E4', subtle: '#F5F5F4', white: '#FFFFFF',
};
export type LineCardCharacter = 'expense' | 'income' | 'guide' | 'review' | 'working' | 'received' | 'spent' | 'cancelled' | 'saving' | 'withdraw' | 'report' | 'reminder' | 'urgent' | 'document' | 'welcome' | 'disconnected';
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

// The CI gradient family of the app's "Liquid Amber" (goalsAmber.css), one per kind of event, so the
// colour says what happened before a word is read (owner, 2026-10-22: "เพิ่มสีสัน ... แต่ทางการ").
// Each runs dark to light; white text on the darker two thirds stays readable.
export const LINE_CARD_THEMES = {
  brand: { start: '#8F3416', center: '#B8481A', end: '#E2672F' },
  positive: { start: '#0D4A2E', center: '#17663F', end: '#2F8A5B' },
  alert: { start: '#6E1A12', center: '#9A2A18', end: '#C4482B' },
  // Money out is red (owner: "รายจ่ายควรเป็นสีแดง"), a brighter crimson than the overdue alert.
  expense: { start: '#7A1426', center: '#B3261E', end: '#E0533F' },
  neutral: { start: '#1C1917', center: '#36302C', end: '#5A524C' },
} as const;
type LineCardTheme = keyof typeof LINE_CARD_THEMES;
// One category per card, in the header chip with its icon (Lucide, white PNGs in /line/icons,
// made by artifacts/line-formal/make-icons.mjs), so the kind of event reads before any text.
// `pose` picks the official mascot image when it differs from the card type: the secretary with the
// clipboard greets and helps.
const CATEGORIES: Record<Exclude<LineCardCharacter, 'income' | 'expense'>, { label: string; theme: LineCardTheme; icon: string; pose?: string }> = {
  guide: { label: 'ผู้ช่วย', theme: 'brand', icon: 'guide', pose: 'review' },
  welcome: { label: 'เชื่อมต่อ LINE', theme: 'brand', icon: 'guide', pose: 'review' },
  disconnected: { label: 'เชื่อมต่อ LINE', theme: 'neutral', icon: 'cancelled', pose: 'cancelled' },
  review: { label: 'บันทึกรายการ', theme: 'brand', icon: 'review' },
  working: { label: 'งาน', theme: 'brand', icon: 'working' },
  received: { label: 'รับเงิน', theme: 'positive', icon: 'received' },
  spent: { label: 'รายจ่าย', theme: 'expense', icon: 'spent' },
  cancelled: { label: 'อัปเดตรายการ', theme: 'neutral', icon: 'cancelled' },
  saving: { label: 'เป้าหมายการออม', theme: 'positive', icon: 'saving' },
  withdraw: { label: 'ถอนจากเป้าหมาย', theme: 'expense', icon: 'spent' },
  report: { label: 'รายงาน', theme: 'brand', icon: 'report' },
  reminder: { label: 'แจ้งเตือน', theme: 'brand', icon: 'reminder' },
  urgent: { label: 'แจ้งเตือน', theme: 'alert', icon: 'urgent' },
  document: { label: 'เอกสาร', theme: 'brand', icon: 'document' },
};
const ON_DARK = { text: '#FFFFFF', soft: '#FFFFFFD9', faint: '#FFFFFFB3', chip: '#FFFFFF2E', line: '#FFFFFF38' };

export function lineCard(opts: {
  title: string; subtitle?: string; altText: string; body: any[];
  character?: LineCardCharacter;
  compact?: boolean;
  metric?: { label: string; value: string; note?: string; color?: string };
  footer?: { label: string; uri: string }; note?: string;
}): LineMessage {
  const requested = opts.character || 'guide';
  // Legacy draft kinds do not imply that money has already changed hands.
  const character = requested === 'income' || requested === 'expense' ? 'review' : requested;
  const category = CATEGORIES[character];
  const theme = LINE_CARD_THEMES[category.theme];
  const padding = '20px';
  // The official white brand symbol (logo01-v1/symbol-white), on the band with no disc or frame.
  const symbol = lineAppLink('/brand/logo01-v1/symbol-white.png')?.uri;
  const icon = lineAppLink(`/line/icons/${category.icon}.png`)?.uri;
  // The official mascot in the pose made for this event (/line/mascot-v6-*.png, never redrawn). No frame
  // (owner: "ไม่ต้องเพิ่มกรอบ ... อยากได้เหมือน Apple"): it stands on the band at the bottom right and the
  // band's edge crops its feet, like a product photo.
  const mascot = lineAppLink(`/line/mascot-v6-${category.pose || character}.png`)?.uri;
  const brand = {
    type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [
      ...(symbol ? [{ type: 'image', url: symbol, size: '18px', aspectRatio: '1:1', aspectMode: 'fit', flex: 0 }] : []),
      { type: 'text', text: 'กระรอกตุนเงิน', size: 'xs', weight: 'bold', color: ON_DARK.text, flex: 1, wrap: false },
      { type: 'box', layout: 'horizontal', flex: 0, spacing: 'xs', alignItems: 'center', cornerRadius: '10px', backgroundColor: ON_DARK.chip,
        paddingStart: '8px', paddingEnd: '9px', paddingTop: '3px', paddingBottom: '3px', contents: [
          ...(icon ? [{ type: 'image', url: icon, size: '12px', aspectRatio: '1:1', aspectMode: 'fit', flex: 0 }] : []),
          { type: 'text', text: category.label, size: 'xxs', weight: 'bold', color: ON_DARK.text, wrap: false, flex: 0 },
        ] },
    ],
  };
  // Two full-size layers under the content give the liquid sheen: light from the top left, depth
  // toward the bottom right. They take no space and never cover text (content comes after them).
  const sheen = [
    { type: 'box', layout: 'vertical', position: 'absolute', offsetTop: '0px', offsetStart: '0px', width: '100%', height: '100%', contents: [],
      background: { type: 'linearGradient', angle: '150deg', startColor: '#FFFFFF33', centerColor: '#FFFFFF00', centerPosition: '45%', endColor: '#FFFFFF00' } },
    { type: 'box', layout: 'vertical', position: 'absolute', offsetTop: '0px', offsetStart: '0px', width: '100%', height: '100%', contents: [],
      background: { type: 'linearGradient', angle: '0deg', startColor: '#00000026', centerColor: '#00000000', centerPosition: '55%', endColor: '#00000000' } },
  ];
  // Beside an amount the mascot can be larger; beside a title it stays smaller so the text keeps its width.
  const figure = opts.metric ? 80 : 72;
  const titleBlock = (margin: string) => [
    { type: 'text', text: opts.title, size: 'lg', weight: 'bold', color: ON_DARK.text, wrap: true, margin },
    ...(opts.subtitle ? [{ type: 'text', text: opts.subtitle, size: 'xs', color: ON_DARK.soft, wrap: true }] : []),
  ];
  return { type: 'flex', altText: opts.altText.slice(0, 400), contents: {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingAll: padding, paddingBottom: mascot ? '0px' : padding, spacing: 'xs',
      background: { type: 'linearGradient', angle: '120deg', startColor: theme.start, centerColor: theme.center, centerPosition: '55%', endColor: theme.end },
      contents: [
        ...sheen,
        brand,
        // With an amount: title and a full-width hairline, then the amount with the mascot beside it.
        // Without one: the mascot stands beside the title.
        ...(opts.metric ? [...titleBlock('lg'), { type: 'separator', color: ON_DARK.line, margin: 'lg' }] : []),
        { type: 'box', layout: 'horizontal', alignItems: opts.metric ? 'flex-end' : 'center', margin: opts.metric ? 'md' : 'lg', contents: [
          { type: 'box', layout: 'vertical', flex: 1, spacing: 'xs', paddingBottom: mascot ? (opts.metric ? padding : '14px') : '0px', contents: opts.metric ? [
            // The key amount sits on the colour, as on a wallet card; its sign tells in or out.
            { type: 'text', text: opts.metric.label, size: 'xs', color: ON_DARK.soft, wrap: true },
            { type: 'text', text: opts.metric.value, size: lineAmountSize(opts.metric.value), weight: 'bold', color: ON_DARK.text, wrap: true },
            ...(opts.metric.note ? [{ type: 'text', text: opts.metric.note, size: 'xs', color: ON_DARK.faint, wrap: true }] : []),
          ] : titleBlock('none') },
          ...(mascot ? [{ type: 'box', layout: 'vertical', width: `${figure}px`, height: `${figure - 12}px`, flex: 0, contents: [
            { type: 'box', layout: 'vertical', height: `${figure - 12}px`, contents: [] },
            { type: 'image', url: mascot, size: `${figure}px`, aspectRatio: '1:1', aspectMode: 'fit', position: 'absolute', offsetTop: '0px', offsetStart: '0px' },
          ] }] : []),
        ] },
      ] },
    body: { type: 'box', layout: 'vertical', paddingAll: padding, paddingTop: '14px', contents: [
      // The band already separates the header; a divider right under it would only add a line.
      ...(opts.body[0]?.type === 'separator' ? opts.body.slice(1) : opts.body),
      ...(opts.note ? [{ type: 'separator', color: C.border, margin: 'xl' }, { type: 'text', text: opts.note, size: 'xs', color: C.muted, wrap: true, margin: 'lg' }] : []),
    ] },
    ...(opts.footer ? { footer: { type: 'box', layout: 'vertical', paddingAll: padding, paddingTop: '0px', contents: [
      { type: 'button', style: 'primary', color: C.accent, height: 'sm', action: { type: 'uri', ...opts.footer } },
    ] } } : {}),
    styles: { header: { backgroundColor: theme.center }, body: { backgroundColor: C.white }, footer: { backgroundColor: C.white } },
  } };
}
