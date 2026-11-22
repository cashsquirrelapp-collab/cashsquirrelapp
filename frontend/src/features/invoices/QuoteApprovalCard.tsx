import React from 'react';
import { CheckCircle2, Copy, Link2, Share2, AlertTriangle } from 'lucide-react';
import type { Invoice } from '../../../../shared/types';
import { quoteRevision } from '../../../../shared/quoteApproval';
import { tr } from '../../i18n/tr';
import './quoteApprovalCard.css';

// A quotation's confirmation status and its link (shared/quoteApproval.ts), on computers and phones alike: confirmed
// (who, when), confirmed before an edit (send a new link), or a button to make the link to send the client.

const thaiDateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export function QuoteApprovalCard({ invoice, onCreateLink, notify, compact = false }: {
  invoice: Invoice;
  /** Makes the link (and notes on the quotation that one was sent); the full URL, or null when it failed. */
  onCreateLink: (invoice: Invoice) => Promise<string | null>;
  notify: (title: string, message: string) => void;
  compact?: boolean;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setUrl(null); }, [invoice.id]);
  if (invoice.documentType !== 'quotation') return null;
  const current = invoice.approval && invoice.approval.revision === quoteRevision(invoice);

  const make = async () => {
    setBusy(true);
    const made = await onCreateLink(invoice);
    setBusy(false);
    if (made) setUrl(made);
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); notify(tr("คัดลอกลิงก์แล้ว"), tr("วางลิงก์ในแชทหรืออีเมลถึงลูกค้าได้เลย")); }
    catch { notify(tr("คัดลอกไม่สำเร็จ"), tr("กดค้างที่ลิงก์เพื่อคัดลอกเอง")); }
  };
  const share = async () => {
    if (!url) return;
    const text = tr("ใบเสนอราคา {0} จาก {1} กรุณาตรวจและกดยืนยันที่ลิงก์นี้", invoice.documentNo, invoice.issuer.name || '');
    try { await navigator.share?.({ title: invoice.documentNo, text, url }); } catch { /* closed */ }
  };

  if (current) return (
    <section className={`qac is-done${compact ? ' is-compact' : ''}`} data-testid="quote-approval" aria-label={tr("การยืนยันของลูกค้า")}>
      <CheckCircle2 size={18} aria-hidden="true" />
      <div><b>{tr("ลูกค้ายืนยันแล้ว")}</b><span>{tr("{0} · {1}", invoice.approval!.name, thaiDateTime(invoice.approval!.at))}</span></div>
    </section>
  );

  return (
    <section className={`qac${invoice.approval ? ' is-stale' : ''}${compact ? ' is-compact' : ''}`} data-testid="quote-approval" aria-label={tr("การยืนยันของลูกค้า")}>
      {invoice.approval ? <AlertTriangle size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}
      <div className="qac-body">
        <b>{invoice.approval ? tr("ใบนี้ถูกแก้ไขหลังลูกค้ายืนยัน") : invoice.approvalRequestedAt ? tr("ส่งลิงก์แล้ว รอลูกค้ายืนยัน") : tr("ให้ลูกค้าเซ็นยืนยันผ่านลิงก์")}</b>
        <span>{invoice.approval ? tr("ส่งลิงก์ใหม่ให้ลูกค้ายืนยันฉบับนี้") : tr("ลูกค้าเปิดลิงก์ ดูใบเสนอราคา เซ็นชื่อ แล้วกดยืนยัน ไม่ต้องพิมพ์หรือสแกน")}</span>
        {url ? (
          <div className="qac-link">
            <input type="text" readOnly value={url} aria-label={tr("ลิงก์ให้ลูกค้ายืนยัน")} onFocus={event => event.currentTarget.select()} />
            <div className="qac-actions">
              <button type="button" className="qac-btn" onClick={() => void copy()}><Copy size={15} aria-hidden="true" />{tr("คัดลอกลิงก์")}</button>
              {typeof navigator.share === 'function' && <button type="button" className="qac-btn" onClick={() => void share()}><Share2 size={15} aria-hidden="true" />{tr("แชร์")}</button>}
            </div>
          </div>
        ) : (
          <button type="button" className="qac-btn is-primary" onClick={() => void make()} disabled={busy}>{busy ? tr("กำลังสร้างลิงก์…") : invoice.approvalRequestedAt || invoice.approval ? tr("สร้างลิงก์ใหม่") : tr("สร้างลิงก์ให้ลูกค้ายืนยัน")}</button>
        )}
      </div>
    </section>
  );
}
