import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, LINE_BRICK, lineAppLink } from './lineCards.js';

// The first minute in LINE (owner, 2026-11-13: "ใช้ง่าย เข้าใจได้รวดเร็ว สะดวก", and different from the competitor's
// banner-and-checklist welcome): a new friend gets two short lines and one question (ใช้แบบไหน), can type a record at once
// and see the card it would make before signing up, then keeps it with one tap. Nothing is stored before sign-up: the
// choice and the tried record ride in the sign-up link. No AI is called for people without an account.

export const USE_TYPES = ['personal', 'business', 'company'] as const;
export type UseType = typeof USE_TYPES[number];
export const USE_LABELS: Record<UseType, string> = { personal: 'ใช้ส่วนตัว', business: 'ฟรีแลนซ์ / ร้านค้า', company: 'บริษัท / สำนักงาน' };
export const isUseType = (value: unknown): value is UseType => typeof value === 'string' && (USE_TYPES as readonly string[]).includes(value);

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
const EXAMPLE: Record<UseType, string> = { personal: 'ข้าวมันไก่ 50', business: 'ค่าเช่ากล้อง 1200', company: 'ค่าเดินทาง 350' };

const asset = (path: string) => lineAppLink(path)?.uri;
export const greetingTile = (icon: string, title: string, detail: string) => ({ type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', margin: 'md', contents: [
  { type: 'box', layout: 'vertical', flex: 0, width: '40px', height: '40px', cornerRadius: '12px', backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    contents: asset(`/line/icons/${icon}.png`) ? [{ type: 'image', url: asset(`/line/icons/${icon}.png`), size: '22px', aspectRatio: '1:1', aspectMode: 'fit' }] : [] },
  { type: 'box', layout: 'vertical', flex: 1, contents: [
    { type: 'text', text: title, size: 'sm', weight: 'bold', color: C.text, wrap: true },
    { type: 'text', text: detail, size: 'xs', color: C.muted, wrap: true },
  ] },
] });
/** ใช้แบบไหน as three large choices in the card (and the same as taps under it). */
const useChoices = () => ({ type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: USE_TYPES.map(use => ({
  type: 'box', layout: 'vertical', cornerRadius: '10px', paddingAll: '11px', borderWidth: '1px', borderColor: '#D6D3D1', backgroundColor: '#FFFFFF',
  action: { type: 'postback', label: USE_LABELS[use], data: `try:use:${use}`, displayText: USE_LABELS[use] },
  contents: [{ type: 'text', text: USE_LABELS[use], size: 'sm', weight: 'bold', color: C.text, align: 'center' }],
})) });

/**
 * Follow: the greeting card (owner, 2026-11-13, design C of four, "เพิ่มพร็อพ ... ตึกสำนักงาน ให้มันดูสวยๆ"): the brick band
 * with office buildings behind the official mascot, three steps with their icons, and ใช้แบบไหน as three choices. Where
 * the Sheets features are shown to newcomers (sheetsForNewcomers), a fourth line says an existing Google Sheets or Excel
 * file can be connected (owner: "เขาจะรู้ได้ไงว่ามึงมีฟีเจอร์นี้ ... มึงต้องบอกเขา เพราะเขาคือลูกค้าใหม่").
 */
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

export function buildTryWelcome(options: { sheets?: boolean } = {}): LineMessage[] {
  const band = LINE_BRICK;
  return [{ type: 'flex', altText: 'ยินดีที่ได้รู้จักครับ ผมเลขากระรอก เลขาการเงินในแชท LINE ใช้แบบไหนครับ', contents: {
    type: 'bubble', size: 'mega', styles: { header: { backgroundColor: band }, body: { backgroundColor: '#FFFFFF' } },
    header: greetingHeader('ยินดีที่ได้รู้จักครับ', 'เลขาการเงินในแชท LINE ของคุณ'),
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', paddingTop: '10px', contents: [
      greetingTile('spent', 'พิมพ์บอก', 'เช่น ค่ากาแฟ 60 หรือ งานถ่ายรูป 5000'),
      greetingTile('review', 'ตรวจแล้วกดยืนยัน', 'เลขาทำการ์ดให้ดูก่อนบันทึกทุกครั้ง'),
      greetingTile('report', 'ดูสรุปเมื่อไหร่ก็ได้', 'พิมพ์ สรุปเดือนนี้'),
      ...(options.sheets ? [SHEETS_TILE()] : []),
      { type: 'separator', color: C.border, margin: 'xl' },
      { type: 'text', text: 'ใช้แบบไหนครับ', size: 'md', weight: 'bold', color: C.text, margin: 'lg' },
      useChoices(),
    ] },
  } } as LineMessage];
}

