import React from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { CustomEase } from 'gsap/CustomEase';
import { CustomWiggle } from 'gsap/CustomWiggle';
import { ExpoScaleEase, SlowMo } from 'gsap/EasePack';
import { Observer } from 'gsap/Observer';
import { PhysicsPropsPlugin } from 'gsap/PhysicsPropsPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { Draggable } from 'gsap/Draggable';
import { Bell, Briefcase, Bug, Camera, Check, CircleHelp, Clapperboard, CodeXml, Coins, FileText, Globe, GraduationCap, Instagram, Lightbulb, Mail, Music2, NotebookPen, PenLine, PenTool, Plus, Video, Wallet } from 'lucide-react';
import { BrandLockup } from '../../../components/brand/BrandLogo';
import { Mascot } from '../../../components/mascot/Mascot';
import { LineLogo } from '../../../components/ui/LineLogo';
import { GmailLogo } from '../../../components/ui/GmailLogo';
import { PRO_REGULAR_MONTHLY, formatBaht, proPriceParts } from '../../../../../shared/proPricing';
import { monthPromoCountdown, useMonthPromoRunning } from '../../billing/promoNotice';
import { currentLanguage } from '../../../i18n/currentLanguage';
import { tr, trc, T } from '../../../i18n/tr';
import { useLanguage } from '../../../i18n/LanguageContext';
import { PhoneDemo } from '../v4/Demos';
import { MascotSlot } from '../../assistant/MascotSlot';
import { statusFor, type AssistantMode } from '../../assistant/assistantMock';
import '../v4/demos.css';
import { HelpForm } from './HelpForm';
import { BRAND_LINKS } from './brandLinks';
import { FULL_LAUNCH_AT } from './launch';
import { SignupCount } from './SignupCount';
import { CalendarViews, ExpensesDemo } from './MoneyDemos';
import { TailWord } from './TailWord';

// The live chat and the A4 documents load only when their sections come near (they bring the app's chat and document code).
const ChatLive = React.lazy(() => import('./ChatLive'));
const DocsLive = React.lazy(() => import('./DocsLive').then(module => ({ default: module.DocsLive })));
import type { PublicFeedbackKind } from '../../../../../shared/feedbackPublic';
import './clean.css';

// The landing page, round 5 (owner, 2026-10-29): clean and white, modern and Gen Z, liquid glass cards and a finance
// feel, after a premium-site reference the owner sent, moved by GSAP ("เอา Gsap ไปศึกษาละทำออกมา"). Round 5b, the
// owner's review the same evening: no soft orange glows anywhere ("ถ้าจะส้มก็ส้มไปเลย ... ให้มันหน้ามันขาวไปเลย"), the top
// bar a rounded liquid glass capsule, no comparison with hiring a real secretary (accountants will use Krarok too), the
// chat with เลขา as the real screen, big, on a page of its own, the morning reminder on another, and a hero of the
// headline and เริ่มใช้ฟรี alone, the button magnetic like GSAP's demo. On computers the top is one pinned scroll scene:
// the words lift away, the floating cards fly into the phone and the phone rises to the middle. Phones and reduced motion
// get the same page laid out in order. Nothing that moves ever passes over text. Only features every account has today
// (50 ทวิ is not shown yet). The previous landing stays in ../v4.

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrambleTextPlugin, DrawSVGPlugin, MotionPathPlugin, Physics2DPlugin, PhysicsPropsPlugin, Draggable, Observer,
  ScrollToPlugin, CustomEase, CustomWiggle, ExpoScaleEase, SlowMo);
// Krarok's own ease for everything that rises into place: quick to leave, long and soft to land.
CustomEase.create('krarok', '0.16, 1, 0.3, 1');
// GSDevTools and MotionPathHelper are tools for building animations; GSAP advises against shipping them, so they are not here.

const LOGIN = '/login';
/** Where the top is one pinned scene. The stylesheet uses the same query (clean.css, "pinned scene"). */
const SCENE = '(min-width: 960px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)';
const MOTION = '(prefers-reduced-motion: no-preference)';
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

