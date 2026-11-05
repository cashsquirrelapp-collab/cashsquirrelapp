import React from 'react';
import { ChevronRight, Copy, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { Mascot } from '../../components/mascot/Mascot';
import type { ReferralStatus } from '../../../../shared/referral';
import './referral.css';

// ชวนเพื่อน รับ 200 โทเคน (owner, 2026-11-05; shared/referral.ts). A small button, not a card (owner: "ทำเป็นปุ่มเล็กๆ ...
// ไม่ต้องเป็นการ์ดใหญ่"), then made to stand out and say what the tokens are for ("บอกเขาด้วยว่ามันคือโทเค็นอะไร ... สำหรับการ
// ใช้งานเอเจนต์เลขากระรอก"): the CI orange pill with the squirrel holding its coin in a cream circle and two lines. On
// computers in the overview's header beside the month, on phones under the quick actions, and from เลขา's chat. It opens one dialog after Fastwork's invite card (the owner's reference): the squirrel, "โค้ดนี้ใช้ได้แค่
// 2 คน", the code large with one คัดลอกโค้ด, what the friend has to do, how many have used it; and, for a new member, the
// box to enter the friend's code. Centred on computers, a sheet from the bottom on phones. No LINE.

export function ReferralButton({ phone, tokens, onOpen }: { phone: boolean; tokens: number; onOpen: () => void }) {
  return (
    <button type="button" className={`ref-pill${phone ? ' is-phone' : ''}`} onClick={onOpen} data-testid="referral-button">
      <span className="ref-pill-face" aria-hidden="true"><Mascot mood="happy" action="hold-coin" size={phone ? 38 : 36} /></span>
      <span className="ref-pill-text">
        <b>{tr("ชวนเพื่อน รับ {0} โทเคน", tokens)}</b>
        <small>{tr("สำหรับใช้งานเอเจนต์เลขากระรอก")}</small>
      </span>
      <ChevronRight className="ref-pill-arrow" size={16} aria-hidden="true" />
    </button>
  );
}

export function ReferralDialog({ status, phone, busy, initial, onCopy, onEnter, onClose }: {
  status: ReferralStatus; phone: boolean; busy: boolean; initial: string;
  onCopy: () => void; onEnter: (code: string) => void; onClose: () => void;
}) {
  const used = status.rewarded + status.pending;
  const full = used >= status.perPerson;
  const [code, setCode] = React.useState(initial || 'SQ-');
  const dialogRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`ref-scrim${phone ? ' is-phone' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className="ref-dialog" role="dialog" aria-modal="true" aria-labelledby="ref-dialog-title" data-testid="referral-dialog">
        <button type="button" className="ref-close" onClick={onClose} aria-label={tr("ปิด")}><X size={18} aria-hidden="true" /></button>
        <span className="ref-figure" aria-hidden="true"><Mascot mood="happy" action="wave" animated={false} size={92} /></span>
        <h2 id="ref-dialog-title">{tr("ชวนเพื่อน รับ {0} โทเคน", status.tokens)}</h2>
        <p className="ref-scarce"><b>{tr("โค้ดนี้ใช้ได้แค่ {0} คน", status.perPerson)}</b> {tr("เลือกเพื่อนให้ดี")}</p>
        <div className="ref-codebox">
          <small>{tr("โค้ดชวนเพื่อน")}</small>
          <b data-testid="referral-code">{status.code}</b>
          {full
            ? <span className="ref-done">{tr("โค้ดนี้ใช้ครบ {0} คนแล้ว", status.perPerson)}</span>
            : <button type="button" className="ref-copy-btn" onClick={onCopy}><Copy size={17} aria-hidden="true" />{tr("คัดลอกโค้ด")}</button>}
        </div>
        <p className="ref-note">{tr("เพื่อนสมัครแล้วกรอกโค้ดและบันทึกงานแรก คุณได้ {0} โทเคนสำหรับใช้งานเอเจนต์เลขากระรอก", status.tokens)}</p>
        <p className="ref-count">
          {tr("ใช้แล้ว {0}/{1} คน", used, status.perPerson)}
          {status.rewarded > 0 && <> · {tr("ได้แล้ว {0} โทเคน", (status.rewarded * status.tokens).toLocaleString())}</>}
          {status.pending > 0 && <> · {tr("รอเพื่อนบันทึกงานแรก {0} คน", status.pending)}</>}
          {' · '}{tr("แคมเปญเหลือ {0} สิทธิ์", status.left)}
        </p>
        {status.canEnter && (
          <form className="ref-enter" data-testid="referral-entry" onSubmit={event => { event.preventDefault(); if (!busy) onEnter(code); }}>
            <b>{tr("มีโค้ดจากเพื่อนไหม")}</b>
            <small>{tr("กรอกโค้ดของเพื่อนที่ชวนคุณมา เพื่อนจะได้ {0} โทเคนเมื่อคุณบันทึกงานแรก", status.tokens)}</small>
            <div className="ref-enter-row">
              <input value={code} onChange={event => setCode(event.target.value.toUpperCase())} aria-label={tr("โค้ดของเพื่อน")} maxLength={20}
                autoCapitalize="characters" autoComplete="off" spellCheck={false} data-testid="referral-input" />
              <button type="submit" disabled={busy || code.replace(/[^0-9A-Z]/gi, '').length < 12} data-testid="referral-submit">
                {busy ? tr("กำลังตรวจโค้ด…") : tr("ยืนยันโค้ด")}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
