import React from 'react';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { BrandLockup } from '../../../components/brand/BrandLogo';
import { Mascot } from '../../../components/mascot/Mascot';
import { MascotPeek } from '../../../components/mascot/MascotPeek';
import { PRO_REGULAR_MONTHLY, formatBaht, proPriceParts } from '../../../../../shared/proPricing';
import { monthPromoCountdown, useMonthPromoRunning } from '../../billing/promoNotice';
import { tr, trc, T } from '../../../i18n/tr';
import { CalendarDemo, ChatDemo, DocsDemo, PhoneDemo } from './Demos';
import './gen.css';
import './demos.css';

// The landing page (owner, 2026-10-29), in Krarok's own style: the KV's squirrel peeking out of the glowing KRAROK PRO
// box beside a real exchange with เลขา (owner: "อย่าทำเหมือนเขา ... เราทำในแบบสไตล์ของเรา"), then the owner's chosen
// sections: the problems on sticky notes, the price, what the app does (each shown as a short motion of the real flow,
// no frames: owner, "เป็นคลิปหรือโมชั่น ... ให้ทุกคนอ๋อ มันทำแบบนี้นี่เอง"), questions and the close. A handwritten accent
// (Sriracha) on the notes and ฿0. Every claim matches what ordinary accounts can use today: the 50 ทวิ page is still
// admin only, so it is not shown ("อย่าเพิ่งสปอย"). The previous landings stay in ../saas and ../editorial.

const LOGIN = '/login';

const NOTES = [
  T('ลูกค้ายังไม่โอนเลย\nต้องทักไปทวงอีกแล้ว'),
  T('ใบเสนอราคา\nเดือนก่อนอยู่ไหนนะ'),
  T('จดงานไว้ในโน้ต 3 ที่\nหาไม่เจอสักที่'),
  T('เดือนนี้เหลือเงิน\nเท่าไรกันแน่'),
  T('วันไหนเงินจะเข้า\nจำไม่ได้เลย'),
];

type FeatureKind = 'chat' | 'remind' | 'docs' | 'calendar';
const FEATURES: { kind: FeatureKind; key: string; rest: string; text: string }[] = [
  { kind: 'chat', key: T('คุย'), rest: T('กับเลขา\nเหมือนเพื่อนร่วมงาน'), text: T('พิมพ์หรือพูดว่าวันนี้ทำงานอะไร เลขาแยกงาน รายจ่าย และการรับเงินให้ครบ ถามอะไรก็ได้ เช่น ใครยังไม่จ่าย') },
  { kind: 'remind', key: T('เตือน'), rest: T('ก่อนลืม\nทุกเช้า'), text: T('ทาง LINE และอีเมล งานไหนใกล้ครบกำหนดรับเงิน และกดบันทึกรับเงินจากในแจ้งเตือนได้เลย') },
  { kind: 'docs', key: T('ออก'), rest: T('เอกสารต่อกัน\nได้ทันที'), text: T('ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ จากงานเดียวกัน ข้อมูลลูกค้าเติมให้เอง') },
  { kind: 'calendar', key: T('รู้'), rest: T('วันไหน\nเงินจะเข้าเท่าไร'), text: T('ปฏิทินและไทม์ไลน์บอกว่างานไหนจะได้เงินวันไหน ยอดรอรับเรียงตามวันครบกำหนด รับเงินบางส่วนหรือทั้งหมดได้ทันที') },
];

