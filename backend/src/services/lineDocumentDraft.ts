import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { calculateDocumentTotals } from '../../../frontend/src/features/invoices/documentMath.js';
import type { Invoice, InvoiceProfile } from '../../../shared/types.js';
import { patchPrivate } from '../repositories/accounts.js';
import { lineAppLink, lineCard, lineValueRow, LINE_CARD_COLORS } from './lineCards.js';
import type { LineMessage } from './line.js';

// Quotations and invoices from LINE as cards (owner, 2026-10-30, after a competitor's LINE: "อยากให้มันสร้างการ์ดได้
// เวลาที่บอกว่าขอใบเสนอราคาหน่อย ... ตรงไหนที่ยังไม่กรอก ก็จะมีให้กรอก ... ถ้าบอกแค่ว่าสร้างใบเสนอราคาให้หน่อย ก็จะสร้างการ์ด
// ขึ้นมาเลย ... ตอนนี้ในไลน์มีแต่คำถามอย่างเดียว ... อยากให้มีการ์ดขึ้นมาเพื่อลดโทเค็น"). No model is called: the words are
// read by fixed rules into a draft, the card shows what is there and what is still missing, the LINE form (liff-add.html,
// draftKind=document) fills the rest in one go, and "สร้างเอกสาร" saves the same unsigned draft document the app's เลขา
// saves (ai/documentActions.ts), through the same checked write (quota, validation, versions).

// Every document the app makes (owner, 2026-10-30: "ใบแจ้งหนี้กับใบเสร็จยังถามปกติอยู่ ... ทั้งหมดเลยที่เป็นคำสั่งให้เพิ่ม
// ต้องเพิ่มการ์ดมา"), each with its picture in the chat: the same types, names and number prefixes as the app (DocumentA4).
export type LineDocumentType = 'quotation' | 'invoice' | 'receipt' | 'taxInvoice' | 'receiptTaxInvoice';
export interface LineDocumentItem { description: string; quantity: number; unit?: string; price: number }
export interface LineDocumentClient { name?: string; address?: string; taxId?: string; phone?: string; email?: string; branch?: string; contactName?: string }
export interface LineDocumentDraft {
  type: LineDocumentType;
  client: LineDocumentClient;
  items: LineDocumentItem[];
  vatRate: number;
  whtRate: number;
  /** Days the client has to pay (credit terms). */
  creditTerm?: number;
  note?: string;
  /** Receipts: the day the money came in (YYYY-MM-DD; empty = the day it is made) and how it was paid. */
  paidDate?: string;
  paymentMethod?: string;
  /** What the user typed, shown in the form for reference (never saved on the document). */
  heard?: string;
}
export interface StoredDocumentDraft { id: string; createdAt: string; draft: LineDocumentDraft }

/** Long enough to fill a document in the form; a card older than this asks for a new one. */
export const DOCUMENT_DRAFT_TTL_MS = 30 * 60 * 1000;
export const DOC_NAME: Record<LineDocumentType, string> = {
  quotation: 'ใบเสนอราคา', invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จรับเงิน', taxInvoice: 'ใบกำกับภาษี', receiptTaxInvoice: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
};
const DOC_PREFIX: Record<LineDocumentType, string> = { quotation: 'QT', invoice: 'INV', receipt: 'REC', taxInvoice: 'TAX', receiptTaxInvoice: 'RTX' };
export const LINE_DOCUMENT_TYPES = Object.keys(DOC_NAME) as LineDocumentType[];
/** A receipt records money received: its date and method, and no credit days. */
export const isReceiptType = (type: string) => type === 'receipt' || type === 'receiptTaxInvoice';
/** A tax invoice always carries VAT 7%, as the app sets it. */
export const isTaxType = (type: string) => type === 'taxInvoice' || type === 'receiptTaxInvoice';
/** The ways money is received, as the app's receipt suggests them. */
export const PAYMENT_METHODS = ['โอนเงิน', 'เงินสด', 'พร้อมเพย์', 'เช็ค', 'บัตรเครดิต'];
const C = LINE_CARD_COLORS;

