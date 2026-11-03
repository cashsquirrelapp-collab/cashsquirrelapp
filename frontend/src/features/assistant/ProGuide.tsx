import React from 'react';
import { flushSync } from 'react-dom';
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { LineLogo } from '../../components/ui/LineLogo';
import { GmailLogo } from '../../components/ui/GmailLogo';
import { tr } from '../../i18n/tr';
import { ASSISTANT_SENT_EVENT, ISSUER_SAVED_EVENT } from './proGuideEvents';
import './proGuide.css';

// After paying for Pro (owner, 2026-10-29, "การ์ดทีละขั้น พาไปกด"): once the arrival clip ends, a card beside the corner
// squirrel lists four first steps. "ไปทำเลย" opens the right page, dims it for a moment and rings the button to press,
// with a small bubble that says what to do; each step ticks itself from the account's real data. Computers and iPads;
// phones too since 2026-10-29 ("ทำบนมือถือด้วยเลย"): the card rises from the bottom like an iOS sheet.

export type ProGuideStep = 'line' | 'email' | 'chat' | 'business';
const STEPS: ProGuideStep[] = ['line', 'email', 'chat', 'business'];
type GuideState = 'off' | 'card' | 'active' | 'pill';
type Saved = { state: GuideState; active?: ProGuideStep; skipped: ProGuideStep[]; chat: boolean };

// The first one on the page wins, so the ring moves on by itself (settings row → its button → the code).
const TARGETS: Record<ProGuideStep, string[]> = {
  line: ['line-code', 'line-connect', 'line'],
  email: ['notif-digest', 'notif'],
  chat: ['chat-composer'],
  // The business details first, not the save button (owner, 2026-10-31: "บอกให้มากรอกตรงนี้ด้วย ... กรอกเสร็จแล้วค่อยกด
  // บันทึกโปรไฟล์"); saving them ends the guide.
  business: ['business-form', 'business'],
};

const storageKey = (account: string) => `krarok.proGuide.${account}`;
function load(account: string): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(account)) || 'null') as Partial<Saved> | null;
    if (raw && typeof raw === 'object') {
      const state: GuideState = raw.state === 'card' || raw.state === 'active' || raw.state === 'pill' ? raw.state : 'off';
      return { state, active: STEPS.includes(raw.active as ProGuideStep) ? raw.active : undefined,
        skipped: Array.isArray(raw.skipped) ? raw.skipped.filter(step => STEPS.includes(step)) : [], chat: raw.chat === true };
    }
  } catch { /* private window or bad data: start clean */ }
  return { state: 'off', skipped: [], chat: false };
}