/** After the pick: try one now. */
export function buildTryPrompt(use: UseType): LineMessage {
  return { type: 'text', text: use === 'personal'
    ? `ลองพิมพ์รายจ่ายวันนี้ดูเลยครับ เช่น ${EXAMPLE.personal}`
    : `ลองพิมพ์รายจ่ายหรือรายรับดูเลยครับ เช่น ${EXAMPLE[use]} หรือ งานถ่ายรูป 5000` };
}

export const TRY_POSTBACK = /^try:use:(personal|business|company)$/;

/** The card a try would make, not saved yet, with one tap to keep it (the sign-up page, LIFF ?start=1). */
export function buildTryPreview(draft: TryDraft, use: UseType | null, liffId: string | undefined): LineMessage {
  const income = draft.kind === 'income';
  const params = new URLSearchParams({ start: '1', keep: encodeTry(draft), ...(use ? { use } : {}) });
  const keep = liffId ? `https://liff.line.me/${liffId}?${params}` : undefined;
  return { type: 'flex', altText: `ตัวอย่าง${income ? 'รายรับ' : 'รายจ่าย'} ${draft.name} ${baht(draft.amount)} กดเก็บไว้เพื่อเริ่มใช้งาน`, contents: {
    type: 'bubble', size: 'kilo',
    body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: [
      { type: 'box', layout: 'horizontal', contents: [{ type: 'box', layout: 'vertical', flex: 0, cornerRadius: '10px', borderWidth: '1px', borderColor: C.border,
        paddingStart: '8px', paddingEnd: '8px', paddingTop: '2px', paddingBottom: '2px', contents: [{ type: 'text', text: 'ตัวอย่าง · ยังไม่บันทึก', size: 'xxs', color: C.muted }] }] },
      { type: 'text', text: `${income ? 'รายรับ' : 'รายจ่าย'}${draft.category ? ` · ${draft.category}` : ''} · วันนี้`, size: 'xs', color: C.muted, margin: 'md', wrap: true },
      { type: 'text', text: draft.name, size: 'md', weight: 'bold', color: C.text, wrap: true },
      { type: 'text', text: `${income ? '+' : '−'}${baht(draft.amount)}`, size: 'xxl', weight: 'bold', color: income ? C.positive : C.negative },
      { type: 'text', text: 'ใช้ชื่อ LINE ของคุณ ไม่ต้องใช้อีเมล', size: 'xxs', color: C.muted, margin: 'md', wrap: true },
    ] },
    ...(keep ? { footer: { type: 'box', layout: 'vertical', paddingAll: '16px', paddingTop: '0px', contents: [
      { type: 'button', style: 'primary', height: 'sm', color: C.accent, action: { type: 'uri', label: 'เก็บไว้ · เริ่มใช้งาน', uri: keep } },
    ] } } : {}),
  } };
}

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

/** คุยกับเลขา on the guest menu: what to type, with sentences to tap; each one comes back as the card it would make. */
export const TRY_CHAT = 'คุยกับเลขา';
const TRY_EXAMPLES = ['ค่ากาแฟ 60', 'งานถ่ายรูป 5000', 'ค่าเช่ากล้อง 1200', 'ได้เงินค่าสอน 1500'];
export function buildTryChat(): LineMessage {
  return { type: 'text', text: 'พิมพ์บอกเลขาได้เลยครับ ชื่อรายการกับจำนวนเงิน เลขาจะทำการ์ดให้ดูก่อน ยังไม่บันทึกจนกว่าคุณจะกดเก็บไว้\nลองแตะตัวอย่างด้านล่างก็ได้',
    quickReply: { items: TRY_EXAMPLES.map(text => ({ type: 'action' as const, action: { type: 'message' as const, label: text, text } })) } };
}
