import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { DocumentType, Invoice, InvoiceItem } from '../../../../shared/types';
import { findThaiBank } from './thaiBanks';
import { calculateDocumentTotals, formatDocDate, formatMoney, thaiBahtText } from './documentMath';

export { calculateDocumentTotals, formatDocDate, formatMoney, thaiBahtText };

// One A4 base template for every accounting document (quotation, invoice, receipt, tax invoice,
// receipt/tax invoice). Preview, print and Save-as-PDF all render this same component -- the
// print window renders <DocumentA4/> with the same DOCUMENT_CSS, so what you see in the preview
// is exactly what is printed. React escapes every text node, so user-entered names/notes stay inert.

export const A4_WIDTH_PX = 793.7; // 210mm @ 96dpi
export const A4_HEIGHT_PX = 1122.5; // 297mm @ 96dpi

export const DOCUMENT_TYPES: DocumentType[] = ['quotation', 'invoice', 'receipt', 'taxInvoice', 'receiptTaxInvoice'];

interface DocumentMeta {
  th: string;
  en: string;
  dateLabel: string;
  dueLabel: string;
  isReceipt: boolean; // shows the "received" block (date / method / amount)
  isQuotation: boolean;
  isTax: boolean;
  prefix: string;
  signatures: [string, string, string, string];
}

export const DOCUMENT_META: Record<DocumentType, DocumentMeta> = {
  quotation: {
    th: 'ใบเสนอราคา', en: 'QUOTATION', dateLabel: 'วันที่เสนอราคา', dueLabel: 'ยืนราคาถึงวันที่',
    isReceipt: false, isQuotation: true, isTax: false, prefix: 'QT',
    signatures: ['ผู้เสนอราคา', 'ผู้อนุมัติเอกสาร', 'ผู้สั่งซื้อ', 'ตราประทับ']
  },
  invoice: {
    th: 'ใบแจ้งหนี้', en: 'INVOICE', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'ครบกำหนดชำระ',
    isReceipt: false, isQuotation: false, isTax: false, prefix: 'INV',
    signatures: ['ผู้ออกเอกสาร', 'ผู้อนุมัติเอกสาร', 'ผู้รับเอกสาร', 'ตราประทับ']
  },
  receipt: {
    th: 'ใบเสร็จรับเงิน', en: 'RECEIPT', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'วันที่รับเงิน',
    isReceipt: true, isQuotation: false, isTax: false, prefix: 'REC',
    signatures: ['ผู้รับเงิน', 'ผู้อนุมัติเอกสาร', 'ผู้จ่ายเงิน', 'ตราประทับ']
  },
  taxInvoice: {
    th: 'ใบกำกับภาษี', en: 'TAX INVOICE', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'ครบกำหนดชำระ',
    isReceipt: false, isQuotation: false, isTax: true, prefix: 'TAX',
    signatures: ['ผู้ออกใบกำกับภาษี', 'ผู้อนุมัติเอกสาร', 'ผู้รับเอกสาร', 'ตราประทับ']
  },
  receiptTaxInvoice: {
    th: 'ใบเสร็จรับเงิน/ใบกำกับภาษี', en: 'RECEIPT / TAX INVOICE', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'วันที่รับเงิน',
    isReceipt: true, isQuotation: false, isTax: true, prefix: 'RTX',
    signatures: ['ผู้รับเงิน', 'ผู้อนุมัติเอกสาร', 'ผู้จ่ายเงิน', 'ตราประทับ']
  }
};

export const getDocumentMeta = (type: string): DocumentMeta => DOCUMENT_META[type as DocumentType] || DOCUMENT_META.invoice;

// ---------------------------------------------------------------------------------------------
// Pagination -- the page height is fixed (A4), so rows are distributed by an estimated height.
// Estimates are deliberately a little generous so a page never overflows.
// ---------------------------------------------------------------------------------------------