// The five problems, in the owner's words and order (2026-10-29): forgot to note it, documents, money mixed up,
// chasing who has paid, not knowing the real profit.
const NOTES = [
  { icon: NotebookPen, text: T('โอ๊ย จ่ายอะไรไปบ้างเนี่ย\nไม่ได้จดอีกแล้ว') },
  { icon: FileText, text: T('แค่ทำใบเสนอราคา\nทำไมมันยุ่งยากจัง') },
  { icon: Coins, text: T('อันไหนเงินงาน อันไหนเงินตัวเอง\nปนกันไปหมดแล้ว') },
  { icon: Wallet, text: T('ลูกค้าคนไหนยังไม่จ่ายบ้างนะ\nต้องไล่เช็กใหม่อีกแล้ว') },
  { icon: CircleHelp, text: T('ทำงานมาตั้งเยอะ\nตกลงเหลือกำไรเท่าไรกันแน่') },
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
// Who it is for (owner, 2026-10-30: "รับงานแบบไหน ก็มีเลขาช่วยได้"): the kinds of work, each with a plain icon, moving past.
const JOBS: { label: string; icon: typeof Camera }[] = [
  { label: 'กราฟิกดีไซเนอร์', icon: PenTool },
  { label: 'ช่างภาพ', icon: Camera },
  { label: 'คนตัดต่อ', icon: Clapperboard },
  { label: 'ครีเอเตอร์', icon: Video },
  { label: 'นักเขียน', icon: PenLine },
  { label: 'นักพัฒนา', icon: CodeXml },
  { label: 'ติวเตอร์', icon: GraduationCap },
  { label: 'คนรับงานอิสระ', icon: Briefcase },
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
/** A feature heading: the key word in CI colour, then the rest, each line kept whole; split for the reveal. */
function FeatureTitle({ id, word, rest }: { id: string; word: string; rest: string }) {
  const parts = rest.split('\n');
  // English words are spaced: the space after the coloured word goes outside its mask (a trailing space inside an
  // inline block is dropped, which made "Talkto"), and the spoken name has a space where the lines break.
  const coloured = word.trimEnd();
  const gap = coloured !== word ? ' ' : '';
  return (
    <h2 id={id} data-words aria-label={`${coloured}${gap}${parts.join(currentLanguage === 'en' ? ' ' : '')}`}>
      <span aria-hidden="true">{parts.map((line, at) => (
        <React.Fragment key={at}>{at > 0 && <br />}<span className="gl-nw">{at === 0 && <><MaskedGrad text={coloured} />{gap}</>}<Words text={line} /></span></React.Fragment>
      ))}</span>
    </h2>
  );
}

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

/** Four tiles: days, hours, minutes, seconds left, read out once as a whole (not every second). */
function CountTiles({ left }: { left: number }) {
  const days = Math.floor(left / 86400), hours = Math.floor(left / 3600) % 24, minutes = Math.floor(left / 60) % 60, seconds = left % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    <div role="timer" aria-live="off" data-seconds-left={left} className="cl-tiles-count"
      aria-label={tr('เวลาที่เหลือ {0} วัน {1} ชั่วโมง {2} นาที {3} วินาที', days, hours, minutes, seconds)}>
      {[[pad(days), tr('วัน')], [pad(hours), tr('ชั่วโมง')], [pad(minutes), tr('นาที')], [pad(seconds), tr('วินาที')]].map(([value, label]) => (
        <span key={label} className="cl-tick" aria-hidden="true"><b>{value}</b><small>{label}</small></span>
      ))}
    </div>
  );
}

/** The deal's countdown as four glass tiles (days, hours, minutes, seconds), only while the offer runs. */
function Countdown() {
  const running = useMonthPromoRunning();
  const left = usePromoSeconds(running);
  if (!running || left <= 0) return null;
  return (
    <div className="cl-count">
      <p className="cl-count-label">{tr('ดีลพิเศษ Pro {0} หมดใน', formatBaht(proPriceParts('month').price))}</p>
      <CountTiles left={left} />
    </div>
  );
}

function useSecondsUntil(at: number) {
  const secondsLeft = React.useCallback(() => Math.max(0, Math.ceil((at - Date.now()) / 1000)), [at]);
  const [seconds, setSeconds] = React.useState(secondsLeft);
  React.useEffect(() => {
    if (secondsLeft() <= 0) { setSeconds(0); return; }
    const tick = () => { const left = secondsLeft(); setSeconds(left); if (left <= 0) window.clearInterval(timer); };
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [secondsLeft]);
  return seconds;
}

/** Under the start button: the days left until Krarok is ready in full (owner, 2026-10-29); gone once the day comes. */
function LaunchCountdown() {
  const left = useSecondsUntil(FULL_LAUNCH_AT);
  if (left <= 0) return null;
  return (
    <div className="cl-launch">
      <p className="cl-launch-label">{tr('พร้อมให้ใช้งานเต็มรูปแบบ 1 ธันวาคม 2569')}</p>
      <CountTiles left={left} />
    </div>
  );
}

/** A floating glass card in the hero. Three layers: place (scroll), float (idle bob), card (entrance). A bare tile is
 *  just its icon, as large as a card, with no glass around it (owner, 2026-10-29: LINE, Gmail and the document). */
function Tile({ n, text, bare, tone = '', children }: { n: number; text?: boolean; bare?: boolean; tone?: string; children: React.ReactNode }) {
  return <span className={`cl-tile is-${n}${text ? ' has-text' : ''}${bare ? ' is-bare' : ''}`}><span className="cl-tile-float"><span className={`cl-tile-card${bare ? '' : ' cl-glass'} ${tone}`}>{bare ? <span className="cl-tile-bare">{children}</span> : children}</span></span></span>;
}

/** The language switch beside เข้าสู่ระบบ (owner, 2026-10-30: "แปลงเป็นภาษาอังกฤษ เผื่อคนต่างชาติ ... สำคัญมาก"): it shows the
 *  language it switches to, in that language ("EN" / "ไทย"); its spoken name is English both ways, for the visitor who
 *  reads English (as the app's own switch says "Switch to Thai"). The choice stays for the app and the sign-in page. */
function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  const next = language === 'th' ? 'en' : 'th';
  return (
    <button type="button" className="cl-lang" lang={next} onClick={() => setLanguage(next)}
      aria-label={next === 'en' ? 'Switch to English' : 'Switch to Thai'} title={next === 'en' ? 'Switch to English' : 'Switch to Thai'}>
      <Globe size={16} aria-hidden="true" /><span>{next === 'en' ? 'EN' : 'ไทย'}</span>
    </button>
  );
}

/** Which plan a feature is in (owner, 2026-10-29: "ฟีเจอร์โปร ฝากบอกด้วย"): KRAROK PRO, or what Free gives. */
function Tier({ pro, children }: { pro?: boolean; children?: React.ReactNode }) {
  return pro
    ? <span className="cl-tier is-pro"><img src="/kv/symbol.svg" alt="" />KRAROK PRO</span>
    : <span className="cl-tier">{children}</span>;
}

function Sparkline() {
  return (
    <svg className="cl-spark" viewBox="0 0 120 36" aria-hidden="true">
      <path className="cl-spark-line" d="M2 30 L18 26 L34 28 L50 18 L66 21 L82 12 L98 14 L118 4" fill="none" stroke="#18A66A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The one action: a CI pill inside a larger magnetic zone (GSAP's magnetic-button demo): the button follows the pointer,
 *  its label a little further, and springs back when the pointer leaves; now and then it wiggles for attention. */
function StartButton({ light = false }: { light?: boolean }) {
  return (
    <span className="cl-mag">
      <a className={`cl-btn is-big${light ? ' is-light' : ''}`} href={LOGIN}>
        <span className="cl-btn-bg" aria-hidden="true" />
        <span className="cl-btn-label">{tr('เริ่มใช้ฟรี')}</span>
      </a>
    </span>
  );
}

/** The bar's start button on computers and iPads (owner, 2026-10-30): not while another start button is on screen. So it
 *  is not there on the first screen (the big one is), slides in once the page moves on to the phone (the hero's words
 *  lift away in the pinned scene, so the big button's fade counts, not only where it sits), and steps aside again
 *  wherever the page shows its own start button (under the price, the closing card). Phones keep theirs as it was. */
const BAR_START_FROM = '(min-width: 744px)';
function useBarStart(root: React.RefObject<HTMLDivElement | null>) {
  React.useEffect(() => {
    const page = root.current;
    const bar = page?.querySelector<HTMLElement>('.cl-bar'), slot = page?.querySelector<HTMLElement>('.cl-bar-cta');
    if (!page || !bar || !slot) return;
    const wide = window.matchMedia(BAR_START_FROM);
    let frame = 0, settle = 0, shown: boolean | null = null;
    const onScreen = (button: HTMLElement) => {
      const box = button.getBoundingClientRect();
      if (!box.height) return false;
      const room = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, bar.getBoundingClientRect().bottom);
      if (room < box.height / 2) return false;
      // the hero's words fade away as the scene moves on; the button goes with them
      const hero = button.closest('.cl-hero');
      if (!hero) return true;
      const look = getComputedStyle(hero);
      return look.visibility !== 'hidden' && parseFloat(look.opacity) > 0.5;
    };
    const update = () => {
      frame = 0;
      const show = !wide.matches || !Array.from(page.querySelectorAll<HTMLElement>('main .cl-btn.is-big')).some(onScreen);
      if (show === shown) return;
      shown = show;
      const button = slot.firstElementChild as HTMLElement | null;
      if (button) slot.style.setProperty('--cl-cta-w', `${Math.ceil(button.offsetWidth)}px`);
      bar.classList.toggle('has-start', show);
      slot.inert = !show;
    };
    const ask = () => {
      if (!frame) frame = requestAnimationFrame(update);
      // the scene follows the scroll a moment behind (scrub), so look once more after it settles
      window.clearTimeout(settle); settle = window.setTimeout(update, 900);
    };
    update();
    window.addEventListener('scroll', ask, { passive: true });
    window.addEventListener('resize', ask);
    wide.addEventListener('change', ask);
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(settle);
      window.removeEventListener('scroll', ask); window.removeEventListener('resize', ask); wide.removeEventListener('change', ask);
    };
  }, [root]);
}

/** The app's window sizes the live chat is drawn at, scaled to the figure. */
const CHAT_STAGE = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;

function useMedia(query: string) {
  const [matches, setMatches] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  React.useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setMatches(list.matches);
    change();
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, [query]);
  return matches;
}

