import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen, Briefcase, Building2, Camera, ChartLine, Check, Code, Compass, FileSpreadsheet, FileText,
  Calculator, CircleDashed, GraduationCap, Landmark, Laptop, ListChecks, Megaphone, MessageCircle, Mic, NotebookPen, Plus, Receipt, Scissors, Settings2, Sheet, ShieldCheck, Smartphone, Store, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { tr, T } from '../../i18n/tr';
import {
  EXCLUSIVE_GOAL, GOALS, OCCUPATIONS, ONBOARDING_STEPS, OTHER_TEXT_MAX, RECORD_PLACES, UNRELEASED_GOALS, WORK_TYPES, answersOf, toggleGoal, toggleOccupation,
  type GoalId, type OccupationId, type OnboardingAnswers, type OnboardingRecord, type RecordPlaceId, type WorkTypeId,
} from '../../../../shared/onboarding';
import { Mascot } from '../../components/mascot/Mascot';
import { OnboardingBackdrop, type BackdropCard } from './OnboardingBackdrop';
import { PARTNER_LOGOS } from '../../components/brand/PartnerLogo';
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
// - Step 5 (welcome-v2, owner 2026-11-13: "positioning เราคืออะไร ... มึงรีเช็คดีๆ"): where the person records today
//   (Google Sheets, Excel, a notebook…), one pick, ข้ามก่อน as on the other questions. It replaced "move your old records
//   in?", which pulled people to us; Krarok goes to them. Question 4 lists the problems Krarok solves, each with one line.

