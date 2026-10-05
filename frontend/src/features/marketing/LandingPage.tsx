import React from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { ArrowRight, Check, Play } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { BrandLockup } from '../../components/brand/BrandLogo';
import { EASE, Eyebrow, Headline, LIGHT_VARS, Lead, Reveal, useSeen } from './landing/primitives';
import { DemoJobCard } from './landing/DemoJobCard';
import { ProductTour } from './landing/ProductTour';
import { CreditTermVisual, DashboardVisual, DocumentsVisual, ExpensesVisual, ReceivablesVisual } from './landing/ChapterVisuals';

// Public landing page. One idea per section, the product as the visual, and motion only where
// it shows the workflow: a job becomes money that is due, then money that arrived.

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

const NAV = [
  { href: '#features', label: 'ฟีเจอร์' },
  { href: '#who', label: 'เหมาะกับใคร' },
  { href: '#how', label: 'ทำงานยังไง' },
  { href: '#pricing', label: 'ราคา' },
];

const AUDIENCE = [
  { title: 'ฟรีแลนซ์', copy: 'หลายงาน หลายลูกค้า หลายวันจ่าย' },
  { title: 'Creator', copy: 'หลายแบรนด์ หลายแคมเปญ หลายรอบจ่าย' },
  { title: 'ครู / ติวเตอร์ / โค้ช', copy: 'มีคลาส มีลูกค้า มีเงินหลายรอบที่ต้องตาม' },
  { title: 'นักเรียน–นักศึกษา', copy: 'เรียนไป รับงานไป' },
  { title: 'Side Hustler', copy: 'มีเงินเดือน แต่รายได้ไม่ได้มีแค่เงินเดือน' },
  { title: 'คนทำงานอิสระ', copy: 'รายได้เข้าตามงาน ไม่ได้เข้าตามสิ้นเดือน' },
];

const DIFFERENCE = ['รับงาน', 'ส่งงาน', 'Credit Term', 'รอเงิน', 'รับจริง', 'หักรายจ่าย', 'เหลือจริง'];

const STEPS = [
  { title: 'รับงาน', copy: 'ใส่ชื่องาน มูลค่า และวันส่ง', scene: 0 },
  { title: 'ส่งงาน', copy: 'กระรอกรู้ว่าเงินก้อนไหนกำลังรอ', scene: 3 },
  { title: 'รับเงินจริง', copy: 'บันทึกรับเงินจากงานเดิม', scene: 4 },
  { title: 'เห็นเงินเหลือจริง', copy: 'รู้ว่าเงินเข้าเท่าไหร่ ออกเท่าไหร่ และเหลือเท่าไหร่', scene: 5 },
];

const wrap = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-12';
const section = 'py-[clamp(5.5rem,4rem+6vw,11rem)]';

