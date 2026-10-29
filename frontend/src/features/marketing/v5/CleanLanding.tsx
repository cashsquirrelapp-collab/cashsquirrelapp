import React from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { CustomEase } from 'gsap/CustomEase';
import { ExpoScaleEase, SlowMo } from 'gsap/EasePack';
import { Observer } from 'gsap/Observer';
import { PhysicsPropsPlugin } from 'gsap/PhysicsPropsPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { TextPlugin } from 'gsap/TextPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { Draggable } from 'gsap/Draggable';
import { ArrowRight, Bell, CalendarDays, Check, ChevronDown, CircleHelp, FileSearch, FileText, NotebookPen, Plus, Wallet } from 'lucide-react';
import { BrandLockup } from '../../../components/brand/BrandLogo';
import { Mascot } from '../../../components/mascot/Mascot';
import { LineLogo } from '../../../components/ui/LineLogo';
import { GmailLogo } from '../../../components/ui/GmailLogo';
import { PRO_REGULAR_MONTHLY, formatBaht, proPriceParts } from '../../../../../shared/proPricing';
import { monthPromoCountdown, useMonthPromoRunning } from '../../billing/promoNotice';
import { currentLanguage } from '../../../i18n/currentLanguage';
import { tr, trc, T } from '../../../i18n/tr';
import { CalendarDemo, ChatDemo, DocsDemo, PhoneDemo } from '../v4/Demos';
import '../v4/demos.css';
import './clean.css';

// The landing page, round 5 (owner, 2026-10-29): clean and white, modern and Gen Z, liquid glass cards and a finance
// feel, after a premium-site reference the owner sent ("คลีนๆขาวๆ ... ทันสมัย ... ลิควิดการ์ด ... ไฟแนนซ์"), moved by GSAP
// (owner: "เอา Gsap ไปศึกษาละทำออกมา"). Krarok's own content, colours and squirrel; the sections the owner kept
// (problems, price, ครบในแอปเดียว with its four motions, questions, the close with the countdown). On computers the top is
// one pinned scroll scene: the words lift away, the floating cards fly into the phone and the phone rises to the middle.
// Phones and reduced motion get the same page laid out in order. Nothing that moves ever passes over text.
// Only features every account has today (50 ทวิ is not shown yet). The previous landing stays in ../v4.

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrambleTextPlugin, DrawSVGPlugin, MotionPathPlugin, Physics2DPlugin, PhysicsPropsPlugin, Draggable, Observer,
  ScrollToPlugin, TextPlugin, CustomEase, ExpoScaleEase, SlowMo);
// Krarok's own ease for everything that rises into place: quick to leave, long and soft to land.
CustomEase.create('krarok', '0.16, 1, 0.3, 1');
// GSDevTools and MotionPathHelper are tools for building animations; GSAP advises against shipping them, so they are not here.

const LOGIN = '/login';
/** Where the top is one pinned scene. The stylesheet uses the same query (clean.css, "pinned scene"). */
const SCENE = '(min-width: 960px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)';
const MOTION = '(prefers-reduced-motion: no-preference)';
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

const NOTES = [
  { icon: Wallet, text: T('ลูกค้ายังไม่โอนเลย\nต้องทักไปทวงอีกแล้ว') },
  { icon: FileSearch, text: T('ใบเสนอราคา\nเดือนก่อนอยู่ไหนนะ') },
  { icon: NotebookPen, text: T('จดงานไว้ในโน้ต 3 ที่\nหาไม่เจอสักที่') },
  { icon: CircleHelp, text: T('เดือนนี้เหลือเงิน\nเท่าไรกันแน่') },
  { icon: CalendarDays, text: T('วันไหนเงินจะเข้า\nจำไม่ได้เลย') },
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

/** Example events for the money ticker: what a week in the app looks like. */
const TICKER: { label: string; amount?: string; tone: 'in' | 'out' | 'due' | 'doc' }[] = [
  { label: T('รับเงินแล้ว · รีวิวสินค้า'), amount: '+฿5,000', tone: 'in' },
  { label: T('ออกใบเสนอราคา · ร้านบี'), amount: '฿18,000', tone: 'doc' },
  { label: T('เตือนรับเงิน 08:00 · 2 รายการ'), amount: '฿12,500', tone: 'due' },
  { label: T('รับเงินแล้ว · ถ่ายรูปสินค้า'), amount: '+฿8,000', tone: 'in' },
  { label: T('รายจ่าย · ค่าโฆษณา'), amount: '−฿1,200', tone: 'out' },
  { label: T('ออกใบเสร็จ · คุณเอ'), amount: '฿5,000', tone: 'doc' },
  { label: T('ครบกำหนดวันนี้ · ร้านบี'), amount: '฿7,500', tone: 'due' },
  { label: T('บันทึกงานใหม่ · ตัดต่อวิดีโอ'), amount: '฿6,000', tone: 'doc' },
];

/** Thai lines that must break where they were written; each piece stays whole. */
const lines = (text: string) => text.split('\n').map((line, at) => <React.Fragment key={at}>{at > 0 && <br />}<span className="gl-nw">{line}</span></React.Fragment>);

/**
 * Words for the reveal. Thai has no spaces, so the words come from the browser's own word segmenter. React draws the
 * pieces itself (SplitText would rewrite markup React owns); each word sits in a one-line mask it rises out of, and
 * breaks only fall between words, as in Thai. A heading split this way carries its whole text as its name
 * (aria-label) and hides the pieces, as SplitText does, so it is read as one sentence.
 */
function splitWords(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (lang: string, options: { granularity: 'word' }) => { segment(text: string): Iterable<{ segment: string }> } }).Segmenter;
  if (!Segmenter) return [text];
  return Array.from(new Segmenter(currentLanguage === 'en' ? 'en' : 'th', { granularity: 'word' }).segment(text), part => part.segment);
}
function Words({ text }: { text: string }) {
  return <>{splitWords(text).map((part, at) => <React.Fragment key={at}>{/^\s+$/.test(part) ? part : <span className="cl-wm"><span className="cl-w">{part}</span></span>}</React.Fragment>)}</>;
}
/** A gradient phrase rises as one word (its colour runs across the whole phrase). */
const MaskedGrad = ({ text, className = '' }: { text: string; className?: string }) => <span className="cl-wm"><span className={`cl-w cl-grad ${className}`}>{text}</span></span>;