function stepTitle(step: ProGuideStep) {
  return step === 'line' ? tr('เชื่อม LINE') : step === 'email' ? tr('เปิดแจ้งเตือนอีเมล') : step === 'chat' ? tr('ลองคุยกับเลขา') : tr('ตั้งข้อมูลผู้ออกเอกสาร');
}
function stepSub(step: ProGuideStep) {
  return step === 'line' ? tr('รับแจ้งเตือน และคุยกับเลขาใน LINE') : step === 'email' ? tr('สรุปงานใกล้ครบกำหนดทุกเช้า 08:00')
    : step === 'chat' ? tr('พิมพ์จดงานแรก เช่น “จดงานรีวิว 5,000 บาท”') : tr('ชื่อ ที่อยู่ เลขผู้เสียภาษี บนใบเสนอราคา');
}
function coachTitle(target: string) {
  switch (target) {
    case 'line': return tr('กดตรงนี้เพื่อเชื่อม LINE');
    case 'line-connect': return tr('กดเชื่อมต่อ LINE เพื่อรับรหัส');
    case 'line-code': return tr('ส่งรหัสนี้ในแชต LINE ภายใน 5 นาที');
    case 'notif': return tr('กดตรงนี้เพื่อตั้งการแจ้งเตือน');
    case 'notif-digest': return tr('เปิดสวิตช์แจ้งเตือนเครดิตเทอม');
    case 'chat-composer': return tr('พิมพ์ตรงนี้แล้วกดส่ง');
    case 'business': return tr('กดตรงนี้เพื่อตั้งข้อมูลผู้ออกเอกสาร');
    case 'business-form': return tr('กรอกข้อมูลธุรกิจตรงนี้');
    case 'business-save': return tr('กดตรงนี้เพื่อบันทึก');
    default: return tr('กรอกข้อมูลด้านบน แล้วกดบันทึก');
  }
}
function coachSteps(step: ProGuideStep, target: string): React.ReactNode[] {
  if (step === 'line') return [
    <>{tr('กด')} <b>LINE</b> {tr('แล้วกด')} <b>{tr('เชื่อมต่อ LINE')}</b> {tr('เพื่อรับรหัส')}</>,
    tr('เพิ่มเพื่อน LINE ของกระรอกตุนเงิน แล้วส่งรหัสในแชต'),
    tr('เชื่อมสำเร็จ น้องจะติ๊กขั้นนี้ให้เอง'),
  ];
  if (step === 'email') return [
    <>{tr('กด')} <b>{tr('การแจ้งเตือน')}</b></>,
    <>{tr('เปิด')} <b>{tr('แจ้งเตือนเครดิตเทอม')}</b></>,
    tr('ทุกเช้า 08:00 จะมีอีเมลสรุปงานใกล้ครบกำหนดถึงอีเมลของบัญชีนี้'),
  ];
  if (step === 'chat') return [
    tr('พิมพ์หรือกดไมค์พูด เช่น “จดงานรีวิว 5,000 บาท”'),
    tr('กดส่ง แล้วเลขาจะทำให้'),
    tr('ส่งข้อความแรกแล้ว น้องจะติ๊กขั้นนี้ให้เอง'),
  ];
  const save = <>{tr('กรอกเสร็จแล้วกด')} <b>{tr('บันทึกโปรไฟล์ธุรกิจ')}</b> {tr('ด้านล่างขวา')}</>;
  if (target === 'business') return [
    <>{tr('กด')} <b>{tr('โปรไฟล์ธุรกิจ')}</b></>,
    tr('กรอกชื่อธุรกิจ เลขผู้เสียภาษี ที่อยู่ เบอร์โทร และอีเมล'),
    save,
  ];
  if (target === 'business-save') return [
    tr('ตรวจชื่อธุรกิจ เลขผู้เสียภาษี และที่อยู่อีกครั้ง'),
    <>{tr('กด')} <b>{tr('บันทึกโปรไฟล์ธุรกิจ')}</b></>,
    tr('บันทึกแล้ว คู่มือจะจบให้เอง'),
  ];
  return [
    tr('กรอกชื่อธุรกิจ เลขผู้เสียภาษี และที่อยู่ออกใบเสร็จ'),
    tr('ใส่เบอร์โทรและอีเมลติดต่อ (ถ้ามี)'),
    <>{tr('แล้วกด')} <b>›</b> {tr('น้องจะพาไปที่ปุ่มบันทึก')}</>,
  ];
}

function StepIcon({ step, size = 36 }: { step: ProGuideStep; size?: number }) {
  if (step === 'line') return <LineLogo size={size} />;
  if (step === 'email') return <GmailLogo size={size} className="pg-icon-line" />;
  if (step === 'chat') return <span className="pg-icon is-chat" style={{ width: size, height: size }}><Mascot gear="headset" mood="happy" animated={false} size={Math.round(size * 0.84)} viewBox="12 8 76 76" /></span>;
  return <span className="pg-icon is-docs" style={{ width: size, height: size }}><FileText size={Math.round(size * 0.5)} strokeWidth={2} /></span>;
}

function Face({ size }: { size: number }) {
  return <span aria-hidden="true" className="pg-face" style={{ width: size, height: size }}><Mascot gear="headset" mood="happy" animated={false} size={Math.round(size * 0.7)} viewBox="12 8 76 76" /></span>;
}

