import React from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { CalendarClock, Check, FileText } from 'lucide-react';
import { Mascot } from '../../../components/mascot/Mascot';
import { BrandLogo } from '../../../components/brand/BrandLogo';
import { CountUp, EASE, Frame, Pill } from './primitives';

// The hero's 12-second product story, built from app-style DOM rather than a video: one job
// goes รับงาน → ส่งงาน → ออกบิล → ตามเงิน → รับเงินจริง, and the dashboard numbers move with it.
// Readable with the sound off; reduced motion shows the finished state.

export const FLOW = ['รับงาน', 'ส่งงาน', 'ออกบิล', 'ตามเงิน', 'รับเงินจริง'] as const;
const CAPTIONS = ['รับงาน', 'ส่งงาน', 'ออกบิล', 'ตามเงิน', 'รับเงินจริง', 'รับเงินจริง'];
const SCENE_MS = 2000;
const HOLD_MS = 2600; // the last scene lingers before the loop starts again
export const LAST_SCENE = 5;

/** Which of the FLOW steps a scene belongs to. */
export const flowStep = (scene: number) => Math.min(scene, FLOW.length - 1);

export function useTheaterScene(ref: React.RefObject<Element | null>, restartKey: number) {
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.3 });
  const [scene, setScene] = React.useState(reduce ? LAST_SCENE : 0);
  React.useEffect(() => { if (!reduce) setScene(0); }, [restartKey, reduce]);
  React.useEffect(() => {
    if (reduce || !inView) return;
    const timer = window.setTimeout(() => setScene(s => (s >= LAST_SCENE ? 0 : s + 1)), scene >= LAST_SCENE ? HOLD_MS : SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [scene, inView, reduce]);
  return reduce ? LAST_SCENE : scene;
}

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.45, ease: EASE } };

/** The demo job card at a given scene -- also reused by "ทำงานยังไง". */
export function DemoJobCard({ scene }: { scene: number }) {
  const delivered = scene >= 1;
  const invoiced = scene >= 2;
  const paid = scene >= 4;
  return (
    <motion.div layout transition={{ duration: 0.5, ease: EASE }} className="rounded-2xl border border-[#E7E4DF] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-[#1C1917] sm:text-base">TikTok Campaign</p>
          <p className="mt-0.5 text-[13px] text-[#77716B]">Brand A · Sponsored Post</p>
        </div>
        <p className="shrink-0 font-mono text-[15px] font-semibold text-[#1C1917] sm:text-base">฿15,000</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={delivered ? 'done' : 'doing'} {...fade}>
            {delivered ? <Pill tone="green"><Check className="h-3 w-3" />ส่งงานแล้ว</Pill> : <Pill tone="blue">กำลังทำ</Pill>}
          </motion.span>
          <motion.span key={paid ? 'paid' : delivered ? 'waiting' : 'unpaid'} {...fade}>
            {paid ? <Pill tone="green"><Check className="h-3 w-3" />รับเงินแล้ว</Pill>
              : scene >= 3 ? <Pill tone="amber">รอรับเงิน · เหลืออีก 8 วัน</Pill>
              : <Pill tone="orange">ยังไม่จ่าย</Pill>}
          </motion.span>
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {delivered && (
          <motion.div key="credit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.5, ease: EASE }}
            className="overflow-hidden">
            <div className="mt-3 flex items-center gap-2 border-t border-[#EFECE8] pt-3 text-[12px] text-[#77716B] sm:text-[13px]">
              <CalendarClock className="h-3.5 w-3.5 text-[#C24A16]" />
              Credit Term <span className="font-medium text-[#1C1917]">30 วัน</span>
              <span className="text-[#C9C3BC]">·</span>
              {paid ? <>รับเงิน <span className="font-medium text-[#12804F]">22 ต.ค.</span></> : <>คาดรับ <span className="font-medium text-[#1C1917]">30 ต.ค.</span></>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {invoiced && (
          <motion.div key="inv" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}
            className="mt-3 flex items-center gap-3 rounded-xl bg-[#FAF8F5] px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E7E4DF] bg-white text-[#77716B]"><FileText className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-[#1C1917]">ใบแจ้งหนี้ INV-024</p>
              <p className="text-[11px] text-[#77716B]">สร้างจากงานนี้ · Brand A</p>
            </div>
            <span className="font-mono text-[12px] font-semibold text-[#1C1917]">฿15,000</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'orange' }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[#77716B]">{label}</p>
      <CountUp value={value} className={`mt-0.5 block font-mono text-[clamp(1.25rem,1rem+0.9vw,1.75rem)] font-semibold tracking-tight ${tone === 'green' ? 'text-[#12804F]' : tone === 'orange' ? 'text-[#C24A16]' : 'text-[#1C1917]'}`} />
    </div>
  );
}

export function ProductTheater({ restartKey }: { restartKey: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const scene = useTheaterScene(ref, restartKey);
  const settled = scene >= LAST_SCENE;
  const step = flowStep(scene);

  return (
    <div ref={ref}>
      <div className="relative rounded-[22px] bg-white shadow-[0_40px_120px_-40px_rgba(70,49,36,0.28)]">
        <Frame className="rounded-[22px]">
          <div className="flex items-center gap-2 border-b border-[#EFECE8] px-4 py-3 sm:px-6">
            <BrandLogo size={22} />
            <span className="text-[13px] font-medium text-[#1C1917]">งาน</span>
            <span className="ml-auto text-[12px] text-[#77716B]">ตุลาคม 2569</span>
          </div>
          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8 lg:p-8">
            <div className="min-h-[244px] sm:min-h-[260px]">
              <p className="mb-2.5 text-[12px] font-medium text-[#77716B]">งานล่าสุด</p>
              <AnimatePresence mode="wait">
                <motion.div key={scene === 0 ? 'enter' : 'job'} initial={scene === 0 ? { opacity: 0, y: 18, scale: 0.985 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE }}>
                  <DemoJobCard scene={scene} />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex flex-col justify-between gap-5 rounded-2xl bg-[#FAF8F5] p-4 sm:p-5">
              <div>
                <p className="text-[12px] font-medium text-[#77716B]">ภาพรวมเดือนนี้</p>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Stat label="รับเงินจริง" value={settled ? 46000 : 31000} tone={settled ? 'green' : undefined} />
                  <Stat label="รอรับเงิน" value={settled ? 10000 : 25000} tone="orange" />
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="max-w-[16rem] text-[12px] leading-relaxed text-[#77716B]">
                  {settled ? 'เงินจากงานนี้ย้ายจาก “รอรับ” มาเป็น “รับจริง” ให้เอง' : 'ยอดที่รออยู่ มาจากงานที่ส่งแล้วแต่ยังไม่ได้เงิน'}
                </p>
                <div className="h-[64px] w-[64px] shrink-0">
                  <AnimatePresence>
                    {settled && (
                      <motion.div key="m" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
                        <Mascot mood="celebrate" action="celebrate" size={64} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </Frame>
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
          <AnimatePresence mode="wait">
            <motion.span key={CAPTIONS[scene]} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }}
              className="inline-flex rounded-full border border-[#E7E4DF] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#1C1917] shadow-sm">
              {CAPTIONS[scene]}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <ol className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] sm:text-[13px]" aria-label="ขั้นตอน">
        {FLOW.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span className={`transition-colors duration-500 ${i === step ? 'font-medium text-[#1C1917]' : i < step ? 'text-[#77716B]' : 'text-[#B8B2AB]'}`}>{label}</span>
            {i < FLOW.length - 1 && <span aria-hidden className={i < step ? 'text-[#E65F2B]' : 'text-[#D9D4CE]'}>→</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