const PAGE_PAD_Y = 38; // px, top + bottom padding of a page (see CSS)
const PAGENO_H = 22; // page-number line pinned under the content
const CONTENT_H = A4_HEIGHT_PX - PAGE_PAD_Y * 2 - PAGENO_H;
const TABLE_HEAD_H = 34;
const CONT_HEAD_H = 50;

export const DEFAULT_LOGO_HEIGHT = 96;
export const MIN_LOGO_HEIGHT = 40;
export const MAX_LOGO_HEIGHT = 200;
const TITLE_ROW_H = 62;

// Height taken by the logo + title area at the top of the first page
const topAreaHeight = (issuer: Invoice['issuer']): number => {
  if (issuer.logoUrl && (issuer.logoPosition === 'center' || issuer.logoPosition === 'custom')) return logoHeightOf(issuer) + TITLE_ROW_H + 12;
  return Math.max(96, logoHeightOf(issuer) + 22);
};

const logoHeightOf = (issuer: { logoHeight?: number }): number =>
  Math.min(MAX_LOGO_HEIGHT, Math.max(MIN_LOGO_HEIGHT, issuer.logoHeight || DEFAULT_LOGO_HEIGHT));

const lineCount = (text: string | undefined, charsPerLine: number): number => {
  if (!text) return 0;
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
};

const rowHeight = (item: InvoiceItem): number =>
  12 + 15 * Math.max(1, lineCount(item.description, 46)) + (item.detail ? 14 * lineCount(item.detail, 52) : 0);

const firstHeadHeight = (invoice: Invoice): number => {
  const issuerLines = lineCount(invoice.issuer.address, 46) + 2;
  const clientLines = lineCount(invoice.client.address, 46) + 2 + (invoice.client.contactName ? 1 : 0);
  return topAreaHeight(invoice.issuer) + 30 + Math.max(issuerLines * 17, 62) + 24 + Math.max(clientLines * 17, 62) + 24;
};

const footerHeight = (invoice: Invoice, meta: DocumentMeta): number => {
  const payment = meta.isQuotation ? 0 : 70;
  const remark = 32 + 14 * Math.max(1, lineCount(invoice.note, 90));
  return 118 + payment + remark + 128;
};

export const paginateItems = (invoice: Invoice): InvoiceItem[][] => {
  const meta = getDocumentMeta(invoice.documentType);
  const foot = footerHeight(invoice, meta);
  const pages: InvoiceItem[][] = [[]];
  let available = CONTENT_H - firstHeadHeight(invoice) - TABLE_HEAD_H;
  for (const item of invoice.items) {
    const h = rowHeight(item);
    if (h > available && pages[pages.length - 1].length > 0) {
      pages.push([]);
      available = CONTENT_H - CONT_HEAD_H - TABLE_HEAD_H;
    }
    pages[pages.length - 1].push(item);
    available -= h;
  }
  // The summary/signature block is pinned to the bottom of the last page; if the last page
  // has no room left for it, it gets a page of its own rather than overflowing.
  if (available < foot) pages.push([]);
  return pages;
};

// ---------------------------------------------------------------------------------------------
// Styles -- layout follows the formal Thai reference sheet; colour identity is our orange theme
// ---------------------------------------------------------------------------------------------

export const DOCUMENT_FONT_URL = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Sarabun:wght@300;400;500;600;700&display=swap';