const MONEY = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
const money = (text: string) => { const value = Number(text.replace(/,/g, '')); return Number.isFinite(value) && value > 0 && value <= 1e12 ? value : null; };
// The document words, longest first: "ใบเสร็จรับเงิน/ใบกำกับภาษี" before "ใบเสร็จ", "ใบวางบิล" before "บิล".
const DOC_WORD = '(ใบเสร็จ(?:รับเงิน)?\\s*/?\\s*ใบกำกับภาษี|ใบกำกับภาษี\\s*/?\\s*ใบเสร็จ(?:รับเงิน)?|ใบเสนอราคา|ใบแจ้งหนี้|ใบวางบิล|ใบเสร็จรับเงิน|ใบเสร็จ|ใบกำกับภาษี|ใบกำกับ|บิล)';
const START = new RegExp(`^(?:(ช่วย|รบกวน)\\s*)?(ทำ|ออก|สร้าง|ร่าง|เขียน|ขอ|เพิ่ม|อยากได้|อยากทำ|อยากออก|อยากสร้าง|ต้องการ|วาง|เปิด)?\\s*${DOC_WORD}(\\s*ใหม่)?\\s*([\\s\\S]*)$`, 'u');
function documentTypeOf(word: string): LineDocumentType {
  if (/ใบเสร็จ/.test(word) && /ใบกำกับ/.test(word)) return 'receiptTaxInvoice';
  if (/ใบกำกับ/.test(word)) return 'taxInvoice';
  if (/ใบเสร็จ/.test(word)) return 'receipt';
  return word === 'ใบเสนอราคา' ? 'quotation' : 'invoice';
}
/** "โอนแล้ว", "จ่ายเงินสด", "ชำระด้วยพร้อมเพย์": how a receipt's money came in. */
const METHOD = /(?:(?:รับ|จ่าย|ชำระ)(?:เงิน)?\s*)?(?:ด้วย|เป็น|ทาง|โดย|ผ่าน)?\s*(เงินสด|โอนเงิน|โอน|พร้อมเพย์|พร้อมเพ|เช็ค|เช็ก|บัตรเครดิต|บัตร)(?:เงิน)?(?:มา)?(?:แล้ว)?/u;
export function paymentMethodOf(word: string): string {
  return /สด/.test(word) ? 'เงินสด' : /โอน/.test(word) ? 'โอนเงิน' : /พร้อม/.test(word) ? 'พร้อมเพย์' : /เช็/.test(word) ? 'เช็ค' : 'บัตรเครดิต';
}
const FILLER = /(?:\s*(?:ให้หน่อย|หน่อย|ด้วย|นะ|น้า|จ้า|จ้ะ|ครับ|คับ|ค้าบ|ค่ะ|คะ|ที))+$/u;
/** Words that start a client's name, kept with the word after them ("บริษัท แบรนด์เอ"). */
const COMPANY = /^(?:บริษัท|บจก\.?|หจก\.?|ห้างหุ้นส่วน(?:จำกัด)?|ร้าน|คุณ|โรงแรม|โรงเรียน|มูลนิธิ|สำนักงาน|สตูดิโอ|คลินิก|สมาคม|กลุ่ม)/u;
/** A word that begins what the work is ("งานรื้อ…", "ค่าออกแบบ"). */
const WORK = /^(?:งาน|ค่า)/u;
/** Lookup words: "ขอใบเสนอราคา ล่าสุด" finds documents, it does not make one. */
const LOOKUP = /^(?:ล่าสุด|เดือนนี้|เดือนที่แล้ว|ทั้งหมด|เก่า|อันเก่า|ฉบับเก่า|PDF|ไฟล์)$/iu;

const thaiDigits = (text: string) => text.replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - 0x0e50));

/**
 * Reads a request to make a quotation or invoice. Null means it is not one (a lookup such as "ขอใบเสนอราคา คุณเอ" stays
 * with the document search). Whatever cannot be read for sure is left empty for the form, never guessed.
 */
