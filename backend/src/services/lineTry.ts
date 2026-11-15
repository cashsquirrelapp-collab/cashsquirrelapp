import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, LINE_BRICK, lineAppLink } from './lineCards.js';

// The first minute in LINE (owner, 2026-11-13: "ใช้ง่าย เข้าใจได้รวดเร็ว สะดวก"): the greeting's look (design C) and the
// record a newcomer types before signing up. Since 2026-11-15 the follow card says what Krarok is and how to connect, and
// anything sent before connecting gets the connect-first card (lineLinkCards.ts); a typed record such as "ข้าวมันไก่ 50"
// still rides in the sign-up link and is saved as the first record. Nothing is stored before sign-up, and no AI is called
// for people without an account.

export const USE_TYPES = ['personal', 'business', 'company'] as const;
export type UseType = typeof USE_TYPES[number];
export const USE_LABELS: Record<UseType, string> = { personal: 'ใช้ส่วนตัว', business: 'ฟรีแลนซ์ / ร้านค้า', company: 'บริษัท / สำนักงาน' };
export const isUseType = (value: unknown): value is UseType => typeof value === 'string' && (USE_TYPES as readonly string[]).includes(value);

/** ใช้แบบไหน on a greeting card sent before 2026-11-15: the pick rides in the sign-up link of the connect-first card. */
export const TRY_POSTBACK = /^try:use:(personal|business|company)$/;

export interface TryDraft { kind: 'expense' | 'income'; name: string; amount: number; category?: string }

const INCOME = /^(ได้เงิน|ได้รับ|รับเงิน|รายรับ|เงินเดือน|ขายได้|ขาย|งาน|ค่าจ้าง|รับงาน|โบนัส)/;
const CATEGORY: [RegExp, string][] = [
  [/กาแฟ|ข้าว|อาหาร|ขนม|ชา|น้ำ(?!มัน)|ก๋วยเตี๋ยว|ส้มตำ|ไก่|หมู|ร้านอาหาร/, 'อาหาร/รับรองลูกค้า'],
  [/รถ|แท็กซี่|grab|bolt|น้ำมัน|bts|mrt|ทางด่วน|ที่จอด|เดินทาง/i, 'ค่าเดินทาง/น้ำมัน'],
  [/ไฟ|ประปา|เน็ต|อินเทอร์เน็ต|โทรศัพท์|มือถือ/, 'ค่าบริการ/สาธารณูปโภค'],
  [/กล้อง|อุปกรณ์|คอม|โปรแกรม|ซอฟต์แวร์|แอป|subscription/i, 'ค่าอุปกรณ์/ซอฟต์แวร์'],
  [/โฆษณา|แอด|ads/i, 'ค่าโฆษณา/ยิงแอด'],
];