export const DOCUMENT_CSS = `
.da4{--da4-accent:#E65F2B;--da4-tint:#FCE9DD;--da4-line:#CFC8C0;--da4-ink:#1F1B18;--da4-muted:#4A433D;
  font-family:'Outfit','Sarabun','Noto Sans Thai',system-ui,sans-serif;color:var(--da4-ink);font-size:11px;line-height:1.45;font-weight:400;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left}
.da4 *{box-sizing:border-box}
.da4 b,.da4 .b{font-weight:600}
.da4-page{position:relative;width:210mm;height:297mm;padding:38px 10mm;background:#fff;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page}
.da4-page:last-child{page-break-after:auto;break-after:auto}
.da4-ico{width:11px;height:11px;flex:none;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.da4-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
.da4-logo-slot{display:flex;align-items:center;min-width:0}
.da4-logo{max-width:280px;object-fit:contain;display:block}
.da4-titlebox{text-align:right}
.da4-top.pos-right{flex-direction:row-reverse}
.da4-top.pos-right .da4-titlebox{text-align:left}
.da4-top.pos-center,.da4-top.pos-custom{flex-direction:column;align-items:stretch;gap:8px}
.da4-top.pos-center .da4-titlebox,.da4-top.pos-custom .da4-titlebox{align-self:flex-end}
.da4-top.pos-center .da4-logo-slot,.da4-top.pos-custom .da4-logo-slot{position:relative;width:100%}
.da4-top.pos-center .da4-logo,.da4-top.pos-custom .da4-logo{position:absolute;top:0;left:var(--da4-x,50%);transform:translateX(calc(var(--da4-x,50%) * -1))}
.da4-titlebox .orig{font-size:10px;font-weight:400;margin-bottom:9px;letter-spacing:.02em}
.da4-titlebox h1{margin:0;font-size:27px;line-height:1.2;font-weight:700;color:var(--da4-accent);display:inline-block;padding-bottom:5px;border-bottom:3px solid var(--da4-accent)}
.da4-headgrid{display:grid;grid-template-columns:1fr 32%;column-gap:14px;margin-top:14px}
.da4-party{display:grid;grid-template-columns:1fr 36%;column-gap:10px;padding:8px 0}
.da4-party + .da4-party{border-top:1px solid var(--da4-line)}
.da4-kv{display:grid;grid-template-columns:62px 1fr;row-gap:2px;font-size:10.5px}
.da4-kv .k{font-weight:600;color:var(--da4-muted)}
.da4-kv .v{word-break:break-word;white-space:pre-line}
.da4-kv .v.name{font-weight:600}
.da4-contact{font-size:10px;display:flex;flex-direction:column;gap:3px}
.da4-contact div{display:flex;gap:7px;align-items:flex-start;word-break:break-all}
.da4-meta{background:var(--da4-tint);border-left:3px solid var(--da4-accent);border-radius:0;padding:8px 12px;font-size:10.5px;align-self:start;margin-top:8px}
.da4-meta div{display:grid;grid-template-columns:82px 1fr;gap:4px}
.da4-meta .k{font-weight:600}
.da4-callback{font-weight:500;font-size:10.5px;margin:10px 0 0 12px}
.da4-cont{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid var(--da4-line)}
.da4-cont strong{font-size:15px;font-weight:700;color:var(--da4-accent)}
.da4-cont span{font-size:10px}
.da4-table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}
.da4-table th{background:var(--da4-tint);font-size:10.5px;font-weight:600;padding:8px 6px;height:34px;text-align:right}
.da4-table th:first-child{text-align:left;padding-left:8px}
.da4-table td{padding:7px 6px 3px;vertical-align:top;font-size:10.5px;text-align:right;font-variant-numeric:tabular-nums}
.da4-table td.desc{text-align:left;padding-left:8px;word-break:break-word;white-space:pre-line}
.da4-table td.desc .n{display:inline-block;width:16px}
.da4-table td.desc .sub{font-size:10px;padding-left:16px;white-space:pre-line}
.da4-table tr{page-break-inside:avoid;break-inside:avoid}
.da4-grow{flex:1 1 auto;min-height:0}
.da4-foot{margin-top:auto}
.da4-sec{display:grid;grid-template-columns:100px 1fr;border-top:1px solid var(--da4-line);padding:9px 0}
.da4-sec > .lab{display:flex;gap:5px;align-items:flex-start;font-weight:600;font-size:10.5px;color:var(--da4-accent)}
.da4-sum{display:grid;grid-template-columns:1fr 36%;column-gap:14px}
.da4-sumrows{display:grid;grid-template-columns:1fr auto;column-gap:16px;row-gap:5px;font-size:10.5px;align-content:start}
.da4-sumrows .l{font-weight:600}
.da4-sumrows .r{text-align:right}
.da4-sumrows .r.txt{grid-column:2}
.da4-totalbox{background:var(--da4-tint);border-left:3px solid var(--da4-accent);border-radius:0;padding:9px 12px;display:flex;justify-content:space-between;align-items:baseline;font-weight:600}
.da4-totalbox .amt{font-size:17px;font-weight:500}
.da4-totalbox .amt small{font-size:9.5px}
.da4-minirows{display:grid;grid-template-columns:1fr auto;row-gap:2px;font-size:10px;margin:8px 8px 0 12px}
.da4-minirows .l{font-weight:600}
.da4-minirows .r{text-align:right;padding-left:14px}
.da4-pay{display:grid;grid-template-columns:200px 1fr auto;column-gap:14px;font-size:10.5px}
.da4-pay .kv2{display:grid;grid-template-columns:auto 1fr;row-gap:5px;column-gap:14px;align-content:start}
.da4-pay .kv2 .k{font-weight:600;white-space:nowrap}
.da4-pay .kv2 span{white-space:nowrap}
.da4-chip{display:inline-block;border:1px solid var(--da4-accent);color:var(--da4-accent);font-size:8.5px;font-weight:600;line-height:1;padding:2px 4px;margin-right:5px;vertical-align:1px}
.da4-bank{display:flex;gap:6px;align-items:flex-start}
.da4-remark{min-height:26px;font-size:10.5px;white-space:pre-line;word-break:break-word}
.da4-sig{display:grid;grid-template-columns:repeat(5,1fr);column-gap:8px;font-size:9.5px;text-align:center}
.da4-sig .role{font-weight:600;font-size:9.5px;line-height:1.3;min-height:26px}
.da4-sig .area{height:58px;border-bottom:1px dashed #8C857D;display:flex;align-items:center;justify-content:center}
.da4-sig .area.noline{border-bottom:none}
.da4-sig .area img{max-width:100%;max-height:52px;object-fit:contain}
.da4-sig .area.box{border:1px dashed #8C857D;border-radius:0;height:62px}
.da4-sig .under{margin-top:4px;min-height:14px;font-size:9.5px}
.da4-pageno{text-align:center;font-size:9px;margin-top:6px}
.da4-sheet{display:flex;flex-direction:column;gap:16px}
.da4-sheet .da4-page{box-shadow:0 6px 24px rgba(28,25,23,.16);border-radius:2px}
.da4-print-root .da4-page{box-shadow:none;border-radius:0}
`;