export function parseLineDocumentCreate(input: string): LineDocumentDraft | null {
  if (input.length > 800) return null;
  const text = thaiDigits(input.normalize('NFC')).replace(/\s+/g, ' ').trim();
  const match = START.exec(text);
  if (!match) return null;
  const [, helped, verb, word, fresh] = match;
  if (!helped && !verb && !fresh) return null; // "ใบแจ้งหนี้ คุณเอ" is a search; "ใบเสนอราคาใหม่" is a new one
  // วาง / เปิด only make a bill ("วางบิล", "เปิดบิล"): "เปิดใบเสนอราคา QT-…" opens one that exists.
  if ((verb === 'วาง' || verb === 'เปิด') && word !== 'บิล') return null;
  if (word === 'บิล' && !verb && !helped) return null;
  const type = documentTypeOf(word);
  let rest = match[5].replace(/^ให้\s*(?:หน่อย|ผม|ฉัน|หนู|เรา|กู|เค้า|ที)(?=\s|$)\s*/u, '').replace(FILLER, '').trim();
  rest = rest.replace(/^(?:ให้\s*)?(?:หน่อย|ที)\s*/u, '').trim();
  // "ออกใบเสร็จจากใบแจ้งหนี้ INV-…": issuing on from a document stays with เลขา, which reads the document.
  if (/^จาก|(?:^|\s)(?:QT|INV|REC|TAX|RTX)-\d/u.test(rest)) return null;
  const draft: LineDocumentDraft = { type, client: {}, items: [], vatRate: isTaxType(type) ? 7 : 0, whtRate: 0, ...(rest ? { heard: rest.slice(0, 300) } : {}) };
  // "ขอใบแจ้งหนี้ คุณเอ" looks one up; "ขอใบแจ้งหนี้ให้คุณเอ" (for someone) makes one.
  if (verb === 'ขอ' && !helped && rest && !/^(?:ให้|สำหรับ|ลูกค้า)/u.test(rest) && (!new RegExp(MONEY).test(rest) || LOOKUP.test(rest))) return null;
  if (!rest) return draft;
  if (isReceiptType(type)) {
    const method = METHOD.exec(rest);
    if (method) { draft.paymentMethod = paymentMethodOf(method[1]); rest = rest.replace(method[0], ' '); }
    rest = rest.replace(/(?:ได้)?(?:รับเงิน|ชำระ(?:เงิน)?|จ่าย(?:เงิน)?)(?:ครบ)?(?:แล้ว)?/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  // Taxes and terms, taken out of the words once read.
  if (/(?:\+|รวม|บวก|คิด|มี)?\s*VAT(?:\s*7\s*%?)?|ภาษีมูลค่าเพิ่ม/iu.test(rest)) { draft.vatRate = 7; rest = rest.replace(/(?:\+|รวม|บวก|คิด|มี)?\s*VAT(?:\s*7\s*%?)?|ภาษีมูลค่าเพิ่ม(?:\s*7\s*%?)?/giu, ' '); }
  const wht = /หัก\s*(?:ณ\s*ที่\s*จ่าย)?\s*([1-5])\s*%/u.exec(rest);
  if (wht) { draft.whtRate = Number(wht[1]); rest = rest.replace(wht[0], ' '); }
  const credit = /เครดิต\s*(\d{1,3})\s*วัน/u.exec(rest);
  if (credit) { if (!isReceiptType(type)) draft.creditTerm = Math.min(365, Number(credit[1])); rest = rest.replace(credit[0], ' '); }
  if (isTaxType(type)) draft.vatRate = 7;

  // "20 รูป รูปละ 300": quantity, unit and the price of one.
  let quantity = 1, unit: string | undefined, price: number | null = null;
  const each = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*([ก-๛A-Za-z]{1,12}?)\\s*(?:\\2)?\\s*ละ\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?`, 'u').exec(rest);
  if (each && Number(each[1]) > 0) { quantity = Number(each[1]); unit = each[2]; price = money(each[3]); rest = rest.replace(each[0], ' '); }
  if (price === null) {
    // An amount named as such wins ("ยอด 4,000"); otherwise the last plain number.
    const named = new RegExp(`(?:ยอด|ราคา|รวม|ค่าจ้าง|จำนวนเงิน)\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท|\\.-)?`, 'u').exec(rest);
    const plain = [...rest.matchAll(new RegExp(`(?:^|\\s)(?:฿\\s*)?(${MONEY})\\s*(?:บาท|\\.-)?(?=\\s|$)`, 'gu'))].at(-1);
    const found = named ?? plain;
    if (found) { price = money(found[1]); rest = rest.replace(found[0], ' '); }
  }

  const { client: clientName, work: description } = splitClientWork(rest);
  if (clientName) draft.client.name = clientName.slice(0, 200);
  if (description || price !== null) {
    draft.items.push({ description: description.slice(0, 200), quantity, ...(unit ? { unit } : {}), price: price ?? 0 });
  }
  return draft;
}

/**
 * Who it is for and what the work is, from the words left once amounts are taken out: the client after ให้ / ลูกค้า /
 * สำหรับ (with the word after a business word: "บริษัท แบรนด์เอ", and จำกัด), or a name that starts like a business; the
 * work from a word like "งาน…" on, or the words left. Shared by documents and jobs (lineQuickDraft.ts).
 */
export function splitClientWork(text: string): { client: string; work: string } {
  // "ถ่ายรูปให้ร้านบี" written as one word: split at ให้ when a business word follows (never "ให้คำปรึกษา").
  const tokens = text.replace(FILLER, '').split(/\s+/).filter(Boolean)
    .flatMap(token => { const glued = new RegExp(`^(.+?)ให้(${COMPANY.source.slice(1)}.*)$`, 'u').exec(token); return glued ? [glued[1], `ให้${glued[2]}`] : [token]; });
  let client: string[] = [];
  const takeClient = (at: number, first: string) => {
    const name = [first];
    let next = at + 1;
    if (COMPANY.test(first) && first.replace(COMPANY, '') === '' && tokens[next]) name.push(tokens[next++]);
    if (tokens[next] && /^(?:จำกัด|\(มหาชน\)|จำกัด\s*\(มหาชน\))$/u.test(tokens[next])) name.push(tokens[next++]);
    tokens.splice(at, next - at);
    client = name;
  };
  // ให้ starts a client, except the verbs it starts: ให้คำปรึกษา, ให้บริการ, ให้เช่า…
  const marker = tokens.findIndex(token => /^(?:ให้|ลูกค้า|สำหรับ)/u.test(token) && !/^ให้(?:คำ|บริการ|เช่า|ยืม|ความ|ข้อมูล|การ)/u.test(token));
  if (marker >= 0) {
    const first = tokens[marker].replace(/^(?:ให้|ลูกค้า|สำหรับ)/u, '');
    if (first) { tokens[marker] = first; takeClient(marker, first); }
    else if (tokens[marker + 1]) { tokens.splice(marker, 1); takeClient(marker, tokens[marker]); }
  } else {
    const company = tokens.findIndex(token => COMPANY.test(token));
    if (company >= 0) takeClient(company, tokens[company]);
  }
  const workAt = tokens.findIndex(token => WORK.test(token));
  const work = (workAt >= 0 ? tokens.slice(workAt) : tokens).join(' ').replace(/^(?:เรื่อง|รายการ)\s*/u, '').replace(/[,，]+$/u, '').trim();
  // "12 Ngam ยอด 4,000 งานรื้อ…": with no ให้, the words before the work name the client.
  if (!client.length && workAt > 0) client = tokens.slice(0, workAt);
  return { client: client.join(' ').replace(/[,，]+$/u, '').trim(), work };
}

/** Amounts and terms read the same way for documents and jobs. */
export const LINE_MONEY = MONEY;
export const readMoney = money;
export const normalizeLineText = (input: string) => thaiDigits(input.normalize('NFC')).replace(/\s+/g, ' ').trim();

/**
 * A detail typed in the chat while a document draft is open ("ลูกค้า บริษัท เอ", "ที่อยู่ …", "VAT", "เครดิต 30 วัน",
 * "รายการ ออกแบบโลโก้ 8000", "ยอด 5000"): the draft with it filled in, or null when the message is not one of these (the
 * owner: "ถ้าเขาอยากพิมพ์ลงในแชทเอง ข้อมูลในส่วนนั้นมึงก็เอาไปกรอกให้เขาโดยอัตโนมัติ").
 */
export function applyDocumentFollowUp(draft: LineDocumentDraft, input: string): LineDocumentDraft | null {
  if (input.length > 500) return null;
  const text = normalizeLineText(input).replace(FILLER, '').trim();
  const next: LineDocumentDraft = { ...draft, client: { ...draft.client }, items: draft.items.map(item => ({ ...item })) };
  let match: RegExpExecArray | null;
  if ((match = /^(?:ลูกค้า|ชื่อลูกค้า|ให้)\s*(?:คือ|ชื่อ)?\s*(.{1,200})$/u.exec(text))) next.client.name = match[1].trim();
  else if ((match = /^ที่อยู่(?:ลูกค้า)?\s*(?:คือ)?\s*(.{3,500})$/u.exec(text))) next.client.address = match[1].trim();
  else if ((match = /^(?:เลข(?:ประจำตัว)?ผู้เสียภาษี(?:ลูกค้า)?|เลขภาษี|tax\s*id)\s*(?:คือ)?\s*([\d\s-]{10,20})$/iu.exec(text))) next.client.taxId = match[1].replace(/\D/g, '');
  else if ((match = /^(?:เบอร์(?:โทร)?|โทร(?:ศัพท์)?)(?:ลูกค้า)?\s*(?:คือ)?\s*([\d\s+-]{6,20})$/u.exec(text))) next.client.phone = match[1].trim();
  else if ((match = /^สาขา\s*(.{1,100})$/u.exec(text))) next.client.branch = match[1].trim();
  else if (/^(?:มี|คิด|รวม|บวก|\+)?\s*VAT(?:\s*7\s*%?)?$|^ภาษีมูลค่าเพิ่ม(?:\s*7\s*%?)?$/iu.test(text)) next.vatRate = 7;
  else if (/^ไม่(?:มี|คิด|รวม)\s*VAT$/iu.test(text)) { if (!isTaxType(next.type)) next.vatRate = 0; }
  else if (isReceiptType(next.type) && (match = new RegExp(`^${METHOD.source}$`, 'u').exec(text))) next.paymentMethod = paymentMethodOf(match[1]);
  else if ((match = /^หัก\s*(?:ณ\s*ที่\s*จ่าย)?\s*([1-5])\s*%$/u.exec(text))) next.whtRate = Number(match[1]);
  else if (/^ไม่(?:มี)?หัก(?:\s*ณ\s*ที่\s*จ่าย)?$/u.test(text)) next.whtRate = 0;
  else if ((match = /^เครดิต\s*(\d{1,3})\s*วัน$/u.exec(text))) next.creditTerm = Math.min(365, Number(match[1]));
  else if (/^ไม่มีเครดิต(?:เทอม)?$/u.test(text)) delete next.creditTerm;
  else if ((match = /^หมายเหตุ\s*(.{1,2000})$/u.exec(text))) next.note = match[1].trim();
  else if ((match = new RegExp(`^(?:ยอด|ราคา)\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?$`, 'u').exec(text)) || (match = new RegExp(`^(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?$`, 'u').exec(text))) {
    // An amount alone fills the one line still without a price, or starts the first line.
    const price = money(match[1]);
    if (price === null) return null;
    const open = next.items.filter(item => !(item.price > 0));
    if (open.length === 1) open[0].price = price;
    else if (!next.items.length) next.items.push({ description: '', quantity: 1, price });
    else return null;
  } else if ((match = /^(?:รายการ|เพิ่มรายการ|เพิ่ม)\s*(.{1,300})$/u.exec(text))) {
    let rest = match[1];
    let quantity = 1, unit: string | undefined, price: number | null = null;
    const each = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*([ก-๛A-Za-z]{1,12}?)\\s*(?:\\2)?\\s*ละ\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?`, 'u').exec(rest);
    if (each) { quantity = Number(each[1]); unit = each[2]; price = money(each[3]); rest = rest.replace(each[0], ' '); }
    else {
      const last = [...rest.matchAll(new RegExp(`(?:^|\\s)(?:ยอด|ราคา)?\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?(?=\\s|$)`, 'gu'))].at(-1);
      if (last) { price = money(last[1]); rest = rest.replace(last[0], ' '); }
    }
    const description = rest.replace(/\s+/g, ' ').trim();
    if (!description || next.items.length >= 30) return null;
    // A first line typed before any price replaces the empty one the card started with.
    const blank = next.items.findIndex(item => !item.description && !(item.price > 0));
    const item = { description: description.slice(0, 200), quantity: quantity > 0 ? quantity : 1, ...(unit ? { unit } : {}), price: price ?? 0 };
    if (blank >= 0) next.items[blank] = item; else next.items.push(item);
  } else return null;
  return next;
}