function PrimaryButton({ onClick, children, size = 'md' }: { onClick: () => void; children: React.ReactNode; size?: 'md' | 'lg' }) {
  return (
    <button type="button" onClick={onClick}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl bg-[#E65F2B] font-semibold text-white transition-colors duration-200 hover:bg-[#D35221] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B] cursor-pointer ${size === 'lg' ? 'h-13 px-7 text-[15px]' : 'h-11 px-5 text-[14px]'}`}
      style={size === 'lg' ? { height: 52 } : undefined}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-[3px]" />
    </button>
  );
}

function Nav({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`sticky top-0 z-50 transition-[background-color,border-color] duration-300 ${scrolled ? 'border-b border-[#ECE8E3] bg-[#FAF8F5]/92 backdrop-blur-md' : 'border-b border-transparent'}`}>
      <div className={`${wrap} flex h-16 items-center justify-between gap-4`}>
        <a href="/" aria-label="กระรอกตุนเงิน หน้าแรก"><BrandLockup size={30} /></a>
        <nav className="hidden items-center gap-8 md:flex" aria-label="เมนูหลัก">
          {NAV.map(item => <a key={item.href} href={item.href} className="text-[14px] text-[#5F5953] transition-colors hover:text-[#1C1917]">{item.label}</a>)}
        </nav>
        <div className="flex items-center gap-1 sm:gap-3">
          <button type="button" onClick={onLogin} className="h-10 px-3 text-[14px] font-medium text-[#1C1917] hover:text-[#C24A16] cursor-pointer">เข้าสู่ระบบ</button>
          <button type="button" onClick={onStart} className="hidden h-10 items-center rounded-xl bg-[#1C1917] px-4 text-[14px] font-medium text-white transition-colors hover:bg-black sm:inline-flex cursor-pointer">เริ่มใช้งานฟรี</button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onStart }: { onStart: () => void }) {
  const reduce = useReducedMotion();
  const [restart, setRestart] = React.useState(0);
  const theaterRef = React.useRef<HTMLDivElement>(null);
  const enter = (delay: number, y: number) => reduce ? {} : {
    initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE, delay },
  };
  const watch = () => {
    setRestart(n => n + 1);
    theaterRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <section className="relative overflow-hidden pb-[clamp(4rem,3rem+4vw,8rem)] pt-[clamp(3.5rem,2rem+5vw,7.5rem)]">
      <div className={`${wrap} text-center`}>
        <motion.p {...enter(0, 10)} className="text-[14px] font-medium text-[#C24A16] sm:text-[15px]">เลขาการเงินที่เกิดมาเพื่อคนรับงาน</motion.p>
        {/* Exactly two lines at every width: the size follows the longer line's measure (~9.35em). */}
        <motion.h1 {...enter(0.15, 22)} className="mx-auto mt-5 font-semibold leading-[1.1] tracking-[-0.015em] text-[#1C1917]"
          style={{ fontSize: 'min(5.5rem, calc((100vw - 72px) / 9.5))' }}>
          <span className="block whitespace-nowrap">เรื่องตามเงิน</span>
          <span className="block whitespace-nowrap">ปล่อยให้กระรอกจัดการ</span>
        </motion.h1>
        <motion.div {...enter(0.45, 12)}>
          <p className="mx-auto mt-7 max-w-[40rem] text-[clamp(1rem,0.9rem+0.4vw,1.2rem)] leading-[1.75] text-[#6B655F] [text-wrap:balance]">
            {/* Phrases never split mid-way; lines break only between them. */}
            {['ตั้งแต่รับงาน ออกบิล', 'กำหนด Credit Term', 'ตามเงินค้าง', 'จนรู้ว่าเหลือเงินจริงเท่าไหร่', 'กระรอกช่วยเก็บทุกอย่างไว้ในที่เดียว'].map((phrase, i) => (
              <React.Fragment key={phrase}>{i === 3 && <br className="hidden md:block" />}<span className="whitespace-nowrap">{phrase}</span>{' '}</React.Fragment>
            ))}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryButton onClick={onStart} size="lg">เริ่มใช้งานฟรี</PrimaryButton>
            <button type="button" onClick={watch}
              className="group inline-flex h-[52px] items-center gap-2.5 rounded-xl px-5 text-[15px] font-medium text-[#1C1917] transition-colors hover:bg-[#F1ECE6] cursor-pointer">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#DCD6CF] transition-colors group-hover:border-[#1C1917]"><Play className="ml-0.5 h-3 w-3 fill-current" /></span>
              ดูการทำงาน
            </button>
          </div>
        </motion.div>
      </div>
      <motion.div ref={theaterRef} {...(reduce ? {} : { initial: { opacity: 0, y: 36, scale: 0.985 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.8, ease: EASE, delay: 0.75 } })}
        className="mx-auto mt-[clamp(3rem,2rem+3vw,5rem)] w-full max-w-[1120px] px-4 sm:px-8">
        <ProductTour restartKey={restart} />
      </motion.div>
    </section>
  );
}