/** Text that rolls up to a copy of itself on hover (the copy is hidden from screen readers). */
const Roll = ({ text }: { text: string }) => <span className="cl-roll"><span>{text}</span><span aria-hidden="true">{text}</span></span>;

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

/** The deal's countdown as four glass tiles (days, hours, minutes, seconds), only while the offer runs. */
function Countdown() {
  const running = useMonthPromoRunning();
  const left = usePromoSeconds(running);
  if (!running || left <= 0) return null;
  const days = Math.floor(left / 86400), hours = Math.floor(left / 3600) % 24, minutes = Math.floor(left / 60) % 60, seconds = left % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    <div className="cl-count">
      <p className="cl-count-label">{tr('ดีลพิเศษ Pro {0} หมดใน', formatBaht(proPriceParts('month').price))}</p>
      <div role="timer" aria-live="off" data-seconds-left={left} className="cl-tiles-count"
        aria-label={tr('เวลาที่เหลือ {0} วัน {1} ชั่วโมง {2} นาที {3} วินาที', days, hours, minutes, seconds)}>
        {[[pad(days), tr('วัน')], [pad(hours), tr('ชั่วโมง')], [pad(minutes), tr('นาที')], [pad(seconds), tr('วินาที')]].map(([value, label]) => (
          <span key={label} className="cl-tick" aria-hidden="true"><b>{value}</b><small>{label}</small></span>
        ))}
      </div>
    </div>
  );
}

/** Soft CI colour behind the glass, so the glass has something to bend. */
function Liquid({ className = '' }: { className?: string }) {
  return <span className={`cl-liquid ${className}`} aria-hidden="true"><i className="cl-blob is-a" /><i className="cl-blob is-b" /><i className="cl-blob is-c" /></span>;
}

/** A floating glass card in the hero. Three layers: place (scroll), float (idle bob), card (entrance). */
function Tile({ n, text, children }: { n: number; text?: boolean; children: React.ReactNode }) {
  return <span className={`cl-tile is-${n}${text ? ' has-text' : ''}`}><span className="cl-tile-float"><span className="cl-tile-card cl-glass">{children}</span></span></span>;
}