/** "ข้าวมันไก่ 50", "ค่ากาแฟ 60 บาท", "งานถ่ายรูป 5,000": a name and an amount; anything else is not a try. */
export function parseTry(text: string): TryDraft | null {
  const match = /^(.{1,60}?)\s*(?:฿\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:บาท|บ\.?)?$/.exec(text.trim().replace(/\s+/g, ' '));
  if (!match) return null;
  const name = match[1].trim().replace(/[:：-]+$/, '').trim();
  const amount = Number(`${match[2].replace(/,/g, '')}${match[3] ? `.${match[3]}` : ''}`);
  if (!name || /^\d/.test(name) || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  if (INCOME.test(name)) return { kind: 'income', name, amount };
  const category = CATEGORY.find(([pattern]) => pattern.test(name))?.[1];
  return { kind: 'expense', name, amount, ...(category ? { category } : {}) };
}

/** The tried record as a short link parameter, and back (checked again: it comes from a link). */
export function encodeTry(draft: TryDraft): string {
  return Buffer.from(JSON.stringify({ k: draft.kind === 'income' ? 'i' : 'e', n: draft.name, a: draft.amount, ...(draft.category ? { c: draft.category } : {}) })).toString('base64url');
}
export function decodeTry(value: unknown): TryDraft | null {
  if (typeof value !== 'string' || value.length > 600) return null;
  try {
    const raw = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { k?: unknown; n?: unknown; a?: unknown; c?: unknown };
    if ((raw.k !== 'e' && raw.k !== 'i') || typeof raw.n !== 'string' || typeof raw.a !== 'number') return null;
    const name = raw.n.trim().slice(0, 60);
    if (!name || !Number.isFinite(raw.a) || raw.a <= 0 || raw.a > 10_000_000) return null;
    const category = typeof raw.c === 'string' && CATEGORY.some(([, known]) => known === raw.c) ? raw.c : undefined;
    return { kind: raw.k === 'i' ? 'income' : 'expense', name, amount: Math.round(raw.a * 100) / 100, ...(category ? { category } : {}) };
  } catch { return null; }
}

const baht = (amount: number) => `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;

const asset = (path: string) => lineAppLink(path)?.uri;
export const greetingTile = (icon: string, title: string, detail: string) => ({ type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', margin: 'md', contents: [
  { type: 'box', layout: 'vertical', flex: 0, width: '40px', height: '40px', cornerRadius: '12px', backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    contents: asset(`/line/icons/${icon}.png`) ? [{ type: 'image', url: asset(`/line/icons/${icon}.png`), size: '22px', aspectRatio: '1:1', aspectMode: 'fit' }] : [] },
  { type: 'box', layout: 'vertical', flex: 1, contents: [
    { type: 'text', text: title, size: 'sm', weight: 'bold', color: C.text, wrap: true },
    { type: 'text', text: detail, size: 'xs', color: C.muted, wrap: true },
  ] },
] });
/** The greeting's band: the brick colour, office buildings along the bottom, the official mascot standing in front. */
export function greetingHeader(title: string, subtitle: string, pose = 'review') {
  const city = asset('/line/greeting-city-v1.png');
  const mascot = asset(`/line/mascot-v6-${pose}.png`);
  const symbol = asset('/brand/logo01-v1/symbol-white.png');
  const band = LINE_BRICK;
  return { type: 'box', layout: 'vertical', backgroundColor: band, paddingAll: '20px', paddingBottom: '0px', contents: [
      // The buildings stand along the bottom of the band, behind the words and the mascot.
      ...(city ? [{ type: 'image', url: city, size: 'full', aspectRatio: '4:1', aspectMode: 'fit', position: 'absolute', offsetStart: '0px', offsetEnd: '0px', offsetBottom: '0px' }] : []),
      { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [
        ...(symbol ? [{ type: 'image', url: symbol, size: '18px', aspectRatio: '1:1', aspectMode: 'fit', flex: 0 }] : []),
        { type: 'text', text: 'กระรอกตุนเงิน', size: 'xs', weight: 'bold', color: '#FFFFFF', flex: 1, wrap: false },
      ] },
      { type: 'text', text: title, size: 'lg', weight: 'bold', color: '#FFFFFF', wrap: true, margin: 'lg' },
      { type: 'text', text: subtitle, size: 'xs', color: '#FFFFFFD9', wrap: true },
      // Room for the city, with the mascot standing in front of it on the right.
      { type: 'box', layout: 'horizontal', height: '84px', contents: [
        { type: 'filler' },
        ...(mascot ? [{ type: 'box', layout: 'vertical', width: '92px', flex: 0, justifyContent: 'flex-end', contents: [
          { type: 'image', url: mascot, size: '92px', aspectRatio: '1:1', aspectMode: 'fit' },
        ] }] : []),
      ] },
    ] };
}

/** The line telling a newcomer an existing sheet or Excel file can be used (shown where the Sheets features are). */
export const SHEETS_TILE = () => greetingTile('document', 'มีชีตหรือ Excel อยู่แล้ว?', 'เชื่อม Google Sheets หรือส่งไฟล์ Excel มาได้ ไม่ต้องย้ายข้อมูล');

/**
 * Right after signing up in LINE: the record they tried, now saved, and one line on what to do next, with buttons for
 * the two things people do first. Replaces the long welcome card in this flow (clean, one card at most).
 */
export function buildTryWelcomeBack(first: TryDraft | null, name: string | null): LineMessage[] {
  const quickReply = { items: [
    { type: 'action' as const, action: { type: 'message' as const, label: 'สรุปเดือนนี้', text: 'สรุปเดือนนี้' } },
    { type: 'action' as const, action: { type: 'cameraRoll' as const, label: 'ส่งรูปสลิป' } },
    { type: 'action' as const, action: { type: 'message' as const, label: 'เชื่อมชีต', text: 'เชื่อมชีต' } },
  ] };
  const text = `${first ? 'เรียบร้อยครับ ✓' : `ยินดีต้อนรับครับ${name ? ` คุณ${name}` : ''}`} พิมพ์มาได้เรื่อย ๆ เช่น ค่ากาแฟ 60 หรือส่งรูปสลิปก็ได้`;
  if (!first) return [{ type: 'text', text, quickReply }];
  const income = first.kind === 'income';
  return [
    { type: 'flex', altText: `บันทึกแล้ว ${first.name} ${income ? '+' : '−'}${baht(first.amount)}`, contents: {
      type: 'bubble', size: 'kilo',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: [
        { type: 'text', text: 'บันทึกแล้ว', size: 'xs', weight: 'bold', color: C.positive },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: first.name, size: 'sm', color: C.text, flex: 3, wrap: true },
          { type: 'text', text: `${income ? '+' : '−'}${baht(first.amount)}`, size: 'sm', weight: 'bold', color: income ? C.positive : C.negative, align: 'end', flex: 2 },
        ] },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: income ? 'เดือนนี้รับแล้ว' : 'เดือนนี้จ่ายไป', size: 'xs', color: C.muted, flex: 3 },
          { type: 'text', text: baht(first.amount), size: 'xs', color: C.text, align: 'end', flex: 2 },
        ] },
      ] },
    } },
    { type: 'text', text, quickReply },
  ];
}