function Audience() {
  const [active, setActive] = React.useState(0);
  return (
    <section id="who" className={`bg-white ${section}`}>
      <div className={wrap}>
        <Reveal>
          <Headline>รายได้ไม่ได้เข้าวันเดียวทุกเดือน?<br />กระรอกเกิดมาเพื่อคุณ</Headline>
          <Lead className="mt-5 max-w-xl">ถ้าต้องจำว่าใครยังไม่จ่าย กระรอกช่วยได้</Lead>
        </Reveal>
        <ol className="mt-[clamp(3rem,2rem+3vw,5rem)] border-t border-[#ECE8E3]">
          {AUDIENCE.map((row, i) => (
            <Reveal as="li" key={row.title} delay={i * 0.06}>
              <div onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} tabIndex={0}
                className="group grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-[#ECE8E3] py-6 outline-none sm:grid-cols-[4rem_minmax(0,0.9fr)_minmax(0,1.1fr)] sm:py-8">
                <span className={`font-mono text-[13px] transition-colors duration-300 ${active === i ? 'text-[#E65F2B]' : 'text-[#B8B2AB]'}`}>{String(i + 1).padStart(2, '0')}</span>
                <span className={`text-[clamp(1.4rem,1rem+1.4vw,2.25rem)] font-semibold leading-tight transition-colors duration-300 ${active === i ? 'text-[#1C1917]' : 'text-[#1C1917] sm:text-[#B8B2AB]'}`}>{row.title}</span>
                <span className={`col-start-2 mt-1.5 text-[15px] leading-relaxed transition-colors duration-300 sm:col-start-3 sm:mt-0 sm:text-[17px] ${active === i ? 'text-[#57514B]' : 'text-[#77716B] sm:text-[#C2BCB5]'}`}>{row.copy}</span>
              </div>
            </Reveal>
          ))}
        </ol>
        <Reveal className="mx-auto mt-[clamp(5rem,3rem+6vw,10rem)] max-w-3xl text-center">
          <p className="text-[clamp(1.5rem,1rem+1.8vw,2.6rem)] font-semibold leading-[1.3] text-[#1C1917] [text-wrap:balance]">
            ถ้ารายได้ของคุณไม่ได้เข้าวันเดียวทุกเดือน<br className="hidden sm:block" /> คุณไม่ควรต้องตามทุกอย่างด้วยความจำ
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Difference() {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const [active, setActive] = React.useState(reduce ? DIFFERENCE.length - 1 : -1);
  useMotionValueEvent(scrollYProgress, 'change', v => { if (!reduce) setActive(Math.min(DIFFERENCE.length - 1, Math.floor(v * DIFFERENCE.length) - 0)); });
  const fill = DIFFERENCE.length > 1 ? Math.max(0, active) / (DIFFERENCE.length - 1) : 0;

  return (
    <section className={`bg-[#141416] ${section}`}>
      <div className={wrap}>
        <Reveal>
          <Headline dark>เงินของคนรับงาน<br />เริ่มก่อนวันที่เงินเข้า</Headline>
          <Lead dark className="mt-5 max-w-2xl">แอปทั่วไปเริ่มบันทึกตอนเงินเข้า–ออกแล้ว แต่กระรอกเริ่มช่วยคุณตั้งแต่วันที่รับงาน</Lead>
        </Reveal>

        <div ref={ref} className="relative mt-[clamp(3.5rem,2.5rem+4vw,7rem)]">
          {/* Desktop: horizontal track */}
          <div className="relative hidden lg:block">
            <div className="absolute left-[calc(100%/14)] right-[calc(100%/14)] top-[11px] h-px bg-[#2E2E33]">
              <div className="h-full origin-left bg-[#E65F2B] transition-transform duration-500 ease-out" style={{ transform: `scaleX(${fill})` }} />
            </div>
            <ol className="relative grid grid-cols-7">
              {DIFFERENCE.map((label, i) => (
                <li key={label} className="flex flex-col items-center text-center">
                  <span className={`h-[23px] w-[23px] rounded-full border-2 transition-colors duration-500 ${i <= active ? 'border-[#E65F2B] bg-[#E65F2B]' : 'border-[#3A3A40] bg-[#141416]'}`} />
                  <span className={`mt-4 text-[15px] transition-colors duration-500 ${i <= active ? 'text-[#F5F2EE]' : 'text-[#5E5B57]'}`}>{label}</span>
                </li>
              ))}
            </ol>
          </div>
          {/* Phone / tablet: vertical */}
          <ol className="relative space-y-6 pl-9 lg:hidden">
            <span className="absolute bottom-2 left-[10px] top-2 w-px bg-[#2E2E33]">
              <span className="block w-full origin-top bg-[#E65F2B] transition-transform duration-500 ease-out" style={{ height: '100%', transform: `scaleY(${fill})` }} />
            </span>
            {DIFFERENCE.map((label, i) => (
              <li key={label} className="relative">
                <span className={`absolute -left-9 top-1 h-[21px] w-[21px] rounded-full border-2 transition-colors duration-500 ${i <= active ? 'border-[#E65F2B] bg-[#E65F2B]' : 'border-[#3A3A40] bg-[#141416]'}`} />
                <span className={`text-[19px] transition-colors duration-500 ${i <= active ? 'text-[#F5F2EE]' : 'text-[#5E5B57]'}`}>{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <Reveal className="mt-[clamp(5rem,3rem+6vw,10rem)] max-w-4xl">
          <p className="text-[clamp(1rem,0.9rem+0.4vw,1.25rem)] text-[#A9A39C]">ไม่ได้แค่บอกว่ามีเงินเท่าไหร่</p>
          <p className="mt-4 text-[clamp(2rem,1.2rem+3vw,4rem)] font-semibold leading-[1.15] text-[#F5F2EE] [text-wrap:balance]">
            แต่บอกได้ว่า<br />เงินก้อนต่อไปจะมาจากงานไหน<br /><span className="text-[#FF9A6B]">และเมื่อไหร่</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Chapter({ id, bg, eyebrow, title, copy, visual, flip = false, centered = false }: {
  id?: string; bg: string; eyebrow: string; title: React.ReactNode; copy: string; visual: React.ReactNode; flip?: boolean; centered?: boolean;
}) {
  if (centered) {
    return (
      <section id={id} className={`${bg} ${section}`}>
        <div className={wrap}>
          <Reveal className="mx-auto max-w-3xl text-center">
            <Eyebrow>{eyebrow}</Eyebrow>
            <Headline className="mt-4">{title}</Headline>
            <Lead className="mx-auto mt-5 max-w-xl">{copy}</Lead>
          </Reveal>
          <Reveal delay={0.1} className="mx-auto mt-[clamp(3rem,2rem+3vw,5rem)] max-w-[880px]">{visual}</Reveal>
        </div>
      </section>
    );
  }
  return (
    <section id={id} className={`${bg} ${section}`}>
      <div className={`${wrap} grid items-center gap-[clamp(2.5rem,1.5rem+3vw,6rem)] ${flip ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]' : 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'}`}>
        <Reveal className={flip ? 'lg:order-2' : ''}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Headline className="mt-4 xl:whitespace-nowrap">{title}</Headline>
          <Lead className="mt-5 max-w-md">{copy}</Lead>
        </Reveal>
        <Reveal delay={0.1} className={flip ? 'lg:order-1' : ''}>{visual}</Reveal>
      </div>
    </section>
  );
}

function TeamTeaser() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.4);
  const reduce = useReducedMotion();
  const members = [
    { name: 'A', x: 16, y: 26 },
    { name: 'B', x: 84, y: 26 },
    { name: 'C', x: 50, y: 92 },
  ];
  return (
    <section className={`bg-[#1C1B1F] ${section}`}>
      <div className={`${wrap} grid items-center gap-[clamp(2.5rem,1.5rem+3vw,6rem)] lg:grid-cols-2`}>
        <Reveal>
          <span className="inline-flex rounded-full border border-[#3A3A40] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[#C9C3BC]">COMING SOON</span>
          <Headline dark className="mt-5">Group &amp; Team กำลังมา</Headline>
          <Lead dark className="mt-5 max-w-md">แชร์ Workspace และจัดการงานร่วมกันได้ง่ายขึ้น</Lead>
        </Reveal>
        <div ref={ref} className="relative mx-auto aspect-[10/8] w-full max-w-[460px]">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            {members.map((m, i) => (
              <motion.line key={m.name} x1={m.x} y1={m.y} x2={50} y2={52} stroke="#4A4A52" strokeWidth={0.35} vectorEffect="non-scaling-stroke"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={seen ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                transition={{ duration: 1.1, ease: EASE, delay: 0.6 + i * 0.7 }} />
            ))}
          </svg>
          <motion.div initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={seen ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }} transition={{ duration: 0.7, ease: EASE }}
            className="absolute left-1/2 top-[52%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#3A3A40] bg-[#232328] p-4">
            <p className="text-[12px] font-medium text-[#F5F2EE]">Workspace</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['งาน', 'เอกสาร', 'สถานะ'].map(t => <span key={t} className="rounded-md bg-[#2E2E34] px-2 py-1 text-[11px] text-[#C9C3BC]">{t}</span>)}
            </div>
          </motion.div>
          {members.map((m, i) => (
            <motion.span key={m.name} initial={reduce ? false : { opacity: 0 }} animate={seen ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.4 + i * 0.7 }}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#3A3A40] bg-[#232328] text-[13px] font-medium text-[#F5F2EE]"
              style={{ left: `${m.x}%`, top: `${m.y}%` }}>
              {m.name}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 70%', 'end 60%'] });
  const [active, setActive] = React.useState(reduce ? STEPS.length - 1 : 0);
  useMotionValueEvent(scrollYProgress, 'change', v => { if (!reduce) setActive(Math.max(0, Math.min(STEPS.length - 1, Math.floor(v * STEPS.length)))); });
  return (
    <section id="how" className={`bg-white ${section}`}>
      <div className={wrap}>
        <Reveal className="max-w-2xl">
          <Headline>คุณทำงาน<br />กระรอกช่วยจำเรื่องเงิน</Headline>
        </Reveal>
        <div ref={ref} className="mt-[clamp(3rem,2rem+3vw,5rem)] grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <ol className="relative">
            <span className="absolute bottom-4 left-[15px] top-4 w-px bg-[#ECE8E3]" aria-hidden>
              <span className="block w-full origin-top bg-[#E65F2B] transition-transform duration-500 ease-out" style={{ height: '100%', transform: `scaleY(${active / (STEPS.length - 1)})` }} />
            </span>
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-5 pb-10 last:pb-0">
                <span className={`relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[12px] transition-colors duration-500 ${i <= active ? 'border-[#E65F2B] bg-[#E65F2B] text-white' : 'border-[#E2DDD7] bg-white text-[#A39D96]'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className={`transition-opacity duration-500 ${i <= active ? 'opacity-100' : 'opacity-45'}`}>
                  <p className="text-[clamp(1.25rem,1rem+0.8vw,1.6rem)] font-semibold text-[#1C1917]">{step.title}</p>
                  <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-[#77716B]">{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-[22px] bg-[#FAF8F5] p-4 sm:p-6">
              <DemoJobCard scene={STEPS[active].scene} />
              <p className="mt-4 text-center text-[13px] text-[#77716B]">
                {active === 0 && 'บันทึกงานใหม่ เงินก้อนนี้ยังไม่เกิด'}
                {active === 1 && 'ส่งงานแล้ว เงินก้อนนี้กลายเป็นยอดที่รอรับ'}
                {active === 2 && 'ลูกค้าโอนแล้ว กดรับเงินจากงานเดิมได้เลย'}
                {active === 3 && 'ยอดรับจริงในภาพรวมอัปเดตให้เอง'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section id="pricing" className={`bg-[#FAF8F5] ${section}`}>
      <div className={`${wrap} text-center`}>
        <Reveal>
          <Headline>เริ่มก่อน<br />ค่อยตัดสินใจทีหลัง</Headline>
        </Reveal>
        <Reveal delay={0.1} className="mx-auto mt-[clamp(3rem,2rem+3vw,5rem)] max-w-md">
          <p className="text-[15px] font-medium text-[#1C1917]">Pro</p>
          <p className="mt-3 font-mono text-[clamp(3rem,2rem+3vw,4.5rem)] font-semibold leading-none tracking-tight text-[#1C1917]">฿149<span className="ml-2 font-sans text-[17px] font-normal tracking-normal text-[#77716B]">/ เดือน</span></p>
          <ul className="mx-auto mt-8 space-y-3 text-left text-[15px] text-[#57514B] sm:w-fit">
            {['ทดลองใช้ฟรี 14 วัน', 'ไม่มีการตัดเงินอัตโนมัติ', 'ไม่ต่ออายุ ก็ใช้แบบฟรีต่อได้'].map(t => (
              <li key={t} className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-[#18A66A]" />{t}</li>
            ))}
          </ul>
          <div className="mt-10"><PrimaryButton onClick={onStart} size="lg">เริ่มใช้งานฟรี</PrimaryButton></div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta({ onStart }: { onStart: () => void }) {
  return (
    <section className={`bg-white ${section}`}>
      <div className={`${wrap} text-center`}>
        <Reveal className="mx-auto flex justify-center"><Mascot mood="proud" size={128} /></Reveal>
        <Reveal delay={0.08}>
          <p className="mt-8 text-[clamp(1.1rem,0.95rem+0.6vw,1.5rem)] text-[#77716B]">งานเยอะขึ้นได้</p>
          <p className="mx-auto mt-3 max-w-3xl text-[clamp(2.2rem,1.2rem+3.8vw,4.75rem)] font-semibold leading-[1.1] tracking-[-0.01em] text-[#1C1917]">
            เรื่องตามเงิน<br />ไม่ต้องเยอะขึ้นตาม
          </p>
          <Lead className="mx-auto mt-6 max-w-lg">ให้กระรอกช่วยจำเรื่องเงิน คุณเอาเวลาไปทำงานที่อยากทำ</Lead>
          <div className="mt-10"><PrimaryButton onClick={onStart} size="lg">เริ่มใช้งานฟรี</PrimaryButton></div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ onLogin }: { onLogin: () => void }) {
  const link = 'text-[14px] text-[#77716B] transition-colors hover:text-[#1C1917]';
  return (
    <footer className="border-t border-[#ECE8E3] bg-[#FAF8F5] py-14">
      <div className={`${wrap} flex flex-col gap-10 sm:flex-row sm:justify-between`}>
        <div>
          <BrandLockup size={28} />
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-[#77716B]">เลขาการเงินที่เกิดมาเพื่อคนรับงาน</p>
        </div>
        <div className="flex gap-16">
          <div>
            <p className="text-[13px] font-medium text-[#1C1917]">ผลิตภัณฑ์</p>
            <ul className="mt-3 space-y-2">
              <li><a href="#features" className={link}>ฟีเจอร์</a></li>
              <li><a href="#pricing" className={link}>ราคา</a></li>
              <li><button type="button" onClick={onLogin} className={`${link} cursor-pointer`}>เข้าสู่ระบบ</button></li>
            </ul>
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#1C1917]">กฎหมาย</p>
            <ul className="mt-3 space-y-2">
              <li><a href="/privacy.html" className={link}>Privacy</a></li>
              <li><a href="/terms.html" className={link}>Terms</a></li>
            </ul>
          </div>
        </div>
      </div>
      <p className={`${wrap} mt-12 text-[12px] text-[#A39D96]`}>© {new Date().getFullYear()} กระรอกตุนเงิน</p>
    </footer>
  );
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const goLogin = () => onNavigate('/login');

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C1917] antialiased" style={{ ...LIGHT_VARS, fontFamily: 'var(--font-sans)', colorScheme: 'light' }}>
      <Nav onStart={goLogin} onLogin={goLogin} />
      <main>
        <Hero onStart={goLogin} />
        <Audience />
        <Difference />
        <Chapter id="features" bg="bg-[#FAF8F5]" eyebrow="เงินที่ยังไม่ได้รับ"
          title={<>งานจบแล้ว<br />แต่เงินยังไม่เข้า<br /><span className="text-[#77716B]">กระรอกไม่ลืม</span></>}
          copy="ยอดที่ยังไม่ได้รับอยู่ในที่เดียว เห็นทันทีว่าก้อนไหนเกินกำหนด ก้อนไหนใกล้ถึงวัน" visual={<ReceivablesVisual />} />
        <Chapter bg="bg-white" eyebrow="Credit Term" flip
          title={<>ลูกค้าบอก “อีก 30 วัน”<br /><span className="text-[#77716B]">กระรอกช่วยจำต่อให้</span></>}
          copy="ส่งงานวันไหน ใส่ Credit Term กี่วัน กระรอกนับให้ แล้ววางวันที่เงินควรเข้าไว้บนปฏิทิน" visual={<CreditTermVisual />} />
        <Chapter bg="bg-[#F6F2EC]" eyebrow="ภาพรวม" centered
          title={<>ยอดงานเยอะ<br />ไม่ได้แปลว่าเงินในมือเยอะ</>}
          copy="กระรอกแยกให้ว่างานทั้งหมดเท่าไหร่ เงินเข้าจริงเท่าไหร่ ยังรออีกเท่าไหร่ และเหลือจริงเท่าไหร่" visual={<DashboardVisual />} />
        <Chapter bg="bg-white" eyebrow="รายจ่าย"
          title={<>เงินหมดไปกับอะไร<br /><span className="text-[#77716B]">ไม่ต้องเดา</span></>}
          copy="บันทึกรายจ่ายตามหมวด แล้วดูได้เลยว่าเดือนนี้เงินไปอยู่ที่ไหนมากที่สุด" visual={<ExpensesVisual />} />
        <Chapter bg="bg-[#FAF8F5]" eyebrow="เอกสาร" flip
          title={<>งานเดียว<br />เอกสารต่อได้เลย</>}
          copy="ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ดึงชื่อลูกค้า ยอดเงิน และภาษีจากงานเดิม ไม่ต้องกรอกซ้ำ" visual={<DocumentsVisual />} />
        <TeamTeaser />
        <HowItWorks />
        <Pricing onStart={goLogin} />
        <FinalCta onStart={goLogin} />
      </main>
      <Footer onLogin={goLogin} />
    </div>
  );
}