const itemReady = (item: LineDocumentItem) => item.description.trim().length > 0 && item.quantity > 0 && item.price > 0;

/** The parts of the user's own business the LINE form shows and may change (never the logo or the signature). */
export const ISSUER_EDITABLE = ['name', 'address', 'taxId', 'phone', 'email', 'bankName', 'bankAccount', 'bankAccountName'] as const;
export type IssuerEdits = Partial<Record<(typeof ISSUER_EDITABLE)[number], string>>;
const digitCount = (value: string | undefined) => (value || '').replace(/\D/g, '').length;
/**
 * What the user's own business still needs before a document from LINE (owner, 2026-10-30: "ผู้ออกเอกสารต้องมีที่อยู่
 * เลขผู้เสียภาษี เบอร์ด้วย เหมือนออกบิล"): its name, address, 13-digit tax ID and phone. Email and bank stay optional.
 */
export function issuerMissing(issuer: Partial<InvoiceProfile> | null | undefined): string[] {
  const taxDigits = digitCount(issuer?.taxId);
  return [
    ...(issuer?.name?.trim() ? [] : ['ชื่อธุรกิจ']),
    ...(issuer?.address?.trim() ? [] : ['ที่อยู่']),
    ...(taxDigits === 13 ? [] : [taxDigits ? 'เลขผู้เสียภาษี 13 หลัก' : 'เลขผู้เสียภาษี']),
    ...(digitCount(issuer?.phone) >= 9 ? [] : ['เบอร์โทร']),
  ];
}