export const PRINT_PAGE_CSS = `
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#fff}
`;

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

type IconName = 'phone' | 'mail' | 'globe' | 'clipboard' | 'banknote' | 'message' | 'pen' | 'landmark';

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6" /></>,
  banknote: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  landmark: <path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2 3 8h18z" />
};

const Ico: React.FC<{ name: IconName }> = ({ name }) => (
  <svg className="da4-ico" viewBox="0 0 24 24" aria-hidden="true">{ICON_PATHS[name]}</svg>
);

interface DocumentA4Props {
  invoice: Invoice;
  // Print window: no on-screen shadow/gap
  print?: boolean;
}

export const DocumentA4: React.FC<DocumentA4Props> = ({ invoice, print }) => {
  const meta = getDocumentMeta(invoice.documentType);
  const totals = calculateDocumentTotals(invoice.items, invoice.vatRate, invoice.whtRate);
  const pages = paginateItems(invoice);
  const totalPages = pages.length;
  const { issuer, client } = invoice;
  const showPayment = !meta.isQuotation;
  const receivedAmount = invoice.paidAmount ?? totals.payable;
  const isLastPage = (index: number) => index === totalPages - 1;
  const startNo = (index: number) => pages.slice(0, index).reduce((sum, rows) => sum + rows.length, 0);
  const payDate = meta.isReceipt ? invoice.paidDate || invoice.dueDate : invoice.dueDate;
  const clientTitle = `${client.code ? `${client.code} ` : ''}${client.name || '-'}${client.branch ? ` (${client.branch})` : ''}`;

  return (
    <div className={`da4 ${print ? 'da4-print-root' : ''}`}>
      <div className={print ? undefined : 'da4-sheet'}>
        {pages.map((rows, pageIndex) => (
          <section className="da4-page" key={pageIndex} data-page={pageIndex + 1}>
            {pageIndex === 0 ? (
              <>
                {/* Logo slot stays reserved even when no logo is uploaded (Profile → logo) */}
                <div
                  className={`da4-top ${issuer.logoPosition === 'right' ? 'pos-right' : issuer.logoPosition === 'center' ? 'pos-center' : issuer.logoPosition === 'custom' ? 'pos-custom' : ''}`}
                  style={{
                    minHeight: (issuer.logoPosition === 'center' || issuer.logoPosition === 'custom') && issuer.logoUrl ? undefined : logoHeightOf(issuer) + 10,
                    ['--da4-x' as string]: `${issuer.logoPosition === 'custom' ? Math.min(100, Math.max(0, issuer.logoOffset ?? 50)) : 50}%`
                  }}
                >
                  <div className="da4-logo-slot" style={{ height: logoHeightOf(issuer), minWidth: issuer.logoPosition === 'center' || issuer.logoPosition === 'custom' ? 0 : 150 }}>
                    {issuer.logoUrl ? <img className="da4-logo" style={{ maxHeight: logoHeightOf(issuer) }} src={issuer.logoUrl} alt="" /> : null}
                  </div>
                  <div className="da4-titlebox">
                    {meta.isTax ? <div className="orig">(ต้นฉบับ)</div> : null}
                    <h1>{meta.th}</h1>
                  </div>
                </div>

                <div className="da4-headgrid">
                  <div>
                    <div className="da4-party">
                      <dl className="da4-kv" style={{ margin: 0 }}>
                        <span className="k">ผู้ขาย :</span><span className="v name">{issuer.name || '-'}</span>
                        <span className="k">ที่อยู่ :</span><span className="v">{issuer.address || '-'}</span>
                        <span className="k">เลขที่ภาษี :</span><span className="v">{issuer.taxId || '-'}</span>
                      </dl>
                      <div className="da4-contact">
                        <div><Ico name="phone" /><span>{issuer.phone || '-'}</span></div>
                        <div><Ico name="mail" /><span>{issuer.email || '-'}</span></div>
                        {issuer.website ? <div><Ico name="globe" /><span>{issuer.website}</span></div> : null}
                      </div>
                    </div>
                    <div className="da4-party">
                      <dl className="da4-kv" style={{ margin: 0 }}>
                        <span className="k">ลูกค้า :</span><span className="v name">{clientTitle}</span>
                        <span className="k">ที่อยู่ :</span><span className="v">{client.address || '-'}</span>
                        <span className="k">เลขที่ภาษี :</span><span className="v">{client.taxId || '-'}</span>
                        <span className="k">เรียน :</span><span className="v">{client.contactName || '-'}</span>
                      </dl>
                      <div className="da4-contact">
                        <div><Ico name="phone" /><span>{client.phone || '-'}</span></div>
                        <div><Ico name="mail" /><span>{client.email || '-'}</span></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="da4-meta">
                      <div><span className="k">เลขที่เอกสาร :</span><span>{invoice.documentNo || '-'}</span></div>
                      <div><span className="k">วันที่ออก :</span><span>{formatDocDate(invoice.createdDate) || '-'}</span></div>
                      {!meta.isReceipt && invoice.dueDate ? <div><span className="k">{meta.dueLabel} :</span><span>{formatDocDate(invoice.dueDate)}</span></div> : null}
                      {meta.isQuotation && invoice.responseDate ? <div><span className="k">วันที่ตอบรับ :</span><span>{formatDocDate(invoice.responseDate)}</span></div> : null}
                      <div><span className="k">อ้างอิง :</span><span>{invoice.refNo || ''}</span></div>
                    </div>
                    <div className="da4-callback">ติดต่อกลับที่ :</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="da4-cont">
                <strong>{meta.th}</strong>
                <span>เลขที่ {invoice.documentNo || '-'} · {client.name}</span>
              </div>
            )}

            {rows.length > 0 || pageIndex === 0 ? (
              <table className="da4-table">
                <colgroup>
                  <col />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>คำอธิบาย</th>
                    <th>จำนวน</th>
                    <th>ราคา</th>
                    <th>ส่วนลด</th>
                    <th>VAT</th>
                    <th>มูลค่าก่อนภาษี</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, i) => (
                    <tr key={item.id}>
                      <td className="desc">
                        <span className="n">{startNo(pageIndex) + i + 1}.</span><span className="b">{item.description || '-'}</span>
                        {item.detail ? <div className="sub">{item.detail}</div> : null}
                      </td>
                      <td>{formatMoney(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</td>
                      <td>{formatMoney(item.price)}</td>
                      <td>{formatMoney(item.discount || 0)}</td>
                      <td>{invoice.vatRate}%</td>
                      <td>{formatMoney(item.quantity * item.price - (item.discount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            <div className="da4-grow" />

            {isLastPage(pageIndex) ? (
              <div className="da4-foot">
                <div className="da4-sec">
                  <div className="lab"><Ico name="clipboard" />สรุป</div>
                  <div className="da4-sum">
                    <div className="da4-sumrows">
                      <span className="l">{invoice.vatRate > 0 ? `มูลค่าที่คำนวณภาษี ${invoice.vatRate}%` : 'มูลค่าก่อนภาษี'}</span>
                      <span className="r">{formatMoney(totals.subtotal)} บาท</span>
                      {invoice.vatRate > 0 ? (
                        <>
                          <span className="l">ภาษีมูลค่าเพิ่ม {invoice.vatRate}%</span>
                          <span className="r">{formatMoney(totals.vatAmount)} บาท</span>
                        </>
                      ) : null}
                      <span className="l">จำนวนเงินทั้งสิ้น</span>
                      <span className="r txt">{thaiBahtText(totals.total)}</span>
                    </div>
                    <div>
                      <div className="da4-totalbox">
                        <span>จำนวนเงินทั้งสิ้น</span>
                        <span className="amt">{formatMoney(totals.total)} <small>บาท</small></span>
                      </div>
                      <div className="da4-minirows">
                        <span className="l">จำนวนเงินที่ถูกหัก ณ ที่จ่าย{invoice.whtRate > 0 ? ` ${invoice.whtRate}%` : ''}</span>
                        <span className="r">{formatMoney(totals.whtAmount)} บาท</span>
                        <span className="l" style={{ textAlign: 'right' }}>จำนวนเงินที่ชำระ:</span>
                        <span className="r">{formatMoney(totals.payable)} บาท</span>
                      </div>
                    </div>
                  </div>
                </div>

                {showPayment ? (
                  <div className="da4-sec">
                    <div className="lab"><Ico name="banknote" />ชำระเงิน</div>
                    <div className="da4-pay">
                      <div className="kv2">
                        <span className="k">{meta.isReceipt ? 'วันที่ชำระ :' : 'กำหนดชำระ :'}</span><span>{formatDocDate(payDate) || '-'}</span>
                        <span className="k">จำนวนเงินรวม :</span><span>{formatMoney(meta.isReceipt ? receivedAmount : totals.payable)} บาท</span>
                      </div>
                      <div>
                        {issuer.bankAccount ? (
                          <div className="da4-bank">
                            <Ico name="landmark" />
                            <div>
                              <div>
                                {findThaiBank(issuer.bankName) ? <span className="da4-chip">{findThaiBank(issuer.bankName)!.code}</span> : null}
                                {issuer.bankName}{meta.isReceipt && invoice.paymentMethod ? ` (${invoice.paymentMethod})` : ''}
                              </div>
                              <div className="b">เลขที่บัญชี {issuer.bankAccount}</div>
                              <div>{issuer.bankAccountName || issuer.name}</div>
                            </div>
                          </div>
                        ) : meta.isReceipt && invoice.paymentMethod ? <div>{invoice.paymentMethod}</div> : null}
                      </div>
                      <div>{meta.isReceipt ? `${formatMoney(receivedAmount)} บาท` : ''}</div>
                    </div>
                  </div>
                ) : null}

                <div className="da4-sec">
                  <div className="lab"><Ico name="message" />หมายเหตุ</div>
                  <div className="da4-remark">{invoice.note || ''}</div>
                </div>

                <div className="da4-sec">
                  <div className="lab"><Ico name="pen" />รับรอง</div>
                  <div className="da4-sig">
                    <div>
                      <div className="role">{meta.signatures[0]} (ผู้ขาย)</div>
                      <div className="area">{issuer.signatureUrl ? <img src={issuer.signatureUrl} alt="" /> : null}</div>
                      <div className="under">{formatDocDate(invoice.createdDate)}</div>
                    </div>
                    <div>
                      <div className="role">{meta.signatures[1]} (ผู้ขาย)</div>
                      <div className="area" />
                      <div className="under">{formatDocDate(invoice.createdDate)}</div>
                    </div>
                    <div>
                      <div className="role">ตราประทับ (ผู้ขาย)</div>
                      <div className="area noline">{issuer.logoUrl ? <img src={issuer.logoUrl} alt="" /> : null}</div>
                    </div>
                    <div>
                      <div className="role">{meta.signatures[2]} (ลูกค้า)</div>
                      <div className="area" />
                      <div className="under b">{client.name}</div>
                    </div>
                    <div>
                      <div className="role">ตราประทับ (ลูกค้า)</div>
                      <div className="area box" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="da4-pageno">หน้า {pageIndex + 1} / {totalPages}</div>
          </section>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// On-screen preview: paper stays A4-sized and is scaled down to fit the available width
// ---------------------------------------------------------------------------------------------

// `crop` shows only the top N px of the first page (used for the live header preview);
// `maxScale` caps how large the paper is drawn.
export const DocumentPreview: React.FC<{ invoice: Invoice; crop?: number; maxScale?: number }> = ({ invoice, crop, maxScale = 1 }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const pageCount = useMemo(() => paginateItems(invoice).length, [invoice]);

  useEffect(() => {
    // Sarabun for Thai text; the same stylesheet is linked in the print window
    const id = 'da4-font';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = DOCUMENT_FONT_URL;
      document.head.appendChild(link);
    }
  }, []);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(maxScale, Math.max(0.3, el.clientWidth / A4_WIDTH_PX)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sheetHeight = crop ? crop * scale : (pageCount * A4_HEIGHT_PX + (pageCount - 1) * 16) * scale;
  return (
    <div ref={hostRef} className="w-full" data-testid="document-preview">
      <style>{DOCUMENT_CSS}</style>
      <div style={{ height: sheetHeight, width: A4_WIDTH_PX * scale, margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ width: A4_WIDTH_PX, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <DocumentA4 invoice={invoice} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Print / Save as PDF -- opens a same-origin window rendering the exact same component
// ---------------------------------------------------------------------------------------------

const printShell = (invoice: Invoice): string => {
  const meta = getDocumentMeta(invoice.documentType);
  const title = `${meta.th}_${invoice.documentNo}`.replace(/[<>&"']/g, '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<link href="${DOCUMENT_FONT_URL}" rel="stylesheet"><style>${PRINT_PAGE_CSS}${DOCUMENT_CSS}</style></head><body><div id="root"></div></body></html>`;
};

// Returns false when the browser blocked the popup
export const printDocument = (invoice: Invoice): boolean => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.write(printShell(invoice));
  printWindow.document.close();
  // React renders the same <DocumentA4/> straight into the print window (it escapes every text
  // node, so user-entered names/notes stay inert there too).
  const root = createRoot(printWindow.document.getElementById('root')!);
  flushSync(() => root.render(<DocumentA4 invoice={invoice} print />));
  const printNow = () => printWindow.setTimeout(() => printWindow.print(), 150);
  void printWindow.document.fonts.ready.then(printNow);
  return true;
};
