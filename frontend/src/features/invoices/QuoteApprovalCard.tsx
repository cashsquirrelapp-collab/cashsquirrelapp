import React from 'react';
import { CheckCircle2, Link as LinkIcon } from 'lucide-react';
import type { Invoice } from '../../../../shared/types';
import { quoteRevision } from '../../../../shared/quoteApproval';
import { tr } from '../../i18n/tr';
import './quoteApprovalCard.css';

// A quotation's confirmation link (shared/quoteApproval.ts) as one icon (owner, 2026-11-22: the card was too busy; "เอา
// เป็นแค่ไอคอน ... ให้กด copy link"): a tap makes the link and copies it. Where it stands shows as a few words beside the
// document's details.

const thaiDateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export function quoteApprovalState(invoice: Invoice): 'confirmed' | 'stale' | 'waiting' | null {
  if (invoice.documentType !== 'quotation') return null;
  if (invoice.approval) return invoice.approval.revision === quoteRevision(invoice) ? 'confirmed' : 'stale';
  return invoice.approvalRequestedAt ? 'waiting' : null;
}

/** รอลูกค้ายืนยัน / ลูกค้ายืนยันแล้ว · name · time / แก้ไขหลังลูกค้ายืนยัน, or nothing. */
export function QuoteApprovalStatus({ invoice }: { invoice: Invoice }) {
  const state = quoteApprovalState(invoice);
  if (!state) return null;
  return (
    <span className={`qas is-${state}`} data-testid="quote-approval-status">
      {state === 'confirmed' && <CheckCircle2 size={13} aria-hidden="true" />}
      {state === 'confirmed' ? tr("ลูกค้ายืนยันแล้ว · {0} · {1}", invoice.approval!.name, thaiDateTime(invoice.approval!.at))
        : state === 'stale' ? tr("แก้ไขหลังลูกค้ายืนยัน ส่งลิงก์ใหม่")
          : tr("รอลูกค้ายืนยัน")}
    </span>
  );
}

/** One icon: makes the link and copies it; when copying is not allowed, the link is shown to copy by hand. */
export function QuoteLinkButton({ invoice, onCreateLink, notify, className }: {
  invoice: Invoice;
  onCreateLink: (invoice: Invoice) => Promise<string | null>;
  notify: (title: string, message: string) => void;
  className: string;
}) {
  const [busy, setBusy] = React.useState(false);
  if (invoice.documentType !== 'quotation') return null;
  const label = tr("คัดลอกลิงก์ให้ลูกค้าเซ็นยืนยัน");
  const copy = async () => {
    setBusy(true);
    const made = onCreateLink(invoice);
    let url: string | null = null;
    try {
      // Safari only copies inside the tap itself, so the clipboard is handed the link while it is still being made.
      const Item = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (Item && navigator.clipboard?.write) {
        await navigator.clipboard.write([new Item({ 'text/plain': made.then(value => { url = value; if (!value) throw new Error('no link'); return new Blob([value], { type: 'text/plain' }); }) })]);
      } else {
        url = await made;
        if (!url) throw new Error('no link');
        await navigator.clipboard.writeText(url);
      }
      notify(tr("คัดลอกลิงก์แล้ว"), tr("ส่งลิงก์นี้ให้ลูกค้าทางแชทหรืออีเมล ลูกค้าเปิดแล้วเซ็นยืนยันใบเสนอราคาได้เลย"));
    } catch {
      url = url ?? await made.catch(() => null);
      if (url) notify(tr("ลิงก์ให้ลูกค้ายืนยัน"), tr("คัดลอกลิงก์นี้ส่งให้ลูกค้า: {0}", url));
    } finally { setBusy(false); }
  };
  return (
    <button type="button" className={className} onClick={() => void copy()} disabled={busy} aria-label={label} title={label} data-testid="quote-link-button">
      <LinkIcon className="qlb-icon" size={18} aria-hidden="true" />
    </button>
  );
}
