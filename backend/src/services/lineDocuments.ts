import type { DocumentType } from '../../../shared/types.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { LineMessage } from './line.js';
import { lineAppLink, lineCard, lineSection, lineValueRow } from './lineCards.js';

type RequestedType = Exclude<DocumentType, 'receiptTaxInvoice'>;
export interface LineDocumentRequest { type: RequestedType; query: string }
export interface LineDocumentSummary {
  id: string;
  documentType: DocumentType;
  documentNo: string;
  createdDate: string;
  clientName: string;
}
export interface LineDocumentResults { documents: LineDocumentSummary[]; hasMore: boolean }

const names: Record<RequestedType, string> = {
  quotation: 'ใบเสนอราคา', invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จ', taxInvoice: 'ใบกำกับภาษี',
};
const types: Record<string, RequestedType> = {
  ใบเสนอราคา: 'quotation', ใบแจ้งหนี้: 'invoice', บิล: 'invoice',
  ใบเสร็จ: 'receipt', ใบเสร็จรับเงิน: 'receipt', ใบกำกับภาษี: 'taxInvoice',
};

/** Read commands only. These never issue a new document or call a language model. */
export function parseLineDocumentRequest(text: string): LineDocumentRequest | null {
  // NFC preserves Thai sara-am in “กำกับ”; NFKC splits it and would break keyword matching.
  const normalized = text.normalize('NFC').trim();
  const match = /^(?:(?:ขอ|ดู|ค้นหา|หา|เปิด|ดาวน์โหลด)\s*(?:ไฟล์\s*)?(?:PDF\s*)?)?(ใบเสนอราคา|ใบแจ้งหนี้|ใบเสร็จรับเงิน|ใบเสร็จ|ใบกำกับภาษี|บิล)(?:\s+(.+))?$/iu.exec(normalized);
  if (!match) return null;
  const query = (match[2] || '').replace(/^PDF(?:\s+|$)/iu, '').replace(/^(?:ของ|ลูกค้า|เลขที่|เลข)\s+/u, '').trim();
  // Oversized searches remain deterministic and receive usage help instead of reaching AI.
  return { type: types[match[1]], query };
}

const metadataColumns = 'id,documentType:data->>documentType,documentNo:data->>documentNo,createdDate:data->>createdDate,clientName:data->client->>name';
const limit = 3;
const searchLimit = limit + 1;
const asSummary = (row: unknown): row is LineDocumentSummary => {
  if (!row || typeof row !== 'object') return false;
  const data = row as Record<string, unknown>;
  return typeof data.id === 'string' && data.id.length > 0 && data.id.length <= 128
    && typeof data.documentType === 'string' && ['quotation', 'invoice', 'receipt', 'taxInvoice', 'receiptTaxInvoice'].includes(data.documentType)
    && typeof data.documentNo === 'string' && typeof data.createdDate === 'string'
    && typeof data.clientName === 'string';
};

/** Escape LIKE syntax; text never becomes an or/filter expression or a column name. */
const literalLike = (value: string) => value.replace(/[\\%_*]/g, character => `\\${character}`);