const FAQ: { q: string; a: string }[] = [
  { q: T('กระรอกตุนเงินเหมาะกับใคร?'), a: T('ฟรีแลนซ์ ครีเอเตอร์ ติวเตอร์ และคนที่รับงานจากหลายลูกค้า แล้วอยากเห็นว่าเงินก้อนไหนเข้าแล้ว ก้อนไหนยังรอ') },
  { q: T('เริ่มใช้งานฟรีได้ไหม?'), a: T('ได้ สมัครด้วย Google, Facebook หรืออีเมล ไม่ต้องใช้บัตร') },
  { q: T('Pro ต่างจาก Free อย่างไร?'), a: T('Pro ออกเอกสารได้ไม่จำกัดและไม่มีลายน้ำ ใช้ผู้ช่วยใน LINE และรับแจ้งเตือนทาง LINE หรืออีเมลได้ ส่วน Free ออกเอกสารใหม่ได้ 10 ใบต่อเดือน') },
  { q: T('ออกใบเสนอราคาได้ไหม?'), a: T('ได้ทั้ง Free และ Pro พร้อมใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี และดาวน์โหลด PDF') },
  { q: T('เชื่อมต่อ LINE อย่างไร?'), a: T('สมัคร Pro แล้วไปที่ ตั้งค่า > LINE กดเชื่อมต่อ แล้วทำตามขั้นตอนใน LINE') },
  { q: T('ยกเลิก Pro ได้ไหม?'), a: T('ได้ทุกเมื่อจากหน้าแพ็กเกจ สิทธิ์ใช้ต่อได้ถึงสิ้นรอบที่ชำระแล้ว') },
];

/** Thai lines that must break where they were written; each piece stays whole. */
const lines = (text: string) => text.split('\n').map((line, at) => <React.Fragment key={at}>{at > 0 && <br />}<span className="gl-nw">{line}</span></React.Fragment>);

function useSriracha() {
  React.useEffect(() => {
    if (document.getElementById('gl-hand-font')) return;
    const link = document.createElement('link');
    link.id = 'gl-hand-font'; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Sriracha&display=swap';
    document.head.appendChild(link);
  }, []);
}