// The labels again, marked for the English pass (shared/onboarding.ts keeps the stable IDs and the Thai labels).
const WORK_LABELS: Record<WorkTypeId, string> = {
  freelance: T("ฟรีแลนซ์ / อาชีพอิสระ"), business_owner: T("เจ้าของกิจการ / เอเจนซี / โปรดักชัน"),
  accounting_office: T("สำนักงานบัญชี / รับทำบัญชี"), employee: T("พนักงานประจำ"), student: T("นักเรียน / นักศึกษา"), other: T("อื่น ๆ (โปรดระบุ)"),
};
const OCCUPATION_LABELS: Record<OccupationId, string> = {
  content_creator: T("คอนเทนต์ครีเอเตอร์"), video_graphic: T("ตัดต่อวิดีโอ / กราฟิก"), developer_digital: T("โปรแกรมเมอร์ / งานดิจิทัล"),
  marketing: T("การตลาด / โฆษณา"), photo_video: T("ช่างภาพ / วิดีโอ"), teacher_coach: T("ครู / ติวเตอร์ / โค้ช"),
  trade_owner: T("ค้าขาย / เจ้าของกิจการ"), accounting: T("บัญชี / การเงิน"), other: T("อื่น ๆ (โปรดระบุ)"),
};
// Question 4: the problem in the person's words, and under it how Krarok takes it off their hands.
const GOAL_LABELS: Record<GoalId, string> = {
  record_chat: T("บันทึกรายรับรายจ่ายผ่าน LINE"), receipts: T("เก็บใบเสร็จและเอกสารไว้ที่เดียว"), receivables: T("ตามเงินที่ลูกค้ายังไม่จ่าย"),
  documents: T("ออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ"), cashflow_overview: T("รู้ว่าเดือนนี้ได้กำไรเท่าไร"), tax: T("เรื่องภาษีและหัก ณ ที่จ่าย"),
  my_sheet: T("กรอกชีตหรือ Excel ที่ใช้อยู่ให้อัตโนมัติ"), accountant: T("ส่งข้อมูลให้นักบัญชีครบทุกเดือน"), exploring: T("ยังไม่แน่ใจ อยากลองใช้ก่อน"),
};
const GOAL_NOTES: Partial<Record<GoalId, string>> = {
  record_chat: T("พิมพ์หรือส่งรูปใบเสร็จ ไม่ต้องจำไปจดทีหลัง"), receipts: T("ส่งรูปเข้ามา เลขาอ่านและเก็บให้ หาเจอง่าย"),
  receivables: T("เตือนวันรับเงิน ไม่ลืมทวง"), documents: T("สั่งในแชท ได้เอกสารในไม่กี่นาที"),
  cashflow_overview: T("ภาพรวมเงินเข้าออก และกำไรแต่ละงาน"), tax: T("ตามใบ 50 ทวิ และถามเรื่องภาษีได้"),
  my_sheet: T("ใช้ไฟล์เดิมของคุณ ไม่ต้องย้ายไปไหน"), accountant: T("สรุปเป็น Excel พร้อมเอกสารครบ"),
};
const RECORD_LABELS: Record<RecordPlaceId, string> = {
  google_sheets: T("Google Sheets"), excel: T("Excel"), notebook: T("สมุด / โน้ตในมือถือ"), other_app: T("แอปบัญชีอื่น"),
  by_accountant: T("มีนักบัญชีทำให้"), none: T("ยังไม่ได้จด"),
};
const WORK_ICONS: Record<WorkTypeId, LucideIcon> = { freelance: Laptop, business_owner: Building2, accounting_office: Calculator, employee: Briefcase, student: BookOpen, other: Plus };
const OCCUPATION_ICONS: Record<OccupationId, LucideIcon> = {
  content_creator: Mic, video_graphic: Scissors, developer_digital: Code, marketing: Megaphone, photo_video: Camera,
  teacher_coach: GraduationCap, trade_owner: Store, accounting: Calculator, other: Plus,
};
const GOAL_ICONS: Record<GoalId, LucideIcon> = {
  record_chat: MessageCircle, receipts: Receipt, receivables: Wallet, documents: FileText, cashflow_overview: ChartLine,
  tax: Landmark, my_sheet: FileSpreadsheet, accountant: Calculator, exploring: Compass,
};
const RECORD_ICONS: Record<RecordPlaceId, LucideIcon> = {
  google_sheets: Sheet, excel: FileSpreadsheet, notebook: NotebookPen, other_app: Smartphone, by_accountant: Briefcase, none: CircleDashed,
};
// Where these Thai labels may break on a narrow tile; left alone, the browser splits words such as รายจ่าย or ค้างรับ.
// The parts join back to the label exactly; English labels are not listed and wrap as usual.
const LABEL_PARTS: Record<string, string[]> = {
  'โปรแกรมเมอร์ / งานดิจิทัล': ['โปรแกรมเมอร์ / ', 'งานดิจิทัล'],
  'ดูภาพรวมรายรับรายจ่ายและกระแสเงินสด': ['ดูภาพรวม', 'รายรับรายจ่าย', 'และกระแสเงินสด'],
  'ติดตามเงินค้างรับจากลูกค้า': ['ติดตาม', 'เงินค้างรับ', 'จากลูกค้า'],
  'จัดการงานและโปรเจกต์': ['จัดการงาน', 'และโปรเจกต์'],
  'ทำใบเสนอราคาและเอกสาร': ['ทำใบเสนอราคา', 'และเอกสาร'],
  // welcome-v2 (2026-11-13): never "ใบ / แจ้งหนี้" or "ที่ / ใช้อยู่" on a phone.
  'บันทึกรายรับรายจ่ายผ่าน LINE': ['บันทึกรายรับรายจ่าย', 'ผ่าน LINE'],
  'เก็บใบเสร็จและเอกสารไว้ที่เดียว': ['เก็บใบเสร็จ', 'และเอกสาร', 'ไว้ที่เดียว'],
  'ตามเงินที่ลูกค้ายังไม่จ่าย': ['ตามเงิน', 'ที่ลูกค้ายังไม่จ่าย'],
  'ออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ': ['ออกใบเสนอราคา ', 'ใบแจ้งหนี้ ', 'ใบเสร็จ'],
  'รู้ว่าเดือนนี้ได้กำไรเท่าไร': ['รู้ว่าเดือนนี้', 'ได้กำไรเท่าไร'],
  'เรื่องภาษีและหัก ณ ที่จ่าย': ['เรื่องภาษี', 'และหัก ณ ที่จ่าย'],
  'กรอกชีตหรือ Excel ที่ใช้อยู่ให้อัตโนมัติ': ['กรอกชีตหรือ Excel ', 'ที่ใช้อยู่', 'ให้อัตโนมัติ'],
  'ส่งข้อมูลให้นักบัญชีครบทุกเดือน': ['ส่งข้อมูลให้นักบัญชี', 'ครบทุกเดือน'],
  'เจ้าของกิจการ / เอเจนซี / โปรดักชัน': ['เจ้าของกิจการ / ', 'เอเจนซี / ', 'โปรดักชัน'],
  'สำนักงานบัญชี / รับทำบัญชี': ['สำนักงานบัญชี / ', 'รับทำบัญชี'],
  'สมุด / โน้ตในมือถือ': ['สมุด / ', 'โน้ตในมือถือ'],
};
const phrased = (label: string): React.ReactNode => LABEL_PARTS[label]
  ? LABEL_PARTS[label].map((part, index) => <React.Fragment key={index}>{index > 0 && <wbr />}<span className="wob-keep">{part}</span></React.Fragment>)
  : label;