/** What a document still needs before it can be made (the issuer is the user's own saved business). */
export function documentMissing(draft: LineDocumentDraft, issuer: Partial<InvoiceProfile> | null | undefined): string[] {
  return [
    ...(issuerMissing(issuer).length ? ['ข้อมูลผู้ออกเอกสาร'] : []),
    ...(draft.client.name?.trim() ? [] : ['ลูกค้า']),
    ...(draft.items.length && draft.items.every(itemReady) ? [] : ['รายการและราคา']),
  ];
}

export const baht = (value: number) => `฿${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const itemsTotals = (draft: LineDocumentDraft) => calculateDocumentTotals(draft.items.map((item, at) => ({ id: String(at), ...item })), draft.vatRate, draft.whtRate);

/** The LINE form for this draft (the same LIFF app as the job form), or undefined without one. */
export function documentFormLink(stored: StoredDocumentDraft): string | undefined {
  const liffId = process.env.LIFF_ID;
  if (!liffId || !/^[A-Za-z0-9-]+$/.test(liffId)) return undefined;
  return `https://liff.line.me/${liffId}?draftKind=document&draftKey=${stored.id}`;
}

const missingText = (label: string) => ({ type: 'text', text: label, size: 'sm', color: C.warning, weight: 'bold', align: 'end', flex: 2, wrap: true });
function row(label: string, value: string | undefined) {
  if (value) return lineValueRow(label, value, { bold: false });
  return { type: 'box', layout: 'horizontal', spacing: 'md', margin: 'md', contents: [
    { type: 'text', text: label, size: 'xs', color: C.muted, flex: 1, wrap: true }, missingText('ยังไม่ได้กรอก')] };
}

/** The user's own business on the card: its name with the address, tax ID and phone under it, or what is still missing. */
function issuerRow(issuer: Partial<InvoiceProfile> | null | undefined) {
  const name = issuer?.name?.trim();
  if (!name) return row('ผู้ออกเอกสาร', undefined);
  const small = (text: string, lines = 1) => ({ type: 'text', text, size: 'xxs', color: C.muted, align: 'end', wrap: true, maxLines: lines });
  const gaps = issuerMissing(issuer);
  const details = [
    issuer?.address?.trim() ? small(issuer.address.trim(), 3) : null,
    digitCount(issuer?.taxId) === 13 ? small(`เลขผู้เสียภาษี ${issuer!.taxId!.trim()}`) : null,
    digitCount(issuer?.phone) >= 9 ? small(`โทร ${issuer!.phone!.trim()}`) : null,
    gaps.length ? { ...missingText(`ยังไม่ได้กรอก ${gaps.join(' · ')}`), size: 'xs', flex: undefined } : null,
  ].filter(Boolean);
  return { type: 'box', layout: 'horizontal', spacing: 'md', margin: 'md', contents: [
    { type: 'text', text: 'ผู้ออกเอกสาร', size: 'xs', color: C.muted, flex: 1, wrap: true },
    { type: 'box', layout: 'vertical', flex: 2, spacing: 'xs', contents: [
      { type: 'text', text: name.length > 120 ? `${name.slice(0, 119)}…` : name, size: 'sm', color: C.text, align: 'end', wrap: true }, ...details] },
  ] };
}

