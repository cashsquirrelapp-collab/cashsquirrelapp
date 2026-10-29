import React from 'react';
import { ArrowRight, FileText, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { formatBaht, proPriceDetails } from '../../../../shared/proPricing';
import { MascotPeek } from '../../components/mascot/MascotPeek';
import { LineLogo } from '../../components/ui/LineLogo';
import { GmailLogo } from '../../components/ui/GmailLogo';
import { PromoCountdownChips } from './promoNotice';
import './plans.css';
import './proKv.css';

// The weekly Pro invitation for accounts not on Pro (owner, 2026-10-29, Gen Z round 4, design 1): a portrait poster in
// the Pro look, dark rust with gold. The eye goes 1 the headline (the day's price in big gold), 2 เลขากระรอก peeking out
// of the glowing KRAROK PRO box (the app's own MascotPeek, never redrawn), 3 the round price badge, 4 what Pro gives,
// 5 the countdown and สมัคร Pro. ✕ and ไว้ทีหลัง close it until next week (App keeps the date). The same poster on every
// screen, scaled to fit.

const W = 400;
const H = 540;
// Room the poster needs around it: the ✕ above, the button and ไว้ทีหลัง below, the badge past the right edge.
const ROOM_W = 460;
const ROOM_H = 650;

function useFitScale() {
  const fit = () => Math.min(1, (window.innerWidth - 24) / ROOM_W, (window.innerHeight - 24) / ROOM_H);
  const [scale, setScale] = React.useState(fit);
  React.useEffect(() => {
    const onResize = () => setScale(fit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

const Star = ({ size, color, className }: { size: number; color: string; className: string }) => (
  <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24"><path d="M12 1.5l2.6 7.1 7.4.3-5.8 4.6 2 7.2L12 16.6l-6.2 4.1 2-7.2L2 8.9l7.4-.3z" fill={color} /></svg>
);

export default function ProKvBanner({ mobile, onClose, onSubscribe }: { mobile: boolean; onClose: () => void; onSubscribe: () => void }) {
  const price = proPriceDetails('month');
  // "วันละไม่ถึง ฿6" at ฿159 a month; it follows the price, so the line stays true when the price changes.
  const perDay = Math.ceil(price.price / 30);
  const scale = useFitScale();
  const cardRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const big = `฿${perDay}`;

  return (
    <div className={`pkv pf-page ${mobile ? 'is-mobile' : ''}`}>
      <div className="pkv-scrim" onClick={onClose} aria-hidden="true" />
      <div className="pkv-fit" style={{ width: W * scale, height: H * scale }}>
        <section ref={cardRef} tabIndex={-1} className="pkv-poster" role="dialog" aria-modal="true" aria-labelledby="pkv-title"
          data-testid="pro-kv" style={{ transform: `scale(${scale})` }}>
          <div className="pkv-card">
            <span className="pkv-glow" aria-hidden="true" />
            <svg className="pkv-streak" aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <defs>
                <linearGradient id="pkv-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FFC36B" stopOpacity="0" /><stop offset=".3" stopColor="#FFC36B" /><stop offset=".65" stopColor="#FFE7BF" /><stop offset="1" stopColor="#FFC36B" stopOpacity="0" /></linearGradient>
                <filter id="pkv-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
              </defs>
              <path d="M-20 226 C 120 196, 250 214, 420 300" stroke="url(#pkv-gold)" strokeWidth="20" fill="none" opacity=".4" filter="url(#pkv-blur)" />
              <path d="M-20 226 C 120 196, 250 214, 420 300" stroke="url(#pkv-gold)" strokeWidth="3" fill="none" opacity=".9" />
            </svg>
            <h2 id="pkv-title" className="pkv-title">
              <span className="pkv-t1">{tr('จ้างเลขาส่วนตัว')}</span>
              <span className="pkv-t2">{tr('วันละไม่ถึง')}</span>
              <span className="pkv-big" data-text={big}><span>{big}</span></span>
            </h2>
            <div className="pkv-hero" aria-hidden="true">
              <span className="pkv-box-light" />
              <span className="pkv-flap is-left" />
              <span className="pkv-flap is-right" />
              <span className="pkv-box-inside" />
              {/* The hero box is placed at the box's top edge: the paws (64% down the 206px artwork) rest on it. */}
              <MascotPeek size={206} mood="excited" gear="headset" motion="peek" style={{ left: -14, top: -Math.round(206 * 0.64) }} className="pkv-peek" />
              <span className="pkv-box"><img src="/kv/symbol.svg" alt="" /><b>KRAROK PRO</b></span>
              <Star className="pkv-spark is-1" size={18} color="#FFE7BF" />
              <Star className="pkv-spark is-2" size={12} color="#FFC36B" />
            </div>
            <div className="pkv-feats">
              <p className="pkv-feats-title">{tr('ได้ครบใน Pro')}</p>
              <ul>
                <li><span className="pkv-ic"><LineLogo size={18} /></span>{tr('เตือนใน LINE')}</li>
                <li><span className="pkv-ic"><GmailLogo size={18} /></span>{tr('แจ้งทางอีเมล')}</li>
                <li><span className="pkv-ic is-doc"><FileText size={15} strokeWidth={2} /></span>{tr('เอกสารไม่จำกัด')}</li>
              </ul>
            </div>
            <PromoCountdownChips className="pkv-count" />
          </div>
          <div className="pkv-badge" data-testid="kv-price">
            <div>
              {price.saving > 0 && <p className="pkv-badge-was"><s><span className="sr-only">{tr('ราคาปกติ')} </span>{formatBaht(price.regular)}</s></p>}
              <p className="pkv-badge-price">{formatBaht(price.price)}</p>
              <p className="pkv-badge-per">{tr('ต่อเดือน')}</p>
            </div>
          </div>
          <Star className="pkv-spark is-3" size={16} color="#FFC36B" />
          <Star className="pkv-spark is-4" size={11} color="#FFE7BF" />
          <svg className="pkv-ribbon is-a" aria-hidden="true" width="150" height="130" viewBox="0 0 150 130">
            <defs><linearGradient id="pkv-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".35" stopColor="#F7D3C4" /><stop offset=".6" stopColor="#C9765A" /><stop offset=".8" stopColor="#FFF1E8" /><stop offset="1" stopColor="#A63F1B" /></linearGradient></defs>
            <path d="M10 92 C 30 20, 92 6, 118 40 C 136 64, 104 92, 82 70 C 64 52, 92 22, 140 30" stroke="url(#pkv-chrome)" strokeWidth="13" strokeLinecap="round" fill="none" />
          </svg>
          <svg className="pkv-ribbon is-b" aria-hidden="true" width="120" height="150" viewBox="0 0 120 150">
            <path d="M100 8 C 40 30, 20 70, 60 92 C 92 110, 70 140, 14 142" stroke="url(#pkv-chrome)" strokeWidth="11" strokeLinecap="round" fill="none" />
          </svg>
          <button type="button" className="pkv-close" onClick={onClose} aria-label={tr('ปิด')}><X size={16} strokeWidth={2.8} /></button>
          <button type="button" className="pkv-cta" onClick={onSubscribe}>
            <span className="pkv-shine" aria-hidden="true" /><span className="pkv-shine is-2" aria-hidden="true" />
            <span className="pkv-cta-label">{tr('สมัคร Pro เลย')}</span>
            <span className="pkv-go" aria-hidden="true"><ArrowRight size={16} strokeWidth={3} /></span>
          </button>
          <button type="button" className="pkv-later" onClick={onClose}>{tr('ไว้ทีหลัง')}</button>
        </section>
      </div>
    </div>
  );
}
