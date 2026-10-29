import React from 'react';
import type { Invoice, InvoiceProfile } from '../../../../../shared/types';
import { A4_HEIGHT_PX, A4_WIDTH_PX, DOCUMENT_CSS, DOCUMENT_FONT_URL, DocumentA4 } from '../../invoices/DocumentA4';
import { tr } from '../../../i18n/tr';

// The landing's documents (owner, 2026-10-29: the pictures looked blurred, like screenshots; "สร้างมันขึ้นมาเองเลย"):
// the app's own A4 document, drawn live with sample data at its real size and scaled down, so every line stays sharp
// at any zoom. A quotation, the invoice issued from it, and its receipt, one after another.

const ISSUER: InvoiceProfile = {
  name: 'สตูดิโอตัวอย่าง', address: '99/9 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110', phone: '081-234-5678',
  email: 'hello@studio.example', taxId: '1234567890123', bankName: 'ธนาคารกสิกรไทย', bankAccount: '123-4-56789-0', bankAccountName: 'สตูดิโอตัวอย่าง',
};
const CLIENT: Invoice['client'] = {
  name: 'บริษัท แบรนด์เอ จำกัด', address: '88 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310', phone: '02-123-4567', email: 'team@brand-a.example',
  taxId: '0105561234567', contactName: 'คุณบี', branch: 'สำนักงานใหญ่',
};
const ITEMS: Invoice['items'] = [
  { id: 'i1', description: 'ถ่ายภาพสินค้า', detail: 'ถ่ายในสตูดิโอ พร้อมรีทัช 20 ภาพ', quantity: 1, unit: 'งาน', price: 6000 },
  { id: 'i2', description: 'ตัดต่อวิดีโอสั้น', detail: 'ความยาว 30 วินาที 1 ชิ้น', quantity: 1, unit: 'ชิ้น', price: 1500 },
];
const base = { issuer: ISSUER, client: CLIENT, items: ITEMS, vatRate: 0, whtRate: 0 };
const DOCS: { invoice: Invoice; label: string }[] = [
  { label: 'ใบเสนอราคา', invoice: { ...base, id: 'qt', documentType: 'quotation', documentNo: 'QT-2569-001', createdDate: '2026-10-01', responseDate: '2026-10-08',
    paymentTerm: 'ชำระเต็มจำนวนหลังส่งงาน', deliveryTerm: 'ส่งงานภายใน 7 วันหลังยืนยัน' } },
  { label: 'ใบแจ้งหนี้', invoice: { ...base, id: 'inv', documentType: 'invoice', documentNo: 'INV-2569-001', createdDate: '2026-10-10', dueDate: '2026-10-25', refNo: 'QT-2569-001' } },
  { label: 'ใบเสร็จ', invoice: { ...base, id: 'rc', documentType: 'receipt', documentNo: 'RC-2569-001', createdDate: '2026-10-24', refNo: 'INV-2569-001',
    paidDate: '2026-10-24', paymentMethod: 'โอนเงิน' } },
];

/** The document type's own font and styles, once for the page. */
function useDocumentStyles() {
  React.useEffect(() => {
    if (!document.getElementById('da4-font')) {
      const link = document.createElement('link');
      link.id = 'da4-font'; link.rel = 'stylesheet'; link.href = DOCUMENT_FONT_URL;
      document.head.appendChild(link);
    }
    if (!document.getElementById('da4-style-landing')) {
      const style = document.createElement('style');
      style.id = 'da4-style-landing'; style.textContent = DOCUMENT_CSS;
      document.head.appendChild(style);
    }
  }, []);
}

/** One A4 sheet at its real size, scaled to the width of its box (measured, so it follows the layout). */
function Sheet({ invoice }: { invoice: Invoice }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.3);
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / A4_WIDTH_PX || 0.3);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="cl-sheet" ref={box}>
      <div className="cl-sheet-in" style={{ width: A4_WIDTH_PX, height: A4_HEIGHT_PX, transform: `scale(${scale})` }}>
        <DocumentA4 invoice={invoice} print />
      </div>
    </div>
  );
}

export function DocsLive() {
  useDocumentStyles();
  return (
    <div className="gl-demo gl-docs" aria-hidden="true">
      {DOCS.map(({ invoice, label }, at) => (
        <figure key={invoice.id} className={`gl-doc is-${at + 1}`} aria-hidden="true">
          <Sheet invoice={invoice} />
          <figcaption>{at > 0 && <span className="gl-doc-arrow">→</span>}{tr(label)}</figcaption>
          {at === 2 && <span className="gl-stamp">{tr('ชำระแล้ว')}</span>}
        </figure>
      ))}
    </div>
  );
}
