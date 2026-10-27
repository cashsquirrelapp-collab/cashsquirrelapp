import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { uiInput, uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import { tr, T } from '../../i18n/tr';
import {
  EXCLUSIVE_GOAL, GOALS, OCCUPATIONS, ONBOARDING_STEPS, OTHER_TEXT_MAX, WORK_TYPES, answersOf, toggleGoal, toggleOccupation,
  type GoalId, type OccupationId, type OnboardingAnswers, type OnboardingRecord, type WorkTypeId,
} from '../../../../shared/onboarding';
import './onboarding.css';

// Welcome Onboarding V1 (owner brief, 2026-10-28): four short questions after the first sign-in, in the order of the
// brief; none is required. ข้ามก่อน on any step keeps what was picked and never asks again; finishing keeps it as
// COMPLETED. The same four steps open from Settings to change the answers. A formal dialog on computers and iPads,
// the whole screen on phones (DESIGN.md: one orange action, grouped lists with ticks, white surfaces, glass only on
// the backdrop).

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
const STEPS = [
  { title: T("อยากให้เราเรียกคุณว่าอะไร?"), sub: T("ชื่อเล่นหรือชื่อที่คุณชอบก็ได้ เปลี่ยนภายหลังได้เสมอ") },
  { title: T("ตอนนี้คุณทำงานรูปแบบไหน?"), sub: T("เลือก 1 ข้อ") },
  { title: T("คุณทำงานด้านไหนบ้าง?"), sub: T("เลือกได้มากกว่า 1 ข้อ") },
  { title: T("อยากให้ Krarok ช่วยเรื่องไหนบ้าง?"), sub: T("เลือกได้หลายข้อ") },
];
const NAME_MIN = 2;
const NAME_MAX = 60;

export type OnboardingResult = { answers: OnboardingAnswers; name: string | null; skippedAtStep?: number };

type Props = {
  /** 'first': after the first sign-in (ข้ามก่อน); 'edit': from Settings (ปิด, and the last step saves). */
  mode: 'first' | 'edit';
  mobile: boolean;
  /** The account's current name, shown in step 1 when the person already has one they chose. */
  accountName?: string;
  previous?: OnboardingRecord | null;
  /** Saves the answers (and the name, when given and changed); throws when it could not. */
  onFinish: (result: OnboardingResult) => Promise<void>;
  onSkip: (result: OnboardingResult) => Promise<void>;
  onClose: () => void;
};

export default function WelcomeOnboarding({ mode, mobile, accountName = '', previous, onFinish, onSkip, onClose }: Props) {
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<OnboardingAnswers>(() => answersOf(previous));
  const [name, setName] = React.useState(mode === 'edit' ? accountName : '');
  const [busy, setBusy] = React.useState<'finish' | 'skip' | null>(null);
  const [error, setError] = React.useState('');
  const titleId = React.useId();
  const otherRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const nameProblem = trimmed.length > 0 && trimmed.length < NAME_MIN;
  const last = step === ONBOARDING_STEPS - 1;
  const result = (skippedAtStep?: number): OnboardingResult => ({ answers, name: trimmed.length >= NAME_MIN ? trimmed : null, ...(skippedAtStep ? { skippedAtStep } : {}) });

  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (step === 0 && !mobile) window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 50);
  }, [step, mobile]);
  React.useEffect(() => {
    if (mode !== 'edit') return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, busy, onClose]);

  const next = async () => {
    if (busy) return;
    if (step === 0 && nameProblem) { nameRef.current?.focus(); return; }
    if (!last) { setStep(value => value + 1); setError(''); return; }
    setBusy('finish'); setError('');
    try { await onFinish(result()); }
    catch { setError(tr("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    finally { setBusy(null); }
  };
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

  const option = (key: string, label: string, picked: boolean, kind: 'radio' | 'check', onPick: () => void, note?: string) => (
    <li key={key}>
      <label className={`wob-row${picked ? ' is-picked' : ''}`}>
        <input type={kind === 'radio' ? 'radio' : 'checkbox'} className="wob-input" checked={picked} onChange={onPick}
          name={kind === 'radio' ? 'wob-work' : undefined} />
        <span className="wob-label">{label}{note && <small>{note}</small>}</span>
        <span className={`wob-tick is-${kind}`} aria-hidden="true">{picked && <Check size={14} strokeWidth={3} />}</span>
      </label>
    </li>
  );
  const otherInput = (value: string, onChange: (text: string) => void, label: string) => (
    <div className="wob-other">
      <input ref={otherRef} className={uiInput} value={value} maxLength={OTHER_TEXT_MAX} onChange={event => onChange(event.target.value)}
        placeholder={label} aria-label={label} />
    </div>
  );

  const body = [
    <div key="name" className="wob-field">
      <label className="wob-field-label" htmlFor="wob-name">{tr("ชื่อที่ให้เลขากระรอกเรียก")}</label>
      <input id="wob-name" ref={nameRef} className={uiInput} value={name} maxLength={NAME_MAX} autoComplete="nickname"
        placeholder={tr("เช่น ปาร์ค, มายด์, บอส")} onChange={event => setName(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void next(); } }}
        aria-invalid={nameProblem || undefined} aria-describedby="wob-name-note" />
      <p id="wob-name-note" className={`wob-note${nameProblem ? ' is-error' : ''}`}>
        {nameProblem ? tr("ชื่อต้องมีอย่างน้อย {0} ตัวอักษร", NAME_MIN) : tr("ใช้เป็นชื่อบัญชีที่เลขากระรอกเรียกคุณ ทั้งในแอปและ LINE ไม่ใช้แทนชื่อจริงในเอกสาร")}
      </p>
    </div>,
    <div key="work">
      <ul className="wob-group" role="radiogroup" aria-labelledby={titleId}>
        {WORK_TYPES.map(type => option(type.id, tr(WORK_LABELS[type.id]), answers.workType === type.id, 'radio', () => pickWork(type.id)))}
      </ul>
      {answers.workType === 'other' && otherInput(answers.workTypeOther, text => setAnswers(value => ({ ...value, workTypeOther: text })), tr("ระบุรูปแบบการทำงานของคุณ"))}
    </div>,
    <div key="occupations">
      <ul className="wob-group" role="group" aria-labelledby={titleId}>
        {OCCUPATIONS.map(item => option(item.id, tr(OCCUPATION_LABELS[item.id]), answers.occupations.includes(item.id), 'check', () => pickOccupation(item.id)))}
      </ul>
      {answers.occupations.includes('other') && otherInput(answers.occupationOther, text => setAnswers(value => ({ ...value, occupationOther: text })), tr("ระบุสายงานของคุณ"))}
    </div>,
    <div key="goals">
      <ul className="wob-group" role="group" aria-labelledby={titleId}>
        {GOALS.map(goal => option(goal.id, tr(GOAL_LABELS[goal.id]), answers.goals.includes(goal.id), 'check',
          () => setAnswers(value => ({ ...value, goals: toggleGoal(value.goals, goal.id) })),
          goal.id === EXCLUSIVE_GOAL ? tr("เลือกข้อนี้แล้ว ข้ออื่นจะถูกเอาออก") : undefined))}
      </ul>
    </div>,
  ][step];

  const progress = (
    <div className="wob-progress">
      <span className="wob-count" aria-hidden="true">{step + 1}/{ONBOARDING_STEPS}</span>
      <span className="wob-bar" role="progressbar" aria-valuemin={1} aria-valuemax={ONBOARDING_STEPS} aria-valuenow={step + 1}
        aria-label={tr("ขั้นตอนที่ {0} จาก {1}", step + 1, ONBOARDING_STEPS)}>
        {Array.from({ length: ONBOARDING_STEPS }, (_, index) => <i key={index} className={index <= step ? 'is-on' : ''} />)}
      </span>
    </div>
  );
  const quiet = mode === 'first'
    ? <button type="button" className="wob-skip" onClick={() => void skip()} disabled={Boolean(busy)}>{busy === 'skip' ? tr("กำลังบันทึก…") : tr("ข้ามก่อน")}</button>
    : <button type="button" className="wob-close" onClick={onClose} disabled={Boolean(busy)} aria-label={tr("ปิด")}><X size={16} strokeWidth={2.2} /></button>;
  const primaryLabel = busy === 'finish' ? tr("กำลังบันทึก…") : !last ? tr("ถัดไป") : mode === 'first' ? tr("เริ่มใช้งาน") : tr("บันทึก");
  const actions = (
    <div className="wob-actions">
      {step > 0 ? <button type="button" className={`${uiSecondaryButton} wob-back`} onClick={() => { setStep(value => value - 1); setError(''); }} disabled={Boolean(busy)}>{tr("ย้อนกลับ")}</button> : <span className="wob-back-space" />}
      <button type="button" className={`${uiPrimaryButton} wob-next`} onClick={() => void next()} disabled={Boolean(busy)}>{primaryLabel}</button>
    </div>
  );

  return createPortal(
    <motion.div className={`wob-scrim${mobile ? ' is-phone' : ''}`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <motion.div className={`wob${mobile ? ' is-phone' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
        initial={reduce ? false : mobile ? { opacity: 0, y: 24 } : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
        <header className="wob-head">{progress}{quiet}</header>
        <div ref={bodyRef} className="wob-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.section key={step} className="wob-step" initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
              {step === 0 && mode === 'first' && (
                <div className="wob-hello">
                  <span className="wob-mascot" aria-hidden="true"><Mascot mood="wave" action="wave" size={mobile ? 64 : 72} animated={!reduce} /></span>
                  <p className="wob-eyebrow">{tr("ยินดีต้อนรับสู่กระรอกตุนเงิน")}</p>
                </div>
              )}
              <h2 id={titleId} className="wob-title">{tr(STEPS[step].title)}</h2>
              <p className="wob-sub">{tr(STEPS[step].sub)}</p>
              {body}
            </motion.section>
          </AnimatePresence>
          {error && <p className="wob-error" role="alert"><AlertCircle size={15} aria-hidden="true" />{error}</p>}
        </div>
        <footer className="wob-foot">{actions}</footer>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
