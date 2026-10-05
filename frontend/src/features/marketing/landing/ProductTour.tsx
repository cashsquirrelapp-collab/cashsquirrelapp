import React from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Bell, CalendarDays, Check, ChevronDown, Home, List, Plus, Receipt, Wallet, X, Briefcase } from 'lucide-react';
import { BrandLockup } from '../../../components/brand/BrandLogo';
import { EASE, Pill, baht } from './primitives';

// "ดูการใช้งานจริง": four short screen recordings, rebuilt as live DOM. Each tab replays one real
// workflow -- record a job with a Credit Term, read the payment timeline, get the LINE reminder
// for overdue / due-today jobs, record the payment -- with a cursor doing the clicking. Labels,
// options and layouts are copied from the app (JobFormDrawer, TimelineView, the overdue digest,
// JobPaymentDialog), so nothing here is a feature the app does not have.

type Step = { ms: number; at?: string; click?: boolean };
type ScreenProps = { step: number };

const STAGE_W = 1040;
const STAGE_H = 640;
// Phones get a narrower stage (no sidebar) so the scaled-down UI stays readable.
const COMPACT_W = 600;
const Compact = React.createContext(false);

// ---------- small shared pieces ----------

function Typed({ text, from, step, ms }: { text: string; from: number; step: number; ms: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (step !== from || reduce) return;
    setN(0);
    const per = Math.max(30, (ms - 200) / text.length);
    const id = window.setInterval(() => setN(v => (v >= text.length ? v : v + 1)), per);
    return () => window.clearInterval(id);
  }, [step, from, text, ms, reduce]);
  if (step < from) return null;
  const shown = step > from || reduce ? text : text.slice(0, n);
  return <>{shown}{step === from && !reduce && n < text.length && <span className="ml-px inline-block h-[1em] w-px translate-y-[2px] animate-pulse bg-[#1C1917]" />}</>;
}

const NAV = [
  { key: 'home', label: 'ภาพรวม', icon: Home },
  { key: 'jobs', label: 'งาน', icon: Briefcase },
  { key: 'calendar', label: 'ปฏิทิน', icon: CalendarDays },
  { key: 'expenses', label: 'รายจ่าย', icon: Receipt },
];

function Shell({ active, children }: { active: string; children: React.ReactNode }) {
  const compact = React.useContext(Compact);
  return (
    <div className="flex h-full bg-[#FAFAF9]">
      {!compact && <aside className="flex w-[188px] shrink-0 flex-col border-r border-[#ECE9E5] bg-white px-3 py-4">
        <div className="px-2"><BrandLockup size={24} /></div>
        <nav className="mt-6 space-y-1">
          {NAV.map(item => (
            <span key={item.key} className={`flex h-9 items-center gap-2.5 rounded-xl px-3 text-[13px] ${item.key === active ? 'bg-[#FFF1E8] font-medium text-[#C24A16]' : 'text-[#57514B]'}`}>
              <item.icon className="h-4 w-4" />{item.label}
            </span>
          ))}
        </nav>
      </aside>}
      <div className={`relative min-w-0 flex-1 overflow-hidden ${compact ? 'px-5 py-5' : 'px-7 py-6'}`}>{children}</div>
    </div>
  );
}

function Segment({ options, value, tourPrefix }: { options: string[]; value: string; tourPrefix?: string }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <span key={o} data-tour={tourPrefix ? `${tourPrefix}-${o}` : undefined}
          className={`flex h-9 items-center justify-center rounded-[10px] border text-[12px] transition-colors duration-300 ${o === value ? 'border-[#E65F2B] bg-[#FFF1E8] font-semibold text-[#C24A16]' : 'border-[#E7E4DF] bg-white text-[#57514B]'}`}>
          {o}
        </span>
      ))}
    </div>
  );
}