// Steps 2-4 (step 1 has no title row: its question sits under the greeting).
const QUESTIONS = [
  { title: T("ตอนนี้คุณทำงานรูปแบบไหน?"), sub: T("เลือก 1 ข้อ") },
  { title: T("คุณทำงานด้านไหนบ้าง?"), sub: T("เลือกได้มากกว่า 1 ข้อ") },
  { title: T("อยากให้ Krarok ช่วยเรื่องไหนบ้าง?"), sub: T("เลือกเรื่องที่ตอนนี้ยุ่งยากสำหรับคุณ เลือกได้หลายข้อ") },
  { title: T("ตอนนี้คุณจดรายรับรายจ่ายไว้ที่ไหน?"), sub: T("เลือกที่ใช้เป็นหลัก 1 ข้อ") },
];
// Signing up inside LINE (owner, 2026-11-13: "อยากให้มันเป็น UI ทรานซิชั่นเหมือนที่เราทำในเว็บไซต์", then "แบบสอบถาม ...
// เหมือนใน .com ... ถามกี่ข้อก็ว่ากันไป"): the first run's own five steps, then one more for the agreements
// (shared/consents.ts terms, ai and line, in the reassuring words of AiConsent.tsx, protections first).
const LINE_AGREE = { title: T("ก่อนเริ่ม อ่านสั้น ๆ ครับ"), sub: T("วิธีที่เราดูแลข้อมูลของคุณ") };
const LINE_PROMISES: { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: T("ข้อมูลใช้เพื่อตอบคุณเท่านั้น ใช้บริการ AI แบบธุรกิจ และไม่ถูกนำไปฝึก AI") },
  { icon: ListChecks, text: T("เลขาไม่บันทึกเอง จะส่งการ์ดให้คุณตรวจและกดยืนยันก่อนทุกครั้ง") },
  { icon: AlertCircle, text: T("เลขาตอบผิดได้บ้าง โปรดตรวจตัวเลขสำคัญ คำตอบไม่ใช่คำปรึกษาทางภาษีหรือกฎหมาย") },
  { icon: Settings2, text: T("เปลี่ยนใจได้ทุกเมื่อที่ ตั้งค่า › ความยินยอม") },
];
// The Thai titles in pieces that rise one after another, the coloured piece marked; other languages rise word by word.
const TITLE_PARTS: Record<string, [string, boolean?][]> = {
  'สวัสดีครับ': [['สวัสดี'], ['ครับ']],
  'ตอนนี้คุณทำงานรูปแบบไหน?': [['ตอนนี้คุณ'], ['ทำงาน'], ['รูปแบบไหน?', true]],
  'คุณทำงานด้านไหนบ้าง?': [['คุณทำงาน'], ['ด้านไหน', true], ['บ้าง?']],
  'อยากให้ Krarok ช่วยเรื่องไหนบ้าง?': [['อยากให้ '], ['Krarok', true], [' ช่วยเรื่องไหนบ้าง?']],
  'ตอนนี้คุณจดรายรับรายจ่ายไว้ที่ไหน?': [['ตอนนี้คุณ'], ['จดรายรับรายจ่าย', true], ['ไว้ที่ไหน?']],
  'ก่อนเริ่ม อ่านสั้น ๆ ครับ': [['ก่อนเริ่ม '], ['อ่านสั้น ๆ', true], [' ครับ']],
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
const GOAL_CARDS: Partial<Record<GoalId, BackdropCard>> = {
  record_chat: 'chat', receipts: 'paid', receivables: 'owed', documents: 'quote', cashflow_overview: 'income', tax: 'alarm', accountant: 'work',
};
/** The questions' steps by number: 1 work type, 2 occupations, 3 goals, 4 where the records are (0 is the name). */
const GOALS_STEP = 3;
const RECORDS_STEP = 4;
const COINS = [[-220, -170, 0.2], [230, -150, 0.26], [-260, 60, 0.32], [250, 90, 0.22], [-90, -240, 0.3], [110, -250, 0.36]] as const;
const NAME_MIN = 2;
const NAME_MAX = 60;

export type OnboardingResult = { answers: OnboardingAnswers; name: string | null; skippedAtStep?: number };

type Props = {
  /** 'first': after the first sign-in (ข้ามก่อน from step 2); 'edit': from Settings (ปิด, and the last step saves);
   *  'line': signing up inside LINE — the first run's own questions exactly (owner, 2026-11-13: "ให้มันขึ้นเหมือนกันเด๊ะ"),
   *  then the agreements, which ข้ามก่อน leads to; the last step signs up. */
  mode: 'first' | 'edit' | 'line';
  mobile: boolean;
  /** The account's current name, filled in step 1 when the answers are opened from Settings. */
  accountName?: string;
  previous?: OnboardingRecord | null;
  /** Saves the answers (and the name, when changed); throws when it could not. */
  onFinish: (result: OnboardingResult) => Promise<void>;
  onSkip: (result: OnboardingResult) => Promise<void>;
  onClose: () => void;
  /** Goals of features not open to this account yet (shared/onboarding.ts UNRELEASED_GOALS) are offered only when true. */
  showUnreleased?: boolean;
  /** 'line': มีบัญชีอยู่แล้ว, the way to link an account made on the website instead (LineLinkExisting.tsx). */
  onHaveAccount?: () => void;
};

export default function WelcomeOnboarding({ mode, mobile, accountName = '', previous, onFinish, onSkip, onClose, showUnreleased = false, onHaveAccount }: Props) {
  const reduce = useReducedMotion() ?? false;
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<OnboardingAnswers>(() => answersOf(previous));
  const [name, setName] = React.useState(mode === 'first' ? '' : accountName);
  const [agreed, setAgreed] = React.useState(false);
  // ข้ามก่อน in LINE keeps what was picked and goes to the agreements; the step it was pressed on is kept as on the web.
  const [skippedAt, setSkippedAt] = React.useState<number | undefined>(undefined);
  const line = mode === 'line';
  const runsFirst = mode === 'first' || line;
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
  // The first run adds step 5, the question about old records; from Settings there are the four kept answers only.
  // The name and four questions everywhere; in LINE one more step for the agreements.
  const totalSteps = line ? ONBOARDING_STEPS + 1 : ONBOARDING_STEPS;
  const agreeStep = line && step === ONBOARDING_STEPS;
  const goalChoices = GOALS.filter(goal => showUnreleased || !UNRELEASED_GOALS.includes(goal.id));
  const last = step === totalSteps - 1;
  // "คุณ" before the name (none in English), with a space before a name in Latin letters: คุณ CEO Park, not คุณCEO Park.
  const honorific = tr("คุณ{0}", '').trim();
  const gap = honorific && /^[A-Za-z0-9]/.test(trimmed) ? ' ' : '';
  const lit = React.useMemo(() => new Set<BackdropCard>(step === GOALS_STEP && !mobile
    ? answers.goals.map(goal => GOAL_CARDS[goal]).filter((card): card is BackdropCard => Boolean(card)) : []), [step, mobile, answers.goals]);
  const result = (skippedAtStep?: number): OnboardingResult => ({
    answers, name: nameOk ? trimmed : null, ...(skippedAtStep ? { skippedAtStep } : {}),
  });

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
    // In LINE the agreements are needed to start.
    if (agreeStep && !agreed) { setError(tr("กรุณากดยอมรับเงื่อนไขก่อนเริ่มใช้งาน")); return; }
    if (!last) { setStep(value => value + 1); setError(''); return; }
    setBusy('finish'); setError('');
    // The first run ends on a short "พร้อมแล้วครับ" before the answers are saved and the screen closes.
    if (mode === 'first' || line) {
      setCelebrating(true);
      await new Promise(resolve => window.setTimeout(resolve, reduce ? 700 : 1700));
    }
    try { await onFinish(result(line ? skippedAt : undefined)); }
    catch (failure) {
      setCelebrating(false);
      // In LINE the server's own reason is shown (it is written for the person: "LINE นี้เชื่อมกับบัญชีอื่นอยู่แล้ว").
      setError(line && failure instanceof Error && failure.message ? failure.message : tr("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง"));
    }
    finally { setBusy(null); }
  };
  const back = () => {
    if (busy || step === 0) return;
    // Back from the agreements after ข้ามก่อน returns to the step that was skipped.
    if (agreeStep && skippedAt) { setStep(skippedAt - 1); setSkippedAt(undefined); setError(''); return; }
    setStep(value => value - 1); setError('');
  };
  const skip = async () => {
    if (busy) return;
    if (line) { setSkippedAt(step + 1); setStep(ONBOARDING_STEPS); setError(''); return; }
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

  const tile = (key: string, Icon: LucideIcon, label: string, picked: boolean, kind: 'radio' | 'check', onPick: () => void, options: { note?: string; wide?: boolean; name?: string; logo?: string } = {}) => (
    <li key={key} className={options.wide ? 'is-wide' : undefined}>
      <label className={`wob-tile${picked ? ' is-picked' : ''}`}>
        <input type={kind === 'radio' ? 'radio' : 'checkbox'} className="wob-input" checked={picked} onChange={onPick}
          name={kind === 'radio' ? options.name ?? 'wob-work' : undefined} />
        <span className={`wob-ico${options.logo ? ' is-logo' : ''}`} aria-hidden="true">{options.logo
          ? <img src={options.logo} alt="" width={mobile ? 26 : 24} height={mobile ? 26 : 24} draggable={false} />
          : <Icon size={mobile ? 21 : 19} strokeWidth={1.9} />}</span>
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
          {line && onHaveAccount && <button type="button" className="wob-have-account" onClick={onHaveAccount} data-testid="line-have-account">{tr("เคยใช้บนเว็บแล้ว? เชื่อมบัญชีเดิม")}</button>}
        </div>
      </div>
    </div>
  );

  const agreement = (
    <div key="agree">
      <ul className="wob-grid is-rows wob-promises" aria-label={tr(LINE_AGREE.sub)}>
        {LINE_PROMISES.map(({ icon: Icon, text }) => (
          <li key={text}><div className="wob-promise"><span className="wob-ico" aria-hidden="true"><Icon size={mobile ? 20 : 18} strokeWidth={1.9} /></span><span className="wob-label">{tr(text)}</span></div></li>
        ))}
      </ul>
      <ul className="wob-grid is-rows wob-agree">
        {tile('agree', ShieldCheck, tr("ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว"), agreed, 'check', () => { setAgreed(value => !value); setError(''); },
          { note: tr("และยินยอมให้เลขากระรอกช่วยดูแลงานผ่าน LINE"), wide: true })}
      </ul>
      <p className="wob-links"><a href="/terms.html" target="_blank" rel="noopener noreferrer">{tr("อ่านเงื่อนไขการใช้งาน")}</a><span aria-hidden="true"> · </span><a href="/privacy.html" target="_blank" rel="noopener noreferrer">{tr("นโยบายความเป็นส่วนตัว")}</a></p>
    </div>
  );
  const choices = agreeStep ? agreement : [
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
      <ul className={`wob-grid${mobile ? ' is-rows' : ''}`} role="group" aria-labelledby={titleId}>
        {goalChoices.map(goal => tile(goal.id, GOAL_ICONS[goal.id], tr(GOAL_LABELS[goal.id]), answers.goals.includes(goal.id), 'check',
          () => setAnswers(value => ({ ...value, goals: toggleGoal(value.goals, goal.id) })),
          goal.id === EXCLUSIVE_GOAL ? { note: tr("เลือกข้อนี้แล้ว ข้ออื่นจะถูกเอาออก"), wide: true } : { note: GOAL_NOTES[goal.id] ? tr(GOAL_NOTES[goal.id]!) : undefined }))}
      </ul>
    </div>,
    <div key="records">
      <ul className={`wob-grid${mobile ? ' is-rows' : ''}`} role="radiogroup" aria-labelledby={titleId}>
        {RECORD_PLACES.map(place => tile(place.id, RECORD_ICONS[place.id], tr(RECORD_LABELS[place.id]), answers.recordsIn === place.id, 'radio',
          () => setAnswers(value => ({ ...value, recordsIn: value.recordsIn === place.id ? null : place.id })),
          { name: 'wob-records', logo: place.id === 'google_sheets' ? PARTNER_LOGOS.sheets : place.id === 'excel' ? PARTNER_LOGOS.excel : undefined }))}
      </ul>
    </div>,
  ][step];

  const progress = (
    <span className="wob-bar" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={step + 1}
      aria-label={tr("ขั้นตอนที่ {0} จาก {1}", step + 1, totalSteps)} style={{ '--wob-steps': totalSteps } as React.CSSProperties}>
      {Array.from({ length: totalSteps }, (_, index) => <i key={index} className={index <= step ? 'is-on' : ''} />)}
    </span>
  );
  // Step 5 has no ข้ามก่อน: ไม่มี is the way past it, and a skip there would not be one of the four kept steps.
  const quiet = agreeStep ? <span className="wob-skip-gap" aria-hidden="true" /> : runsFirst
    ? <button type="button" className="wob-skip" onClick={() => void skip()} disabled={Boolean(busy)}>{busy === 'skip' ? tr("กำลังบันทึก…") : tr("ข้ามก่อน")}</button>
    : closeButton;
  const primaryLabel = busy === 'finish' ? (line ? tr("กำลังเตรียมบัญชี…") : tr("กำลังบันทึก…")) : !last ? tr("ถัดไป")
    : runsFirst ? tr("เริ่มใช้งาน") : tr("บันทึก");
  const nextButton = <button type="button" className="wob-next" onClick={() => void next()} disabled={Boolean(busy)}>{primaryLabel}</button>;
  const question = step === 0 ? null : agreeStep ? LINE_AGREE : QUESTIONS[step - 1];

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
            <p className="wob-q-num">{last ? tr("ข้อสุดท้าย") : tr("ข้อ {0} จาก {1}", step + 1, totalSteps)}</p>
            <h2 id={titleId} className="wob-q-title" aria-label={tr(question.title)}><Rising text={tr(question.title)} /></h2>
            <p className="wob-q-sub">{tr(question.sub)}
              {step === 2 && <span className="wob-count">{tr("เลือกแล้ว {0}", answers.occupations.length)}</span>}
              {step === GOALS_STEP && !mobile && <span className="wob-sub-more">{tr("เลือกแล้วจะเห็นว่าแอปช่วยตรงไหน")}</span>}</p>
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
          <p className="wob-done-sub">{line ? tr("กลับไปที่แชทแล้วพิมพ์บอกเลขาได้เลย") : tr("ตั้งค่าเริ่มต้นตามที่คุณตอบให้แล้ว")}</p>
        </motion.div>
      )}
    </motion.div>,
    document.body,
  );
}