function usePromoSeconds(running: boolean) {
  const [seconds, setSeconds] = React.useState(() => monthPromoCountdown().totalSeconds);
  React.useEffect(() => {
    if (!running) return;
    const tick = () => setSeconds(monthPromoCountdown().totalSeconds);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return seconds;
}

/** The deal's countdown as four tiles (days, hours, minutes, seconds), only while the offer runs. */
function Countdown() {
  const running = useMonthPromoRunning();
  const left = usePromoSeconds(running);
  if (!running || left <= 0) return null;
  const days = Math.floor(left / 86400), hours = Math.floor(left / 3600) % 24, minutes = Math.floor(left / 60) % 60, seconds = left % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    <div className="gl-count">
      <p className="gl-count-label">{tr('ดีลพิเศษ Pro {0} หมดใน', formatBaht(proPriceParts('month').price))}</p>
      <div role="timer" aria-live="off" data-seconds-left={left} className="gl-tiles"
        aria-label={tr('เวลาที่เหลือ {0} วัน {1} ชั่วโมง {2} นาที {3} วินาที', days, hours, minutes, seconds)}>
        {[[pad(days), tr('วัน')], [pad(hours), tr('ชั่วโมง')], [pad(minutes), tr('นาที')], [pad(seconds), tr('วินาที')]].map(([value, label]) => (
          <span key={label} className="gl-tile" aria-hidden="true"><b>{value}</b><small>{label}</small></span>
        ))}
      </div>
    </div>
  );
}

/** The KV's scene: the KRAROK PRO box lit from inside, เลขากระรอก peeking out of it (the app's own MascotPeek). */
function BoxScene() {
  return (
    <div className="gl-box-scene" aria-hidden="true">
      <span className="gl-box-light" />
      <span className="gl-box-flap is-left" /><span className="gl-box-flap is-right" />
      <span className="gl-box-inside" />
      <MascotPeek size={250} mood="excited" gear="headset" motion="peek" className="gl-box-peek" style={{ left: 5, top: -160 }} />
      <span className="gl-box"><img src="/kv/symbol.svg" alt="" /><b>KRAROK PRO</b></span>
    </div>
  );
}

export default function GenLanding() {
  useSriracha();
  const promoRunning = useMonthPromoRunning();
  const price = proPriceParts('month');

  // Sections, and each motion, start as they come into view.
  React.useEffect(() => {
    const items = Array.from(document.querySelectorAll('.gl-reveal'));
    if (!('IntersectionObserver' in window)) { items.forEach(item => item.classList.add('is-in')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target); }
    }), { threshold: 0.2 });
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const start = (className: string) => <a className={`gl-btn ${className}`} href={LOGIN}>{tr('เริ่มใช้ฟรี')}<ArrowRight size={18} aria-hidden="true" /></a>;

  return (
    <div className="gl">
      <a className="gl-skip" href="#gl-main">{tr('ข้ามไปเนื้อหา')}</a>
      <header className="gl-bar">
        <a href="#top" className="gl-logo" aria-label={tr('กระรอกตุนเงิน หน้าแรก')}><BrandLockup size={30} /></a>
        <nav className="gl-links" aria-label={tr('เมนูหลัก')}><a href="#gl-features">{tr('ฟีเจอร์')}</a><a href="#pricing">{tr('ราคา')}</a><a href="#gl-faq">{tr('คำถาม')}</a></nav>
        <span className="gl-bar-right"><a className="gl-login" href={LOGIN}>{tr('เข้าสู่ระบบ')}</a><a className="gl-btn is-small" href={LOGIN}>{tr('เริ่มใช้ฟรี')}</a></span>
      </header>

      <main id="gl-main">
        {/* 1 · hero */}
        <section id="top" className="gl-hero" aria-labelledby="gl-h1">
          <span className="gl-orb is-rust" aria-hidden="true" /><span className="gl-orb is-gold" aria-hidden="true" /><span className="gl-orb is-rose" aria-hidden="true" />
          <div className="gl-hero-text">
            <span className="gl-chip">{tr('เลขาการเงินสำหรับคนทำงานอิสระ')}</span>
            <h1 id="gl-h1"><span className="gl-nw">{tr('เรื่องเงินของงานอิสระ')}</span><br /><span className="gl-nw">{trc('hero', 'ให้')}<span className="gl-loop gl-grad">{tr('เลขากระรอก')}</span>{trc('hero', 'ดูแล')}</span></h1>
            <p className="gl-lead">{tr('จดงาน เตือนลูกค้าจ่าย ออกใบเสนอราคาถึงใบเสร็จ')}<br />{tr('แค่พิมพ์หรือพูดภาษาปกติ ทั้งในแอปและใน LINE')}</p>
            <div className="gl-hero-cta">{start('is-big')}<a className="gl-btn is-big is-ghost" href="#gl-features">{tr('ดูว่าเลขาทำอะไรได้')}<ChevronDown size={18} aria-hidden="true" /></a></div>
            <ul className="gl-ticks">{[tr('ไม่ต้องใช้บัตร'), tr('คอม iPad และมือถือ'), tr('เชื่อม LINE ได้')].map(item => <li key={item}><i><Check size={12} strokeWidth={3.2} /></i>{item}</li>)}</ul>
          </div>
          <div className="gl-hero-scene">
            <p className="gl-me gl-loop">{tr('พรุ่งนี้มีงานรีวิว 2 งาน งานละ 5,000 กับงานถ่ายรูปอีก 8,000 ครับ')}</p>
            <div className="gl-bot"><span className="gl-face" aria-hidden="true"><Mascot gear="headset" mood="happy" animated={false} size={34} viewBox="12 8 76 76" /></span>
              <p className="gl-say gl-loop">{tr('บันทึกให้แล้ว 3 งาน รวม {0} ครับ', '฿18,000')}<span className="gl-saved"><Check size={13} strokeWidth={3} aria-hidden="true" />{tr('บันทึกแล้ว')}</span></p></div>
            <BoxScene />
          </div>
        </section>

        {/* 2 · the problems */}
        <section className="gl-problem" aria-labelledby="gl-problem-title">
          <div className="gl-problem-head gl-reveal">
            <h2 id="gl-problem-title">{tr('งานฟรีแลนซ์ก็เหนื่อยพอแล้ว…')}</h2>
            <p>{tr('เรื่องเงินที่เหลือ ให้เลขากระรอกจัดการ')}</p>
          </div>
          <ul className="gl-notes gl-reveal">{NOTES.map((note, at) => <li key={at} className={`gl-note gl-hand is-${at + 1}`}>{lines(tr(note))}</li>)}</ul>
        </section>

        {/* 3 · the price */}
        <section className="gl-value" aria-labelledby="gl-value-title">
          <div className="gl-value-card gl-reveal">
            <p className="gl-value-was">{tr('จ้างเลขาจริง เดือนละหลักหมื่น')}</p>
            <h2 id="gl-value-title">{tr('เลขากระรอก')} <span className="gl-underline gl-nw">{tr('วันละไม่ถึง {0}', formatBaht(Math.ceil(price.price / 30)))}<svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 14 C 60 4, 120 18, 180 9 S 270 6, 297 12" /></svg></span></h2>
            <div className="gl-value-rows">
              <div className="gl-value-figure"><span className="gl-hand gl-zero">฿0</span></div>
              <div className="gl-value-text"><h3>{tr('เริ่มฟรี')} <span className="gl-grad">{tr('ไม่ต้องใช้บัตร')}</span></h3><p>{tr('จดงาน รายรับรายจ่าย ปฏิทิน และออกเอกสารได้ 10 ใบต่อเดือน')}</p></div>
              <div className="gl-value-figure is-pro" id="pricing">
                <p className="gl-price">{promoRunning && <s className="gl-price-was"><span className="sr-only">{tr('ราคาปกติ')} </span>{formatBaht(PRO_REGULAR_MONTHLY)}</s>}<strong className="gl-num">{formatBaht(price.price)}</strong><span>{tr('/ เดือน')}</span></p>
                <p className="gl-price-fee">{tr('+ ค่าธรรมเนียมชำระเงิน {0} · ยอดชำระ {1}', formatBaht(price.fee), formatBaht(price.total))}</p>
              </div>
              <div className="gl-value-text is-pro"><h3>{tr('อัปเกรดเป็น')} <span className="gl-grad">Pro</span> {tr('เมื่อพร้อม')}</h3><p>{tr('เลขากระรอก แจ้งเตือนทาง LINE และอีเมล ออกเอกสารได้ไม่จำกัด')}</p></div>
            </div>
            <div className="gl-value-cta">{start('is-big')}</div>
          </div>
        </section>

        {/* 4 · what it does, each shown as a short motion of the real flow */}
        <section id="gl-features" className="gl-features" aria-labelledby="gl-features-title">
          <h2 id="gl-features-title" className="gl-reveal">{tr('ครบในแอปเดียว')}</h2>
          {FEATURES.map((feature, at) => (
            <article key={feature.kind} className={`gl-feature gl-reveal${at % 2 ? ' is-flip' : ''}`}>
              <div className={`gl-feature-visual is-${feature.kind}`}>
                {feature.kind === 'chat' ? <ChatDemo /> : feature.kind === 'remind' ? <PhoneDemo /> : feature.kind === 'docs' ? <DocsDemo /> : <CalendarDemo />}
              </div>
              <div className="gl-feature-text">
                <h3><span className="gl-grad">{tr(feature.key)}</span>{lines(tr(feature.rest))}</h3>
                <p>{tr(feature.text)}</p>
              </div>
            </article>
          ))}
        </section>

        {/* 5 · questions */}
        <section id="gl-faq" className="gl-faq" aria-labelledby="gl-faq-title">
          <h2 id="gl-faq-title">{tr('คำถามที่พบบ่อย')}</h2>
          <div className="gl-faq-list">{FAQ.map(item => (
            <details key={item.q}><summary>{tr(item.q)}<span aria-hidden="true">+</span></summary><p>{tr(item.a)}</p></details>
          ))}</div>
        </section>

        {/* 6 · the close */}
        <section className="gl-final" aria-labelledby="gl-final-title">
          <img className="gl-final-bg" src="/landing-v3/desktop-overview.webp" alt="" aria-hidden="true" loading="lazy" />
          <div className="gl-final-in gl-reveal">
            <Mascot gear="headset" mood="wave" action="wave" size={150} />
            <h2 id="gl-final-title"><span className="gl-nw">{trc('final', 'ให้เลขากระรอก')}</span><wbr /><span className="gl-nw">{trc('final', 'ช่วยดูแลเงินของคุณ')}</span><br /><span className="gl-grad">{tr('ตั้งแต่วันนี้')}</span></h2>
            <Countdown />
            {start('is-big')}
          </div>
        </section>
      </main>

      <footer className="gl-foot">
        <span>{tr('© 2569 กระรอกตุนเงิน')}</span>
        <span><a href="/privacy">{tr('นโยบายความเป็นส่วนตัว')}</a> · <a href="/terms">{tr('ข้อตกลงการใช้งาน')}</a></span>
      </footer>
    </div>
  );
}