type Spot = { name: string; left: number; top: number; width: number; height: number };
const modalOpen = () => Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]'));
// A place to type: the on-screen keyboard opens for these on phones and iPads.
const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';
const isField = (node: Element | null) => node instanceof HTMLElement && node.matches(FIELD);
/** The nearest box that scrolls this node (the app's page card), or the page itself. */
function scrollerOf(node: HTMLElement): HTMLElement {
  for (let item = node.parentElement; item; item = item.parentElement) {
    const overflow = getComputedStyle(item).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && item.scrollHeight > item.clientHeight) return item;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
const NO_STEPS_DONE: Record<ProGuideStep, boolean> = { line: false, email: false, chat: false, business: false };

export default function ProGuide({ accountId, start, practiceStart = 0, line, email, businessSaved, page, onGo, mobile = false }: {
  accountId: string;
  /** Goes up by one each time the guide should open (after the payment arrival, ?guide=pro). */
  start: number;
  /** Goes up by one each time the team opens a practice run (เลขากระรอก ⋯ → ดูคู่มือเริ่มใช้ Pro อีกครั้ง, admins). */
  practiceStart?: number;
  line: boolean;
  email: boolean;
  businessSaved: () => boolean;
  page: string;
  onGo: (step: ProGuideStep) => void;
  /** Phones: the card as a bottom sheet, the pill beside the phone's squirrel. */
  mobile?: boolean;
}) {
  const [real, setReal] = React.useState<Saved>(() => load(accountId));
  const updateReal = React.useCallback((patch: Partial<Saved>) => setReal(current => {
    const next = { ...current, ...patch };
    try { localStorage.setItem(storageKey(accountId), JSON.stringify(next)); } catch { /* the guide still works for this visit */ }
    return next;
  }), [accountId]);
  // The team's practice run (owner, 2026-11-03: "ขึ้นพรีวิว สำหรับแอดมินให้กูใช้ซ้ำได้"): the same guide from step 1, as often
  // as they like. A step ticks only when it is done during the run; the account's own guide and progress stay as they were.
  const [practice, setPractice] = React.useState<(Saved & { done: Record<ProGuideStep, boolean> }) | null>(null);
  const practiceOn = React.useRef(false);
  const saved: Saved = practice ?? real;
  const update = React.useCallback((patch: Partial<Saved>) => {
    if (!practiceOn.current) { updateReal(patch); return; }
    if (patch.state === 'off') { practiceOn.current = false; setPractice(null); return; }
    setPractice(current => current && { ...current, ...patch });
  }, [updateReal]);
  const practiceDone = React.useCallback((step: ProGuideStep) => {
    if (practiceOn.current) setPractice(current => current && { ...current, done: { ...current.done, [step]: true } });
  }, []);

  const startSeen = React.useRef(0);
  React.useEffect(() => {
    if (start <= startSeen.current) return;
    startSeen.current = start;
    practiceOn.current = false; setPractice(null);
    updateReal({ state: 'card', active: undefined });
  }, [start, updateReal]);
  const practiceSeen = React.useRef(0);
  // LINE already linked and the e-mail summary already on count as done from the start of a run (owner, 2026-11-03:
  // "ถ้าเชื่อมแล้วก็พาข้ามอันถัดไปเลย"): they cannot be done again, so the run goes on to the next step.
  const accountNow = React.useRef({ line, email });
  accountNow.current = { line, email };
  React.useEffect(() => {
    if (practiceStart <= practiceSeen.current) return;
    practiceSeen.current = practiceStart;
    practiceOn.current = true;
    setPractice({ state: 'card', skipped: [], chat: false, done: { ...NO_STEPS_DONE, line: accountNow.current.line, email: accountNow.current.email } });
  }, [practiceStart]);
  // In a practice run LINE and the e-mail switch tick when they are turned on during the run.
  const lineBefore = React.useRef(line);
  const emailBefore = React.useRef(email);
  React.useEffect(() => { if (line && !lineBefore.current) practiceDone('line'); lineBefore.current = line; }, [line, practiceDone]);
  React.useEffect(() => { if (email && !emailBefore.current) practiceDone('email'); emailBefore.current = email; }, [email, practiceDone]);

  // The issuer profile lives in this account's private cache; Settings says when it saves, and a slow poll covers the rest.
  const [business, setBusiness] = React.useState(() => businessSaved());
  React.useEffect(() => {
    if (saved.state === 'off') return;
    const check = () => setBusiness(businessSaved());
    const savedNow = () => { check(); if (businessSaved()) practiceDone('business'); };
    check();
    const timer = window.setInterval(check, 2000);
    window.addEventListener(ISSUER_SAVED_EVENT, savedNow);
    return () => { window.clearInterval(timer); window.removeEventListener(ISSUER_SAVED_EVENT, savedNow); };
  }, [saved.state, businessSaved, practiceDone]);
  React.useEffect(() => {
    const sent = () => { updateReal({ chat: true }); practiceDone('chat'); };
    window.addEventListener(ASSISTANT_SENT_EVENT, sent);
    return () => window.removeEventListener(ASSISTANT_SENT_EVENT, sent);
  }, [updateReal, practiceDone]);

  const done: Record<ProGuideStep, boolean> = practice ? practice.done : { line, email, chat: real.chat, business };
  const doneCount = STEPS.filter(step => done[step]).length;
  // Forward only (owner, 2026-11-03: "พอถึงขั้นตอนที่4แล้วก็จบ ไม่ต้องพาวนใหม่"): a skipped step is never offered again by
  // itself; its row stays on the card for anyone who wants to go back.
  const current = STEPS.find(item => !done[item] && !saved.skipped.includes(item)) ?? null;
  const active = saved.state === 'active' ? saved.active ?? null : null;

  // Step 4 on phones and iPads (owner, 2026-11-03: customers "ทำไม่ได้สักที"): once the keyboard is up it takes half the
  // screen, and the bubble, the ring and the pill sat on the very fields being filled in. While a field is being typed
  // into they step aside, and come back a moment after the keyboard has closed (kept on the page, so nothing replays).
  const [typing, setTyping] = React.useState(false);
  React.useEffect(() => {
    setTyping(false);
    if (active !== 'business' || !(mobile || window.matchMedia('(pointer: coarse)').matches)) return;
    let timer = 0;
    const onIn = (event: FocusEvent) => { if (isField(event.target as Element | null)) { window.clearTimeout(timer); setTyping(true); } };
    const onOut = () => { window.clearTimeout(timer); timer = window.setTimeout(() => setTyping(isField(document.activeElement)), 700); };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    setTyping(isField(document.activeElement));
    return () => { window.clearTimeout(timer); document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, [active, mobile]);
  const away = typing && active === 'business';

  // A step whose button or fields are on the page already is shown where it is: going to it again (from the card, or with
  // ‹ ›) never sends the page back to ตั้งค่า's first screen, which emptied the business details being typed in
  // (owner, 2026-11-03: "มันจะทำการรีเซ็ตหมด ... ทุกคนต้องมากรอกใหม่อีกรอบ").
  const onPage = (step: ProGuideStep) => TARGETS[step].some(name => Array.from(document.querySelectorAll<HTMLElement>(`[data-guide-target="${name}"]`))
    .some(item => { const box = item.getBoundingClientRect(); return box.width > 0 && box.height > 0; }));
  const go = (step: ProGuideStep, from?: ProGuideStep) => {
    // Moving on from a step not done yet leaves it marked ข้ามไว้ on the card.
    const skipped = [...saved.skipped.filter(item => item !== step && item !== from), ...(from && !done[from] ? [from] : [])];
    update({ state: 'active', active: step, skipped });
    if (!onPage(step)) onGo(step);
  };
  // ‹ › in the bubble (owner, 2026-11-03: "ปุ่มลูกศรซ้ายขวา ... ข้ามขั้นตอนหรือจะดูขั้นตอนซ้ำ"): one step back or on; past the
  // last step the guide ends ("พอถึงขั้นตอนที่4แล้วก็จบ ไม่ต้องพาวนใหม่").
  const moveStep = (dir: -1 | 1) => {
    if (!active) return;
    if (active === 'business') {
      if (dir > 0 && !atSave) { setAtSave(true); return; }
      if (dir < 0 && atSave) { setAtSave(false); return; }
    }
    const to = STEPS[STEPS.indexOf(active) + dir];
    if (to) { go(to, dir > 0 ? active : undefined); return; }
    if (dir > 0) update({ state: 'off', active: undefined, skipped: done[active] ? saved.skipped : [...saved.skipped.filter(item => item !== active), active] });
  };
  const showAll = () => update({ state: 'card', active: undefined });
  const later = () => update({ state: 'pill', active: undefined });

  // The step being done is finished: say so by the squirrel for a moment, then show the card with the next step.
  const [cheer, setCheer] = React.useState<ProGuideStep | null>(null);
  // Done while this step is open, not done before it was opened: going back with ‹ to a finished step shows it again
  // instead of cheering and closing at once.
  const openedDone = React.useRef<{ step: ProGuideStep | null; done: boolean }>({ step: null, done: false });
  if (openedDone.current.step !== active) openedDone.current = { step: active, done: active ? done[active] : false };
  const activeDone = active ? done[active] && !openedDone.current.done : false;
  React.useEffect(() => {
    if (!active || !activeDone) return;
    // Saving the business profile ends the guide there and then (owner, 2026-10-31: "พอกดบันทึกโปรไฟล์ปุ๊บก็เลิกสอนทันที").
    if (active === 'business') { update({ state: 'off', active: undefined }); return; }
    setCheer(active);
    const timer = window.setTimeout(() => { setCheer(null); update({ state: 'card', active: undefined }); }, 1600);
    return () => window.clearTimeout(timer);
  }, [active, activeDone, update]);

  // Follow the target on the page: the first match of the step's list. The ring and the bubble wait until the page
  // has settled (owner, 2026-10-29: "ให้มันนิ่งก่อนแล้วค่อยคุม", the coach used to jump after the page in 250 ms steps):
  // the new page renders and scrolls to the button, the button stays put for a few frames, then the ring appears and
  // the bubble drops in. After that they follow the button every frame while the page scrolls, so nothing stutters.
  // Step 4 in two parts: the fields, then (after ›) the save button that ends the guide.
  const [atSave, setAtSave] = React.useState(false);
  React.useEffect(() => { setAtSave(false); }, [active]);
  const [spot, setSpot] = React.useState<Spot | null>(null);
  const [lost, setLost] = React.useState(false);
  const spotName = React.useRef('');
  React.useEffect(() => {
    if (!active || activeDone) { setSpot(null); setLost(false); spotName.current = ''; return; }
    const same = (a: Spot | null, b: Spot | null) => Boolean(a && b && a.name === b.name && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);
    const STILL_FRAMES = 8; // about 130 ms without moving counts as settled
    let raf = 0;
    let last: Spot | null = null;
    let still = 0;
    let settled = false;
    let missingSince = 0;
    const measure = (): Spot | null => {
      // Step 4's second half (owner, 2026-11-03: "ลูกศรขั้นตอนสุดท้าย ... ให้มากดตรงนี้ ... บันทึกโปรไฟล์"): the save button.
      for (const name of active === 'business' && atSave ? ['business-save', ...TARGETS.business] : TARGETS[active]) {
        const node = Array.from(document.querySelectorAll<HTMLElement>(`[data-guide-target="${name}"]`)).find(item => {
          const box = item.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(item).visibility !== 'hidden';
        });
        if (!node) continue;
        if (spotName.current !== name) {
          // A new button for this step: hide the coach, bring the button into view, and settle again.
          spotName.current = name;
          settled = false; still = 0; last = null;
          setSpot(null);
          const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
          if (name === 'business-form') {
            // The fields' bubble goes above them, so they land low enough to leave it room (a short phone too).
            const box = node.getBoundingClientRect();
            const want = Math.max((window.innerHeight - box.height) / 2, coachHeightRef.current + 18 + 16);
            scrollerOf(node).scrollBy({ top: box.top - want, behavior });
          } else node.scrollIntoView({ block: 'center', behavior });
        }
        const box = node.getBoundingClientRect();
        return { name, left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) };
      }
      return null;
    };
    const frame = () => {
      raf = 0;
      if (modalOpen()) { settled = false; still = 0; last = null; setSpot(null); setLost(false); return; }
      const next = measure();
      if (!next) {
        settled = false; still = 0; last = null; spotName.current = '';
        setSpot(null);
        if (!missingSince) missingSince = performance.now();
        if (performance.now() - missingSince > 1250) setLost(true);
        return;
      }
      missingSince = 0; setLost(false);
      const moved = !same(last, next);
      last = next;
      if (!settled) {
        still = moved ? 0 : still + 1;
        if (still >= STILL_FRAMES) { settled = true; setSpot(next); return; }
        raf = requestAnimationFrame(frame); // keep watching every frame until it stops moving
        return;
      }
      if (moved) {
        // Drawn in this same frame, before the browser paints, so the ring never trails the button by a frame.
        flushSync(() => setSpot(next));
        raf = requestAnimationFrame(frame); // following a scroll: every frame until it stops
      }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    kick();
    // The page can change without scrolling (a route, a section opening): a light check four times a second.
    const timer = window.setInterval(kick, 250);
    window.addEventListener('scroll', kick, { capture: true, passive: true });
    window.addEventListener('resize', kick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(timer);
      window.removeEventListener('scroll', kick, { capture: true });
      window.removeEventListener('resize', kick);
    };
  }, [active, activeDone, atSave]);

  // While the card is out the corner squirrel's own words step aside, so nothing sits under the card.
  const pillShown = saved.state === 'pill' || (saved.state === 'active' && page !== 'assistant');
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('pg-card-open', saved.state === 'card');
    root.classList.toggle('pg-pill-open', pillShown);
    return () => { root.classList.remove('pg-card-open'); root.classList.remove('pg-pill-open'); };
  }, [saved.state, pillShown]);

  React.useEffect(() => {
    if (saved.state !== 'card' && saved.state !== 'active') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || modalOpen()) return;
      if (saved.state === 'card') later(); else showAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const coachRef = React.useRef<HTMLElement | null>(null);
  const [coachHeight, setCoachHeight] = React.useState(196);
  const coachHeightRef = React.useRef(coachHeight);
  coachHeightRef.current = coachHeight;
  React.useLayoutEffect(() => {
    const height = coachRef.current?.offsetHeight;
    if (height && Math.abs(height - coachHeight) > 2) setCoachHeight(height);
  });

  if (saved.state === 'off') return null;

  const progress = (
    <span aria-hidden="true" className="pg-bars">{STEPS.map(step => <span key={step} className={done[step] ? 'is-done' : ''} />)}</span>
  );

  if (saved.state === 'card') {
    const finished = doneCount === STEPS.length;
    return (
      <section className={`pg-card${mobile ? ' is-mobile' : ''}`} aria-labelledby="pg-title" data-testid="pro-guide" data-practice={practice ? '' : undefined}>
        {mobile ? <span aria-hidden="true" className="pg-grip" /> : <span aria-hidden="true" className="pg-card-tail" />}
        <div className="pg-head">
          <Face size={46} />
          <div className="pg-head-text">
            <h2 id="pg-title">{finished ? tr('ครบ 4 ขั้นแล้ว พร้อมใช้ Pro') : tr('เริ่มใช้ Pro ใน 4 ขั้น')}</h2>
            <p>{practice ? tr('โหมดทดลองสำหรับแอดมิน ความคืบหน้าจริงของบัญชีไม่เปลี่ยน') : finished ? tr('ต่อจากนี้คุยกับเลขาได้ทุกหน้า ทั้งในแอปและ LINE') : tr('กดไปทำเลย แล้วน้องพาไปที่ปุ่มให้ทีละขั้น')}</p>
          </div>
          <span className="pg-count" aria-label={tr('ทำแล้ว {0} จาก {1} ขั้น', String(doneCount), String(STEPS.length))}>{doneCount}/{STEPS.length}</span>
        </div>
        {progress}
        <ol className="pg-steps">
          {STEPS.map((step, index) => {
            const isDone = done[step];
            const isCurrent = !isDone && step === current;
            const body = <>
              <span className="pg-step-icon"><StepIcon step={step} /><span className={`pg-step-no ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''}`} aria-hidden="true">{isDone ? <Check size={11} strokeWidth={3} /> : index + 1}</span></span>
              <span className="pg-step-text"><b>{stepTitle(step)}</b><span>{isDone ? tr('เรียบร้อยแล้ว') : stepSub(step)}</span></span>
            </>;
            return (
              <li key={step} className={`pg-step ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''}`} data-step={step}>
                {isDone ? <div className="pg-step-row">{body}<span className="pg-done-chip">{tr('เรียบร้อย')}</span></div>
                  : isCurrent ? <div className="pg-step-row">{body}<button type="button" className="pg-go" onClick={() => go(step)} aria-label={tr('ไปทำเลย: {0}', stepTitle(step))}>{tr('ไปทำเลย')}</button></div>
                    : <button type="button" className="pg-step-row is-button" onClick={() => go(step)} aria-label={tr('ไปทำเลย: {0}', stepTitle(step))}>{body}
                      {saved.skipped.includes(step) ? <span className="pg-skipped">{tr('ข้ามไว้')}</span> : <ChevronRight size={16} aria-hidden="true" className="pg-chevron" />}</button>}
              </li>
            );
          })}
        </ol>
        <div className="pg-foot">
          {finished ? <button type="button" className="pg-link" onClick={() => update({ state: 'off', active: undefined })}>{tr('เสร็จแล้ว')}</button>
            : <button type="button" className="pg-link" onClick={later}>{tr('ไว้ทีหลัง')}</button>}
          {!finished && <span>{tr('เปิดอีกครั้งได้ที่น้องกระรอกมุมจอ')}</span>}
        </div>
      </section>
    );
  }

  const pillStep = cheer ?? active;
  const pill = page === 'assistant' && saved.state === 'active' ? null : (
    <div className={`pg-pill-wrap${page === 'assistant' ? ' is-chat-page' : ''}${mobile ? ' is-mobile' : ''}${away ? ' pg-away' : ''}`}>
      <button type="button" className={`pg-pill ${cheer ? 'is-cheer' : ''}`} onClick={showAll} data-testid="pro-guide-pill"
        aria-label={pillStep ? tr('ขั้นที่ {0} จาก {1}: {2} · ดูทุกขั้น', String(STEPS.indexOf(pillStep) + 1), String(STEPS.length), stepTitle(pillStep)) : tr('เริ่มใช้ Pro {0}/{1} · เปิดอีกครั้ง', String(doneCount), String(STEPS.length))}>
        {cheer ? <><span className="pg-pill-tick" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>{tr('{0} เรียบร้อย', stepTitle(cheer))}</>
          : pillStep ? <><span className="pg-num">{STEPS.indexOf(pillStep) + 1}/{STEPS.length}</span>{stepTitle(pillStep)}</>
            : <><Face size={22} /><span>{tr('เริ่มใช้ Pro')}</span><span className="pg-num">{doneCount}/{STEPS.length}</span></>}
      </button>
      {saved.state === 'pill' && <button type="button" className="pg-pill-x" onClick={() => update({ state: 'off', active: undefined })} aria-label={tr('ปิดคำแนะนำเริ่มใช้ Pro')} title={tr('ปิดคำแนะนำเริ่มใช้ Pro')}><X size={13} /></button>}
    </div>
  );

  if (saved.state === 'pill' || !active) return pill;

  const gutter = mobile ? 12 : 16;
  const width = Math.min(380, window.innerWidth - gutter * 2);
  const index = STEPS.indexOf(active);
  const dots = <span aria-hidden="true" className="pg-dots">{STEPS.map((step, at) => <span key={step} className={at === index ? 'is-on' : done[step] ? 'is-done' : ''} />)}</span>;
  const last = index === STEPS.length - 1;
  const actions = <span className="pg-coach-actions">
    <button type="button" className="pg-arrow" onClick={() => moveStep(-1)} disabled={index === 0} aria-label={tr('ขั้นก่อนหน้า')} title={tr('ขั้นก่อนหน้า')}><ChevronLeft size={18} aria-hidden="true" /></button>
    {/* The last step ends by saving, so its › only leads to the save button (no จบคู่มือ). */}
    {!(last && atSave) && <button type="button" className="pg-arrow" onClick={() => moveStep(1)} aria-label={last ? tr('ไปที่ปุ่มบันทึก') : tr('ขั้นถัดไป')} title={last ? tr('ไปที่ปุ่มบันทึก') : tr('ขั้นถัดไป')}><ChevronRight size={18} aria-hidden="true" /></button>}
  </span>;
  const head = (title: string) => <div className="pg-coach-head">
    <Face size={40} />
    <div className="pg-head-text"><p className="pg-coach-kicker">{tr('ขั้นที่ {0} จาก {1}', String(index + 1), String(STEPS.length))}</p><h2 id="pg-coach-title">{title}</h2></div>
    <StepIcon step={active} size={30} />
  </div>;

  let coach: React.ReactNode = null;
  if (cheer) coach = null;
  else if (spot) {
    const fitsBelow = spot.top + spot.height + 18 + coachHeight <= window.innerHeight - 12;
    const fitsAbove = spot.top - 18 - coachHeight >= 12;
    // The business details go on under their first fields (address, phone, e-mail), so that bubble only ever goes above
    // them; with no room there it waits until the fields are scrolled lower, and the pill names the step meanwhile
    // (2026-11-03: on phones it used to drop onto the very fields being filled in).
    const form = spot.name === 'business-form';
    const below = form ? false : fitsBelow;
    const left = Math.max(gutter, Math.min(spot.left - 6, window.innerWidth - width - gutter));
    const top = below ? spot.top + spot.height + 18 : Math.max(12, spot.top - 18 - coachHeight);
    const tail = Math.max(20, Math.min(spot.left + Math.min(spot.width / 2, 34) - left, width - 40));
    coach = form && !fitsAbove ? null : (
      <section ref={coachRef} className={`pg-coach is-follow ${below ? 'is-below' : 'is-above'}${away ? ' pg-away' : ''}`} style={{ translate: `${left}px ${top}px`, width }} aria-labelledby="pg-coach-title" aria-live="polite" data-testid="pro-guide-coach" data-target={spot.name}>
        <span aria-hidden="true" className="pg-coach-tail" style={{ left: tail }} />
        {head(coachTitle(spot.name))}
        <ol className="pg-coach-steps">{coachSteps(active, spot.name).map((item, at) => <li key={at}>{item}</li>)}</ol>
        <div className="pg-coach-foot">{dots}{actions}</div>
      </section>
    );
  } else if (lost) {
    coach = (
      <section ref={coachRef} className={`pg-coach is-lost${mobile ? ' is-mobile' : ''}`} style={mobile ? undefined : { width }} aria-labelledby="pg-coach-title" data-testid="pro-guide-coach" data-target="">
        {head(stepTitle(active))}
        <p className="pg-coach-lost">{tr('ปุ่มของขั้นนี้อยู่อีกหน้า กดพาไปเพื่อทำต่อ')}</p>
        <div className="pg-coach-foot">
          <button type="button" className="pg-go is-small" onClick={() => go(active)}>{tr('พาไป')}<ArrowRight size={14} aria-hidden="true" /></button>
          {actions}
        </div>
      </section>
    );
  }

  return (
    <>
      {spot && !cheer && <>
        <span key={`dim-${spot.name}`} aria-hidden="true" className={`pg-dim${away ? ' pg-away' : ''}`} style={{ translate: `${spot.left - 6}px ${spot.top - 6}px`, width: spot.width + 12, height: spot.height + 12 }} />
        <span key={`ring-${spot.name}`} aria-hidden="true" className={`pg-ring${away ? ' pg-away' : ''}`} data-testid="pro-guide-ring" style={{ translate: `${spot.left - 6}px ${spot.top - 6}px`, width: spot.width + 12, height: spot.height + 12 }} />
      </>}
      {coach}
      {pill}
    </>
  );
}