/** The draft as a card: what is there, what is still to fill, and the one next step. */
export function buildDocumentDraftCard(stored: StoredDocumentDraft, issuer: Partial<InvoiceProfile> | null): LineMessage {
  const { draft } = stored;
  const name = DOC_NAME[draft.type];
  const missing = documentMissing(draft, issuer);
  const ready = missing.length === 0;
  const totals = itemsTotals(draft);
  const form = documentFormLink(stored);
  const items = draft.items.slice(0, 3).map(item => row(item.description || 'ยังไม่ระบุชื่อรายการ',
    item.price > 0 ? `${item.quantity !== 1 || item.unit ? `${item.quantity.toLocaleString('en-US')} ${item.unit || 'หน่วย'} × ` : ''}${baht(item.price)}` : undefined));
  const optional = draft.client.name ? [!draft.client.address && 'ที่อยู่ลูกค้า', !draft.client.taxId && 'เลขผู้เสียภาษีลูกค้า'].filter(Boolean) : [];
  const card = lineCard({
    title: name, character: 'document', compact: true,
    subtitle: ready ? 'แบบร่าง · พร้อมสร้างเอกสาร' : 'แบบร่าง · ยังไม่ได้สร้างเอกสาร',
    metric: { label: 'ยอดชำระสุทธิ', value: totals.payable > 0 ? baht(totals.payable) : 'ยังไม่มียอด' },
    body: [
      issuerRow(issuer),
      row('ลูกค้า', draft.client.name),
      ...(items.length ? items : [row('รายการ', undefined)]),
      ...(draft.items.length > 3 ? [{ type: 'text', text: `และอีก ${draft.items.length - 3} รายการ`, size: 'xs', color: C.muted, margin: 'sm', align: 'end' }] : []),
      ...(draft.vatRate ? [lineValueRow(`VAT ${draft.vatRate}%`, baht(totals.vatAmount), { bold: false })] : []),
      ...(draft.whtRate ? [lineValueRow(`หัก ณ ที่จ่าย ${draft.whtRate}%`, `−${baht(totals.whtAmount)}`, { bold: false })] : []),
      ...(draft.creditTerm && !isReceiptType(draft.type) ? [lineValueRow('เครดิต', `${draft.creditTerm} วัน`, { bold: false })] : []),
      ...(isReceiptType(draft.type) ? [
        lineValueRow('วันที่รับเงิน', draft.paidDate ? thaiDay(draft.paidDate) : `วันนี้ (${thaiDay(bangkokToday(new Date()))})`, { bold: false }),
        lineValueRow('วิธีชำระ', draft.paymentMethod || 'ไม่ระบุ', { bold: false, ...(draft.paymentMethod ? {} : { color: C.muted }) }),
      ] : []),
      ...(optional.length ? [{ type: 'text', text: `ยังไม่ได้กรอก (ไม่บังคับ): ${optional.join(' · ')}`, size: 'xxs', color: C.muted, margin: 'lg', wrap: true }] : []),
    ],
    note: ready ? 'ตรวจแล้วกด สร้างเอกสาร ได้เลย หรือเพิ่มรายละเอียดในฟอร์มก่อน' : form
      ? 'กรอกส่วนที่ยังขาดในฟอร์มเดียว ไม่ต้องพิมพ์ตอบทีละข้อ'
      : `พิมพ์รายละเอียดในข้อความเดียว เช่น ทำ${name} ให้คุณบี ถ่ายรูปสินค้า 20 รูป รูปละ 300`,
    altText: `${name} แบบร่าง${totals.payable > 0 ? ` ${baht(totals.payable)}` : ''}${ready ? '' : ` · ยังไม่ได้กรอก ${missing.join(', ')}`}`,
  }) as Extract<LineMessage, { type: 'flex' }>;
  const createAction = form
    ? { type: 'uri', label: 'สร้างเอกสาร', uri: `${form}&create=1` }
    : { type: 'postback', label: 'สร้างเอกสาร', data: `doc:create:${stored.id}`, displayText: `สร้าง${name}` };
  const cancel = { type: 'button', style: 'secondary', color: C.subtle, height: 'sm', flex: 1,
    action: { type: 'postback', label: 'ยกเลิก', data: `doc:cancel:${stored.id}`, displayText: 'ยกเลิกเอกสาร' } };
  card.contents = { ...(card.contents as object), footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px', paddingTop: '0px', contents: [
    // สร้างเอกสาร opens the form to create at once, so the page can also be sent as a picture; with no form, a postback.
    // It is always on the card (owner: "ปุ่มเสร็จสิ้นมันยังไม่มี"): with something missing the form comes first, and
    // สร้างเอกสาร opens the form at what is missing instead of creating.
    ready
      ? { type: 'button', style: 'primary', color: C.accent, height: 'sm', action: createAction }
      : form ? { type: 'button', style: 'primary', color: C.accent, height: 'sm', action: { type: 'uri', label: 'กรอกข้อมูล', uri: form } } : null,
    { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
      ...(ready && form ? [{ type: 'button', style: 'secondary', height: 'sm', flex: 2, action: { type: 'uri', label: 'แก้ไข / กรอกเพิ่ม', uri: form } }] : []),
      ...(!ready ? [{ type: 'button', style: 'secondary', height: 'sm', flex: 2, action: createAction }] : []),
      cancel,
    ] },
  ].filter(Boolean) } };
  return card;
}