/** True while the element is within `margin` of the screen (once = stays true after the first time). */
function useNear(ref: React.RefObject<HTMLElement | null>, margin: string, once = false) {
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      setNear(entry.isIntersecting);
      if (once && entry.isIntersecting) observer.disconnect();
    }, { rootMargin: margin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, margin, once]);
  return near;
}

/** The real chat screen, live in the page (owner, 2026-10-29: sharp at any zoom), with เลขากระรอก beside it doing what
 *  the chat is doing. It runs only while it is near the screen, and from the start each time it comes back. */
function ChatScreen() {
  const [mode, setMode] = React.useState<AssistantMode>('awake');
  const box = React.useRef<HTMLDivElement>(null);
  const shot = React.useRef<HTMLDivElement>(null);
  const near = useNear(box, '400px 0px');
  const phone = useMedia('(max-width: 743px)');
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const stage = phone ? CHAT_STAGE.phone : CHAT_STAGE.desk;
  const [scale, setScale] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = shot.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / stage.width);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stage.width]);
  return (
    <div className="cl-chatwrap" ref={box}>
      <div className={`cl-buddy cl-glass is-${mode}`} aria-hidden="true">
        <span className="cl-buddy-face"><MascotSlot mode={mode} size={70} gear="headset" /></span>
        <span className="cl-buddy-text"><b>{tr('เลขากระรอก')}</b><small><i />{statusFor(mode)}</small></span>
      </div>
      <div className={`cl-chatshot${phone ? ' is-phone' : ''}`} ref={shot} role="img" aria-label={tr('ตัวอย่าง: ถามเลขาว่าใครยังไม่จ่าย แล้วบอกงานพรุ่งนี้ให้บันทึก')}>
        <div className="cl-chatlive" style={{ width: stage.width, height: stage.height, transform: `scale(${scale})` }}>
          {near && scale > 0 && (
            <React.Suspense fallback={null}>
              <ChatLive phone={phone} still={still} width={stage.width} height={stage.height} onMode={setMode} />
            </React.Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

/** The documents, drawn once they come near the screen (the A4 renderer loads then). */
function LiveDocs() {
  const box = React.useRef<HTMLDivElement>(null);
  const near = useNear(box, '600px 0px', true);
  return (
    <div ref={box} className="cl-docs-live" role="img" aria-label={tr('ตัวอย่าง: ใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ ออกต่อกันจากงานเดียว')}>
      {near ? <React.Suspense fallback={<div className="gl-demo gl-docs" />}><DocsLive /></React.Suspense> : <div className="gl-demo gl-docs" />}
    </div>
  );
}

/** An element's place inside an ancestor, ignoring transforms (so it can be measured mid-animation). */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.offsetParent as HTMLElement | null) { x += node.offsetLeft; y += node.offsetTop; }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}

/** The landing is light only. The app turns dark by itself in the evening (a class on <html>), which would turn the live
 *  chat screen dark too: it is kept off while the landing is shown, and put back when the landing goes. */
function useLightOnly() {
  React.useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    const clear = () => { if (html.classList.contains('dark')) html.classList.remove('dark'); };
    clear();
    const observer = new MutationObserver(clear);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => { observer.disconnect(); if (wasDark) html.classList.add('dark'); };
  }, []);
}

/** In English, "Krarok Assistant" in the headline is set in a rounded type (Nunito), as เลขากระรอก is in Thai's looped
 *  type: friendly but formal (owner, 2026-10-30). Loaded only for English. */
function useRoundedLatin() {
  React.useEffect(() => {
    if (currentLanguage !== 'en' || document.getElementById('cl-round-font')) return;
    const link = document.createElement('link');
    link.id = 'cl-round-font'; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@800&display=swap';
    document.head.appendChild(link);
  }, []);
}

