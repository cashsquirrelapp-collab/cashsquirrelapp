import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { DocumentType, Invoice, InvoiceItem } from '../../../../shared/types';
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
    signatures: ['ผู้เสนอราคา', 'ผู้อนุมัติ', 'ลูกค้าตอบรับ', 'ตราประทับ']
  },
  invoice: {
    th: 'ใบแจ้งหนี้', en: 'INVOICE', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'ครบกำหนดชำระ',
    isReceipt: false, isQuotation: false, isTax: false, prefix: 'INV',
    signatures: ['ผู้ออกเอกสาร', 'ผู้อนุมัติ', 'ผู้รับเอกสาร', 'ตราประทับ']
  },
  receipt: {
    th: 'ใบเสร็จรับเงิน', en: 'RECEIPT', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'วันที่รับเงิน',
    isReceipt: true, isQuotation: false, isTax: false, prefix: 'REC',
    signatures: ['ผู้รับเงิน', 'ผู้อนุมัติ', 'ผู้จ่ายเงิน', 'ตราประทับ']
  },
  taxInvoice: {
    th: 'ใบกำกับภาษี', en: 'TAX INVOICE', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'ครบกำหนดชำระ',
    isReceipt: false, isQuotation: false, isTax: true, prefix: 'TAX',
    signatures: ['ผู้ออกใบกำกับภาษี', 'ผู้อนุมัติ', 'ผู้รับเอกสาร', 'ตราประทับ']
  },
  receiptTaxInvoice: {
    th: 'ใบเสร็จรับเงิน / ใบกำกับภาษี', en: 'RECEIPT / TAX INVOICE', dateLabel: 'วันที่ออกเอกสาร', dueLabel: 'วันที่รับเงิน',
    isReceipt: true, isQuotation: false, isTax: true, prefix: 'RTX',
    signatures: ['ผู้รับเงิน', 'ผู้อนุมัติ', 'ผู้จ่ายเงิน', 'ตราประทับ']
  }
};

export const getDocumentMeta = (type: string): DocumentMeta => DOCUMENT_META[type as DocumentType] || DOCUMENT_META.invoice;

// ---------------------------------------------------------------------------------------------
// Pagination -- the page height is fixed (A4), so rows are distributed by an estimated height.
// Estimates are deliberately a little generous so a page never overflows.
// ---------------------------------------------------------------------------------------------

const PAGE_PAD_Y = 42; // px, top + bottom padding of a page (see CSS)
const PAGENO_H = 26; // page-number line pinned under the content
const CONTENT_H = A4_HEIGHT_PX - PAGE_PAD_Y * 2 - PAGENO_H;
const TABLE_HEAD_H = 30;
const CONT_HEAD_H = 56;

const lineCount = (text: string | undefined, charsPerLine: number): number => {
  if (!text) return 0;
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
};

const rowHeight = (item: InvoiceItem): number =>
  13 + 15 * Math.max(1, lineCount(item.description, 36)) + (item.detail ? 14 * lineCount(item.detail, 48) : 0);

const firstHeadHeight = (invoice: Invoice): number => {
  const issuerLines = lineCount(invoice.issuer.address, 56) + (invoice.issuer.phone || invoice.issuer.email ? 1 : 0) + (invoice.issuer.taxId ? 1 : 0);
  const clientLines = lineCount(invoice.client.address, 50) + (invoice.client.contactName ? 1 : 0) + (invoice.client.phone || invoice.client.email ? 1 : 0) + (invoice.client.taxId ? 1 : 0);
  return 130 + Math.max(issuerLines * 15, 60) + 32 + Math.max(clientLines * 15 + 62, 132);
};