const thaiDay = (key: string) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));

/** After saving: the document's number, client and total, and the way to open it (and its PDF) in the app. */
export function buildDocumentCreatedCard(record: Invoice): LineMessage {
  const name = DOC_NAME[record.documentType as LineDocumentType] ?? 'เอกสาร';
  const totals = calculateDocumentTotals(record.items, record.vatRate, record.whtRate);
  const open = lineAppLink(`/invoice?${new URLSearchParams({ type: record.documentType, document: record.id })}`, 'ดูเอกสาร · ดาวน์โหลด PDF');
  const card = lineCard({
    title: `สร้าง${name}แล้ว`, subtitle: record.documentNo, character: 'document', compact: true,
    metric: { label: 'ยอดชำระสุทธิ', value: baht(totals.payable) },
    body: [
      lineValueRow('ลูกค้า', record.client.name, { bold: false }),
      lineValueRow('วันที่ออก', thaiDay(record.createdDate), { bold: false }),
      ...(record.dueDate ? [lineValueRow('ครบกำหนดชำระ', thaiDay(record.dueDate), { bold: false })] : []),
      ...(record.paidDate ? [lineValueRow('วันที่รับเงิน', thaiDay(record.paidDate), { bold: false })] : []),
      ...(record.paymentMethod ? [lineValueRow('วิธีชำระ', record.paymentMethod, { bold: false })] : []),
      ...(record.paymentTerm ? [lineValueRow('เงื่อนไขชำระ', record.paymentTerm, { bold: false })] : []),
    ],
    note: 'ยังไม่ได้ส่งให้ลูกค้า · เปิดเอกสารเพื่อตรวจ แก้ไข ดาวน์โหลด PDF หรือออกเอกสารต่อ',
    ...(open ? { footer: open } : {}),
    altText: `สร้าง${name}แล้ว ${record.documentNo} ${record.client.name} ${baht(totals.payable)}`,
  });
  return card;
}

const bangkokToday = (now: Date) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
const PROFILE_FIELDS: (keyof InvoiceProfile)[] = ['name', 'address', 'phone', 'email', 'taxId', 'bankName', 'bankAccount', 'bankAccountName'];

/** The issuer as the app's เลขา copies it: the saved profile and its branding, never its signature. */
export function documentIssuer(profile: unknown): InvoiceProfile {
  const source = profile && typeof profile === 'object' ? profile as Record<string, unknown> : {};
  const result = Object.fromEntries(PROFILE_FIELDS.map(field => [field, typeof source[field] === 'string' ? source[field] : ''])) as unknown as InvoiceProfile;
  for (const field of ['logoUrl', 'logoPosition', 'logoOffset', 'logoHeight', 'website']) if (source[field] !== undefined) (result as unknown as Record<string, unknown>)[field] = source[field];
  return result;
}

