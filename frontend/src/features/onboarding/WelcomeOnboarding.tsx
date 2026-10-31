import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen, Briefcase, Building2, Camera, ChartLine, Check, Code, Compass, FileText,
  GraduationCap, Laptop, ListChecks, Megaphone, Mic, Plus, Scissors, Store, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { tr, T } from '../../i18n/tr';
import {
  EXCLUSIVE_GOAL, GOALS, OCCUPATIONS, ONBOARDING_STEPS, OTHER_TEXT_MAX, WORK_TYPES, answersOf, toggleGoal, toggleOccupation,
  type GoalId, type OccupationId, type OnboardingAnswers, type OnboardingRecord, type WorkTypeId,
} from '../../../../shared/onboarding';
import { Mascot } from '../../components/mascot/Mascot';
import { OnboardingBackdrop, type BackdropCard } from './OnboardingBackdrop';
import './onboarding.css';

// Welcome Onboarding (owner brief, 2026-10-28): four short questions after the first sign-in, on the whole screen of
// every device. Look A "การ์ดลอย" since 2026-11-01 (owner: "ปรับ UI ... ให้มันลิงก์กับ UI landing page"; picked from three
// options on the canvas Pq9Lo57QVdan83pEAKhNa3): white like the landing page in light and dark alike, its floating glass
// cards behind, words rising into place, the name in the flowing CI gradient beside the mascot, and on the last question
// the card of each goal picked lights up. A short "พร้อมแล้วครับ" closes the first run.
// - Step 1 is only the greeting, the question and one glass field ("ให้มันเอลเมนต์น้อยที่สุด"): no logo, no step
//   count, no ข้ามก่อน. The name is required ("ต้องตั้งชื่อเรียก"), at least two letters; it appears under
//   สวัสดีครับ as it is typed.
// - Steps 2-4: glass tiles with an icon, a tick when picked, a progress bar, ข้ามก่อน (keeps what was picked and never
//   asks again). From Settings the same steps open with a round ปิด instead, and the last step saves.

// The labels again, marked for the English pass (shared/onboarding.ts keeps the stable IDs and the Thai labels).
const WORK_LABELS: Record<WorkTypeId, string> = {
  freelance: T("ฟรีแลนซ์ / อาชีพอิสระ"), employee: T("พนักงานประจำ"), student: T("นักเรียน / นักศึกษา"),
  business_owner: T("เจ้าของธุรกิจ / เอเจนซี"), other: T("อื่น ๆ (โปรดระบุ)"),
};
const OCCUPATION_LABELS: Record<OccupationId, string> = {
  content_creator: T("คอนเทนต์ครีเอเตอร์"), video_graphic: T("ตัดต่อวิดีโอ / กราฟิก"), developer_digital: T("โปรแกรมเมอร์ / งานดิจิทัล"),
  marketing: T("การตลาด / โฆษณา"), photo_video: T("ช่างภาพ / วิดีโอ"), teacher_coach: T("ครู / ติวเตอร์ / โค้ช"),
  trade_owner: T("ค้าขาย / เจ้าของกิจการ"), other: T("อื่น ๆ (โปรดระบุ)"),
};
const GOAL_LABELS: Record<GoalId, string> = {
  cashflow_overview: T("ดูภาพรวมรายรับรายจ่ายและกระแสเงินสด"), receivables: T("ติดตามเงินค้างรับจากลูกค้า"),
  projects: T("จัดการงานและโปรเจกต์"), documents: T("ทำใบเสนอราคาและเอกสาร"), exploring: T("ยังไม่แน่ใจ อยากลองใช้ก่อน"),
};
const WORK_ICONS: Record<WorkTypeId, LucideIcon> = { freelance: Laptop, employee: Briefcase, student: BookOpen, business_owner: Building2, other: Plus };
const OCCUPATION_ICONS: Record<OccupationId, LucideIcon> = {
  content_creator: Mic, video_graphic: Scissors, developer_digital: Code, marketing: Megaphone, photo_video: Camera,
  teacher_coach: GraduationCap, trade_owner: Store, other: Plus,
};
const GOAL_ICONS: Record<GoalId, LucideIcon> = { cashflow_overview: ChartLine, receivables: Wallet, projects: ListChecks, documents: FileText, exploring: Compass };
// Where these Thai labels may break on a narrow tile; left alone, the browser splits words such as รายจ่าย or ค้างรับ.
// The parts join back to the label exactly; English labels are not listed and wrap as usual.
const LABEL_PARTS: Record<string, string[]> = {
  'โปรแกรมเมอร์ / งานดิจิทัล': ['โปรแกรมเมอร์ / ', 'งานดิจิทัล'],
  'ดูภาพรวมรายรับรายจ่ายและกระแสเงินสด': ['ดูภาพรวม', 'รายรับรายจ่าย', 'และกระแสเงินสด'],
  'ติดตามเงินค้างรับจากลูกค้า': ['ติดตาม', 'เงินค้างรับ', 'จากลูกค้า'],
  'จัดการงานและโปรเจกต์': ['จัดการงาน', 'และโปรเจกต์'],
  'ทำใบเสนอราคาและเอกสาร': ['ทำใบเสนอราคา', 'และเอกสาร'],
};
const phrased = (label: string): React.ReactNode => LABEL_PARTS[label]
  ? LABEL_PARTS[label].map((part, index) => <React.Fragment key={index}>{index > 0 && <wbr />}<span className="wob-keep">{part}</span></React.Fragment>)
  : label;