export default function CleanLanding() {
  useSriracha();
  useRoundedLatin();
  useLightOnly();
  const promoRunning = useMonthPromoRunning();
  const price = proPriceParts('month');
  const root = React.useRef<HTMLDivElement>(null);
  useBarStart(root);
  // The report form, opened from the menu's ช่วยเหลือ, the buttons under the price and the footer (one form for all).
  const [help, setHelp] = React.useState<PublicFeedbackKind | null>(null);
  const closeHelp = React.useCallback(() => setHelp(null), []);

  // useGSAP (@gsap/react): everything made here is reverted when the page goes or the deal changes.
  useGSAP((_context, contextSafe) => {
    const safe = contextSafe ?? (<T,>(fn: T) => fn);
    const page = root.current;
    if (!page) return;
    const q = (selector: string) => Array.from(page.querySelectorAll<HTMLElement>(selector));
    /** The room kept at the top for the floating bar. */
    const reserved = () => parseFloat(getComputedStyle(page).getPropertyValue('--bar')) || 88;
    const mm = gsap.matchMedia(page);

    // Without motion: everything shows where it ends, and the motions show their last frame (demos.css).
    mm.add('(prefers-reduced-motion: reduce)', () => { q('.cl-feat').forEach(section => section.classList.add('is-in')); });

    // The pinned scene comes first: ScrollTriggers are measured in the order they are made, and every later section
    // sits below this one's scroll room (GSAP's ScrollTrigger guidance: create them from the top of the page down).
    mm.add(SCENE, () => {
      const scene = q('.cl-scene')[0], pin = q('.cl-pin')[0], device = q('.cl-device')[0], hero = q('.cl-hero')[0], tiles = q('.cl-tiles')[0];
      if (!scene || !pin || !device || !hero || !tiles) return;
      // The phone first peeks up from below the words (and the cards, when they sit under the words), then rises.
      const frame = q('.cl-device-frame')[0], deck = q('.cl-deck')[0];
      if (!frame || !deck) return;
      // The device sits centred below the bar (CSS left/top); GSAP keeps it centred while it changes size.
      gsap.set(device, { xPercent: -50, yPercent: -50 });
      const peek = () => {
        const pinHeight = pin.offsetHeight, height = device.offsetHeight;
        const strip = getComputedStyle(tiles).position === 'absolute' ? 0 : tiles.offsetTop + tiles.offsetHeight;
        const above = Math.max(hero.offsetTop + hero.offsetHeight, strip);
        return Math.max(0, Math.max(above + 34, pinHeight - 170) - (pinHeight / 2 + reserved() / 2 - height / 2));
      };
      // The computer it becomes: its width from the stylesheet (--cl-lw), a 16:10 screen in the same 10px bezel.
      // (A custom property reads back as its formula, so a hidden probe of that width gives the pixels.)
      const laptop = () => { const width = q('.cl-lw-probe')[0]?.offsetWidth || 760; return { width, height: (width - 20) * 0.625 + 20 }; };
      const toPhone = (el: HTMLElement, axis: 'x' | 'y') => {
        const at = offsetIn(el, pin);
        return axis === 'x' ? pin.offsetWidth / 2 - at.x : pin.offsetHeight / 2 + reserved() / 2 - at.y;
      };
      const scroll = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: scene, start: 'top top', end: '+=1900', pin, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      // autoAlpha: once gone, the words and cards are hidden too, so nothing unseen sits over what is shown.
      scroll.to(hero, { autoAlpha: 0, y: -120, duration: 0.2, ease: 'power1.in' }, 0)
        .fromTo(device, { y: peek }, { y: 0, duration: 0.5, ease: 'power2.inOut' }, 0.16)
        .to(q('.cl-tile'), { x: (_i, el) => toPhone(el, 'x'), y: (_i, el) => toPhone(el, 'y'), rotation: (at: number) => (at % 2 ? 24 : -24), duration: 0.42, ease: 'power2.in' }, 0.18)
        // ExpoScaleEase: a shrink from 1 to 0.3 that looks even all the way, instead of most of it happening at the end
        .to(q('.cl-tile'), { scale: 0.3, duration: 0.42, ease: 'expoScale(1, 0.3, power1.in)' }, 0.18)
        .to(q('.cl-tile.has-text'), { autoAlpha: 0, duration: 0.16 }, 0.18)
        .to(q('.cl-tile:not(.has-text)'), { autoAlpha: 0, duration: 0.1 }, 0.5)
        .from(q('.cl-side.is-left .cl-w'), { yPercent: 115, duration: 0.16, stagger: 0.02, ease: 'power3.out' }, 0.56)
        .from(q('.cl-side'), { opacity: 0, x: (at: number) => (at ? 48 : -48), duration: 0.22, ease: 'power2.out' }, 0.56)
        .from(q('.cl-notice'), { opacity: 0, y: 26, scale: 0.88, duration: 0.14, ease: 'back.out(2)' }, 0.72)
        // Then the phone turns into a computer, the words beside it staying where they are: the notice goes, the body
        // stretches into the screen's lid, the island shrinks to the camera, the phone's screen gives way to the computer's,
        // and the keyboard deck opens out underneath.
        .to(q('.cl-notice'), { autoAlpha: 0, y: 14, duration: 0.07 }, 0.93)
        .to(frame, { width: () => laptop().width, height: () => laptop().height, borderRadius: 18, duration: 0.34, ease: 'power2.inOut' }, 0.98)
        .to(q('.cl-island'), { width: 7, height: 7, top: 3, borderRadius: 4, duration: 0.2, ease: 'power2.inOut' }, 1.0)
        // the computer's screen comes in over the phone's (never both see-through over the dark bezel), then the phone's goes
        .to(q('.cl-screen.is-desk'), { opacity: 1, duration: 0.16 }, 1.03)
        .set(q('.cl-screen.is-phone'), { opacity: 0 }, 1.2)
        .fromTo(deck, { scaleX: 0.25, autoAlpha: 0 }, { scaleX: 1, autoAlpha: 1, duration: 0.18, ease: 'power3.out' }, 1.16)
        .to({}, { duration: 0.16 }, 1.34);
    });

    mm.add(MOTION, () => {
      const off: (() => void)[] = [];
      // The capsule bar firms up once the page moves, with a thin CI line showing how far down the page is.
      ScrollTrigger.create({ start: 8, end: 'max', toggleClass: { targets: q('.cl-bar'), className: 'is-scrolled' } });
      gsap.fromTo(q('.cl-progress'), { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

      // 1 · the hero arrives: each word rises out of its own mask, the floating cards pop in, their amounts roll like a
      // money screen (ScrambleText, digits only) and the month's line draws itself (DrawSVG).
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      intro.from(q('.cl-hero h1 .cl-w'), { yPercent: 115, rotation: 5, transformOrigin: '0% 100%', duration: 1.2, ease: 'krarok', stagger: 0.07 }, 0.05)
        .from(q('.cl-launch'), { y: 16, autoAlpha: 0, duration: 0.8 }, 0.6)
        .from(q('.cl-cta'), { y: 18, autoAlpha: 0, scale: 0.92, duration: 0.8, ease: 'back.out(1.8)' }, 0.78)
        .from(q('.cl-perch'), { autoAlpha: 0, y: 24, scale: 0.6, transformOrigin: '50% 100%', duration: 0.9, ease: 'back.out(1.8)' }, 0.95)
        .from(q('.cl-tile-card'), { autoAlpha: 0, scale: 0.55, rotation: () => gsap.utils.random(-14, 14), duration: 1, ease: 'back.out(1.7)', stagger: { each: 0.08, from: 'random' } }, 0.35)
        .from(q('.cl-device-frame'), { opacity: 0, duration: 0.8 }, 0.5)
        .from(q('.cl-spark-line'), { drawSVG: 0, duration: 1.3, ease: 'power2.inOut' }, 0.9);
      q('[data-scramble]').forEach((el, at) => intro.to(el, { duration: 1.2, ease: 'none', scrambleText: { text: el.textContent ?? '', chars: '0123456789', speed: 0.7, revealDelay: 0.3 } }, 0.6 + at * 0.12));
      gsap.to(q('.cl-tile-float'), { y: 'random(-10, 10)', rotation: 'random(-3, 3)', duration: 'random(2.6, 4.2)', ease: 'sine.inOut', yoyo: true, repeat: -1, repeatRefresh: true, delay: 1.2 });

      // The buttons wiggle now and then for attention (CustomWiggle); the magnet below only moves x and y
      // (overwrite: "auto"), so the wiggle keeps going while the pointer pulls.
      q('.cl-btn.is-big').forEach((button, at) => gsap.to(button, { rotation: 7, duration: 1.3, ease: 'wiggle({wiggles: 7, type: easeOut})', repeat: -1, repeatDelay: 2.8, delay: 1.8 + at * 0.4 }));

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

      // 2 · the kinds of work run past on their own; scrolling speeds them up and leans them, then they ease back.
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
      // SlowMo: the light lingers as it crosses the price, then slips away.
      gsap.fromTo(q('.cl-plan-sheen'), { xPercent: -160 }, { xPercent: 260, duration: 2.2, ease: 'slow(0.5, 0.75, false)', repeat: -1, repeatDelay: 3, delay: 1 });

      // 5 · each feature page: its motion starts as it comes into view (the live chat runs by itself while it is near).
      q('.cl-feat').forEach(section => ScrollTrigger.create({ trigger: section, start: 'top 75%', once: true, onEnter: () => section.classList.add('is-in') }));

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

      // The page's own links glide to their section, below the floating bar (ScrollToPlugin); the skip link stays instant.
      q('a[href^="#"]:not(.cl-skip)').forEach(link => {
        const go = safe((event: Event) => {
          const id = link.getAttribute('href')!.slice(1);
          const found = id === 'top' ? null : document.getElementById(id);
          if (id !== 'top' && !found) return;
          event.preventDefault();
          // The section, not a card inside it: cards may still be rising into place, which would throw the aim off.
          const target = found?.closest('section') ?? found;
          gsap.to(window, { duration: 1.2, ease: 'power3.inOut', scrollTo: { y: target ?? 0, offsetY: target ? reserved() - 20 : 0, autoKill: true }, overwrite: true,
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

    // With a mouse: the start buttons are magnetic (GSAP's magnetic-button demo: the button follows at 0.4 of the
    // pointer, its label at 0.24 more, and springs back with elastic.out), the glass cards tilt and catch a light, the
    // hero's cards drift against the pointer at different depths, and the problem notes can be picked up (they spring back).
    mm.add(`${MOTION} and ${FINE_POINTER}`, () => {
      const off: (() => void)[] = [];
      const listen = (el: EventTarget, type: string, handler: (event: PointerEvent) => void) => { el.addEventListener(type, handler as EventListener); off.push(() => el.removeEventListener(type, handler as EventListener)); };
      q('.cl-mag').forEach(zone => {
        const button = zone.querySelector<HTMLElement>('.cl-btn'), label = zone.querySelector<HTMLElement>('.cl-btn-label');
        if (!button || !label) return;
        listen(zone, 'pointermove', event => {
          const box = zone.getBoundingClientRect();
          const x = gsap.utils.mapRange(box.left, box.right, -box.width / 2, box.width / 2, event.clientX);
          const y = gsap.utils.mapRange(box.top, box.bottom, -box.height / 2, box.height / 2, event.clientY);
          gsap.to(button, { x: x * 0.4, y: y * 0.3, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
          gsap.to(label, { x: x * 0.24, y: y * 0.18, duration: 0.4, ease: 'power2.out', overwrite: true });
        });
        listen(zone, 'pointerleave', () => {
          gsap.to(button, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)', overwrite: 'auto' });
          gsap.to(label, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)', overwrite: true });
        });
      });
      q('.cl-plan, .cl-feat-card').forEach(card => {
        gsap.set(card, { transformPerspective: 1100 });
        const tiltX = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' }), tiltY = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
        listen(card, 'pointermove', event => {
          const box = card.getBoundingClientRect(), x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
          card.style.setProperty('--mx', `${event.clientX - box.left}px`); card.style.setProperty('--my', `${event.clientY - box.top}px`);
          tiltX((0.5 - y) * 4); tiltY((x - 0.5) * 5);
        });
        listen(card, 'pointerleave', () => { tiltX(0); tiltY(0); });
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

  return (
    <div className={`cl${currentLanguage === 'en' ? ' is-en' : ''}`} ref={root}>
      <a className="cl-skip" href="#cl-main">{tr('ข้ามไปเนื้อหา')}</a>
      {/* The top bar: a floating liquid glass capsule (owner: "โค้งๆมนๆกลมๆ ไม่เป็นเหลี่ยม") */}
      <header className="cl-bar">
        <div className="cl-bar-in">
          <a href="#top" className="cl-logo" aria-label={tr('กระรอกตุนเงิน หน้าแรก')}><BrandLockup size={28} /></a>
          <nav className="cl-links" aria-label={tr('เมนูหลัก')}><a href="#cl-features"><Roll text={tr('ฟีเจอร์')} /></a><a href="#pricing"><Roll text={tr('ราคา')} /></a><a href="#cl-faq"><Roll text={tr('คำถาม')} /></a><a href="#cl-help"><Roll text={tr('ช่วยเหลือ')} /></a></nav>
          <span className="cl-bar-right"><a className="cl-help-link" href="#cl-help" aria-label={tr('ช่วยเหลือ')}><CircleHelp size={17} aria-hidden="true" /><span>{tr('ช่วยเหลือ')}</span></a><LanguageSwitch />
            {/* no เข้าสู่ระบบ here (owner, 2026-10-30): every start button opens the page that signs in or signs up; the bar's
                start button comes and goes with the page (useBarStart) */}
            <span className="cl-bar-cta"><a className="cl-btn is-small" href={LOGIN}><Roll text={tr('เริ่มใช้ฟรี')} /></a></span></span>
          <span className="cl-progress" aria-hidden="true" />
        </div>
      </header>

      <main id="cl-main">
        {/* 1 · the hero and the phone, one scene */}
        <section id="top" className="cl-scene" aria-labelledby="cl-h1">
          <div className="cl-pin">
            <div className="cl-top">
              <div className="cl-hero">
                <h1 id="cl-h1" aria-label={`${trc('hero', 'ตั้งแต่รับงาน')} ${trc('hero', 'จนถึงรับเงิน')} ${trc('hero', 'ให้')}${tr('เลขากระรอก')}${trc('hero', 'ดูแล')}`}><span aria-hidden="true"><span className="cl-h1-top"><span className="gl-nw"><Words text={trc('hero', 'ตั้งแต่รับงาน')} /></span> <span className="gl-nw"><Words text={trc('hero', 'จนถึงรับเงิน')} /></span></span><br /><span className="gl-nw cl-h1-end"><Words text={trc('hero', 'ให้')} />{currentLanguage === 'en' ? <MaskedGrad text={tr('เลขากระรอก')} className="gl-loop is-flow" /> : <TailWord />}<Words text={trc('hero', 'ดูแล')} />
                  {/* เลขากระรอก itself, standing at the end of its line and waving (owner, 2026-10-29: the words say เลขากระรอก, so
                      the squirrel should be there too). The locked mascot, its own wave; sized with the type. */}
                  <span className="cl-perch"><Mascot gear="headset" mood="wave" action="wave" size={120} /></span></span></span></h1>
                {/* No line of copy under the headline (owner, 2026-10-29): typing or speaking to เลขา is Pro only, and the
                    hero must not suggest it comes free. */}
                {/* The countdown under the headline, then the start button, bigger, with the real signup total beside it (under it
                    on phones; owner, 2026-10-30: "ยอดมีผู้สมัคร ... ด้านล่างของเขาดาว ... เริ่มใช้งานฟรีให้มันเด่นๆ"). The two side by
                    side are as tall as the button, so the first screen grows no taller. SignupCount.tsx */}
                <LaunchCountdown />
                <div className="cl-cta"><StartButton /><SignupCount /></div>
              </div>
              <div className="cl-tiles" aria-hidden="true">
                <Tile n={1} bare><LineLogo size={62} /></Tile>
                <Tile n={2} text tone="is-solid"><span className="cl-tile-icon is-white"><Bell size={16} /></span><span className="cl-tile-pair"><b className="gl-num" data-scramble>08:00</b><small>{tr('เตือนรับเงิน')}</small></span></Tile>
                <Tile n={3} text><span className="cl-tile-icon is-green"><Plus size={16} strokeWidth={3} /></span><span className="cl-tile-pair"><b className="gl-num is-green" data-scramble>+฿5,000</b><small>{tr('รับแล้ว')}</small></span></Tile>
                <Tile n={4} bare><span className="cl-tile-doc"><FileText size={30} /></span></Tile>
                <Tile n={5} bare><GmailLogo size={62} bare /></Tile>
                {/* no squirrel card here: เลขากระรอก stands at the end of the headline (owner, 2026-10-30: "มันซ้ำ") */}
                <Tile n={7} text><span className="cl-tile-stat"><small><i className="is-due" />{tr('เงินรอรับ')}</small><b className="gl-num" data-scramble>฿12,500</b><em>{tr('{0} งาน', 2)}</em></span></Tile>
                <Tile n={8} text><span className="cl-tile-stat"><small><i className="is-in" />{tr('เงินเข้าเดือนนี้')}</small><b className="gl-num" data-scramble>฿38,500</b><Sparkline /></span></Tile>
              </div>
            </div>
            <div className="cl-stage">
              <div className="cl-side is-left">
                <span className="cl-eyebrow">{tr('ภาพรวม')}</span>
                <h2 aria-label={`${trc('stage', 'เห็นเงิน')}${trc('stage', 'ทั้งเดือน')}${trc('stage', 'ในหน้าเดียว')}`}><span aria-hidden="true"><span className="gl-nw"><Words text={trc('stage', 'เห็นเงิน')} /></span><wbr /><span className="gl-nw"><Words text={trc('stage', 'ทั้งเดือน')} /></span><wbr /><span className="gl-nw"><MaskedGrad text={trc('stage', 'ในหน้าเดียว')} /></span></span></h2>
              </div>
              {/* The phone; on computers it turns into a computer as the page scrolls on (owner: "ให้มันแปลงร่างให้กลายเป็นคอม
                  ... ข้อความฝั่งซ้ายฝั่งขวาให้อยู่ที่เดิม"). Both screens are the app's real overview with the same example data. */}
              <div className="cl-device">
                <div className="cl-device-frame">
                  <span className="cl-island" aria-hidden="true" />
                  <img className="cl-screen is-phone" src="/landing-v5/overview-phone.webp" width={1170} height={2532} alt={tr('หน้าภาพรวมของแอปบนมือถือ')} />
                  <img className="cl-screen is-desk" src="/landing-v5/overview-desktop.webp" width={2400} height={1500} alt={tr('หน้าภาพรวมของแอปบนคอม')} />
                </div>
                <span className="cl-deck" aria-hidden="true" />
                <span className="cl-lw-probe" aria-hidden="true" />
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

        {/* who it is for: a small heading and the kinds of work moving past (six copies: half the strip is wider than a 2560px
            screen, so the loop never shows its end) */}
        <section className="cl-jobs" aria-labelledby="cl-jobs-title">
          <p id="cl-jobs-title" className="cl-jobs-title">{tr('รับงานแบบไหน ก็มีเลขาช่วยได้')}</p>
          <ul className="sr-only">{JOBS.map(job => <li key={job.label}>{trc('jobs', job.label)}</li>)}</ul>
          <div className="cl-ticker" aria-hidden="true">
            <div className="cl-ticker-track">
              {[0, 1, 2, 3, 4, 5].map(copy => (
                <span key={copy} className="cl-ticker-set">
                  {JOBS.map(({ label, icon: Icon }) => (
                    <span key={label} className="cl-tick-item"><span className="cl-tick-icon"><Icon size={16} strokeWidth={2} /></span>{trc('jobs', label)}</span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 2 · the problems */}
        <section className="cl-problem" aria-labelledby="cl-problem-title">
          <div className="cl-problem-stage">
            <div className="cl-problem-head">
              <span className="cl-eyebrow">{tr('เคยเป็นแบบนี้ไหม?')}</span>
              <h2 id="cl-problem-title" data-words aria-label={`${trc('problem', 'แค่รับงาน')}${trc('problem', 'ก็เหนื่อยพอแล้ว…')}`}><span aria-hidden="true"><span className="gl-nw"><Words text={trc('problem', 'แค่รับงาน')} /></span><wbr /><span className="gl-nw"><Words text={trc('problem', 'ก็เหนื่อยพอแล้ว…')} /></span></span></h2>
              <p>{tr('เรื่องเงินที่เหลือ ให้เลขากระรอกจัดการ')}</p>
            </div>
            <ul className="cl-notes">{NOTES.map(({ icon: Icon, text }, at) => (
              <li key={text} className={`cl-note is-${at + 1}`}>
                <span className="cl-note-in cl-glass"><span className="cl-note-icon" aria-hidden="true"><Icon size={18} /></span><span className="gl-hand">{lines(tr(text))}</span></span>
              </li>
            ))}</ul>
          </div>
        </section>

        {/* 3 · the price (no comparison with hiring a person: owner, accountants will use Krarok too) */}
        <section className="cl-pricing" aria-labelledby="cl-price-title">
          <div className="cl-head">
            <span className="cl-eyebrow">{trc('eyebrow', 'ราคา')}</span>
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
              <span className="cl-plan-sheen" aria-hidden="true" />
              <span className="cl-plan-head"><span className="cl-plan-brand"><img src="/kv/symbol.svg" alt="" />KRAROK PRO</span><span className="cl-plan-badge">{tr('แนะนำ')}</span></span>
              <p className="cl-price">{promoRunning && <s className="cl-price-was"><span className="sr-only">{tr('ราคาปกติ')} </span>{formatBaht(PRO_REGULAR_MONTHLY)}</s>}<strong className="gl-num">{formatBaht(price.price)}</strong><span>{tr('/ เดือน')}</span></p>
              <p className="cl-price-fee">{tr('+ ค่าธรรมเนียมชำระเงิน {0} · ยอดชำระ {1}', formatBaht(price.fee), formatBaht(price.total))}</p>
              <h3>{trc('plan', 'อัปเกรดเป็น')} <span className="cl-grad">Pro</span> {trc('plan', 'เมื่อพร้อม')}</h3>
              <p className="cl-plan-text">{tr('เลขากระรอก แจ้งเตือนทาง LINE และอีเมล ออกเอกสารได้ไม่จำกัด')}</p>
            </article>
          </div>
          <div className="cl-center"><StartButton /></div>
          {/* Feedback while the app is in beta: the same form, opened at the matching kind */}
          <div className="cl-feedback-cta">
            <p>{tr('อยู่ในช่วงเบต้า เจอปัญหาหรืออยากให้มีอะไรเพิ่ม บอกทีมกระรอกได้เลย')}</p>
            <span className="cl-feedback-buttons">
              <button type="button" onClick={() => setHelp('bug')}><Bug size={16} aria-hidden="true" />{tr('แจ้งปัญหา / บั๊ก')}</button>
              <button type="button" onClick={() => setHelp('idea')}><Lightbulb size={16} aria-hidden="true" />{tr('เสนอไอเดีย')}</button>
            </span>
          </div>
        </section>

        {/* 4 · what it does: each feature on a page of its own (owner: "เอาไว้คนละหน้าเลย") */}
        <section id="cl-features" className="cl-features" aria-labelledby="cl-features-title">
          <div className="cl-head">
            <span className="cl-eyebrow">{tr('ฟีเจอร์')}</span>
            <h2 id="cl-features-title" data-words aria-label={tr('ครบจบในแอปเดียว')}><span aria-hidden="true"><Words text={tr('ครบจบในแอปเดียว')} /></span></h2>
            <p>{tr('ทุกเรื่องเงินของงานอิสระ ตั้งแต่จดงานจนได้รับเงิน')}</p>
          </div>
        </section>

        {/* the chat with เลขา: the real screen, big */}
        <section className="cl-feat is-chat" aria-labelledby="cl-feat-chat">
          <div className="cl-feat-text is-center">
            <Tier pro />
            <FeatureTitle id="cl-feat-chat" word={tr('คุย')} rest={tr('กับเลขา\nเหมือนเพื่อนร่วมงาน')} />
            <p>{tr('พิมพ์หรือพูดว่าวันนี้ทำงานอะไร เลขาแยกงาน รายจ่าย และการรับเงินให้ครบ ถามอะไรก็ได้ เช่น ใครยังไม่จ่าย')}</p>
          </div>
          <figure className="cl-feat-shot" data-rise>
            <ChatScreen />
            <figcaption>{tr('หน้าจอจริงในแอป ใช้ข้อมูลตัวอย่าง')}</figcaption>
          </figure>
        </section>

        {/* the morning reminder */}
        <section className="cl-feat is-remind" aria-labelledby="cl-feat-remind">
          <div className="cl-feat-text">
            <Tier pro />
            <FeatureTitle id="cl-feat-remind" word={tr('เตือน')} rest={tr('ก่อนลืม\nทุกเช้า')} />
            <p>{tr('ทาง LINE และอีเมล งานไหนใกล้ครบกำหนดรับเงิน และกดบันทึกรับเงินจากในแจ้งเตือนได้เลย')}</p>
            <span className="cl-feat-apps" aria-hidden="true"><span><LineLogo size={22} />LINE</span><span><GmailLogo size={20} />{tr('อีเมล')}</span></span>
          </div>
          <div className="cl-feat-visual gl-feature-visual is-remind" data-rise><PhoneDemo /></div>
        </section>

        {/* documents, one after another */}
        <section className="cl-feat is-docs" aria-labelledby="cl-feat-docs">
          <div className="cl-feat-visual gl-feature-visual is-docs" data-rise><LiveDocs /></div>
          <div className="cl-feat-text">
            <Tier>{tr('ฟรี 10 ใบต่อเดือน · Pro ไม่จำกัด')}</Tier>
            <FeatureTitle id="cl-feat-docs" word={tr('ออก')} rest={tr('เอกสารต่อกัน\nได้ทันที')} />
            <p>{tr('ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ จากงานเดียวกัน ข้อมูลลูกค้าเติมให้เอง')}</p>
          </div>
        </section>

        {/* the month on a calendar, and the same money as a timeline (owner, 2026-10-29: both views) */}
        <section className="cl-feat is-calendar" aria-labelledby="cl-feat-calendar">
          <div className="cl-feat-text">
            <Tier>{tr('ใช้ฟรี')}</Tier>
            <FeatureTitle id="cl-feat-calendar" word={tr('รู้')} rest={tr('วันไหน\nเงินจะเข้าเท่าไร')} />
            <p>{tr('ปฏิทินและไทม์ไลน์บอกว่างานไหนจะได้เงินวันไหน ยอดรอรับเรียงตามวันครบกำหนด รับเงินบางส่วนหรือทั้งหมดได้ทันที')}</p>
          </div>
          <div className="cl-feat-visual gl-feature-visual is-calendar" data-rise><CalendarViews /></div>
        </section>

        {/* spending, free for every account (owner, 2026-10-29: "ฟีเจอร์ฟรี ... รายจ่ายใส่เข้าไปด้วย") */}
        <section className="cl-feat is-expense" aria-labelledby="cl-feat-expense">
          <div className="cl-feat-visual gl-feature-visual is-expense" data-rise><ExpensesDemo /></div>
          <div className="cl-feat-text">
            <Tier>{tr('ใช้ฟรี')}</Tier>
            <FeatureTitle id="cl-feat-expense" word={trc('feat', 'จด')} rest={tr('รายจ่าย\nรู้กำไรจริง')} />
            <p>{tr('ค่าใช้จ่ายประจำตั้งไว้ครั้งเดียว ขึ้นให้ทุกเดือน รายจ่ายอื่นจดพร้อมหมวดหมู่ แล้วเห็นทันทีว่าเดือนนี้เหลือกำไรเท่าไร')}</p>
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
            <svg className="cl-ribbon" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true">
              <path d="M-40 400 C 160 520, 300 140, 470 230 S 640 520, 820 330 S 1000 40, 1250 170" />
            </svg>
            {[0, 1, 2, 3].map(at => <span key={at} className="cl-coin" aria-hidden="true"><img src="/kv/symbol.svg" alt="" /></span>)}
            <div className="cl-final-in">
              <Mascot gear="headset" mood="wave" action="wave" size={140} />
              <h2 id="cl-final-title"><span className="gl-nw">{trc('final', 'ให้เลขากระรอก')}</span><wbr /><span className="gl-nw">{trc('final', 'ช่วยดูแลเงินของคุณ')}</span>{' '}<br /><span className="cl-final-em">{tr('ตั้งแต่วันนี้')}</span></h2>
              <Countdown />
              <div className="cl-final-cta"><StartButton light /></div>
            </div>
          </div>
        </section>
      </main>

      {/* The footer: where to follow and reach the team, and the way to the report form (the menu's ช่วยเหลือ lands here). */}
      <footer id="cl-help" className="cl-foot">
        <div className="cl-foot-grid">
          <div className="cl-foot-brand"><BrandLockup size={26} /></div>
          <div className="cl-foot-col">
            <h2>{tr('ติดตามและติดต่อ')}</h2>
            <ul>
              <li>{BRAND_LINKS.instagram
                ? <a href={BRAND_LINKS.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={16} aria-hidden="true" />{tr('ติดตามบน Instagram')}</a>
                : <span className="cl-foot-soon"><Instagram size={16} aria-hidden="true" />{tr('Instagram — เร็ว ๆ นี้')}</span>}</li>
              <li>{BRAND_LINKS.tiktok
                ? <a href={BRAND_LINKS.tiktok} target="_blank" rel="noopener noreferrer"><Music2 size={16} aria-hidden="true" />{tr('ติดตามบน TikTok')}</a>
                : <span className="cl-foot-soon"><Music2 size={16} aria-hidden="true" />{tr('TikTok — เร็ว ๆ นี้')}</span>}</li>
              <li><a href={`mailto:${BRAND_LINKS.email}`}><Mail size={16} aria-hidden="true" />{tr('อีเมลหาเรา')}</a></li>
            </ul>
          </div>
          <div className="cl-foot-col">
            <h2>{tr('ช่วยเหลือ')}</h2>
            <ul>
              <li><button type="button" onClick={() => setHelp('bug')}><Bug size={16} aria-hidden="true" />{tr('แจ้งปัญหา / เสนอไอเดีย')}</button></li>
              <li><button type="button" onClick={() => setHelp('general')}><CircleHelp size={16} aria-hidden="true" />{tr('ส่งความคิดเห็นทั่วไป')}</button></li>
            </ul>
          </div>
        </div>
        <div className="cl-foot-legal">
          <span className="cl-foot-links"><a href="/privacy">{tr('นโยบายความเป็นส่วนตัว')}</a><a href="/terms">{tr('ข้อตกลงการใช้งาน')}</a></span>
          <span className="cl-foot-copy">{tr('© 2569 กระรอกตุนเงิน')}</span>
        </div>
      </footer>
      {help && <HelpForm kind={help} onClose={closeHelp} />}
    </div>
  );
}
