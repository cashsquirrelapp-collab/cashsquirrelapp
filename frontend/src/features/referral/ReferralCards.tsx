import React from 'react';
import { ChevronRight, Copy, Gift, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { Mascot } from '../../components/mascot/Mascot';
import { isReferralCode, normalizeCode, type ReferralStatus } from '../../../../shared/referral';
import './referral.css';

// ใส่โค้ด รับ 200 โทเคน, แนะนำเพื่อนร่วมอาชีพ (owner, 2026-11-05; shared/referral.ts). Small buttons, not a card ("ทำเป็นปุ่ม
// เล็กๆ"), the CI orange pill with the squirrel holding its coin and two short lines ("บอกเขาด้วยว่ามันคือโทเค็นอะไร").
// Round 2 ("กูอยากให้มันมีปุ่มให้ใส่โค้ด ... โค้ดกูจะได้ประมาณสัก 5 สิทธิ์ ... แนะนำกันต่อกันเอง"): an account that may still
// enter a code has the orange "ใส่โค้ด รับ 200 โทเคน" (and, on computers and iPads, a small "แนะนำเพื่อนร่วมอาชีพ" beside
// it); after that the orange pill is "แนะนำเพื่อนร่วมอาชีพ". The words are for people at work, not a social app (owner:
// "ชวนเพื่อน ... มันเหมือนไม่ใช่แอปบัญชี" → "แนะนำเพื่อนร่วมอาชีพ"). One window with three faces: entering a code, the tokens given (with
// the way on to passing the code on), and the account's own code after Fastwork's invite card. Centred on computers, a
// sheet from the bottom on phones. No LINE.

export type ReferralView = 'enter' | 'share';

export function ReferralButtons({ phone, status, onOpen }: { phone: boolean; status: ReferralStatus; onOpen: (view: ReferralView) => void }) {
  const enter = status.canEnter;
  return (
    <div className={`ref-buttons${phone ? ' is-phone' : ''}`}>
      <button type="button" className={`ref-pill${phone ? ' is-phone' : ''}`} onClick={() => onOpen(enter ? 'enter' : 'share')} data-testid="referral-button">
        <span className="ref-pill-face" aria-hidden="true"><Mascot mood="happy" action="hold-coin" size={phone ? 38 : 36} /></span>
        <span className="ref-pill-text">
          <b>{enter ? tr("ใส่โค้ด รับ {0} โทเคน", status.tokens) : tr("แนะนำเพื่อนร่วมอาชีพ")}</b>
          <small>{enter ? tr("สำหรับใช้งานเอเจนต์เลขากระรอก") : tr("ให้ใช้เลขากระรอกฟรี {0} โทเคน", status.tokens)}</small>
        </span>
        <ChevronRight className="ref-pill-arrow" size={16} aria-hidden="true" />
      </button>
      {enter && !phone && (
        <button type="button" className="ref-chip" onClick={() => onOpen('share')} data-testid="referral-share-button">
          <Gift size={15} aria-hidden="true" />{tr("แนะนำเพื่อนร่วมอาชีพ")}
        </button>
      )}
    </div>
  );
}

export function ReferralDialog({ status, phone, busy, initial, view: firstView, onCopy, onEnter, onChat, onClose }: {
  status: ReferralStatus; phone: boolean; busy: boolean; initial: string; view: ReferralView;
  onCopy: () => void; onEnter: (code: string) => Promise<boolean>; onChat: () => void; onClose: () => void;
}) {
  const [view, setView] = React.useState<ReferralView | 'done'>(firstView);
  // Empty, with the shape of a code as its hint (owner: "ตัด SQ ออก ... เป็นเงาพื้นหลัง"); a pasted code is cleaned at once.
  const [code, setCode] = React.useState(initial ? normalizeCode(initial) : '');
  const dialogRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const limited = status.perPerson !== null;
  const full = limited && status.used >= status.perPerson!;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (await onEnter(code)) setView('done');
  };
  const link = (to: ReferralView, label: string, testId: string) => (
    <button type="button" className="ref-switch" onClick={() => setView(to)} data-testid={testId}>{label}<ChevronRight size={15} aria-hidden="true" /></button>
  );
  return (
    <div className={`ref-scrim${phone ? ' is-phone' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className="ref-dialog" role="dialog" aria-modal="true" aria-labelledby="ref-dialog-title" data-testid="referral-dialog" data-view={view}>
        <button type="button" className="ref-close" onClick={onClose} aria-label={tr("ปิด")}><X size={18} aria-hidden="true" /></button>
        {view === 'enter' && <>
          <span className="ref-figure" aria-hidden="true"><Mascot mood="happy" action="hold-coin" animated={false} size={92} /></span>
          <h2 id="ref-dialog-title">{tr("ใส่โค้ด รับ {0} โทเคน", status.tokens)}</h2>
          <p className="ref-scarce">{tr("ใช้งานเอเจนต์เลขากระรอกฟรี · กรอกได้ครั้งเดียว")}</p>
          <form className="ref-enter" data-testid="referral-entry" onSubmit={event => { void submit(event); }}>
            <input value={code} onChange={event => setCode(event.target.value.toUpperCase())} aria-label={tr("โค้ดแนะนำ")} maxLength={40}
              onPaste={event => { const text = event.clipboardData.getData('text'); if (text) { event.preventDefault(); setCode(normalizeCode(text)); } }}
              placeholder="SQ-XXXXXXXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} data-testid="referral-input" />
            <button type="submit" disabled={busy || !isReferralCode(code)} data-testid="referral-submit">
              {busy ? tr("กำลังตรวจโค้ด…") : tr("รับโทเคน")}
            </button>
          </form>
          <p className="ref-count">{tr("แคมเปญเหลือ {0} สิทธิ์", status.left)}</p>
          {status.code && link('share', tr("มีโค้ดของตัวเองด้วย แนะนำเพื่อนร่วมอาชีพ"), 'referral-to-share')}
        </>}
        {view === 'done' && <>
          <span className="ref-figure" aria-hidden="true"><Mascot mood="celebrate" action="celebrate" animated={false} size={92} /></span>
          <h2 id="ref-dialog-title">{tr("ได้รับ {0} โทเคนแล้ว", status.tokens)}</h2>
          <p className="ref-scarce">{tr("ใช้คุยกับเลขากระรอกได้เลย")}</p>
          <div className="ref-actions">
            <button type="button" className="ref-copy-btn" onClick={onChat} data-testid="referral-chat">{tr("คุยกับเลขากระรอก")}</button>
            {status.code && <button type="button" className="ref-second-btn" onClick={() => setView('share')} data-testid="referral-pass-on">{tr("แนะนำเพื่อนร่วมอาชีพ")}</button>}
          </div>
        </>}
        {view === 'share' && <>
          <span className="ref-figure" aria-hidden="true"><Mascot mood="happy" action="wave" animated={false} size={92} /></span>
          <h2 id="ref-dialog-title">{tr("แนะนำเพื่อนร่วมอาชีพ")}</h2>
          <p className="ref-scarce">{limited
            ? <><b>{tr("โค้ดนี้ใช้ได้แค่ {0} คน", status.perPerson)}</b> {tr("เลือกคนที่ได้ใช้จริง")}</>
            : <b>{tr("โค้ดนี้ใช้ได้ไม่จำกัดจำนวน")}</b>}</p>
          <div className="ref-codebox">
            <small>{tr("โค้ดของคุณ")}</small>
            <b data-testid="referral-code">{status.code}</b>
            {full
              ? <span className="ref-done">{tr("โค้ดนี้ใช้ครบ {0} คนแล้ว", status.perPerson)}</span>
              : <button type="button" className="ref-copy-btn" onClick={onCopy}><Copy size={17} aria-hidden="true" />{tr("คัดลอกโค้ด")}</button>}
          </div>
          <p className="ref-note">{tr("คนที่กรอกโค้ดของคุณ ได้ {0} โทเคนใช้เลขากระรอกฟรี", status.tokens)}</p>
          <p className="ref-count">
            {limited ? tr("ใช้แล้ว {0}/{1} คน", status.used, status.perPerson) : tr("ใช้แล้ว {0} คน", status.used)}
            {' · '}{tr("แคมเปญเหลือ {0} สิทธิ์", status.left)}
          </p>
          {status.canEnter && link('enter', tr("มีโค้ดแนะนำอยู่แล้ว ใส่โค้ด รับ {0} โทเคน", status.tokens), 'referral-to-enter')}
        </>}
      </section>
    </div>
  );
}