// Steps 2-4 (step 1 has no title row: its question sits under the greeting).
const QUESTIONS = [
  { title: T("ตอนนี้คุณทำงานรูปแบบไหน?"), sub: T("เลือก 1 ข้อ") },
  { title: T("คุณทำงานด้านไหนบ้าง?"), sub: T("เลือกได้มากกว่า 1 ข้อ") },
  { title: T("อยากให้ Krarok ช่วยเรื่องไหนบ้าง?"), sub: T("เลือกได้หลายข้อ") },
];
// The Thai titles in pieces that rise one after another, the coloured piece marked; other languages rise word by word.
const TITLE_PARTS: Record<string, [string, boolean?][]> = {
  'สวัสดีครับ': [['สวัสดี'], ['ครับ']],
  'ตอนนี้คุณทำงานรูปแบบไหน?': [['ตอนนี้คุณ'], ['ทำงาน'], ['รูปแบบไหน?', true]],
  'คุณทำงานด้านไหนบ้าง?': [['คุณทำงาน'], ['ด้านไหน', true], ['บ้าง?']],
  'อยากให้ Krarok ช่วยเรื่องไหนบ้าง?': [['อยากให้ '], ['Krarok', true], [' ช่วยเรื่องไหนบ้าง?']],
};
function pieces(text: string, flowLast: boolean): [string, boolean?][] {
  const known = TITLE_PARTS[text];
  if (known) return known;
  const words = text.split(/(?<= )/);
  return words.map((word, index) => [word, flowLast && index === words.length - 1]);
}
/** Each piece in a one-line mask it rises out of. The gradient sits on an inner span: on the same span its animation
 *  would replace the rise and the piece would stay hidden. Edge spaces become no-break spaces so they are kept. */
function Rising({ text, flowLast = true, start = 0.05 }: { text: string; flowLast?: boolean; start?: number }) {
  return (
    <>
      {pieces(text, flowLast).map(([piece, flow], index) => {
        const kept = piece.replace(/^ | $/g, '\u00A0');
        return (
          <span key={index} className="wob-wm" aria-hidden="true">
            <span className="wob-w" style={{ '--d': `${(start + index * 0.08).toFixed(2)}s` } as React.CSSProperties}>{flow ? <span className="wob-flow">{kept}</span> : kept}</span>
          </span>
        );
      })}
    </>
  );
}
// The last question lights the background card of each goal picked.
const GOAL_CARDS: Partial<Record<GoalId, BackdropCard>> = { cashflow_overview: 'income', receivables: 'owed', projects: 'work', documents: 'quote' };
const COINS = [[-220, -170, 0.2], [230, -150, 0.26], [-260, 60, 0.32], [250, 90, 0.22], [-90, -240, 0.3], [110, -250, 0.36]] as const;
const NAME_MIN = 2;
const NAME_MAX = 60;

export type OnboardingResult = { answers: OnboardingAnswers; name: string | null; skippedAtStep?: number };

type Props = {
  /** 'first': after the first sign-in (ข้ามก่อน from step 2); 'edit': from Settings (ปิด, and the last step saves). */
  mode: 'first' | 'edit';
  mobile: boolean;
  /** The account's current name, filled in step 1 when the answers are opened from Settings. */
  accountName?: string;
  previous?: OnboardingRecord | null;
  /** Saves the answers (and the name, when changed); throws when it could not. */
  onFinish: (result: OnboardingResult) => Promise<void>;
  onSkip: (result: OnboardingResult) => Promise<void>;
  onClose: () => void;
};

