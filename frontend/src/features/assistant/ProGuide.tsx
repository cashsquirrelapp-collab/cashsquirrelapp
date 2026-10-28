import React from 'react';
import { ArrowRight, Check, ChevronRight, FileText, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { LineLogo } from '../../components/ui/LineLogo';
import { GmailLogo } from '../../components/ui/GmailLogo';
import { tr } from '../../i18n/tr';
import { ASSISTANT_SENT_EVENT, ISSUER_SAVED_EVENT } from './proGuideEvents';
import './proGuide.css';

// After paying for Pro (owner, 2026-10-29, "การ์ดทีละขั้น พาไปกด"): once the arrival clip ends, a card beside the corner
// squirrel lists four first steps. "ไปทำเลย" opens the right page, dims it for a moment and rings the button to press,
// with a small bubble that says what to do; each step ticks itself from the account's real data. Computers and iPads.

export type ProGuideStep = 'line' | 'email' | 'chat' | 'business';
const STEPS: ProGuideStep[] = ['line', 'email', 'chat', 'business'];
type GuideState = 'off' | 'card' | 'active' | 'pill';
type Saved = { state: GuideState; active?: ProGuideStep; skipped: ProGuideStep[]; chat: boolean };

// The first one on the page wins, so the ring moves on by itself (settings row → its button → the code).
const TARGETS: Record<ProGuideStep, string[]> = {
  line: ['line-code', 'line-connect', 'line'],
  email: ['notif-digest', 'notif'],
  chat: ['chat-composer'],
  business: ['business-save', 'business'],
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
    default: return tr('กรอกข้อมูลด้านบน แล้วกดบันทึก');
  }
}
function coachSteps(step: ProGuideStep): React.ReactNode[] {
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
  return [
    <>{tr('กด')} <b>{tr('โปรไฟล์ธุรกิจ')}</b></>,
    tr('กรอกชื่อ ที่อยู่ และเลขผู้เสียภาษี'),
    <>{tr('กด')} <b>{tr('บันทึกโปรไฟล์ธุรกิจ')}</b> {tr('น้องจะติ๊กขั้นนี้ให้เอง')}</>,
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

export default function ProGuide({ accountId, start, line, email, businessSaved, page, onGo }: {
  accountId: string;
  /** Goes up by one each time the guide should open (after the payment arrival, ?guide=pro). */
  start: number;
  line: boolean;
  email: boolean;
  businessSaved: () => boolean;
  page: string;
  onGo: (step: ProGuideStep) => void;
}) {
  const [saved, setSaved] = React.useState<Saved>(() => load(accountId));
  const update = React.useCallback((patch: Partial<Saved>) => setSaved(current => {
    const next = { ...current, ...patch };
    try { localStorage.setItem(storageKey(accountId), JSON.stringify(next)); } catch { /* the guide still works for this visit */ }
    return next;
  }), [accountId]);

  const startSeen = React.useRef(0);
  React.useEffect(() => {
    if (start <= startSeen.current) return;
    startSeen.current = start;
    update({ state: 'card', active: undefined });
  }, [start, update]);

  // The issuer profile lives in this account's private cache; Settings says when it saves, and a slow poll covers the rest.
  const [business, setBusiness] = React.useState(() => businessSaved());
  React.useEffect(() => {
    if (saved.state === 'off') return;
    const check = () => setBusiness(businessSaved());
    check();
    const timer = window.setInterval(check, 2000);
    window.addEventListener(ISSUER_SAVED_EVENT, check);
    return () => { window.clearInterval(timer); window.removeEventListener(ISSUER_SAVED_EVENT, check); };
  }, [saved.state, businessSaved]);
  React.useEffect(() => {
    const sent = () => update({ chat: true });
    window.addEventListener(ASSISTANT_SENT_EVENT, sent);
    return () => window.removeEventListener(ASSISTANT_SENT_EVENT, sent);
  }, [update]);

  const done: Record<ProGuideStep, boolean> = { line, email, chat: saved.chat, business };
  const doneCount = STEPS.filter(step => done[step]).length;
  const current = STEPS.find(step => !done[step] && !saved.skipped.includes(step)) ?? STEPS.find(step => !done[step]) ?? null;
  const active = saved.state === 'active' ? saved.active ?? null : null;

  const go = (step: ProGuideStep) => {
    update({ state: 'active', active: step, skipped: saved.skipped.filter(item => item !== step) });
    onGo(step);
  };
  const skip = (step: ProGuideStep) => update({ state: 'card', active: undefined, skipped: [...saved.skipped.filter(item => item !== step), step] });
  const showAll = () => update({ state: 'card', active: undefined });
  const later = () => update({ state: 'pill', active: undefined });

  // The step being done is finished: say so by the squirrel for a moment, then show the card with the next step.
  const [cheer, setCheer] = React.useState<ProGuideStep | null>(null);
  const activeDone = active ? done[active] : false;
  React.useEffect(() => {
    if (!active || !activeDone) return;
    setCheer(active);
    const timer = window.setTimeout(() => { setCheer(null); update({ state: 'card', active: undefined }); }, 1600);
    return () => window.clearTimeout(timer);
  }, [active, activeDone, update]);

  // Follow the target on the page: the first match of the step's list, re-measured as the page scrolls or changes.
  const [spot, setSpot] = React.useState<Spot | null>(null);
  const [lost, setLost] = React.useState(false);
  const spotName = React.useRef('');
  React.useEffect(() => {
    if (!active || activeDone) { setSpot(null); setLost(false); spotName.current = ''; return; }
    let missing = 0;
    const find = () => {
      if (modalOpen()) { setSpot(null); setLost(false); return; }
      for (const name of TARGETS[active]) {
        const node = Array.from(document.querySelectorAll<HTMLElement>(`[data-guide-target="${name}"]`)).find(item => {
          const box = item.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(item).visibility !== 'hidden';
        });
        if (!node) continue;
        if (spotName.current !== name) {
          spotName.current = name;
          node.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
        const box = node.getBoundingClientRect();
        const next = { name, left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) };
        missing = 0; setLost(false);
        setSpot(prev => (prev && prev.name === next.name && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next));
        return;
      }
      setSpot(null); spotName.current = '';
      missing += 1;
      if (missing >= 5) setLost(true);
    };
    find();
    const timer = window.setInterval(find, 250);
    window.addEventListener('resize', find);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', find); };
  }, [active, activeDone]);

  // While the card is out the corner squirrel's own words step aside, so nothing sits under the card.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('pg-card-open', saved.state === 'card');
    return () => root.classList.remove('pg-card-open');
  }, [saved.state]);

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
      <section className="pg-card" aria-labelledby="pg-title" data-testid="pro-guide">
        <span aria-hidden="true" className="pg-card-tail" />
        <div className="pg-head">
          <Face size={46} />
          <div className="pg-head-text">
            <h2 id="pg-title">{finished ? tr('ครบ 4 ขั้นแล้ว พร้อมใช้ Pro') : tr('เริ่มใช้ Pro ใน 4 ขั้น')}</h2>
            <p>{finished ? tr('ต่อจากนี้คุยกับเลขาได้ทุกหน้า ทั้งในแอปและ LINE') : tr('กดไปทำเลย แล้วน้องพาไปที่ปุ่มให้ทีละขั้น')}</p>
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
    <div className={`pg-pill-wrap ${page === 'assistant' ? 'is-chat-page' : ''}`}>
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

  const width = Math.min(380, window.innerWidth - 32);
  const index = STEPS.indexOf(active);
  const dots = <span aria-hidden="true" className="pg-dots">{STEPS.map((step, at) => <span key={step} className={at === index ? 'is-on' : done[step] ? 'is-done' : ''} />)}</span>;
  const actions = <span className="pg-coach-actions">
    <button type="button" className="pg-link" onClick={() => skip(active)}>{tr('ข้ามขั้นนี้')}</button>
    <button type="button" className="pg-link is-quiet" onClick={showAll}>{tr('ดูทุกขั้น')}</button>
  </span>;
  const head = (title: string) => <div className="pg-coach-head">
    <Face size={40} />
    <div className="pg-head-text"><p className="pg-coach-kicker">{tr('ขั้นที่ {0} จาก {1}', String(index + 1), String(STEPS.length))}</p><h2 id="pg-coach-title">{title}</h2></div>
    <StepIcon step={active} size={30} />
  </div>;

  let coach: React.ReactNode = null;
  if (cheer) coach = null;
  else if (spot) {
    const below = spot.top + spot.height + 18 + coachHeight <= window.innerHeight - 12;
    const left = Math.max(16, Math.min(spot.left - 6, window.innerWidth - width - 16));
    const top = below ? spot.top + spot.height + 18 : Math.max(12, spot.top - 18 - coachHeight);
    const tail = Math.max(20, Math.min(spot.left + Math.min(spot.width / 2, 34) - left, width - 40));
    coach = (
      <section ref={coachRef} className={`pg-coach ${below ? 'is-below' : 'is-above'}`} style={{ left, top, width }} aria-labelledby="pg-coach-title" aria-live="polite" data-testid="pro-guide-coach" data-target={spot.name}>
        <span aria-hidden="true" className="pg-coach-tail" style={{ left: tail }} />
        {head(coachTitle(spot.name))}
        <ol className="pg-coach-steps">{coachSteps(active).map((item, at) => <li key={at}>{item}</li>)}</ol>
        <div className="pg-coach-foot">{dots}{actions}</div>
      </section>
    );
  } else if (lost) {
    coach = (
      <section ref={coachRef} className="pg-coach is-lost" style={{ width }} aria-labelledby="pg-coach-title" data-testid="pro-guide-coach" data-target="">
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
        <span key={`dim-${spot.name}`} aria-hidden="true" className="pg-dim" style={{ left: spot.left - 6, top: spot.top - 6, width: spot.width + 12, height: spot.height + 12 }} />
        <span key={`ring-${spot.name}`} aria-hidden="true" className="pg-ring" data-testid="pro-guide-ring" style={{ left: spot.left - 6, top: spot.top - 6, width: spot.width + 12, height: spot.height + 12 }} />
      </>}
      {coach}
      {pill}
    </>
  );
}