/** One document per draft: pressing สร้างเอกสาร twice, or the form and the card together, cannot make two. */
export function documentIdFor(draftId: string): string {
  const hex = createHash('sha256').update(`line-document:${draftId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 | (parseInt(hex[16], 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The saved document for a finished draft: the same shape and numbering as a เลขา draft (unsigned). */
export function buildLineDocumentRecord(draft: LineDocumentDraft, issuer: InvoiceProfile, now = new Date(), id: string = randomUUID()): Invoice {
  const created = bangkokToday(now);
  const record: Invoice = {
    id, assistantDraft: true, documentType: draft.type,
    documentNo: `${DOC_PREFIX[draft.type] ?? 'INV'}-${Number(created.slice(0, 4)) + 543}-${id.slice(0, 8).toUpperCase()}`,
    createdDate: created, issuer,
    client: { name: draft.client.name?.trim() || '', address: draft.client.address?.trim() || '', phone: draft.client.phone?.trim() || '', email: draft.client.email?.trim() || '', taxId: draft.client.taxId?.trim() || '',
      ...(draft.client.branch?.trim() ? { branch: draft.client.branch.trim() } : {}), ...(draft.client.contactName?.trim() ? { contactName: draft.client.contactName.trim() } : {}) },
    items: draft.items.map(item => ({ id: randomUUID(), description: item.description.trim(), quantity: item.quantity, price: item.price, ...(item.unit?.trim() ? { unit: item.unit.trim() } : {}) })),
    vatRate: isTaxType(draft.type) ? 7 : draft.vatRate, whtRate: draft.whtRate,
    ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
  };
  if (isReceiptType(draft.type)) {
    // The money is in: the day it came (the day it is made, unless the form said) and how; no credit days.
    record.paidDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.paidDate || '') ? draft.paidDate : created;
    if (draft.paymentMethod?.trim()) record.paymentMethod = draft.paymentMethod.trim().slice(0, 100);
  } else if (draft.creditTerm) {
    if (draft.type !== 'quotation') record.dueDate = addDays(created, draft.creditTerm); // invoices and tax invoices fall due
    record.paymentTerm = `เครดิต ${draft.creditTerm} วัน`;
  }
  return record;
}

/** A fresh draft identity: a card's buttons act only on the draft they were drawn for. */
export function newDocumentDraft(draft: LineDocumentDraft, now = new Date()): StoredDocumentDraft {
  return { id: randomBytes(8).toString('hex'), createdAt: now.toISOString(), draft };
}

export function isActiveDocumentDraft(stored: unknown, key?: string, now = Date.now()): stored is StoredDocumentDraft {
  if (!stored || typeof stored !== 'object') return false;
  const value = stored as Partial<StoredDocumentDraft>;
  const age = now - Date.parse(value.createdAt || '');
  return typeof value.id === 'string' && /^[a-f0-9]{16}$/.test(value.id) && Number.isFinite(age) && age >= 0 && age < DOCUMENT_DRAFT_TTL_MS
    && !!value.draft && (key === undefined || value.id === key);
}

/** The private slot for the account's one document draft (the same store as the job and expense drafts). */
export async function saveDocumentDraft(user: { user_id: string; notif_settings?: Record<string, unknown> }, stored: StoredDocumentDraft): Promise<void> {
  await patchPrivate(user.user_id, { pendingDocumentDraft: stored });
  user.notif_settings = { ...(user.notif_settings || {}), pendingDocumentDraft: stored };
}
export async function clearDocumentDraft(user: { user_id: string; notif_settings?: Record<string, unknown> }): Promise<void> {
  await patchPrivate(user.user_id, {}, ['pendingDocumentDraft']);
  if (user.notif_settings) delete user.notif_settings.pendingDocumentDraft;
}

/** LINE postbacks of the draft card, as the commands typed in chat. */
export function decodeLineDocumentAction(data: string): string | null {
  const match = /^doc:(create|cancel):([a-f0-9]{16})$/.exec(data);
  return match ? `${match[1] === 'create' ? 'สร้างเอกสาร' : 'ยกเลิกเอกสาร'} ${match[2]}` : null;
}
export function parseDocumentCommand(text: string): { action: 'create' | 'cancel'; key: string } | null {
  const match = /^(สร้างเอกสาร|ยกเลิกเอกสาร) ([a-f0-9]{16})$/.exec(text.trim());
  return match ? { action: match[1] === 'สร้างเอกสาร' ? 'create' : 'cancel', key: match[2] } : null;
}

/**
 * The account's saved issuer and record versions, read fresh (the LINE row carries no documents). `profile` is the
 * whole saved profile (logo and signature too): it stays on the server, so edits from the form are laid over it.
 */
export async function loadDocumentAccount(userId: string): Promise<{ issuer: InvoiceProfile; issuerVersion: number | null; profile?: Record<string, unknown> }> {
  const { supabaseAssistantDb } = await import('../ai/supabaseDb.js');
  const account = await supabaseAssistantDb.loadAccount(userId);
  const version = account.versions['cashflow_documents:issuer_profile'];
  const saved = (account.user as unknown as { issuer_profile?: unknown }).issuer_profile;
  return { issuer: documentIssuer(saved), issuerVersion: typeof version === 'number' ? version : null,
    profile: saved && typeof saved === 'object' ? { ...(saved as Record<string, unknown>) } : {} };
}

/** The saved profile with the form's edits laid over it: everything the form does not show (logo, signature) is kept. */
export function mergeIssuerEdits(profile: Record<string, unknown> | undefined, edits: IssuerEdits): Record<string, unknown> {
  const next: Record<string, unknown> = { ...Object.fromEntries(PROFILE_FIELDS.map(field => [field, ''])), ...(profile || {}) };
  for (const field of ISSUER_EDITABLE) if (typeof edits[field] === 'string') next[field] = edits[field]!.trim();
  return next;
}

/**
 * Saves the document (and, when the form filled in or changed the user's own business, the issuer profile, so the next
 * document has it) through the same checked write as a confirmed เลขา card: validation, versions and the Free
 * plan's document quota. False when it was already saved (the same draft pressed twice) or changed elsewhere.
 */
export async function saveLineDocument(userId: string, record: Invoice, newIssuer?: { profile: Record<string, unknown>; version: number | null }): Promise<boolean> {
  const [{ supabaseAssistantDb }, { proposalChanges }] = await Promise.all([import('../ai/supabaseDb.js'), import('../ai/proposals.js')]);
  const changes = [
    ...proposalChanges({ kind: 'add_document', jobId: record.id, record: record as unknown as Record<string, unknown> }, null),
    ...(newIssuer ? proposalChanges({ kind: 'edit_issuer_profile', jobId: 'issuer_profile', record: newIssuer.profile as unknown as Record<string, unknown> }, newIssuer.version) : []),
  ];
  return supabaseAssistantDb.applyChanges(userId, changes);
}