function Field({ label, tour, children, focused }: { label: string; tour?: string; children: React.ReactNode; focused?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[#1C1917]">{label}</span>
      <span data-tour={tour} className={`flex h-10 items-center rounded-[10px] border bg-white px-3 text-[13px] text-[#1C1917] transition-colors duration-200 ${focused ? 'border-[#E65F2B] ring-2 ring-[#E65F2B]/15' : 'border-[#E7E4DF]'}`}>{children}</span>
    </label>
  );
}

function Toast({ show, text }: { show: boolean; text: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.35, ease: EASE }}
          className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-[#1C1917] px-4 py-2.5 text-[13px] text-white shadow-lg">
          <span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#7FD8AE]" />{text}</span>
          <span className="font-medium text-[#FFB48F]">เลิกทำ</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- jobs list (tabs 1 and 4) ----------

type Row = { id: string; name: string; client: string; date: string; dateTone?: 'red'; stage: string; stageTone: 'blue' | 'green' | 'neutral'; pay: string; payTone: 'orange' | 'green'; amount: number; fresh?: boolean };

const ROW_SERUM: Row = { id: 'serum', name: 'รีวิวเซรั่ม', client: 'Skinness', date: 'ครบกำหนดวันนี้', stage: 'เสร็จแล้ว', stageTone: 'green', pay: 'ยังไม่จ่าย', payTone: 'orange', amount: 1500 };
const ROW_CLASS: Row = { id: 'class', name: 'คลาสติวสอบ (4 ครั้ง)', client: 'คุณแพร', date: '3 ต.ค. 2569', stage: 'ปิดงานแล้ว', stageTone: 'neutral', pay: 'รับครบแล้ว', payTone: 'green', amount: 4800 };
const ROW_DD: Row = { id: 'dd', name: 'Brand Consultation', client: 'DDproperty', date: 'เกินกำหนด 9 วัน', dateTone: 'red', stage: 'เสร็จแล้ว', stageTone: 'green', pay: 'ยังไม่จ่าย', payTone: 'orange', amount: 6665 };
const ROW_TIKTOK: Row = { id: 'tiktok', name: 'TikTok Campaign', client: 'Brand A', date: '31 ต.ค. 2569', stage: 'เสร็จแล้ว', stageTone: 'green', pay: 'ยังไม่จ่าย', payTone: 'orange', amount: 15000 };

function JobsPage({ rows, counts, children, highlight, badgeMenu }: {
  rows: Row[]; counts: { all: number; working: number; waiting: number; waitingAmount: number; closed: number }; children?: React.ReactNode; highlight?: string;
  /** A menu opened from one row's payment badge, drawn under that badge. */
  badgeMenu?: { id: string; node: React.ReactNode };
}) {
  const compact = React.useContext(Compact);
  const cols = compact ? 'grid-cols-[minmax(0,1.5fr)_88px_96px_84px]' : 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_96px_96px_90px]';
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[22px] font-semibold leading-tight text-[#1C1917]">งาน</p>
          <p className="mt-0.5 text-[12px] text-[#77716B]">ติดตามงานตั้งแต่รับงาน จนถึงวันที่เงินจริงเข้ามา</p>
        </div>
        <span data-tour="add" className="flex h-10 items-center gap-1.5 rounded-full bg-[#E65F2B] px-4 text-[13px] font-semibold text-white"><Plus className="h-4 w-4" />เพิ่มงาน</span>
      </div>
      <div className="mt-5 flex gap-2 text-[12px]">
        {([['ทั้งหมด', `${counts.all}`, true], ['กำลังทำ', `${counts.working}`], ['รอรับเงิน', `${counts.waiting} · ${baht(counts.waitingAmount)}`], ['ปิดงานแล้ว', `${counts.closed}`]] as const).filter(([label]) => !compact || label !== 'กำลังทำ').map(([label, n, on]) => (
          <motion.span key={label as string} layout className={`rounded-full border px-3.5 py-1.5 ${on ? 'border-[#F3B08C] bg-[#FFF7F1] font-semibold text-[#C24A16]' : 'border-[#E7E4DF] bg-white text-[#57514B]'}`}>
            {label} <span className="font-medium">{n}</span>
          </motion.span>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-[14px] border border-[#E7E4DF] bg-white">
        <div className={`grid ${cols} border-b border-[#EFECE8] px-4 py-2.5 text-[11px] text-[#77716B]`}>
          <span>งาน / ลูกค้า</span>{!compact && <span>กำหนด</span>}<span>สถานะงาน</span><span>การชำระ</span><span className="text-right">จำนวนเงิน</span>
        </div>
        <AnimatePresence initial={false}>
          {rows.map(row => (
            <motion.div key={row.id} layout initial={row.fresh ? { opacity: 0, y: -8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}
              className={`grid ${cols} items-center border-b border-[#EFECE8] px-4 py-3 transition-colors duration-700 last:border-b-0 ${highlight === row.id ? 'bg-[#FFF7F1]' : ''}`}>
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[#1C1917]">{row.name}</span><span className="block truncate text-[11px] text-[#77716B]">{row.client}</span></span>
              {!compact && <span className={`text-[12px] ${row.dateTone === 'red' ? 'font-medium text-[#C43A3A]' : 'text-[#57514B]'}`}>{row.date}</span>}
              <span><Pill tone={row.stageTone}>{row.stage}</Pill></span>
              <span data-tour={`pay-${row.id}`} className="relative w-fit"><Pill tone={row.payTone}>{row.pay}{row.payTone === 'orange' && <ChevronDown className="h-3 w-3" />}</Pill>
                <AnimatePresence>{badgeMenu?.id === row.id && badgeMenu.node}</AnimatePresence>
              </span>
              <span className="text-right font-mono text-[13px] font-semibold text-[#1C1917]">{baht(row.amount)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {children}
    </>
  );
}

// ---------- tab 1: record a job ----------

const RECORD_STEPS: Step[] = [
  { ms: 1100, at: 'add' }, { ms: 450, at: 'add', click: true },
  { ms: 650, at: 'name' }, { ms: 1300, at: 'name', click: true },
  { ms: 1000, at: 'client', click: true }, { ms: 900, at: 'value', click: true },
  { ms: 1000, at: 'stage-ส่งงานแล้ว', click: true },
  { ms: 1300, at: 'credit-30', click: true },
  { ms: 800, at: 'save', click: true },
  { ms: 2600 },
];

function RecordScreen({ step }: ScreenProps) {
  const open = step >= 2 && step <= 8;
  const saved = step >= 9;
  const delivered = step >= 6;
  const credit = step >= 7;
  const rows = saved ? [{ ...ROW_TIKTOK, fresh: true }, ROW_SERUM, ROW_DD, ROW_CLASS] : [ROW_SERUM, ROW_DD, ROW_CLASS];
  const counts = saved ? { all: 4, working: 0, waiting: 3, waitingAmount: 23165, closed: 1 } : { all: 3, working: 0, waiting: 2, waitingAmount: 8165, closed: 1 };
  return (
    <Shell active="jobs">
      <JobsPage rows={rows} counts={counts} highlight={saved ? 'tiktok' : undefined} />
      <AnimatePresence>
        {open && (
          <>
            <motion.div key="scrim" className="absolute inset-0 bg-[rgba(33,29,26,0.22)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
            <motion.div key="drawer" initial={{ x: 440 }} animate={{ x: 0 }} exit={{ x: 440 }} transition={{ duration: 0.45, ease: EASE }}
              className="absolute inset-y-0 right-0 flex w-[420px] flex-col bg-white shadow-[0_0_40px_rgba(33,29,26,0.16)]">
              <div className="flex items-center justify-between border-b border-[#EFECE8] px-6 py-4">
                <p className="text-[17px] font-semibold text-[#1C1917]">เพิ่มงาน</p><X className="h-4 w-4 text-[#77716B]" />
              </div>
              <div className="flex-1 space-y-4 overflow-hidden px-6 py-4">
                <Field label="ชื่องาน / โปรเจกต์" tour="name" focused={step === 3}><Typed text="TikTok Campaign" from={3} step={step} ms={1300} /></Field>
                <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
                  <Field label="ลูกค้า / ผู้จ่าย" tour="client" focused={step === 4}><Typed text="Brand A" from={4} step={step} ms={1000} /></Field>
                  <Field label="มูลค่างาน" tour="value" focused={step === 5}><span className="text-[#A39D96]">฿</span>&nbsp;<Typed text="15,000" from={5} step={step} ms={900} /></Field>
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-[#1C1917]">งานนี้ถึงไหนแล้ว?</p>
                  <Segment options={['กำลังทำ', 'ส่งงานแล้ว']} value={delivered ? 'ส่งงานแล้ว' : 'กำลังทำ'} tourPrefix="stage" />
                </div>
                <AnimatePresence initial={false}>
                  {delivered && (
                    <motion.div key="date" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                      <Field label="ส่งงานวันไหน?">1 ต.ค. 2569</Field>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-[#1C1917]">ตอนนี้ลูกค้าจ่ายถึงไหนแล้ว?</p>
                  <Segment options={['ยังไม่จ่าย', 'รับครบแล้ว', 'รับบางส่วน', 'แบ่งงวด']} value="ยังไม่จ่าย" />
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-[#1C1917]">Credit Term</p>
                  <Segment options={['0 วัน', '30', '45', '60', '90']} value={credit ? '30' : '0 วัน'} tourPrefix="credit" />
                  {/* Same rule as the app: delivery date + Credit Term = expected pay date. */}
                  <p className="mt-2.5 rounded-[10px] bg-[#FFF7F1] px-3 py-2 text-[12px]">
                    {delivered ? (
                      <span className="text-[#1C1917]">คาดว่าจะได้รับเงิน{' '}
                        <AnimatePresence mode="wait">
                          <motion.strong key={credit ? 'c30' : 'c0'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }} className="inline-block font-semibold text-[#C24A16]">
                            {credit ? '31 ต.ค. 2569' : '1 ต.ค. 2569'}
                          </motion.strong>
                        </AnimatePresence>
                      </span>
                    ) : <span className="text-[#77716B]">ใส่วันส่งงานด้านบน แล้วจะคำนวณวันที่ได้รับเงินให้</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 border-t border-[#EFECE8] px-6 py-4">
                <span className="flex h-11 flex-1 items-center justify-center rounded-xl border border-[#E7E4DF] text-[13px] text-[#1C1917]">ยกเลิก</span>
                <span data-tour="save" className="flex h-11 flex-[2] items-center justify-center rounded-xl bg-[#E65F2B] text-[13px] font-semibold text-white">บันทึกงาน</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <Toast show={saved} text="บันทึกงานแล้ว" />
    </Shell>
  );
}

// ---------- tab 2: payment timeline ----------

const TIMELINE_STEPS: Step[] = [
  { ms: 1100, at: 'tl' }, { ms: 450, at: 'tl', click: true },
  { ms: 1900, at: 'row-tiktok' },
  { ms: 800, at: 'filter', click: true },
  { ms: 800, at: 'opt-เกินกำหนด' }, { ms: 300, at: 'opt-เกินกำหนด', click: true },
  { ms: 2400, at: 'row-dd' },
];

type TLRow = { id: string; date: string; name: string; client: string; amount: number; status: string; tone: 'red' | 'amber' | 'green' | 'neutral'; carried?: boolean };
const TL_OCT: TLRow[] = [
  { id: 'dd', date: '26 ก.ย.', name: 'Brand Consultation', client: 'DDproperty', amount: 6665, status: 'เกินกำหนด 9 วัน', tone: 'red', carried: true },
  { id: 'class', date: '3 ต.ค.', name: 'คลาสติวสอบ (4 ครั้ง)', client: 'คุณแพร', amount: 4800, status: 'รับแล้ว', tone: 'green' },
  { id: 'serum', date: '5 ต.ค.', name: 'รีวิวเซรั่ม', client: 'Skinness', amount: 1500, status: 'ครบกำหนดวันนี้', tone: 'amber' },
  { id: 'tiktok', date: '31 ต.ค.', name: 'TikTok Campaign', client: 'Brand A', amount: 15000, status: 'อีก 26 วัน', tone: 'neutral' },
];

function TLRowView({ row }: { row: TLRow }) {
  return (
    <motion.div layout data-tour={`row-${row.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
      className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[#E7E4DF] bg-white px-3.5 py-2.5">
      <span className={`text-[12px] ${row.tone === 'red' ? 'font-medium text-[#C43A3A]' : 'text-[#77716B]'}`}>{row.date}</span>
      <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[#1C1917]">{row.name}</span><span className="block truncate text-[11px] text-[#77716B]">{row.client}</span></span>
      <span className="flex flex-col items-end gap-1"><span className="font-mono text-[13px] font-semibold text-[#1C1917]">{baht(row.amount)}</span><Pill tone={row.tone}>{row.status}</Pill></span>
    </motion.div>
  );
}

function TimelineScreen({ step }: ScreenProps) {
  const timeline = step >= 2;
  const menu = step === 4 || step === 5;
  const overdueOnly = step >= 6;
  const filterLabel = overdueOnly ? 'เกินกำหนด' : 'ทั้งหมด';
  const rows = overdueOnly ? TL_OCT.filter(r => r.tone === 'red') : TL_OCT;
  const carried = rows.filter(r => r.carried);
  const inMonth = rows.filter(r => !r.carried);
  return (
    <Shell active="calendar">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[22px] font-semibold leading-tight text-[#1C1917]">ปฏิทิน</p>
          <p className="mt-0.5 text-[12px] text-[#77716B]">ดูงาน กำหนด และจังหวะเงินของคุณ</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#E7E4DF] bg-white p-0.5 text-[12px]">
          <span className={`flex h-8 items-center gap-1.5 rounded-[10px] px-3 ${!timeline ? 'bg-[#FFF1E8] font-medium text-[#C24A16]' : 'text-[#77716B]'}`}><CalendarDays className="h-3.5 w-3.5" />ปฏิทิน</span>
          <span data-tour="tl" className={`flex h-8 items-center gap-1.5 rounded-[10px] px-3 ${timeline ? 'bg-[#FFF1E8] font-medium text-[#C24A16]' : 'text-[#77716B]'}`}><List className="h-3.5 w-3.5" />ไทม์ไลน์</span>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {!timeline ? (
          <motion.div key="cal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="mt-5 rounded-[14px] border border-[#E7E4DF] bg-white p-4">
            <p className="mb-3 text-[14px] font-semibold text-[#1C1917]">ตุลาคม 2569</p>
            <div className="grid grid-cols-7 gap-1 text-[11px]">
              {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => <span key={d} className="pb-1 text-center text-[#A39D96]">{d}</span>)}
              {[0, 1, 2].map(i => <span key={i} />)}
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <span key={d} className={`h-[58px] rounded-lg border border-[#F0EDE9] p-1 ${d === 5 ? 'bg-[#FFF7F1]' : ''}`}>
                  <span className={`text-[11px] ${d === 5 ? 'font-semibold text-[#C24A16]' : 'text-[#57514B]'}`}>{d}</span>
                  {d === 3 && <span className="mt-0.5 block truncate rounded bg-[#E9F7F0] px-1 text-[9px] text-[#12804F]">รับ ฿4,800</span>}
                  {d === 5 && <span className="mt-0.5 block truncate rounded bg-[#FFF6E5] px-1 text-[9px] text-[#9A6412]">รีวิวเซรั่ม</span>}
                  {d === 31 && <span className="mt-0.5 block truncate rounded bg-[#FFF1E8] px-1 text-[9px] text-[#C24A16]">TikTok</span>}
                </span>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="tl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="mt-5">
            <div className="relative mb-4 flex items-center justify-between">
              <p className="text-[12px] text-[#77716B]">ใช้สำหรับวางแผนกระแสเงินล่วงหน้า</p>
              <span data-tour="filter" className="flex h-9 items-center gap-2 rounded-xl border border-[#E7E4DF] bg-white px-3 text-[12px] text-[#1C1917]">แสดง: {filterLabel}<ChevronDown className="h-3.5 w-3.5 text-[#77716B]" /></span>
              <AnimatePresence>
                {menu && (
                  <motion.div key="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    className="absolute right-0 top-[42px] z-10 w-44 rounded-xl border border-[#E7E4DF] bg-white p-1.5 shadow-lg">
                    {['ทั้งหมด', 'รอรับเงิน', 'รับแล้ว', 'เกินกำหนด'].map(o => (
                      <span key={o} data-tour={`opt-${o}`} className={`block rounded-lg px-3 py-2 text-[12px] ${o === 'เกินกำหนด' && step === 5 ? 'bg-[#F3F2F0]' : ''} text-[#1C1917]`}>{o}</span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="relative pl-7">
              <span className="absolute bottom-0 left-[6px] top-2 w-px bg-[#E7E4DF]" />
              <span className="absolute left-0 top-2 h-[13px] w-[13px] rounded-full border-2 border-[#E65F2B] bg-[#E65F2B]" />
              <p className="text-[19px] font-semibold text-[#1C1917]">ตุลาคม 2569 <span className="ml-1 align-middle text-[11px] font-medium text-[#C24A16]">เดือนนี้</span></p>
              <div className="mt-2.5 flex items-end justify-between rounded-[14px] border border-[#E7E4DF] bg-white px-4 py-2.5">
                <div><p className="text-[11px] text-[#77716B]">เงินคาดว่าจะเข้าเดือนนี้</p><p className="font-mono text-[18px] font-semibold text-[#1C1917]">{baht(27965)}</p></div>
                <div className="text-right text-[11px] text-[#77716B]"><p>รับแล้ว <span className="font-mono text-[#1C1917]">{baht(4800)}</span></p><p>รอรับ <span className="font-mono text-[#1C1917]">{baht(23165)}</span></p></div>
              </div>
              <div className="mt-2 space-y-1.5">
                <AnimatePresence initial={false}>
                  {carried.length > 0 && <motion.p key="c" layout className="px-1 text-[11px] font-medium text-[#C43A3A]">ค้างจากเดือนก่อน</motion.p>}
                  {carried.map(r => <TLRowView key={r.id} row={r} />)}
                  {inMonth.length > 0 && <motion.p key="m" layout className="px-1 pt-0.5 text-[11px] font-medium text-[#77716B]">ครบกำหนดเดือนนี้</motion.p>}
                  {inMonth.map(r => <TLRowView key={r.id} row={r} />)}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

// ---------- tab 3: LINE reminder ----------

const ALERT_STEPS: Step[] = [{ ms: 1500 }, { ms: 900 }, { ms: 900 }, { ms: 900 }, { ms: 2600 }];

function AlertScreen({ step }: ScreenProps) {
  const compact = React.useContext(Compact);
  const banner = step === 0 || step === 1;
  const show = (n: number) => step >= n;
  const reveal = (n: number) => ({ initial: { opacity: 0, y: 8 }, animate: show(n) ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }, transition: { duration: 0.45, ease: EASE } });
  return (
    <div className="relative flex h-full items-center justify-center gap-14 bg-[#F6F2EC] px-10">
      <div className={compact ? 'hidden' : 'max-w-[330px]'}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#57514B]"><Bell className="h-3.5 w-3.5 text-[#C24A16]" />ทุกเช้า ทาง LINE และอีเมล</span>
        <p className="mt-4 text-[26px] font-semibold leading-snug text-[#1C1917]">ไม่ต้องเปิดแอป<br />ก็รู้ว่าใครยังไม่จ่าย</p>
        <p className="mt-3 text-[14px] leading-relaxed text-[#77716B]">กระรอกส่งสรุปงานที่เลยกำหนด ครบกำหนดวันนี้ และใกล้ครบกำหนดใน 1–2 วัน</p>
      </div>
      <div className="relative h-[560px] w-[290px] shrink-0 overflow-hidden rounded-[40px] border-[7px] border-[#1C1917] bg-[#8CABD9]">
        <div className="flex items-center gap-2 bg-[#273246] px-4 pb-2.5 pt-7 text-white">
          <span className="text-[13px] font-semibold">กระรอกตุนเงิน</span>
        </div>
        <AnimatePresence>
          {banner && (
            <motion.div key="push" initial={{ y: -90 }} animate={{ y: 0 }} exit={{ y: -90, opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}
              className="absolute inset-x-2 top-2 z-10 rounded-2xl bg-white/95 px-3 py-2.5 shadow-lg">
              <p className="flex items-center justify-between text-[10px] text-[#77716B]"><span className="font-semibold text-[#06C755]">LINE</span>ตอนนี้</p>
              <p className="mt-0.5 text-[12px] font-semibold text-[#1C1917]">กระรอกตุนเงิน</p>
              <p className="text-[12px] text-[#1C1917]">แจ้งเตือนดีลค้างชำระเลยกำหนด 1 รายการ</p>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="p-3">
          <motion.div {...reveal(1)} className="rounded-[14px] border border-[#E6D8C7] bg-[#FFF9F0] p-3.5 text-[11px]">
            <p className="text-[9px] font-bold tracking-wide text-[#DC2626]">OVERDUE CREDIT ALERT</p>
            <p className="mt-1 text-[13px] font-bold leading-snug text-[#E65F2B]">🚨 สรุปดีลงานที่ต้องติดตามเครดิตเทอม</p>
            <motion.div {...reveal(2)} className="mt-3 border-t border-[#E8DFD3] pt-2.5">
              <p className="font-bold text-[#DC2626]">⚠️ เกินกำหนดชำระเงินแล้ว (1 รายการ)</p>
              <p className="mt-1.5 flex justify-between font-bold text-[#3D2314]"><span>DDproperty</span><span>฿6,665</span></p>
              <p className="flex justify-between text-[10px] text-[#7A5C43]"><span>Brand Consultation</span><span className="font-bold text-[#DC2626]">เลยกำหนดมาแล้ว 9 วัน</span></p>
            </motion.div>
            <motion.div {...reveal(3)} className="mt-3 border-t border-[#E8DFD3] pt-2.5">
              <p className="font-bold text-[#B45309]">⏰ ครบกำหนดวันนี้ (1 รายการ)</p>
              <p className="mt-1.5 flex justify-between font-bold text-[#3D2314]"><span>Skinness</span><span>฿1,500</span></p>
              <p className="flex justify-between text-[10px] text-[#7A5C43]"><span>รีวิวเซรั่ม</span><span className="font-bold text-[#B45309]">ครบกำหนดวันนี้</span></p>
            </motion.div>
            <motion.div {...reveal(4)} className="mt-3 border-t border-[#E8DFD3] pt-2.5">
              <p className="font-bold text-[#3D2314]">💡 คำแนะนำในการดำเนินการทวงถาม</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#7A5C43]">1. เช็คสเตทเมนต์ธนาคารว่ายังไม่มียอดเข้าจริง<br />2. ทักไปทวงถามลูกค้าอย่างสุภาพ</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ---------- tab 4: record the payment ----------

const PAY_STEPS: Step[] = [
  { ms: 1100, at: 'pay-dd' }, { ms: 450, at: 'pay-dd', click: true },
  { ms: 800, at: 'menu-full' }, { ms: 350, at: 'menu-full', click: true },
  { ms: 1300, at: 'confirm' }, { ms: 350, at: 'confirm', click: true },
  { ms: 2800 },
];

function PayScreen({ step }: ScreenProps) {
  const menu = step === 2 || step === 3;
  const dialog = step === 4 || step === 5;
  const paid = step >= 6;
  const dd: Row = paid ? { ...ROW_DD, date: 'รับเงิน 5 ต.ค.', dateTone: undefined, stage: 'ปิดงานแล้ว', stageTone: 'neutral', pay: 'รับครบแล้ว', payTone: 'green' } : ROW_DD;
  const counts = paid ? { all: 4, working: 0, waiting: 2, waitingAmount: 16500, closed: 2 } : { all: 4, working: 0, waiting: 3, waitingAmount: 23165, closed: 1 };
  return (
    <Shell active="jobs">
      <JobsPage rows={[ROW_TIKTOK, ROW_SERUM, dd, ROW_CLASS]} counts={counts} highlight={paid ? 'dd' : undefined}
        badgeMenu={menu ? { id: 'dd', node: (
          <motion.span key="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute left-0 top-[calc(100%+6px)] z-10 block w-48 rounded-xl border border-[#E7E4DF] bg-white p-1.5 shadow-lg">
            <span data-tour="menu-full" className={`block rounded-lg px-3 py-2 text-[12px] text-[#1C1917] ${step === 3 ? 'bg-[#F3F2F0]' : ''}`}>รับเงินครบ</span>
            <span className="block rounded-lg px-3 py-2 text-[12px] text-[#1C1917]">รับมัดจำ / บางส่วน</span>
          </motion.span>
        ) } : undefined} />
      <AnimatePresence>
        {dialog && (
          <motion.div key="dlg" className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(33,29,26,0.25)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <motion.div initial={{ scale: 0.97, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="w-[380px] rounded-2xl bg-white p-5 shadow-xl">
              <p className="text-[15px] font-semibold text-[#1C1917]">บันทึกรับเงิน</p>
              <p className="mt-0.5 text-[12px] text-[#77716B]">Brand Consultation · DDproperty</p>
              <div className="mt-4"><Segment options={['รับเงินครบ', 'รับมัดจำ / บางส่วน']} value="รับเงินครบ" /></div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="ยอดที่ได้รับ (บาท)">6,665</Field>
                <Field label="วันที่รับเงิน">5 ต.ค. 2569</Field>
              </div>
              <div className="mt-5 flex gap-3">
                <span className="flex h-11 flex-1 items-center justify-center rounded-xl border border-[#E7E4DF] text-[13px] text-[#1C1917]">ยกเลิก</span>
                <span data-tour="confirm" className="flex h-11 flex-[2] items-center justify-center rounded-xl bg-[#E65F2B] text-[13px] font-semibold text-white">บันทึกรับเงิน</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Toast show={paid} text="รับเงินครบแล้ว" />
    </Shell>
  );
}

// ---------- the tour ----------

const TOURS: { key: string; label: string; icon: typeof Plus; caption: string; steps: Step[]; Screen: (p: ScreenProps) => React.ReactElement }[] = [
  { key: 'record', label: 'บันทึกดีล', icon: Plus, caption: 'ใส่ชื่องาน ลูกค้า มูลค่า แล้วเลือก Credit Term กระรอกคำนวณวันที่เงินควรเข้าให้', steps: RECORD_STEPS, Screen: RecordScreen },
  { key: 'timeline', label: 'ไทม์ไลน์รับเงิน', icon: CalendarDays, caption: 'ดูทั้งเดือนว่าเงินก้อนไหนจะเข้าเมื่อไหร่ อันไหนค้างจากเดือนก่อน กรองดูเฉพาะที่เกินกำหนดได้', steps: TIMELINE_STEPS, Screen: TimelineScreen },
  { key: 'alert', label: 'แจ้งเตือนเงินค้าง', icon: Bell, caption: 'งานที่เลยกำหนดหรือครบกำหนดวันนี้ ส่งสรุปเข้า LINE และอีเมลให้ทุกเช้า (แพ็กเกจ Pro)', steps: ALERT_STEPS, Screen: AlertScreen },
  { key: 'pay', label: 'รับเงินจริง', icon: Wallet, caption: 'ลูกค้าโอนแล้ว กดที่สถานะ บันทึกรับเงิน ยอดรอรับลดลงเอง และเลิกทำได้ถ้ากดผิด', steps: PAY_STEPS, Screen: PayScreen },
];

const total = (steps: Step[]) => steps.reduce((s, x) => s + x.ms, 0);

function Cursor({ stageRef, target, click, scale, stepKey }: { stageRef: React.RefObject<HTMLDivElement | null>; target?: string; click?: boolean; scale: number; stepKey: string }) {
  const [pos, setPos] = React.useState({ x: STAGE_W * 0.62, y: STAGE_H * 0.7 });
  React.useLayoutEffect(() => {
    if (!target) return;
    const measure = () => {
      const stage = stageRef.current;
      const el = stage?.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (!stage || !el) return;
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setPos({ x: (r.left - s.left + r.width * 0.55) / scale, y: (r.top - s.top + r.height * 0.6) / scale });
    };
    measure();
    const late = window.setTimeout(measure, 380); // after drawers / menus finish moving in
    return () => window.clearTimeout(late);
  }, [stageRef, target, scale, stepKey]);
  return (
    <motion.div className="pointer-events-none absolute left-0 top-0 z-40" animate={{ x: pos.x, y: pos.y }} transition={{ duration: 0.7, ease: EASE }}>
      {click && (
        <motion.span key={stepKey} className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-[#E65F2B]/30" initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut', delay: 0.15 }} />
      )}
      <svg width="22" height="24" viewBox="0 0 22 24" className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)]" aria-hidden>
        <path d="M2 1.5 L2 19.5 L7 15 L10.5 22.5 L13.5 21 L10.2 13.8 L17 13.5 Z" fill="#1C1917" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

export function ProductTour({ restartKey = 0 }: { restartKey?: number }) {
  const reduce = useReducedMotion();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { amount: 0.35 });
  const [tab, setTab] = React.useState(0);
  const tour = TOURS[tab];
  const [step, setStep] = React.useState(reduce ? tour.steps.length - 1 : 0);
  const [scale, setScale] = React.useState(1);
  const [compact, setCompact] = React.useState(false);
  const stageW = compact ? COMPACT_W : STAGE_W;
  const playing = inView && !reduce;

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => {
      const narrow = box.clientWidth < 700;
      setCompact(narrow);
      setScale(box.clientWidth / (narrow ? COMPACT_W : STAGE_W));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      if (step < tour.steps.length - 1) setStep(step + 1);
      else { setTab((tab + 1) % TOURS.length); setStep(0); }
    }, tour.steps[step].ms);
    return () => window.clearTimeout(id);
  }, [playing, step, tab, tour]);

  const choose = (i: number) => { setTab(i); setStep(reduce ? TOURS[i].steps.length - 1 : 0); };
  React.useEffect(() => { if (restartKey) choose(0); }, [restartKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = tour.steps.slice(0, step).reduce((s, x) => s + x.ms, 0);
  const Screen = tour.Screen;
  const current = tour.steps[step];

  return (
    <div ref={rootRef}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="ดูการใช้งาน">
        {TOURS.map((t, i) => {
          const on = i === tab;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => choose(i)}
              className={`group relative overflow-hidden rounded-xl border px-4 pb-3 pt-3 text-left transition-colors duration-300 cursor-pointer ${on ? 'border-[#E7E4DF] bg-white' : 'border-transparent hover:bg-white/60'}`}>
              <span className={`flex items-center gap-2 text-[14px] font-medium ${on ? 'text-[#1C1917]' : 'text-[#8A847E]'}`}><t.icon className="h-4 w-4" />{t.label}</span>
              <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[#EFECE8]">
                {on && (
                  <motion.span key={`${tab}-${step}`} className="block h-full bg-[#E65F2B]"
                    initial={{ width: `${(done / total(tour.steps)) * 100}%` }}
                    animate={{ width: `${((reduce ? total(tour.steps) : done + (playing ? current.ms : 0)) / total(tour.steps)) * 100}%` }}
                    transition={{ duration: playing ? current.ms / 1000 : 0, ease: 'linear' }} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={tour.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
          className="mx-auto mt-5 max-w-2xl text-center text-[15px] leading-relaxed text-[#57514B] [text-wrap:balance]">
          {tour.caption}
        </motion.p>
      </AnimatePresence>
      <div ref={boxRef} className="relative mt-6 w-full overflow-hidden rounded-[20px] border border-[#E7E4DF] bg-white shadow-[0_40px_120px_-40px_rgba(70,49,36,0.28)]" style={{ height: STAGE_H * scale }}>
        <div ref={stageRef} className="absolute left-0 top-0 origin-top-left" style={{ width: stageW, height: STAGE_H, transform: `scale(${scale})` }} aria-hidden>
          <Compact.Provider value={compact}>
            <AnimatePresence mode="wait">
              <motion.div key={tour.key} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <Screen step={step} />
              </motion.div>
            </AnimatePresence>
          </Compact.Provider>
          {!reduce && tour.key !== 'alert' && <Cursor stageRef={stageRef} target={current.at} click={current.click} scale={scale} stepKey={`${tab}-${step}`} />}
        </div>
      </div>
    </div>
  );
}