export default function WelcomeOnboarding({ mode, mobile, accountName = '', previous, onFinish, onSkip, onClose }: Props) {
  const reduce = useReducedMotion() ?? false;
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<OnboardingAnswers>(() => answersOf(previous));
  const [name, setName] = React.useState(mode === 'edit' ? accountName : '');
  const [nameTried, setNameTried] = React.useState(false);
  const [busy, setBusy] = React.useState<'finish' | 'skip' | null>(null);
  const [celebrating, setCelebrating] = React.useState(false);
  const [error, setError] = React.useState('');
  const titleId = React.useId();
  const otherRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const nameOk = trimmed.length >= NAME_MIN;
  const nameError = nameTried && !nameOk
    ? (trimmed ? tr("ชื่อต้องมีอย่างน้อย {0} ตัวอักษร", NAME_MIN) : tr("กรุณาใส่ชื่อที่อยากให้เราเรียก"))
    : '';
  const last = step === ONBOARDING_STEPS - 1;
  // "คุณ" before the name (none in English), with a space before a name in Latin letters: คุณ CEO Park, not คุณCEO Park.
  const honorific = tr("คุณ{0}", '').trim();
  const gap = honorific && /^[A-Za-z0-9]/.test(trimmed) ? ' ' : '';
  const lit = React.useMemo(() => new Set<BackdropCard>(step === ONBOARDING_STEPS - 1 && !mobile
    ? answers.goals.map(goal => GOAL_CARDS[goal]).filter((card): card is BackdropCard => Boolean(card)) : []), [step, mobile, answers.goals]);
  const result = (skippedAtStep?: number): OnboardingResult => ({ answers, name: nameOk ? trimmed : null, ...(skippedAtStep ? { skippedAtStep } : {}) });

  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (step === 0 && !mobile) window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 60);
  }, [step, mobile]);
  React.useEffect(() => {
    if (mode !== 'edit') return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, busy, onClose]);

  const next = async () => {
    if (busy) return;
    if (step === 0 && !nameOk) { setNameTried(true); nameRef.current?.focus(); return; }
    if (!last) { setStep(value => value + 1); setError(''); return; }
    setBusy('finish'); setError('');
    // The first run ends on a short "พร้อมแล้วครับ" before the answers are saved and the screen closes.
    if (mode === 'first') {
      setCelebrating(true);
      await new Promise(resolve => window.setTimeout(resolve, reduce ? 700 : 1700));
    }
    try { await onFinish(result()); }
    catch { setCelebrating(false); setError(tr("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    finally { setBusy(null); }
  };
  const back = () => { if (!busy && step > 0) { setStep(value => value - 1); setError(''); } };
  const skip = async () => {
    if (busy) return;
    setBusy('skip'); setError('');
    try { await onSkip(result(step + 1)); }
    catch { setError(tr("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    finally { setBusy(null); }
  };
  const pickWork = (id: WorkTypeId) => {
    setAnswers(value => ({ ...value, workType: value.workType === id ? null : id }));
    if (id === 'other') window.setTimeout(() => otherRef.current?.focus(), 30);
  };
  const pickOccupation = (id: OccupationId) => {
    setAnswers(value => ({ ...value, occupations: toggleOccupation(value.occupations, id) }));
    if (id === 'other' && !answers.occupations.includes('other')) window.setTimeout(() => otherRef.current?.focus(), 30);
  };

  const tile = (key: string, Icon: LucideIcon, label: string, picked: boolean, kind: 'radio' | 'check', onPick: () => void, options: { note?: string; wide?: boolean } = {}) => (
    <li key={key} className={options.wide ? 'is-wide' : undefined}>
      <label className={`wob-tile${picked ? ' is-picked' : ''}`}>
        <input type={kind === 'radio' ? 'radio' : 'checkbox'} className="wob-input" checked={picked} onChange={onPick}
          name={kind === 'radio' ? 'wob-work' : undefined} />
        <span className="wob-ico" aria-hidden="true"><Icon size={mobile ? 21 : 19} strokeWidth={1.9} /></span>
        <span className="wob-label">{phrased(label)}{options.note && <small>{options.note}</small>}</span>
        <span className={`wob-tick is-${kind}`} aria-hidden="true">{picked && <Check size={13} strokeWidth={3.2} />}</span>
      </label>
    </li>
  );
  const otherInput = (value: string, onChange: (text: string) => void, label: string) => (
    <div className="wob-other">
      <input ref={otherRef} className="wob-field" value={value} maxLength={OTHER_TEXT_MAX} onChange={event => onChange(event.target.value)}
        placeholder={label} aria-label={label} />
    </div>
  );

  const closeButton = (
    <button type="button" className="wob-round wob-close" onClick={onClose} disabled={Boolean(busy)} aria-label={tr("ปิด")}><X size={17} strokeWidth={2.2} /></button>
  );
  const errorLine = error && <p className="wob-error" role="alert"><AlertCircle size={15} aria-hidden="true" />{error}</p>;

  // Step 1: the greeting, the question and one field; the name echoes under สวัสดีครับ as it is typed.
  const nameStage = (
    <div className="wob-name">
      {mode === 'edit' && <div className="wob-name-top">{closeButton}</div>}
      <div className="wob-name-center">
        <div className="wob-hello" aria-hidden="true">
          <p className="wob-hello-line"><span className="wob-hello-words"><Rising text={tr("สวัสดีครับ")} flowLast={false} /></span>
            <span className="wob-mascot"><Mascot mood="happy" gear="headset" animated={false} size={mobile ? 58 : 92} viewBox="10 14 82 82" /></span></p>
          <p className="wob-hello-name">
            {trimmed
              ? <span key="name" className="wob-name-in">{honorific}{gap}<span className="wob-flow">{trimmed}</span></span>
              : <span key="empty" className="wob-name-empty">{honorific}<span className="wob-caret" /></span>}
          </p>
        </div>
        {/* The name line keeps its height before a name is typed, so the field never moves. */}
        <div className="wob-name-form">
          <h2 id={titleId} className="wob-ask">{tr("อยากให้เราเรียกคุณว่าอะไร?")}</h2>
          <form className={`wob-capsule${trimmed ? ' is-filled' : ''}${nameError ? ' is-error' : ''}`} noValidate
            onSubmit={event => { event.preventDefault(); void next(); }}>
            <input id="wob-name" ref={nameRef} className="wob-capsule-input" value={name} maxLength={NAME_MAX} autoComplete="nickname"
              enterKeyHint="next" placeholder={tr("เช่น ปาร์ค, มายด์, บอส")} aria-label={tr("ชื่อที่ให้เลขากระรอกเรียก")}
              aria-invalid={Boolean(nameError) || undefined} aria-describedby="wob-name-note" onChange={event => setName(event.target.value)} />
            <button type="submit" className={`wob-go${nameOk ? ' is-ready' : ''}`} disabled={Boolean(busy)} aria-label={mobile ? tr("ถัดไป") : undefined}>
              {!mobile && <span>{tr("ถัดไป")}</span>}
              <ArrowRight size={mobile ? 20 : 18} strokeWidth={2.3} aria-hidden="true" />
            </button>
          </form>
          <p id="wob-name-note" className={`wob-note${nameError ? ' is-error' : ''}`} role={nameError ? 'alert' : undefined}>
            {nameError || tr("ใช้ทั้งในแอปและ LINE ไม่ใช้แทนชื่อจริงในเอกสาร")}
          </p>
          {errorLine}
        </div>
      </div>
    </div>
  );

  const choices = [
    null,
    <div key="work">
      <ul className={`wob-grid${mobile ? ' is-rows' : ''}`} role="radiogroup" aria-labelledby={titleId}>
        {WORK_TYPES.map(type => tile(type.id, WORK_ICONS[type.id], tr(WORK_LABELS[type.id]), answers.workType === type.id, 'radio', () => pickWork(type.id)))}
      </ul>
      {answers.workType === 'other' && otherInput(answers.workTypeOther, text => setAnswers(value => ({ ...value, workTypeOther: text })), tr("ระบุรูปแบบการทำงานของคุณ"))}
    </div>,
    <div key="occupations">
      <ul className={`wob-grid${mobile ? ' is-tiles' : ''}`} role="group" aria-labelledby={titleId}>
        {OCCUPATIONS.map(item => tile(item.id, OCCUPATION_ICONS[item.id], tr(OCCUPATION_LABELS[item.id]), answers.occupations.includes(item.id), 'check', () => pickOccupation(item.id)))}
      </ul>
      {answers.occupations.includes('other') && otherInput(answers.occupationOther, text => setAnswers(value => ({ ...value, occupationOther: text })), tr("ระบุสายงานของคุณ"))}
    </div>,
    <div key="goals">
      <ul className={`wob-grid${mobile ? ' is-tiles' : ''}`} role="group" aria-labelledby={titleId}>
        {GOALS.map(goal => tile(goal.id, GOAL_ICONS[goal.id], tr(GOAL_LABELS[goal.id]), answers.goals.includes(goal.id), 'check',
          () => setAnswers(value => ({ ...value, goals: toggleGoal(value.goals, goal.id) })),
          goal.id === EXCLUSIVE_GOAL ? { note: tr("เลือกข้อนี้แล้ว ข้ออื่นจะถูกเอาออก"), wide: true } : {}))}
      </ul>
    </div>,
  ][step];

  const progress = (
    <span className="wob-bar" role="progressbar" aria-valuemin={1} aria-valuemax={ONBOARDING_STEPS} aria-valuenow={step + 1}
      aria-label={tr("ขั้นตอนที่ {0} จาก {1}", step + 1, ONBOARDING_STEPS)}>
      {Array.from({ length: ONBOARDING_STEPS }, (_, index) => <i key={index} className={index <= step ? 'is-on' : ''} />)}
    </span>
  );
  const quiet = mode === 'first'
    ? <button type="button" className="wob-skip" onClick={() => void skip()} disabled={Boolean(busy)}>{busy === 'skip' ? tr("กำลังบันทึก…") : tr("ข้ามก่อน")}</button>
    : closeButton;
  const primaryLabel = busy === 'finish' ? tr("กำลังบันทึก…") : !last ? tr("ถัดไป") : mode === 'first' ? tr("เริ่มใช้งาน") : tr("บันทึก");
  const nextButton = <button type="button" className="wob-next" onClick={() => void next()} disabled={Boolean(busy)}>{primaryLabel}</button>;
  const question = step > 0 ? QUESTIONS[step - 1] : null;

  // Steps 2-4. Phones: back, the bar and ข้ามก่อน on top, ถัดไป at the bottom within reach. Computers and iPads: the
  // bar and ข้ามก่อน on top, the choices in two columns, back and next under them.
  const questionStage = question && (
    <div className="wob-q">
      <header className="wob-q-head">
        {mobile && <button type="button" className="wob-round" onClick={back} disabled={Boolean(busy)} aria-label={tr("ย้อนกลับ")}><ArrowLeft size={18} strokeWidth={2.2} /></button>}
        {progress}
        {quiet}
      </header>
      <div ref={bodyRef} className="wob-q-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section key={step} className="wob-q-step" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <p className="wob-q-num">{last ? tr("ข้อสุดท้าย") : tr("ข้อ {0} จาก {1}", step + 1, ONBOARDING_STEPS)}</p>
            <h2 id={titleId} className="wob-q-title" aria-label={tr(question.title)}><Rising text={tr(question.title)} /></h2>
            <p className="wob-q-sub">{tr(question.sub)}
              {step === 2 && <span className="wob-count">{tr("เลือกแล้ว {0}", answers.occupations.length)}</span>}
              {last && !mobile && <span className="wob-sub-more">{tr("เลือกแล้วจะเห็นว่าแอปช่วยตรงไหน")}</span>}</p>
            {choices}
          </motion.section>
        </AnimatePresence>
        {errorLine}
        {!mobile && (
          <div className="wob-q-actions">
            <button type="button" className="wob-back" onClick={back} disabled={Boolean(busy)}><ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />{tr("ย้อนกลับ")}</button>
            {nextButton}
          </div>
        )}
      </div>
      {mobile && <footer className="wob-q-foot">{nextButton}</footer>}
    </div>
  );

  return createPortal(
    <motion.div className={`wob-stage${mobile ? ' is-phone' : ''}${step === 0 ? ' is-name-step' : ''}`} role="dialog" aria-modal="true"
      aria-labelledby={titleId} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
      <OnboardingBackdrop phone={mobile} still={reduce} quiet={step > 0} name={trimmed ? `${gap}${trimmed}` : ''} lit={lit} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step === 0 ? 'name' : 'questions'} className="wob-layer" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
          {step === 0 ? nameStage : questionStage}
        </motion.div>
      </AnimatePresence>
      {celebrating && (
        <motion.div className="wob-done" role="status" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
          {!reduce && COINS.map(([x, y, delay], index) => (
            <span key={index} className="wob-coin" style={{ '--x': `${mobile ? Math.round(x * 0.6) : x}px`, '--y': `${mobile ? Math.round(y * 0.75) : y}px`, '--d': `${delay}s` } as React.CSSProperties} aria-hidden="true" />
          ))}
          <span className="wob-done-mascot" aria-hidden="true"><Mascot mood="celebrate" action="celebrate" gear="headset" animated={!reduce} size={mobile ? 120 : 150} viewBox="10 14 82 82" /></span>
          <p className="wob-done-title">{tr("พร้อมแล้วครับ")}{trimmed && <> <span className="wob-flow">{honorific}{gap}{trimmed}</span></>}</p>
          <p className="wob-done-sub">{tr("ตั้งค่าเริ่มต้นตามที่คุณตอบให้แล้ว")}</p>
        </motion.div>
      )}
    </motion.div>,
    document.body,
  );
}
