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

export type LineDocumentType = 'quotation' | 'invoice';
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
  /** What the user typed, shown in the form for reference (never saved on the document). */
  heard?: string;
}
export interface StoredDocumentDraft { id: string; createdAt: string; draft: LineDocumentDraft }

/** Long enough to fill a document in the form; a card older than this asks for a new one. */
export const DOCUMENT_DRAFT_TTL_MS = 30 * 60 * 1000;
export const DOC_NAME: Record<LineDocumentType, string> = { quotation: 'ใบเสนอราคา', invoice: 'ใบแจ้งหนี้' };
const C = LINE_CARD_COLORS;

const MONEY = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
const money = (text: string) => { const value = Number(text.replace(/,/g, '')); return Number.isFinite(value) && value > 0 && value <= 1e12 ? value : null; };
const START = /^(?:(ช่วย|รบกวน)\s*)?(ทำ|ออก|สร้าง|ร่าง|เขียน|ขอ|อยากได้|อยากทำ|ต้องการ)?\s*(ใบเสนอราคา|ใบแจ้งหนี้|ใบวางบิล)\s*([\s\S]*)$/u;
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
  const [, helped, verb, word] = match;
  if (!helped && !verb) return null;
  const type: LineDocumentType = word === 'ใบเสนอราคา' ? 'quotation' : 'invoice';
  let rest = match[4].replace(/^ให้\s*(?:หน่อย|ผม|ฉัน|หนู|เรา|กู|เค้า|ที)(?=\s|$)\s*/u, '').replace(FILLER, '').trim();
  rest = rest.replace(/^(?:ให้\s*)?(?:หน่อย|ที)\s*/u, '').trim();
  const draft: LineDocumentDraft = { type, client: {}, items: [], vatRate: 0, whtRate: 0, ...(rest ? { heard: rest.slice(0, 300) } : {}) };
  if (verb === 'ขอ' && !helped && rest && (!new RegExp(MONEY).test(rest) || LOOKUP.test(rest))) return null;
  if (!rest) return draft;

  // Taxes and terms, taken out of the words once read.
  if (/(?:\+|รวม|บวก|คิด|มี)?\s*VAT(?:\s*7\s*%?)?|ภาษีมูลค่าเพิ่ม/iu.test(rest)) { draft.vatRate = 7; rest = rest.replace(/(?:\+|รวม|บวก|คิด|มี)?\s*VAT(?:\s*7\s*%?)?|ภาษีมูลค่าเพิ่ม(?:\s*7\s*%?)?/giu, ' '); }
  const wht = /หัก\s*(?:ณ\s*ที่\s*จ่าย)?\s*([1-5])\s*%/u.exec(rest);
  if (wht) { draft.whtRate = Number(wht[1]); rest = rest.replace(wht[0], ' '); }
  const credit = /เครดิต\s*(\d{1,3})\s*วัน/u.exec(rest);
  if (credit) { draft.creditTerm = Math.min(365, Number(credit[1])); rest = rest.replace(credit[0], ' '); }

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

  // The client: after ให้ / ลูกค้า / สำหรับ, or a name that starts like a business.
  const tokens = rest.replace(FILLER, '').split(/\s+/).filter(Boolean);
  let client: string[] = [];
  const takeClient = (at: number, first: string) => {
    const name = [first];
    let next = at + 1;
    if (COMPANY.test(first) && first.replace(COMPANY, '') === '' && tokens[next]) name.push(tokens[next++]);
    if (tokens[next] && /^(?:จำกัด|\(มหาชน\)|จำกัด\s*\(มหาชน\))$/u.test(tokens[next])) name.push(tokens[next++]);
    tokens.splice(at, next - at);
    client = name;
  };
  const marker = tokens.findIndex(token => /^(?:ให้|ลูกค้า|สำหรับ)/u.test(token));
  if (marker >= 0) {
    const first = tokens[marker].replace(/^(?:ให้|ลูกค้า|สำหรับ)/u, '');
    if (first) { tokens[marker] = first; takeClient(marker, first); }
    else if (tokens[marker + 1]) { tokens.splice(marker, 1); takeClient(marker, tokens[marker]); }
  } else {
    const company = tokens.findIndex(token => COMPANY.test(token));
    if (company >= 0) takeClient(company, tokens[company]);
  }
  // What the work is: from a word like "งาน…" on, or the words left.
  const workAt = tokens.findIndex(token => WORK.test(token));
  let description = (workAt >= 0 ? tokens.slice(workAt) : tokens).join(' ').trim();
  // "12 Ngam ยอด 4,000 งานรื้อ…": with no ให้, the words before the work name the client.
  if (!client.length && workAt > 0) client = tokens.slice(0, workAt);
  description = description.replace(/^(?:เรื่อง|รายการ)\s*/u, '').replace(/[,，]+$/u, '').trim();
  const clientName = client.join(' ').replace(/[,，]+$/u, '').trim();
  if (clientName) draft.client.name = clientName.slice(0, 200);
  if (description || price !== null) {
    draft.items.push({ description: description.slice(0, 200), quantity, ...(unit ? { unit } : {}), price: price ?? 0 });
  }
  return draft;
}