function Sparkline() {
  return (
    <svg className="cl-spark" viewBox="0 0 120 36" aria-hidden="true">
      <defs><linearGradient id="cl-spark-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#18A66A" stopOpacity="0.28" /><stop offset="1" stopColor="#18A66A" stopOpacity="0" /></linearGradient></defs>
      <path d="M2 30 L18 26 L34 28 L50 18 L66 21 L82 12 L98 14 L118 4 L118 36 L2 36 Z" fill="url(#cl-spark-fill)" />
      <path className="cl-spark-line" d="M2 30 L18 26 L34 28 L50 18 L66 21 L82 12 L98 14 L118 4" fill="none" stroke="#18A66A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An element's place inside an ancestor, ignoring transforms (so it can be measured mid-animation). */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.offsetParent as HTMLElement | null) { x += node.offsetLeft; y += node.offsetTop; }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}

export default function CleanLanding() {
  useSriracha();
  const promoRunning = useMonthPromoRunning();
  const price = proPriceParts('month');
  const root = React.useRef<HTMLDivElement>(null);

  // useGSAP (@gsap/react): everything made here is reverted when the page goes or the deal changes.
  useGSAP((_context, contextSafe) => {
    const safe = contextSafe ?? (<T,>(fn: T) => fn);
    const page = root.current;
    if (!page) return;
    const q = (selector: string) => Array.from(page.querySelectorAll<HTMLElement>(selector));
    const mm = gsap.matchMedia(page);

    // Without motion: everything shows where it ends, and the motions show their last frame (demos.css).
    mm.add('(prefers-reduced-motion: reduce)', () => { q('.cl-card').forEach(card => card.classList.add('is-in')); });

    // The pinned scene comes first: ScrollTriggers are measured in the order they are made, and every later section
    // sits below this one's scroll room (GSAP's ScrollTrigger guidance: create them from the top of the page down).
    mm.add(SCENE, () => {
      const scene = q('.cl-scene')[0], pin = q('.cl-pin')[0], device = q('.cl-device')[0], hero = q('.cl-hero')[0], tiles = q('.cl-tiles')[0];
      if (!scene || !pin || !device || !hero || !tiles) return;
      const bar = () => q('.cl-bar')[0]?.offsetHeight ?? 68;
      // The phone first peeks up from below the words (and the cards, when they sit under the words), then rises.
      const peek = () => {
        const pinHeight = pin.offsetHeight, height = device.offsetHeight;
        const strip = getComputedStyle(tiles).position === 'absolute' ? 0 : tiles.offsetTop + tiles.offsetHeight;
        const above = Math.max(hero.offsetTop + hero.offsetHeight, strip);
        return Math.max(0, Math.max(above + 34, pinHeight - 170) - (pinHeight - height) / 2);
      };
      const toPhone = (el: HTMLElement, axis: 'x' | 'y') => {
        const at = offsetIn(el, pin);
        return axis === 'x' ? pin.offsetWidth / 2 - at.x : pin.offsetHeight / 2 - at.y;
      };
      const scroll = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: scene, start: () => `top ${bar()}px`, end: '+=1100', pin, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      // autoAlpha: once gone, the words and cards are hidden too, so nothing unseen sits over what is shown.
      scroll.to(hero, { autoAlpha: 0, y: -120, duration: 0.2, ease: 'power1.in' }, 0)
        .to(q('.cl-tint'), { opacity: 1, duration: 0.5 }, 0.1)
        .fromTo(device, { y: peek }, { y: 0, duration: 0.5, ease: 'power2.inOut' }, 0.16)
        .to(q('.cl-tile'), { x: (_i, el) => toPhone(el, 'x'), y: (_i, el) => toPhone(el, 'y'), rotation: (at: number) => (at % 2 ? 24 : -24), duration: 0.42, ease: 'power2.in' }, 0.18)
        // ExpoScaleEase: a shrink from 1 to 0.3 that looks even all the way, instead of most of it happening at the end
        .to(q('.cl-tile'), { scale: 0.3, duration: 0.42, ease: 'expoScale(1, 0.3, power1.in)' }, 0.18)
        .to(q('.cl-tile.has-text'), { autoAlpha: 0, duration: 0.16 }, 0.18)
        .to(q('.cl-tile:not(.has-text)'), { autoAlpha: 0, duration: 0.1 }, 0.5)
        .from(q('.cl-side.is-left .cl-w'), { yPercent: 115, duration: 0.16, stagger: 0.02, ease: 'power3.out' }, 0.56)
        .from(q('.cl-side'), { opacity: 0, x: (at: number) => (at ? 48 : -48), duration: 0.22, ease: 'power2.out' }, 0.56)
        .from(q('.cl-notice'), { opacity: 0, y: 26, scale: 0.88, duration: 0.14, ease: 'back.out(2)' }, 0.72)
        .to({}, { duration: 0.12 }, 0.88);
    });

    mm.add(MOTION, () => {
      const off: (() => void)[] = [];
      // The top bar turns to glass once the page moves, with a thin CI line showing how far down the page is.
      ScrollTrigger.create({ start: 8, end: 'max', toggleClass: { targets: q('.cl-bar'), className: 'is-scrolled' } });
      gsap.fromTo(q('.cl-progress'), { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

      // 1 · the hero arrives: each word rises out of its own mask, the floating cards pop in, their amounts roll like a
      // money screen (ScrambleText, digits only) and the month's line draws itself (DrawSVG).
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      intro.from(q('.cl-hero .cl-chip'), { y: 14, autoAlpha: 0, duration: 0.6 })
        .from(q('.cl-hero h1 .cl-w'), { yPercent: 115, rotation: 5, transformOrigin: '0% 100%', duration: 1.2, ease: 'krarok', stagger: 0.07 }, 0.1)
        .from(q('.cl-lead'), { y: 14, autoAlpha: 0, duration: 0.7 }, 0.5)
        .from(q('.cl-cta'), { y: 14, autoAlpha: 0, duration: 0.6 }, 0.62)
        .from(q('.cl-ticks li'), { y: 8, autoAlpha: 0, duration: 0.5, stagger: 0.06 }, 0.75)
        .from(q('.cl-tile-card'), { autoAlpha: 0, scale: 0.55, rotation: () => gsap.utils.random(-14, 14), duration: 1, ease: 'back.out(1.7)', stagger: { each: 0.08, from: 'random' } }, 0.35)
        .from(q('.cl-device-frame'), { opacity: 0, duration: 0.8 }, 0.5)
        .from(q('.cl-spark-line'), { drawSVG: 0, duration: 1.3, ease: 'power2.inOut' }, 0.9);
      // The chip types itself, a Thai word at a time (TextPlugin, with the words the browser finds as its steps).
      const chip = q('.cl-chip-text')[0];
      if (chip) {
        const full = chip.textContent ?? '';
        intro.fromTo(chip, { text: '' }, { text: { value: splitWords(full).join('\u200B'), delimiter: '\u200B' }, duration: 0.9, ease: 'none', onComplete: () => { chip.textContent = full; } }, 0.12);
      }
      q('[data-scramble]').forEach((el, at) => intro.to(el, { duration: 1.2, ease: 'none', scrambleText: { text: el.textContent ?? '', chars: '0123456789', speed: 0.7, revealDelay: 0.3 } }, 0.6 + at * 0.12));
      gsap.to(q('.cl-tile-float'), { y: 'random(-10, 10)', rotation: 'random(-3, 3)', duration: 'random(2.6, 4.2)', ease: 'sine.inOut', yoyo: true, repeat: -1, repeatRefresh: true, delay: 1.2 });

      // The liquid colour behind the glass slowly moves, and drifts a little slower than the page (parallax).
      q('.cl-blob').forEach(blob => gsap.to(blob, { x: 'random(-70, 70)', y: 'random(-50, 50)', scale: 'random(0.85, 1.2)', duration: 'random(9, 14)', ease: 'sine.inOut', yoyo: true, repeat: -1, repeatRefresh: true }));
      q('.cl-liquid:not(.is-hero)').forEach(layer => gsap.fromTo(layer, { yPercent: 10 }, { yPercent: -10, ease: 'none', scrollTrigger: { trigger: layer.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }));

      // Headings: each word rises out of its mask as the heading reaches the screen.
      q('[data-words]').forEach(heading => gsap.from(heading.querySelectorAll('.cl-w'), {
        yPercent: 115, rotation: 4, transformOrigin: '0% 100%', duration: 1.1, ease: 'krarok', stagger: 0.05,
        scrollTrigger: { trigger: heading, start: 'top 88%' },
      }));
      // Without the pinned scene (phones, iPads held upright) the phone's heading rises like the others.
      if (!window.matchMedia(SCENE).matches) q('.cl-side.is-left h2').forEach(heading => gsap.from(heading.querySelectorAll('.cl-w'), {
        yPercent: 115, rotation: 4, transformOrigin: '0% 100%', duration: 1.1, ease: 'krarok', stagger: 0.05, scrollTrigger: { trigger: heading, start: 'top 88%' },
      }));
      // Blocks rise into place.
      gsap.set(q('[data-rise]'), { y: 40, opacity: 0 });
      ScrollTrigger.batch(q('[data-rise]'), {
        start: 'top 90%', once: true,
        onEnter: batch => gsap.to(batch, { y: 0, opacity: 1, duration: 1, ease: 'krarok', stagger: 0.1, overwrite: 'auto' }),
      });

      // 2 · the money ticker runs on its own; scrolling speeds it up and leans it, then it eases back.
      const track = q('.cl-ticker-track')[0];
      if (track) {
        const run = gsap.to(track, { xPercent: -50, duration: 46, ease: 'none', repeat: -1 });
        const lean = gsap.quickTo(track, 'skewX', { duration: 0.5, ease: 'power3.out' });
        let calm: gsap.core.Tween | undefined, straighten: gsap.core.Tween | undefined;
        // Observer reads the wheel, touch and scroll speed (even at the page's ends), not just the scroll position.
        const watch = Observer.create({ target: window, type: 'wheel,touch,scroll', onChangeY: self => {
          const speed = self.velocityY;
          run.timeScale(gsap.utils.clamp(1, 7, 1 + Math.abs(speed) / 260));
          lean(gsap.utils.clamp(-7, 7, speed / -320));
          calm?.kill(); straighten?.kill();
          calm = gsap.to(run, { timeScale: 1, duration: 1.2, ease: 'power2.out', delay: 0.12 });
          straighten = gsap.delayedCall(0.14, () => lean(0));
        } });
        off.push(() => watch.kill());
      }

      // 3 · the problems: each note drifts in from outside, never across the heading, then bobs.
      q('.cl-note').forEach((note, at) => {
        gsap.from(note, { opacity: 0, x: at % 2 ? 60 : -60, y: 30, scale: 0.9, duration: 0.9, ease: 'back.out(1.5)', delay: at * 0.08, scrollTrigger: { trigger: q('.cl-problem')[0], start: 'top 70%' } });
      });
      gsap.to(q('.cl-note-in'), { y: 'random(-7, 7)', duration: 'random(2.8, 4)', ease: 'sine.inOut', yoyo: true, repeat: -1, repeatRefresh: true });

      // 4 · the price: the line under "วันละไม่ถึง" draws itself; while the deal runs the Pro price counts down to it and
      // a few coins jump out (Physics2D) when it lands.
      const underline = page.querySelector<SVGPathElement>('.cl-underline path');
      if (underline) gsap.from(underline, { drawSVG: 0, duration: 1.1, ease: 'power2.inOut', scrollTrigger: { trigger: underline, start: 'top 85%' } });
      const strike = q('.cl-was-line')[0];
      if (strike) gsap.from(strike, { scaleX: 0, duration: 0.8, ease: 'power2.out', scrollTrigger: { trigger: strike, start: 'top 85%' } });
      const figure = q('.cl-price strong')[0];
      const from = PRO_REGULAR_MONTHLY, to = price.price;
      const coins: HTMLElement[] = [];
      const burst = safe(() => {
        const card = figure?.closest<HTMLElement>('.cl-plan');
        if (!figure || !card) return;
        const box = card.getBoundingClientRect(), at = figure.getBoundingClientRect();
        for (let n = 0; n < 12; n++) {
          const coin = document.createElement('span');
          coin.className = 'cl-pop-coin'; coin.setAttribute('aria-hidden', 'true');
          coin.style.left = `${at.left - box.left + at.width * gsap.utils.random(0.25, 0.8)}px`; coin.style.top = `${at.top - box.top + at.height * 0.45}px`;
          card.appendChild(coin); coins.push(coin);
          // Physics2D throws each coin up and lets it fall; PhysicsProps spins it and lets the spin wind down.
          gsap.to(coin, { duration: gsap.utils.random(1.1, 1.6), ease: 'power1.in', autoAlpha: 0, physicsProps: { rotation: { velocity: gsap.utils.random(-520, 520), friction: 0.08 } },
            physics2D: { velocity: gsap.utils.random(200, 380), angle: gsap.utils.random(235, 305), gravity: 560 }, onComplete: () => coin.remove() });
        }
      });
      if (figure && promoRunning && from > to) {
        const value = { v: from };
        gsap.to(value, { v: to, duration: 1.4, ease: 'power3.out', snap: { v: 1 }, onUpdate: () => { figure.textContent = formatBaht(value.v); }, onComplete: burst,
          scrollTrigger: { trigger: figure, start: 'top 88%', once: true } });
        off.push(() => { figure.textContent = formatBaht(to); });
      }
      off.push(() => coins.forEach(coin => coin.remove()));
      // The Pro card's light sweeps across it now and then.
      // SlowMo: the light lingers as it crosses the price, then slips away.
      gsap.fromTo(q('.cl-plan-sheen'), { xPercent: -160 }, { xPercent: 260, duration: 2.2, ease: 'slow(0.5, 0.75, false)', repeat: -1, repeatDelay: 3, delay: 1 });

      // 5 · the four motions start as their card comes into view.
      q('.cl-card').forEach(card => ScrollTrigger.create({ trigger: card, start: 'top 82%', once: true, onEnter: () => card.classList.add('is-in') }));

      // Questions open and close smoothly instead of jumping.
      q('.cl-faq details').forEach(item => {
        const summary = item.querySelector('summary'), answer = item.querySelector<HTMLElement>('.cl-faq-a');
        if (!summary || !answer) return;
        const toggle = safe((event: Event) => {
          event.preventDefault();
          const element = item as HTMLDetailsElement;
          if (element.open) {
            item.classList.add('is-closing');
            gsap.to(answer, { height: 0, opacity: 0, duration: 0.32, ease: 'power2.inOut', overwrite: true, onComplete: () => { element.open = false; item.classList.remove('is-closing'); gsap.set(answer, { clearProps: 'height,opacity' }); } });
          } else {
            element.open = true;
            gsap.fromTo(answer, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.45, ease: 'power3.out', overwrite: true, clearProps: 'height' });
          }
        });
        summary.addEventListener('click', toggle);
        off.push(() => summary.removeEventListener('click', toggle));
      });

      // The page's own links glide to their section, below the top bar (ScrollToPlugin); the skip link stays instant.
      q('a[href^="#"]:not(.cl-skip)').forEach(link => {
        const go = safe((event: Event) => {
          const id = link.getAttribute('href')!.slice(1);
          const found = id === 'top' ? null : document.getElementById(id);
          if (id !== 'top' && !found) return;
          event.preventDefault();
          // The section, not a card inside it: cards may still be rising into place, which would throw the aim off.
          const target = found?.closest('section') ?? found;
          const bar = q('.cl-bar')[0]?.offsetHeight ?? 68;
          gsap.to(window, { duration: 1.2, ease: 'power3.inOut', scrollTo: { y: target ?? 0, offsetY: target ? bar : 0, autoKill: true }, overwrite: true,
            onComplete: () => { if (target) { if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); } } });
        });
        link.addEventListener('click', go);
        off.push(() => link.removeEventListener('click', go));
      });

      // 6 · the close: the ribbon draws itself as it scrolls in, and Krarok coins ride along it (MotionPath).
      const ribbon = page.querySelector<SVGPathElement>('.cl-ribbon path');
      if (ribbon) {
        gsap.from(ribbon, { drawSVG: 0, ease: 'none', scrollTrigger: { trigger: q('.cl-final')[0], start: 'top 85%', end: 'center 55%', scrub: 0.8 } });
        // They fade while they pass behind the words, so the ribbon never runs a coin under the heading or the timer.
        const card = q('.cl-final-card')[0], riders = q('.cl-coin');
        let words: { left: number; top: number; right: number; bottom: number }[] = [];
        const measure = () => {
          if (!card) return;
          const box = card.getBoundingClientRect();
          words = q('.cl-final-in > *').map(part => { const r = part.getBoundingClientRect(); return { left: r.left - box.left - 26, top: r.top - box.top - 26, right: r.right - box.left + 26, bottom: r.bottom - box.top + 26 }; });
        };
        ScrollTrigger.addEventListener('refresh', measure); measure();
        off.push(() => ScrollTrigger.removeEventListener('refresh', measure));
        riders.forEach((coin, at) => {
          let hidden = false;
          gsap.to(coin, { duration: 12, ease: 'none', repeat: -1, motionPath: { path: ribbon, align: ribbon, alignOrigin: [0.5, 0.5] },
            onUpdate: () => {
              const x = Number(gsap.getProperty(coin, 'x')) + coin.offsetWidth / 2, y = Number(gsap.getProperty(coin, 'y')) + coin.offsetHeight / 2;
              const behind = words.some(r => x > r.left && x < r.right && y > r.top && y < r.bottom);
              if (behind !== hidden) { hidden = behind; gsap.to(coin, { opacity: behind ? 0 : 1, duration: 0.35, ease: 'power1.out', overwrite: 'auto' }); }
            } }).progress(at / riders.length);
        });
      }
      gsap.from(q('.cl-final-in > *'), { y: 30, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: q('.cl-final')[0], start: 'top 70%' } });
      return () => off.forEach(undo => undo());
    });

    // With a mouse: the glass cards tilt and catch a light where the pointer is, the big buttons lean towards it,
    // the hero's cards drift against it at different depths, and the problem notes can be picked up (they spring back).
    mm.add(`${MOTION} and ${FINE_POINTER}`, () => {
      const off: (() => void)[] = [];
      const listen = (el: EventTarget, type: string, handler: (event: PointerEvent) => void) => { el.addEventListener(type, handler as EventListener); off.push(() => el.removeEventListener(type, handler as EventListener)); };
      q('.cl-card, .cl-plan').forEach(card => {
        gsap.set(card, { transformPerspective: 1100 });
        const tiltX = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' }), tiltY = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
        listen(card, 'pointermove', event => {
          const box = card.getBoundingClientRect(), x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
          card.style.setProperty('--mx', `${event.clientX - box.left}px`); card.style.setProperty('--my', `${event.clientY - box.top}px`);
          tiltX((0.5 - y) * 4); tiltY((x - 0.5) * 5);
        });
        listen(card, 'pointerleave', () => { tiltX(0); tiltY(0); });
      });
      q('.cl-btn.is-big').forEach(button => {
        const x = gsap.quickTo(button, 'x', { duration: 0.5, ease: 'power3.out' }), y = gsap.quickTo(button, 'y', { duration: 0.5, ease: 'power3.out' });
        listen(button, 'pointermove', event => { const box = button.getBoundingClientRect(); x((event.clientX - box.left - box.width / 2) * 0.18); y((event.clientY - box.top - box.height / 2) * 0.28); });
        listen(button, 'pointerleave', () => { x(0); y(0); });
      });
      const tiles = q('.cl-tiles')[0], scene = q('.cl-scene')[0];
      if (tiles && scene) {
        gsap.set(tiles, { '--px': 0, '--py': 0 });
        const px = gsap.quickTo(tiles, '--px', { duration: 1, ease: 'power3.out' }), py = gsap.quickTo(tiles, '--py', { duration: 1, ease: 'power3.out' });
        listen(scene, 'pointermove', event => { px((event.clientX / innerWidth - 0.5) * -2); py((event.clientY / innerHeight - 0.5) * -2); });
      }
      q('.cl-note').forEach(note => {
        const [drag] = Draggable.create(note, {
          type: 'x,y', zIndexBoost: true, cursor: 'grab', activeCursor: 'grabbing',
          onPress: safe(() => { gsap.to(note, { scale: 1.06, duration: 0.25, overwrite: 'auto' }); }),
          onRelease: safe(() => { gsap.to(note, { x: 0, y: 0, scale: 1, duration: 1.2, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' }); }),
        });
        off.push(() => drag.kill());
      });
      return () => off.forEach(undo => undo());
    });

    // Measure again once the fonts and the phone picture have their size.
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh).catch(() => undefined);
    window.addEventListener('load', refresh);
    return () => { window.removeEventListener('load', refresh); mm.revert(); };
    // The page is built once; the language and the deal re-render it through the app.
  }, { scope: root, dependencies: [promoRunning, price.price], revertOnUpdate: true });

  const start = (className = '') => <a className={`cl-btn is-big ${className}`} href={LOGIN}><Roll text={tr('เริ่มใช้ฟรี')} /><span className="cl-btn-dot" aria-hidden="true"><ArrowRight size={17} /></span></a>;

  return (
    <div className="cl" ref={root}>
      <a className="cl-skip" href="#cl-main">{tr('ข้ามไปเนื้อหา')}</a>
      <header className="cl-bar">
        <a href="#top" className="cl-logo" aria-label={tr('กระรอกตุนเงิน หน้าแรก')}><BrandLockup size={30} /></a>
        <nav className="cl-links" aria-label={tr('เมนูหลัก')}><a href="#cl-features"><Roll text={tr('ฟีเจอร์')} /></a><a href="#pricing"><Roll text={tr('ราคา')} /></a><a href="#cl-faq"><Roll text={tr('คำถาม')} /></a></nav>
        <span className="cl-bar-right"><a className="cl-login" href={LOGIN}><Roll text={tr('เข้าสู่ระบบ')} /></a><a className="cl-btn is-small" href={LOGIN}><Roll text={tr('เริ่มใช้ฟรี')} /></a></span>
        <span className="cl-progress" aria-hidden="true" />
      </header>

      <main id="cl-main">
        {/* 1 · the hero and the phone, one scene */}
        <section id="top" className="cl-scene" aria-labelledby="cl-h1">
          <div className="cl-pin">
            <span className="cl-tint" aria-hidden="true" />
            <Liquid className="is-hero" />
            <div className="cl-top">
              <div className="cl-hero">
                <span className="cl-chip cl-glass"><i aria-hidden="true" /><span className="cl-chip-text">{tr('เลขาการเงินสำหรับคนทำงานอิสระ')}</span></span>
                <h1 id="cl-h1" aria-label={`${tr('เรื่องเงินของงานอิสระ')} ${trc('hero', 'ให้')}${tr('เลขากระรอก')}${trc('hero', 'ดูแล')}`}><span aria-hidden="true"><span className="gl-nw"><Words text={tr('เรื่องเงินของงานอิสระ')} /></span><br /><span className="gl-nw"><Words text={trc('hero', 'ให้')} /><MaskedGrad text={tr('เลขากระรอก')} className="gl-loop" /><Words text={trc('hero', 'ดูแล')} /></span></span></h1>
                <p className="cl-lead">{tr('จดงาน เตือนลูกค้าจ่าย ออกใบเสนอราคาถึงใบเสร็จ')} <br />{tr('แค่พิมพ์หรือพูดภาษาปกติ ทั้งในแอปและใน LINE')}</p>
                <div className="cl-cta">{start()}<a className="cl-btn is-ghost" href="#cl-features">{tr('ดูว่าเลขาทำอะไรได้')}<ChevronDown size={18} aria-hidden="true" /></a></div>
                <ul className="cl-ticks">{[tr('ไม่ต้องใช้บัตร'), tr('คอม iPad และมือถือ'), tr('เชื่อม LINE ได้')].map(item => <li key={item}><i><Check size={12} strokeWidth={3.2} /></i>{item}</li>)}</ul>
              </div>
              <div className="cl-tiles" aria-hidden="true">
                <Tile n={1}><LineLogo size={30} /></Tile>
                <Tile n={2} text><span className="cl-tile-icon is-orange"><Bell size={16} /></span><span className="cl-tile-pair"><b className="gl-num" data-scramble>08:00</b><small>{tr('เตือนรับเงิน')}</small></span></Tile>
                <Tile n={3} text><span className="cl-tile-icon is-green"><Plus size={16} strokeWidth={3} /></span><span className="cl-tile-pair"><b className="gl-num is-green" data-scramble>+฿5,000</b><small>{tr('รับแล้ว')}</small></span></Tile>
                <Tile n={4}><span className="cl-tile-doc"><FileText size={26} /></span></Tile>
                <Tile n={5}><GmailLogo size={28} /></Tile>
                <Tile n={6}><span className="cl-tile-face"><Mascot gear="headset" mood="happy" animated={false} size={46} viewBox="12 8 76 76" /></span></Tile>
                <Tile n={7} text><span className="cl-tile-stat"><small><i className="is-due" />{tr('เงินรอรับ')}</small><b className="gl-num" data-scramble>฿12,500</b><em>{tr('{0} งาน', 2)}</em></span></Tile>
                <Tile n={8} text><span className="cl-tile-stat"><small><i className="is-in" />{tr('เงินเข้าเดือนนี้')}</small><b className="gl-num" data-scramble>฿38,500</b><Sparkline /></span></Tile>
              </div>
            </div>
            <div className="cl-stage">
              <div className="cl-side is-left">
                <span className="cl-eyebrow">{tr('ภาพรวม')}</span>
                <h2 aria-label={`${trc('stage', 'เห็นเงิน')}${trc('stage', 'ทั้งเดือน')}${trc('stage', 'ในหน้าเดียว')}`}><span aria-hidden="true"><span className="gl-nw"><Words text={trc('stage', 'เห็นเงิน')} /></span><wbr /><span className="gl-nw"><Words text={trc('stage', 'ทั้งเดือน')} /></span><wbr /><span className="gl-nw"><MaskedGrad text={trc('stage', 'ในหน้าเดียว')} /></span></span></h2>
              </div>
              <div className="cl-device">
                <div className="cl-device-frame">
                  <span className="cl-island" aria-hidden="true" />
                  <img className="cl-screen" src="/landing-v3/phone-overview.webp" width={1170} height={2532} alt={tr('หน้าภาพรวมของแอปบนมือถือ')} />
                </div>
                <div className="cl-notice cl-glass" aria-hidden="true">
                  <span className="cl-notice-icon"><Check size={16} strokeWidth={3} /></span>
                  <span className="cl-notice-text"><b>{tr('รับเงินแล้ว')}<em className="gl-num">+฿5,000</em></b><small>{tr('รีวิวสินค้า · คุณเอ')}</small></span>
                </div>
              </div>
              <div className="cl-side is-right">
                <p>{tr('มูลค่างาน รับเงินจริง รายจ่าย และกำไรสุทธิของเดือนนี้ เทียบกับเดือนก่อนให้ทันที')}</p>
                <p className="cl-side-note">{tr('ใช้ได้ทั้งคอม iPad และมือถือ')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* the money ticker */}
        <div className="cl-ticker" aria-hidden="true">
          <div className="cl-ticker-track">
            {[0, 1].map(copy => (
              <span key={copy} className="cl-ticker-set">
                {TICKER.map(item => (
                  <span key={item.label} className={`cl-tick-item is-${item.tone}`}><i />{tr(item.label)}{item.amount && <b className="gl-num">{item.amount}</b>}</span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* 2 · the problems */}
        <section className="cl-problem" aria-labelledby="cl-problem-title">
          <Liquid className="is-problem" />
          <div className="cl-problem-stage">
            <div className="cl-problem-head">
              <span className="cl-eyebrow">{tr('ปัญหาที่ฟรีแลนซ์เจอ')}</span>
              <h2 id="cl-problem-title" data-words aria-label={`${trc('problem', 'งานฟรีแลนซ์')}${trc('problem', 'ก็เหนื่อยพอแล้ว…')}`}><span aria-hidden="true"><span className="gl-nw"><Words text={trc('problem', 'งานฟรีแลนซ์')} /></span><wbr /><span className="gl-nw"><Words text={trc('problem', 'ก็เหนื่อยพอแล้ว…')} /></span></span></h2>
              <p>{tr('เรื่องเงินที่เหลือ ให้เลขากระรอกจัดการ')}</p>
            </div>
            <ul className="cl-notes">{NOTES.map(({ icon: Icon, text }, at) => (
              <li key={text} className={`cl-note is-${at + 1}`}>
                <span className="cl-note-in cl-glass"><span className="cl-note-icon" aria-hidden="true"><Icon size={18} /></span><span className="gl-hand">{lines(tr(text))}</span></span>
              </li>
            ))}</ul>
          </div>
        </section>

        {/* 3 · the price */}
        <section className="cl-pricing" aria-labelledby="cl-price-title">
          <Liquid className="is-price" />
          <div className="cl-head">
            <span className="cl-eyebrow">{trc('eyebrow', 'ราคา')}</span>
            <p className="cl-was"><span>{tr('จ้างเลขาจริง เดือนละหลักหมื่น')}<i className="cl-was-line" aria-hidden="true" /></span></p>
            <h2 id="cl-price-title">{tr('เลขากระรอก')} <span className="cl-underline gl-nw">{tr('วันละไม่ถึง {0}', formatBaht(Math.ceil(price.price / 30)))}<svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 14 C 60 4, 120 18, 180 9 S 270 6, 297 12" /></svg></span></h2>
          </div>
          <div className="cl-plans">
            <article className="cl-plan is-free cl-glass" data-rise>
              <span className="cl-plan-tag">Free</span>
              <p className="gl-hand cl-zero">฿0</p>
              <h3>{tr('เริ่มฟรี')} <span className="cl-grad">{tr('ไม่ต้องใช้บัตร')}</span></h3>
              <p className="cl-plan-text">{tr('จดงาน รายรับรายจ่าย ปฏิทิน และออกเอกสารได้ 10 ใบต่อเดือน')}</p>
            </article>
            <article className="cl-plan is-pro" id="pricing" data-rise>
              <span className="cl-plan-liquid" aria-hidden="true"><i /><i /></span>
              <span className="cl-plan-sheen" aria-hidden="true" />
              <span className="cl-plan-head"><span className="cl-plan-brand"><img src="/kv/symbol.svg" alt="" />KRAROK PRO</span><span className="cl-plan-badge">{tr('แนะนำ')}</span></span>
              <p className="cl-price">{promoRunning && <s className="cl-price-was"><span className="sr-only">{tr('ราคาปกติ')} </span>{formatBaht(PRO_REGULAR_MONTHLY)}</s>}<strong className="gl-num">{formatBaht(price.price)}</strong><span>{tr('/ เดือน')}</span></p>
              <p className="cl-price-fee">{tr('+ ค่าธรรมเนียมชำระเงิน {0} · ยอดชำระ {1}', formatBaht(price.fee), formatBaht(price.total))}</p>
              <h3>{tr('อัปเกรดเป็น')} <span className="cl-grad">Pro</span> {tr('เมื่อพร้อม')}</h3>
              <p className="cl-plan-text">{tr('เลขากระรอก แจ้งเตือนทาง LINE และอีเมล ออกเอกสารได้ไม่จำกัด')}</p>
            </article>
          </div>
          <div className="cl-center">{start()}</div>
        </section>

        {/* 4 · what it does, each shown as a short motion of the real flow, on liquid glass cards */}
        <section id="cl-features" className="cl-features" aria-labelledby="cl-features-title">
          <Liquid className="is-features" />
          <div className="cl-head">
            <span className="cl-eyebrow">{tr('ฟีเจอร์')}</span>
            <h2 id="cl-features-title" data-words aria-label={tr('ครบในแอปเดียว')}><span aria-hidden="true"><Words text={tr('ครบในแอปเดียว')} /></span></h2>
            <p>{tr('ทุกเรื่องเงินของงานอิสระ ตั้งแต่จดงานจนได้รับเงิน')}</p>
          </div>
          <div className="cl-bento">
            {FEATURES.map(feature => (
              <article key={feature.kind} className={`cl-card cl-glass is-${feature.kind}`} data-rise>
                <div className="cl-card-text">
                  <h3><span className="cl-grad">{tr(feature.key)}</span>{lines(tr(feature.rest))}</h3>
                  <p>{tr(feature.text)}</p>
                </div>
                <div className={`cl-card-visual gl-feature-visual is-${feature.kind}`}>
                  {feature.kind === 'chat' ? <ChatDemo /> : feature.kind === 'remind' ? <PhoneDemo /> : feature.kind === 'docs' ? <DocsDemo /> : <CalendarDemo />}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 5 · questions */}
        <section id="cl-faq" className="cl-faq" aria-labelledby="cl-faq-title">
          <div className="cl-faq-side">
            <span className="cl-eyebrow">{trc('eyebrow', 'คำถาม')}</span>
            <h2 id="cl-faq-title" data-words aria-label={trc('faq', 'คำถามที่พบบ่อย')}><span aria-hidden="true"><Words text={trc('faq', 'คำถามที่พบบ่อย')} /></span></h2>
            <p>{tr('ทุกอย่างที่ควรรู้ก่อนเริ่มใช้')}</p>
          </div>
          <div className="cl-faq-list">{FAQ.map(item => (
            <details key={item.q} className="cl-glass"><summary>{tr(item.q)}<span aria-hidden="true"><Plus size={18} /></span></summary><div className="cl-faq-a"><p>{tr(item.a)}</p></div></details>
          ))}</div>
        </section>

        {/* 6 · the close */}
        <section className="cl-final" aria-labelledby="cl-final-title">
          <div className="cl-final-card">
            <span className="cl-final-liquid" aria-hidden="true"><i /><i /><i /></span>
            <svg className="cl-ribbon" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true">
              <path d="M-40 400 C 160 520, 300 140, 470 230 S 640 520, 820 330 S 1000 40, 1250 170" />
            </svg>
            {[0, 1, 2, 3].map(at => <span key={at} className="cl-coin" aria-hidden="true"><img src="/kv/symbol.svg" alt="" /></span>)}
            <div className="cl-final-in">
              <Mascot gear="headset" mood="wave" action="wave" size={140} />
              <h2 id="cl-final-title"><span className="gl-nw">{trc('final', 'ให้เลขากระรอก')}</span><wbr /><span className="gl-nw">{trc('final', 'ช่วยดูแลเงินของคุณ')}</span><br /><span className="cl-final-em">{tr('ตั้งแต่วันนี้')}</span></h2>
              <Countdown />
              <div className="cl-final-cta">{start('is-light')}</div>
            </div>
          </div>
        </section>
      </main>

      <footer className="cl-foot">
        <BrandLockup size={26} />
        <span className="cl-foot-links"><a href="/privacy">{tr('นโยบายความเป็นส่วนตัว')}</a><a href="/terms">{tr('ข้อตกลงการใช้งาน')}</a></span>
        <span className="cl-foot-copy">{tr('© 2569 กระรอกตุนเงิน')}</span>
      </footer>
    </div>
  );
}