const footerHeight = (invoice: Invoice, meta: DocumentMeta): number => {
  const totals = calculateDocumentTotals(invoice.items, invoice.vatRate, invoice.whtRate);
  const summaryRows = 2 + (totals.discount > 0 ? 2 : 0) + (invoice.vatRate > 0 ? 1 : 0) + (invoice.whtRate > 0 ? 2 : 0) + (meta.isReceipt ? 2 : 0);
  const summary = summaryRows * 22 + 6;
  const left = 46 + (invoice.issuer.bankAccount && !meta.isQuotation ? 70 : 0) + 30 + lineCount(invoice.note, 56) * 14;
  return Math.max(summary, left) + 128;
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
// Styles -- our app's orange theme on a white sheet
// ---------------------------------------------------------------------------------------------

export const DOCUMENT_FONT_URL = 'https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap';

export const DOCUMENT_CSS = `
.da4{--da4-accent:#E65F2B;--da4-accent-dark:#A63F1B;--da4-tint:#FDF3EC;--da4-head:#FBE3D3;--da4-line:#E8DFD3;--da4-ink:#1C1917;--da4-muted:#6B625A;
  font-family:'Sarabun','Noto Sans Thai',system-ui,sans-serif;color:var(--da4-ink);font-size:11.5px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left}
.da4 *{box-sizing:border-box}
.da4-page{position:relative;width:210mm;height:297mm;padding:11mm 12mm;background:#fff;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page}
.da4-page:last-child{page-break-after:auto;break-after:auto}
.da4-topbar{position:absolute;left:0;right:0;top:0;height:6px;background:var(--da4-accent)}
.da4-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
.da4-issuer{display:flex;gap:12px;flex:1;min-width:0}
.da4-logo{width:64px;height:64px;object-fit:contain;flex:none}
.da4-issuer-name{font-size:15px;font-weight:700;margin:0 0 2px}
.da4-issuer p{margin:0;color:var(--da4-muted);font-size:10.5px;white-space:pre-line}
.da4-title{text-align:right;flex:none;max-width:52%}
.da4-title h1{margin:0;font-size:22px;font-weight:800;color:var(--da4-accent);line-height:1.15}
.da4-title .en{font-size:10px;font-weight:700;letter-spacing:.14em;color:var(--da4-muted);margin-top:2px}
.da4-meta{margin-top:8px;border:1px solid var(--da4-line);border-radius:8px;background:var(--da4-tint);padding:6px 10px;font-size:10.5px;min-width:210px}
.da4-meta div{display:flex;justify-content:space-between;gap:14px}
.da4-meta span:first-child{color:var(--da4-muted)}
.da4-meta strong{font-weight:700}
.da4-cont{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--da4-accent);padding-bottom:6px;margin-bottom:8px}
.da4-cont strong{font-size:14px;color:var(--da4-accent)}
.da4-cont span{font-size:10.5px;color:var(--da4-muted)}
.da4-parties{display:grid;grid-template-columns:1.35fr 1fr;gap:10px;margin-top:14px}
.da4-box{border:1px solid var(--da4-line);border-radius:8px;padding:8px 10px}
.da4-box h3{margin:0 0 5px;font-size:9.5px;font-weight:700;letter-spacing:.08em;color:var(--da4-accent);text-transform:uppercase}
.da4-kv{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;font-size:10.5px}
.da4-kv dt{color:var(--da4-muted);margin:0}
.da4-kv dd{margin:0;font-weight:400;white-space:pre-line;word-break:break-word}
.da4-customer-name{font-size:12.5px;font-weight:700;margin:0 0 3px}
.da4-table{width:100%;border-collapse:collapse;margin-top:12px;table-layout:fixed}
.da4-table th{background:var(--da4-head);color:var(--da4-accent-dark);font-size:10.5px;font-weight:700;padding:6px 7px;border:1px solid var(--da4-line);height:30px}
.da4-table td{padding:5px 7px;border:1px solid var(--da4-line);vertical-align:top;font-size:11px}
.da4-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.da4-table .ctr{text-align:center}
.da4-table .desc{word-break:break-word;white-space:pre-line}
.da4-table .detail{color:var(--da4-muted);font-size:10px;margin-top:1px;white-space:pre-line}
.da4-table tr{page-break-inside:avoid;break-inside:avoid}
.da4-grow{flex:1 1 auto;min-height:0}
.da4-foot{margin-top:auto}
.da4-sumrow{display:grid;grid-template-columns:1fr 46%;gap:14px;align-items:start}
.da4-text-amount{border:1px solid var(--da4-line);border-radius:8px;background:var(--da4-tint);padding:6px 10px;font-weight:700;font-size:11px}
.da4-text-amount small{display:block;color:var(--da4-muted);font-weight:500;font-size:9.5px}
.da4-note h4{margin:8px 0 2px;font-size:9.5px;font-weight:700;letter-spacing:.08em;color:var(--da4-muted);text-transform:uppercase}
.da4-note p{margin:0;font-size:10.5px;white-space:pre-line;word-break:break-word}
.da4-sum{font-size:11px}
.da4-sum div{display:flex;justify-content:space-between;gap:10px;padding:2.5px 0}
.da4-sum .v{font-variant-numeric:tabular-nums;font-weight:600}
.da4-sum .muted{color:var(--da4-muted)}
.da4-sum .total{margin-top:4px;background:var(--da4-accent);color:#fff;border-radius:8px;padding:7px 10px;font-size:13px;font-weight:800}
.da4-sum .total .v{font-weight:800}
.da4-sum .payable{font-weight:700;border-top:1px dashed var(--da4-line);margin-top:4px;padding-top:5px}
.da4-sig{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:22px;text-align:center;font-size:10px}
.da4-sig .line{height:38px;border-bottom:1px dashed #A8A29E}
.da4-sig .stamp{height:38px;border:1px dashed #C9BFB3;border-radius:8px}
.da4-sig .role{font-weight:700;margin-top:4px}
.da4-sig .date{color:var(--da4-muted);font-size:9.5px;margin-top:2px}
.da4-sig .name{font-size:9.5px;color:var(--da4-muted);min-height:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.da4-pageno{text-align:center;font-size:9.5px;color:var(--da4-muted);margin-top:10px}
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

const Row: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) =>
  children ? (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  ) : null;

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
  const showBank = !meta.isQuotation && !!issuer.bankAccount;
  const receivedAmount = invoice.paidAmount ?? totals.payable;
  const isLastPage = (index: number) => index === totalPages - 1;
  const startNo = (index: number) => pages.slice(0, index).reduce((sum, rows) => sum + rows.length, 0);

  return (
    <div className={`da4 ${print ? 'da4-print-root' : ''}`}>
      <div className={print ? undefined : 'da4-sheet'}>
        {pages.map((rows, pageIndex) => (
          <section className="da4-page" key={pageIndex} data-page={pageIndex + 1}>
            <div className="da4-topbar" />

            {pageIndex === 0 ? (
              <>
                <header className="da4-head">
                  <div className="da4-issuer">
                    {issuer.logoUrl ? <img className="da4-logo" src={issuer.logoUrl} alt="" /> : null}
                    <div style={{ minWidth: 0 }}>
                      <p className="da4-issuer-name" style={{ color: 'var(--da4-ink)' }}>{issuer.name || '-'}</p>
                      {issuer.address ? <p>{issuer.address}</p> : null}
                      {issuer.phone || issuer.email ? (
                        <p>{[issuer.phone && `โทร ${issuer.phone}`, issuer.email].filter(Boolean).join('  |  ')}</p>
                      ) : null}
                      {issuer.taxId ? <p>เลขประจำตัวผู้เสียภาษี {issuer.taxId}</p> : null}
                    </div>
                  </div>
                  <div className="da4-title">
                    <h1>{meta.th}</h1>
                    <div className="en">{meta.en}</div>
                    <div className="da4-meta">
                      <div><span>เลขที่</span><strong>{invoice.documentNo || '-'}</strong></div>
                      <div><span>{meta.dateLabel}</span><strong>{formatDocDate(invoice.createdDate) || '-'}</strong></div>
                      {meta.isReceipt ? (
                        invoice.paidDate || invoice.dueDate ? <div><span>{meta.dueLabel}</span><strong>{formatDocDate(invoice.paidDate || invoice.dueDate)}</strong></div> : null
                      ) : invoice.dueDate ? (
                        <div><span>{meta.dueLabel}</span><strong>{formatDocDate(invoice.dueDate)}</strong></div>
                      ) : null}
                      {meta.isQuotation && invoice.responseDate ? <div><span>วันที่ตอบรับ</span><strong>{formatDocDate(invoice.responseDate)}</strong></div> : null}
                      {invoice.refNo ? <div><span>อ้างอิง</span><strong>{invoice.refNo}</strong></div> : null}
                    </div>
                  </div>
                </header>

                <div className="da4-parties">
                  <div className="da4-box">
                    <h3>{meta.isQuotation ? 'เสนอราคาถึง / Customer' : 'ลูกค้า / Customer'}</h3>
                    <p className="da4-customer-name">{client.name || '-'}{client.branch ? ` (${client.branch})` : ''}</p>
                    <dl className="da4-kv">
                      <Row label="รหัสลูกค้า">{client.code}</Row>
                      <Row label="ที่อยู่">{client.address}</Row>
                      <Row label="เลขผู้เสียภาษี">{client.taxId}</Row>
                      <Row label="ผู้ติดต่อ">{client.contactName}</Row>
                      <Row label="โทร">{client.phone}</Row>
                      <Row label="อีเมล">{client.email}</Row>
                    </dl>
                  </div>
                  <div className="da4-box">
                    <h3>เงื่อนไข / Terms</h3>
                    <dl className="da4-kv">
                      <Row label="การชำระเงิน">{invoice.paymentTerm}</Row>
                      <Row label="กำหนดส่งมอบ">{invoice.deliveryTerm}</Row>
                      {meta.isReceipt ? <Row label="วิธีชำระ">{invoice.paymentMethod}</Row> : null}
                      {meta.isReceipt ? <Row label="วันที่ชำระ">{formatDocDate(invoice.paidDate)}</Row> : null}
                      <Row label="ภาษีมูลค่าเพิ่ม">{invoice.vatRate > 0 ? `${invoice.vatRate}%` : meta.isTax ? undefined : 'ไม่มี'}</Row>
                    </dl>
                  </div>
                </div>
              </>
            ) : (
              <div className="da4-cont">
                <strong>{meta.th}</strong>
                <span>เลขที่ {invoice.documentNo || '-'} · {client.name}</span>
              </div>
            )}

            {rows.length > 0 || !isLastPage(pageIndex) || pageIndex === 0 ? (
              <table className="da4-table">
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>ลำดับ</th>
                    <th>รายละเอียด</th>
                    <th>จำนวน</th>
                    <th>หน่วย</th>
                    <th>ราคา/หน่วย</th>
                    <th>ส่วนลด</th>
                    <th>จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, i) => (
                    <tr key={item.id}>
                      <td className="ctr">{startNo(pageIndex) + i + 1}</td>
                      <td>
                        <div className="desc">{item.description || '-'}</div>
                        {item.detail ? <div className="detail">{item.detail}</div> : null}
                      </td>
                      <td className="num">{item.quantity.toLocaleString('en-US')}</td>
                      <td className="ctr">{item.unit || ''}</td>
                      <td className="num">{formatMoney(item.price)}</td>
                      <td className="num">{item.discount ? formatMoney(item.discount) : '-'}</td>
                      <td className="num"><strong>{formatMoney(item.quantity * item.price - (item.discount || 0))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            <div className="da4-grow" />

            {isLastPage(pageIndex) ? (
              <div className="da4-foot">
                <div className="da4-sumrow">
                  <div>
                    <div className="da4-text-amount">
                      <small>จำนวนเงินตัวอักษร</small>
                      ({thaiBahtText(totals.total)})
                    </div>
                    {showBank ? (
                      <div className="da4-note">
                        <h4>ช่องทางชำระเงิน</h4>
                        <p>
                          {issuer.bankName}{'\n'}
                          เลขที่บัญชี {issuer.bankAccount}{'\n'}
                          ชื่อบัญชี {issuer.bankAccountName || issuer.name}
                        </p>
                      </div>
                    ) : null}
                    <div className="da4-note">
                      <h4>หมายเหตุ</h4>
                      <p>{invoice.note || '-'}</p>
                    </div>
                  </div>

                  <div className="da4-sum">
                    {totals.discount > 0 ? (
                      <>
                        <div><span className="muted">รวมเป็นเงิน</span><span className="v">{formatMoney(totals.gross)}</span></div>
                        <div><span className="muted">ส่วนลด</span><span className="v">-{formatMoney(totals.discount)}</span></div>
                      </>
                    ) : null}
                    <div><span className="muted">{invoice.vatRate > 0 ? 'มูลค่าก่อนภาษี' : 'รวมเป็นเงิน'}</span><span className="v">{formatMoney(totals.subtotal)}</span></div>
                    {invoice.vatRate > 0 ? (
                      <div><span className="muted">ภาษีมูลค่าเพิ่ม {invoice.vatRate}%</span><span className="v">{formatMoney(totals.vatAmount)}</span></div>
                    ) : null}
                    <div className="total"><span>จำนวนเงินทั้งสิ้น</span><span className="v">{formatMoney(totals.total)}</span></div>
                    {invoice.whtRate > 0 ? (
                      <>
                        <div className="muted" style={{ marginTop: 4 }}><span>หัก ณ ที่จ่าย {invoice.whtRate}%</span><span className="v">-{formatMoney(totals.whtAmount)}</span></div>
                        <div className="payable"><span>จำนวนเงินที่ชำระ</span><span className="v">{formatMoney(totals.payable)}</span></div>
                      </>
                    ) : null}
                    {meta.isReceipt ? (
                      <div className="payable"><span>ได้รับเงินแล้ว</span><span className="v">{formatMoney(receivedAmount)}</span></div>
                    ) : null}
                  </div>
                </div>

                <div className="da4-sig">
                  {meta.signatures.map((role, i) => (
                    <div key={role}>
                      {i === 1 || i === 3 ? <div className="stamp" /> : <div className="line" />}
                      <div className="role">{role}</div>
                      {i === 0 || i === 2 ? (
                        <>
                          <div className="name">{i === 0 ? issuer.name : client.name}</div>
                          <div className="date">วันที่ ...... / ...... / ..........</div>
                        </>
                      ) : null}
                    </div>
                  ))}
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

export const DocumentPreview: React.FC<{ invoice: Invoice }> = ({ invoice }) => {
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
    const update = () => setScale(Math.min(1, Math.max(0.3, el.clientWidth / A4_WIDTH_PX)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sheetHeight = (pageCount * A4_HEIGHT_PX + (pageCount - 1) * 16) * scale;
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