const itemReady = (item: LineDocumentItem) => item.description.trim().length > 0 && item.quantity > 0 && item.price > 0;
/** What a document still needs before it can be made (the issuer is the user's own saved business). */
export function documentMissing(draft: LineDocumentDraft, issuerName: string | undefined): string[] {
  return [
    ...(issuerName?.trim() ? [] : ['ผู้ออกเอกสาร']),
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

/** The draft as a card: what is there, what is still to fill, and the one next step. */
export function buildDocumentDraftCard(stored: StoredDocumentDraft, issuer: Pick<InvoiceProfile, 'name'> | null): LineMessage {
  const { draft } = stored;
  const name = DOC_NAME[draft.type];
  const missing = documentMissing(draft, issuer?.name);
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
      row('ผู้ออกเอกสาร', issuer?.name?.trim() || undefined),
      row('ลูกค้า', draft.client.name),
      ...(items.length ? items : [row('รายการ', undefined)]),
      ...(draft.items.length > 3 ? [{ type: 'text', text: `และอีก ${draft.items.length - 3} รายการ`, size: 'xs', color: C.muted, margin: 'sm', align: 'end' }] : []),
      ...(draft.vatRate ? [lineValueRow(`VAT ${draft.vatRate}%`, baht(totals.vatAmount), { bold: false })] : []),
      ...(draft.whtRate ? [lineValueRow(`หัก ณ ที่จ่าย ${draft.whtRate}%`, `−${baht(totals.whtAmount)}`, { bold: false })] : []),
      ...(draft.creditTerm ? [lineValueRow('เครดิต', `${draft.creditTerm} วัน`, { bold: false })] : []),
      ...(optional.length ? [{ type: 'text', text: `ยังไม่ได้กรอก (ไม่บังคับ): ${optional.join(' · ')}`, size: 'xxs', color: C.muted, margin: 'lg', wrap: true }] : []),
    ],
    note: ready ? 'ตรวจแล้วกด สร้างเอกสาร ได้เลย หรือเพิ่มรายละเอียดในฟอร์มก่อน' : form
      ? 'กรอกส่วนที่ยังขาดในฟอร์มเดียว ไม่ต้องพิมพ์ตอบทีละข้อ'
      : `พิมพ์รายละเอียดในข้อความเดียว เช่น ทำ${name} ให้คุณบี ถ่ายรูปสินค้า 20 รูป รูปละ 300`,
    altText: `${name} แบบร่าง${totals.payable > 0 ? ` ${baht(totals.payable)}` : ''}${ready ? '' : ` · ยังไม่ได้กรอก ${missing.join(', ')}`}`,
  }) as Extract<LineMessage, { type: 'flex' }>;
  const cancel = { type: 'button', style: 'secondary', color: C.subtle, height: 'sm', flex: 1,
    action: { type: 'postback', label: 'ยกเลิก', data: `doc:cancel:${stored.id}`, displayText: 'ยกเลิกเอกสาร' } };
  card.contents = { ...(card.contents as object), footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px', paddingTop: '0px', contents: [
    ready
      ? { type: 'button', style: 'primary', color: C.accent, height: 'sm', action: { type: 'postback', label: 'สร้างเอกสาร', data: `doc:create:${stored.id}`, displayText: `สร้าง${name}` } }
      : form ? { type: 'button', style: 'primary', color: C.accent, height: 'sm', action: { type: 'uri', label: 'กรอกข้อมูล', uri: form } } : null,
    { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
      ...(ready && form ? [{ type: 'button', style: 'secondary', height: 'sm', flex: 2, action: { type: 'uri', label: 'แก้ไข / กรอกเพิ่ม', uri: form } }] : []),
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
    documentNo: `${draft.type === 'invoice' ? 'INV' : 'QT'}-${Number(created.slice(0, 4)) + 543}-${id.slice(0, 8).toUpperCase()}`,
    createdDate: created, issuer,
    client: { name: draft.client.name?.trim() || '', address: draft.client.address?.trim() || '', phone: draft.client.phone?.trim() || '', email: draft.client.email?.trim() || '', taxId: draft.client.taxId?.trim() || '',
      ...(draft.client.branch?.trim() ? { branch: draft.client.branch.trim() } : {}), ...(draft.client.contactName?.trim() ? { contactName: draft.client.contactName.trim() } : {}) },
    items: draft.items.map(item => ({ id: randomUUID(), description: item.description.trim(), quantity: item.quantity, price: item.price, ...(item.unit?.trim() ? { unit: item.unit.trim() } : {}) })),
    vatRate: draft.vatRate, whtRate: draft.whtRate,
    ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
  };
  if (draft.creditTerm) {
    if (draft.type === 'invoice') record.dueDate = addDays(created, draft.creditTerm);
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

/** The account's saved issuer and record versions, read fresh (the LINE row carries no documents). */
export async function loadDocumentAccount(userId: string): Promise<{ issuer: InvoiceProfile; issuerVersion: number | null }> {
  const { supabaseAssistantDb } = await import('../ai/supabaseDb.js');
  const account = await supabaseAssistantDb.loadAccount(userId);
  const version = account.versions['cashflow_documents:issuer_profile'];
  return { issuer: documentIssuer((account.user as unknown as { issuer_profile?: unknown }).issuer_profile), issuerVersion: typeof version === 'number' ? version : null };
}

/**
 * Saves the document (and, when the form filled the user's own business for the first time, the issuer profile, so the
 * next document has it) through the same checked write as a confirmed เลขา card: validation, versions and the Free
 * plan's document quota. False when it was already saved (the same draft pressed twice) or changed elsewhere.
 */
export async function saveLineDocument(userId: string, record: Invoice, newIssuer?: { profile: InvoiceProfile; version: number | null }): Promise<boolean> {
  const [{ supabaseAssistantDb }, { proposalChanges }] = await Promise.all([import('../ai/supabaseDb.js'), import('../ai/proposals.js')]);
  const changes = [
    ...proposalChanges({ kind: 'add_document', jobId: record.id, record: record as unknown as Record<string, unknown> }, null),
    ...(newIssuer ? proposalChanges({ kind: 'edit_issuer_profile', jobId: 'issuer_profile', record: newIssuer.profile as unknown as Record<string, unknown> }, newIssuer.version) : []),
  ];
  return supabaseAssistantDb.applyChanges(userId, changes);
}
