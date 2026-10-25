import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { calculateDocumentTotals } from '../../../frontend/src/features/invoices/documentMath.js';
import { isValidDateKey } from '../../../shared/incomeExport.js';
import type { Invoice, InvoiceProfile } from '../../../shared/types.js';
import { prepareProposal } from './proposals.js';
import type { ToolContext } from './tools.js';
import type { ToolOutcome, ToolSpec } from './types.js';

const text = z.string().trim().max(10000);
const short = z.string().trim().max(500);
const date = z.string().refine(value => isValidDateKey(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200, 'Use a real Gregorian YYYY-MM-DD date');
const money = z.number().finite().min(0).max(1e12);
const profileFields = { name: short.optional(), address: text.optional(), phone: short.optional(), email: short.optional(), tax_id: short.optional() };
const clientSchema = z.object({ ...profileFields, contact_name: short.optional(), code: short.optional(), branch: short.optional() }).strict();
const itemSchema = z.object({ description: short.min(1), quantity: z.number().finite().positive().max(1e12), price: money,
  discount: money.optional(), unit: short.optional(), detail: text.optional() }).strict()
  .refine(item => item.quantity * item.price <= 1e12 && (item.discount ?? 0) <= item.quantity * item.price, 'Discount cannot exceed the line amount');
const fields = {
  document_type: z.enum(['quotation', 'invoice']).optional(), document_no: short.min(1).optional(),
  client: clientSchema.optional(), issuer: z.object(profileFields).strict().optional(),
  items: z.array(itemSchema).min(1).max(30).optional(),
  created_date: date.optional(), due_date: date.optional(), response_date: date.optional(),
  vat_rate: z.number().finite().min(0).max(100).optional(), wht_rate: z.number().finite().min(0).max(100).optional(),
  note: text.optional(), payment_term: text.optional(), delivery_term: text.optional(), ref_no: short.optional(),
};
const createSchema = z.object(fields).strict();
const editSchema = z.object({ ...fields, document_id: short.min(1) }).strict();
const deleteSchema = z.object({ document_id: short.min(1) }).strict();
const string = (description: string) => ({ type: 'string', description });
const partyArgs = { type: 'object', properties: {
  name: string('Name supplied by the user'), address: string('Address if supplied'), phone: string('Phone if supplied'),
  email: string('Email if supplied'), tax_id: string('Tax ID if supplied; never invent'),
} };
const properties = {
  document_type: { type: 'string', enum: ['quotation', 'invoice'], description: 'Quotation or invoice only; no receipt or tax invoice.' },
  document_no: string('Optional exact number supplied by user; otherwise generate a unique number'),
  client: { ...partyArgs, properties: { ...partyArgs.properties, contact_name: string('Contact if supplied'), code: string('Client code if supplied'), branch: string('Branch if supplied') } },
  issuer: { ...partyArgs, description: 'Only supplied issuer details. Omitted fields use own saved issuer profile; no signature.' },
  items: { type: 'array', maxItems: 30, items: { type: 'object', properties: {
    description: string('Service/product name'), quantity: { type: 'number', description: 'Quantity, explicitly supplied or one for one quoted service' },
    price: { type: 'number', description: 'Unit price in baht before VAT and WHT' }, discount: { type: 'number', description: 'Flat line discount in baht, not percent' },
    unit: string('Unit if supplied'), detail: string('Extra line detail if supplied'),
  }, required: ['description', 'quantity', 'price'] } },
  created_date: string('YYYY-MM-DD, defaults today in Bangkok'), due_date: string('Payment due YYYY-MM-DD if supplied'), response_date: string('Acceptance date YYYY-MM-DD if supplied'),
  vat_rate: { type: 'number', description: 'VAT percent explicitly supplied; zero by default, displayed for review' },
  wht_rate: { type: 'number', description: 'WHT percent explicitly supplied; zero by default, displayed for review' },
  note: string('Note if supplied'), payment_term: string('Payment terms if supplied'), delivery_term: string('Delivery terms if supplied'), ref_no: string('Reference number if supplied'),
};
export const DOCUMENT_ACTION_TOOLS: ToolSpec[] = [
  { name: 'propose_add_document', description: 'Prepare and save an ordinary quotation/invoice through a confirmation card. Fill supplied details and own issuer profile; ask together for missing client, issuer name, and priced items. The card shows lines, taxes, dates and totals. No signature, receipt, payment posting, external send or import. On confirmation it becomes a normal editable app document.', parameters: { type: 'object', properties, required: ['document_type', 'client', 'items'] } },
  { name: 'propose_edit_document', description: 'Prepare edits to an own quotation/invoice identified by search_documents. Pass only requested fields; items replaces all lines, so read the full document first. Does not record payment or send the document.', parameters: { type: 'object', properties: { document_id: string('Own document ID from search_documents'), ...properties }, required: ['document_id'] } },
  { name: 'propose_delete_document', description: 'Prepare deleting an own quotation/invoice. Confirmation is required. This removes the saved document, never any job or payment.', parameters: { type: 'object', properties: { document_id: string('Own document ID from search_documents') }, required: ['document_id'] } },
];
export const isDocumentActionTool = (name: string) => DOCUMENT_ACTION_TOOLS.some(tool => tool.name === name);
const fail = (error: string, missing?: string[]): ToolOutcome => ({ result: { ok: false, error, ...(missing ? { missing } : {}) } });
const baht = (value: number) => `฿${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const docName = (type: string) => type === 'quotation' ? 'ใบเสนอราคา' : 'ใบแจ้งหนี้';
export const documentPath = (record: Pick<Invoice, 'id' | 'documentType'>) => `/invoice?${new URLSearchParams({ type: record.documentType, document: record.id })}`;
const optionalFields = { due_date: 'dueDate', response_date: 'responseDate', note: 'note', payment_term: 'paymentTerm', delivery_term: 'deliveryTerm', ref_no: 'refNo' } as const;
const partyFields = { name: 'name', address: 'address', phone: 'phone', email: 'email', tax_id: 'taxId', contact_name: 'contactName', code: 'code', branch: 'branch' } as const;
const setParty = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(source)) target[partyFields[key as keyof typeof partyFields]] = value;
};
function ownIssuer(value: unknown): InvoiceProfile {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: InvoiceProfile = { name: '', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
  for (const field of Object.keys(result) as (keyof InvoiceProfile)[]) if (typeof source[field] === 'string') (result as unknown as Record<string, unknown>)[field] = source[field];
  // Copy branding, but creating a draft never attaches the account's saved signature.
  for (const field of ['logoUrl', 'logoPosition', 'logoOffset', 'logoHeight', 'website']) if (source[field] !== undefined) (result as unknown as Record<string, unknown>)[field] = source[field];
  return result;
}
export async function executeDocumentAction(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolOutcome> {
  if (!isDocumentActionTool(name)) return fail('ไม่รู้จักคำสั่งเอกสารนี้');
  const source = context.user as typeof context.user & { invoices?: Invoice[]; issuer_profile?: InvoiceProfile };
  const docs = source.invoices || [];
  const schema = name === 'propose_add_document' ? createSchema : name === 'propose_edit_document' ? editSchema : deleteSchema;
  const parsed = schema.safeParse(args);
  if (!parsed.success) return fail('รายละเอียดเอกสารไม่ถูกต้อง ตรวจวันที่ จำนวน ราคา และส่วนลด โดยใช้เฉพาะข้อมูลที่ผู้ใช้ระบุ');
  const input = parsed.data as z.infer<typeof editSchema>;
  const existing = name !== 'propose_add_document' ? docs.find(doc => doc.id === input.document_id) : undefined;
  if (name !== 'propose_add_document' && !existing) return fail('ไม่พบเอกสารนี้ในบัญชีที่เข้าสู่ระบบ');
  if (existing && !['quotation', 'invoice'].includes(existing.documentType)) return fail('เครื่องมือนี้แก้ไขได้เฉพาะใบเสนอราคาและใบแจ้งหนี้');
  if (name === 'propose_edit_document' && existing && (existing.issuer.signatureUrl || (!existing.assistantDraft && source.issuer_profile?.signatureUrl))) {
    return fail('เอกสารนี้มีลายเซ็น กรุณาเปิดหน้าเอกสารเพื่อตรวจหรือทำสำเนาฉบับใหม่ก่อนแก้ไข เลขาจะไม่เปลี่ยนเนื้อหาที่มีลายเซ็น');
  }
  if (name === 'propose_delete_document') return prepareProposal(context, { kind: 'delete_document', id: existing!.id, record: null,
    title: `ลบ${docName(existing!.documentType)} ${existing!.documentNo}`, changes: [{ label: 'เอกสารที่จะลบ', value: `${existing!.documentNo} · ${existing!.client.name}` }, { label: 'ผลการลบ', value: 'ลบเอกสารที่บันทึกไว้ โดยไม่เปลี่ยนงานหรือรายการรับเงิน' }] });
  if (existing && Object.keys(args).length === 1) return fail('ระบุรายละเอียดเอกสารที่ต้องการเปลี่ยน');
  const id = existing?.id ?? randomUUID();
  const now = new Date((context.now?.getTime() ?? Date.now()) + 7 * 3600_000).toISOString().slice(0, 10);
  const type = input.document_type ?? existing?.documentType;
  const missing: string[] = [];
  if (!type) missing.push('ประเภทเอกสาร (ใบเสนอราคาหรือใบแจ้งหนี้)');
  const record: Invoice = existing ? structuredClone(existing) : {
    id, assistantDraft: true, documentType: type ?? 'quotation', documentNo: '', createdDate: now, issuer: ownIssuer(source.issuer_profile),
    client: { name: '', address: '', phone: '', email: '', taxId: '' }, items: [], vatRate: 0, whtRate: 0,
  };
  if (type) record.documentType = type;
  record.createdDate = input.created_date ?? record.createdDate;
  record.documentNo = input.document_no ?? (existing?.documentNo || `${type === 'invoice' ? 'INV' : 'QT'}-${Number(record.createdDate.slice(0, 4)) + 543}-${id.slice(0, 8).toUpperCase()}`);
  if (docs.some(doc => doc.id !== id && doc.documentNo.toLowerCase() === record.documentNo.toLowerCase())) return fail('เลขที่เอกสารนี้มีอยู่แล้ว กรุณาใช้เลขอื่นหรือไม่ระบุเพื่อให้สร้างเลขใหม่');
  if (input.issuer) setParty(record.issuer as unknown as Record<string, unknown>, input.issuer);
  if (input.client) setParty(record.client, input.client);
  if (!record.issuer.name.trim()) missing.push('ชื่อผู้ออกเอกสาร (ยังไม่มีในโปรไฟล์)');
  if (!record.client.name.trim()) missing.push('ชื่อลูกค้าหรือบริษัทผู้รับบริการ');
  // The client is never the issuer (owner, 2026-10-25: เลขา offered the client's name as the issuer's): the issuer is
  // the account's own business, asked with an issuer party question when none is saved.
  const sameParty = (a: string, b: string) => { const key = (value: string) => value.replace(/\s+|บริษัท|จำกัด|\(มหาชน\)|co\.?|ltd\.?|company|limited/gi, '').toLowerCase(); return Boolean(key(a)) && key(a) === key(b); };
  if (record.issuer.name.trim() && record.client.name.trim() && sameParty(record.issuer.name, record.client.name)) {
    return fail('ชื่อผู้ออกเอกสารตรงกับชื่อลูกค้า ผู้ออกเอกสารคือธุรกิจของผู้ใช้เอง ให้ถามข้อมูลผู้ออกเอกสารของผู้ใช้ (ask_user แบบ party role issuer)', ['ข้อมูลผู้ออกเอกสารของผู้ใช้เอง (ไม่ใช่ลูกค้า)']);
  }
  if (input.items) record.items = input.items.map(item => ({ ...item, id: randomUUID() }));
  if (!record.items.length) missing.push('รายการสินค้า/บริการ พร้อมจำนวนและราคาต่อหน่วย');
  if (missing.length) return fail('ขอข้อมูลที่จำเป็นเหล่านี้พร้อมกันก่อนเตรียมเอกสาร', missing);
  if (input.vat_rate !== undefined) record.vatRate = input.vat_rate;
  if (input.wht_rate !== undefined) record.whtRate = input.wht_rate;
  for (const [from, to] of Object.entries(optionalFields)) if (input[from as keyof typeof optionalFields] !== undefined) (record as unknown as Record<string, unknown>)[to] = input[from as keyof typeof optionalFields];
  const totals = calculateDocumentTotals(record.items, record.vatRate, record.whtRate);
  if (Object.values(totals).some(value => !Number.isFinite(value) || value < 0 || value > 1e12)) return fail('ยอดรวมเอกสารไม่ถูกต้องหรือเกินขอบเขตที่แอปรองรับ');
  const changes = [
    { label: 'เอกสาร', value: `${docName(record.documentType)} ${record.documentNo}` },
    { label: 'ผู้ออก / ลูกค้า', value: `${record.issuer.name} → ${record.client.name}` },
    ...([['ผู้ออก', record.issuer], ['ลูกค้า', record.client]] as const).flatMap(([label, party]) =>
      (['address', 'phone', 'email', 'taxId'] as const).flatMap(key => party[key] ? [{ label: `${label} · ${{ address: 'ที่อยู่', phone: 'โทรศัพท์', email: 'อีเมล', taxId: 'เลขผู้เสียภาษี' }[key]}`, value: party[key] }] : [])),
    ...(['contactName', 'code', 'branch'] as const).flatMap(key => record.client[key] ? [{ label: `ลูกค้า · ${{ contactName: 'ผู้ติดต่อ', code: 'รหัสลูกค้า', branch: 'สาขา' }[key]}`, value: record.client[key]! }] : []),
    ...([['ผู้ออก', input.issuer], ['ลูกค้า', input.client]] as const).flatMap(([label, supplied]) => Object.entries(supplied || {}).filter(([, value]) => value === '').map(([key]) => ({ label: `${label} · ${key}`, value: 'เว้นว่างตามที่ระบุ' }))),
    { label: 'วันที่', value: record.createdDate },
    ...record.items.flatMap((item, index) => [{ label: `รายการ ${index + 1}`, value: `${item.description} · ${item.quantity} ${item.unit || 'หน่วย'} × ${baht(item.price)}${item.discount ? ` · ลด ${baht(item.discount)}` : ''}` },
      ...(item.detail ? [{ label: `รายละเอียดรายการ ${index + 1}`, value: item.detail }] : [])]),
    { label: 'รวมก่อนภาษี', value: baht(totals.subtotal) },
    { label: `VAT ${record.vatRate}%`, value: baht(totals.vatAmount) },
    { label: `หัก ณ ที่จ่าย ${record.whtRate}%`, value: baht(totals.whtAmount) },
    { label: 'ยอดชำระสุทธิ', value: baht(totals.payable) },
    ...Object.values(optionalFields).flatMap(key => record[key] ? [{ label: ({ dueDate: 'กำหนดชำระ', responseDate: 'วันที่ตอบรับ', note: 'หมายเหตุ', paymentTerm: 'เงื่อนไขชำระ', deliveryTerm: 'เงื่อนไขส่งมอบ', refNo: 'อ้างอิง' })[key], value: record[key]! }] : []),
    { label: 'เมื่อยืนยัน', value: 'บันทึกในหน้าเอกสารเพื่อเปิดตรวจและแก้ไข ยังไม่ส่งให้ลูกค้าและไม่บันทึกรับเงิน' },
  ];
  return prepareProposal(context, { kind: existing ? 'edit_document' : 'add_document', id, record: record as unknown as Record<string, unknown>,
    title: `${existing ? 'แก้ไข' : 'สร้าง'}${docName(record.documentType)} ${record.documentNo}`, changes });
}
