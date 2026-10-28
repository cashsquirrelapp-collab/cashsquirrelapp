import React from 'react';
import { useReducedMotion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatBaht, proPriceDetails } from '../../../../shared/proPricing';
import { PromoCountdownChips, useMonthPromoRunning } from './promoNotice';
import { KV_CLIP_CSS, KV_CLIP_HTML } from './proKvClip';
import './plans.css';
import './proKv.css';

// The weekly Pro invitation for accounts not on Pro (owner, 2026-10-29: design B with the character clip; this reverses
// the 2026-10-23 removal of the automatic promos, at the owner's request). Left: a 30 s clip in which two freelancers
// use the real app (KV_CLIP_*, generated from the design canvas). Right: what Pro does, the price and สมัคร Pro.
// ✕ and ไว้ทีหลัง close it until next week (App keeps the date). Computers and iPads: a dialog; phones: a sheet.

const LINE_ICON = '/kv/line.svg';

export default function ProKvBanner({ mobile, onClose, onSubscribe }: { mobile: boolean; onClose: () => void; onSubscribe: () => void }) {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  const promoRunning = useMonthPromoRunning();
  const price = proPriceDetails('month');
  const cardRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clip = reduce
    ? <img className="pkv-poster" src="/kv/poster.jpg" alt="" />
    : <div className="pkv-clip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: KV_CLIP_HTML }} />;
  const ticks = <ul className="pkv-ticks">
    <li><span className="pkv-tick"><Check size={11} strokeWidth={3.2} /></span>{tr('หลายโปรเจกต์ก็บอกทีเดียว น้องแยกบันทึกให้ครบ')}</li>
    <li><span className="pkv-tick"><Check size={11} strokeWidth={3.2} /></span>{tr('ถามได้ทุกเรื่อง ใครยังไม่จ่าย เดือนนี้เหลือเท่าไร')}</li>
    <li><span className="pkv-tick is-line"><img src={LINE_ICON} alt="" /></span>{tr('เตือนเงินครบกำหนดทุกเช้า ทาง LINE และอีเมล')}</li>
    <li><span className="pkv-tick is-docs"><Check size={11} strokeWidth={3.2} /></span>{tr('ออกเอกสารได้ไม่จำกัด')}</li>
  </ul>;
  const priceRow = <p className="pkv-price" data-testid="kv-price">
    {price.saving > 0 && <s><span className="sr-only">{t('plans.regularPrice')} </span>{formatBaht(price.regular)}</s>}
    <b>{formatBaht(price.price)}</b><span>{t('plans.monthPerShort')}</span>
  </p>;
  const title = <h2 id="pkv-title" className="pkv-title">{tr('พูดภาษาปกติ')}{mobile ? ' ' : <br />}<span className="pkv-grad">{tr('เลขาจัดการให้')}</span></h2>;

  return (
    <div className={`pkv pf-page ${mobile ? 'is-mobile' : ''}`}>
      <style>{KV_CLIP_CSS}</style>
      <div className="pkv-scrim" onClick={onClose} aria-hidden="true" />
      <section ref={cardRef} tabIndex={-1} className="pkv-card" role="dialog" aria-modal="true" aria-labelledby="pkv-title" data-testid="pro-kv">
        <div className="pkv-left">
          {mobile && <span className="pkv-grip" aria-hidden="true" />}
          <div className="pkv-stage">{clip}</div>
        </div>
        <div className="pkv-right">
          <button type="button" className="pkv-close" onClick={onClose} aria-label={tr('ปิด')}><X size={15} strokeWidth={2.4} /></button>
          {!mobile && <span className="pkv-pill">{promoRunning ? tr('Pro · ราคาพิเศษ') : 'Krarok Pro'}</span>}
          {title}
          {!mobile && ticks}
          <div className="pkv-offer">
            {priceRow}
            {promoRunning && <PromoCountdownChips className="pkv-count" />}
          </div>
          <div className="pkv-actions">
            <button type="button" className="pkv-cta" onClick={onSubscribe}><span className="pkv-shine" aria-hidden="true" /><span>{tr('สมัคร Pro')}</span></button>
            <button type="button" className="pkv-later" onClick={onClose}>{tr('ไว้ทีหลัง')}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