/** The owner comes only from the verified LINE link. Group documents and PDF bytes are not read. */
export async function findLineDocuments(
  ownerId: string,
  request: LineDocumentRequest,
  database = getSupabaseAdmin(),
): Promise<LineDocumentResults> {
  if (!ownerId || !names[request.type] || request.query.length > 120) throw new Error('Invalid document request');
  const allowedTypes = request.type === 'receipt' || request.type === 'taxInvoice'
    ? [request.type, 'receiptTaxInvoice'] : [request.type];
  const base = () => database.from('cashflow_invoices').select(metadataColumns)
    .eq('user_id', ownerId).in('data->>documentType', allowedTypes)
    .order('data->>createdDate', { ascending: false }).order('id', { ascending: false }).limit(searchLimit);
  const query = request.query.trim();
  if (!query) {
    const result = await base();
    if (result.error) throw result.error;
    const documents = (result.data || []).filter(asSummary);
    return { documents: documents.slice(0, limit), hasMore: documents.length > limit };
  }
  // Prefer an exact document number. Otherwise search number and customer independently,
  // retaining the ownership predicate on every request without interpolating raw .or syntax.
  const exact = await base().eq('data->>documentNo', query);
  if (exact.error) throw exact.error;
  const exactDocuments = (exact.data || []).filter(asSummary);
  if (exactDocuments.length) return { documents: exactDocuments.slice(0, limit), hasMore: exactDocuments.length > limit };
  const pattern = `%${literalLike(query)}%`;
  const results = await Promise.all([
    base().ilike('data->>documentNo', pattern),
    base().ilike('data->client->>name', pattern),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const distinct = new Map<string, LineDocumentSummary>();
  for (const result of results) for (const document of (result.data || []).filter(asSummary)) distinct.set(document.id, document);
  const documents = [...distinct.values()].sort((a, b) => b.createdDate.localeCompare(a.createdDate) || b.id.localeCompare(a.id));
  return { documents: documents.slice(0, limit), hasMore: documents.length > limit };
}

export function buildLineDocumentMessages(request: LineDocumentRequest, results?: LineDocumentResults): LineMessage[] {
  const name = names[request.type];
  if (request.query.length > 120) return [{ type: 'text', text: `พิมพ์ “ขอ${name}” ตามด้วยเลขเอกสารหรือชื่อลูกค้าสั้น ๆ เช่น “ขอ${name} ลูกค้าเอ”` }];
  if (!results) return [{ type: 'text', text: 'ตอนนี้ค้นหาเอกสารไม่สำเร็จครับ ลองขอเอกสารอีกครั้งภายหลัง ยังไม่ได้ส่งไฟล์หรือออกเอกสารใหม่' }];
  if (!results.documents.length) return [lineCard({
    title: `ค้นหา${name}`, compact: true, character: 'document', altText: `ไม่พบ${name}ที่บันทึกไว้ในบัญชีส่วนตัว`,
    body: [lineSection(request.query ? `ไม่พบเอกสารที่ตรงกับ “${request.query}” ในบัญชีส่วนตัวที่เชื่อม LINE` : 'ยังไม่มีเอกสารประเภทนี้บันทึกไว้ในบัญชีส่วนตัวที่เชื่อม LINE')],
    footer: lineAppLink(`/invoice?type=${request.type}`, 'เปิดหน้าเอกสาร'),
    note: 'เปิดเอกสารของบัญชีที่เชื่อม LINE · ยังไม่ได้ออกเอกสารใหม่',
  })];
  return results.documents.slice(0, limit).map(document => {
    const tab = document.documentType === 'receiptTaxInvoice' ? 'taxInvoice' : document.documentType;
    const params = new URLSearchParams({ type: tab, document: document.id, from: 'line' });
    return lineCard({
      title: document.documentType === 'receiptTaxInvoice' ? 'ใบเสร็จ / ใบกำกับภาษี' : names[tab],
      compact: true, character: 'document', subtitle: document.documentNo.slice(0, 120) || 'ยังไม่ระบุเลขเอกสาร',
      altText: `${name} ${document.documentNo} · ${document.clientName} · เปิดเอกสาร / PDF`,
      body: [lineValueRow('ลูกค้า', document.clientName || 'ยังไม่ระบุลูกค้า', { bold: false }),
        lineValueRow('วันที่เอกสาร', document.createdDate || 'ยังไม่ระบุวันที่', { bold: false })],
      footer: lineAppLink(`/invoice?${params}`, 'เปิดเอกสาร / PDF'),
      note: `${results.hasMore ? 'แสดง 3 รายการล่าสุดที่ตรงกัน · ระบุเลขเอกสารเพื่อค้นหาให้แคบลง\n' : ''}เปิดเอกสารจากบัญชีที่เชื่อม LINE แล้วดาวน์โหลดหรือแชร์ PDF ให้ลูกค้าได้`,
    });
  });
}
