import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Car, Check, FileCheck2, FileText, Laptop, Megaphone, Receipt, ScrollText, Utensils, type LucideIcon } from 'lucide-react';
import { EASE, Frame, Pill, baht, useSeen } from './primitives';

// One large product visual per story chapter. Each animates once, when it scrolls into view,
// and only the part that explains the feature moves. Figures are an illustrated example month.

const show = (seen: boolean, delay = 0, y = 14) => ({
  initial: { opacity: 0, y },
  animate: seen ? { opacity: 1, y: 0 } : { opacity: 0, y },
  transition: { duration: 0.6, ease: EASE, delay },
});

// ---- 01 เงินที่ยังไม่ได้รับ ----
const OWED = [
  { name: 'Brand Consultation', client: 'DDproperty', amount: 6665, when: 'เกินกำหนด 4 วัน', tone: 'red' as const, strip: '#D64545' },
  { name: 'รีวิวเซรั่ม', client: 'Skinness', amount: 1500, when: 'ครบกำหนดวันนี้', tone: 'amber' as const, strip: '#E6A23C' },
  { name: 'TikTok Campaign', client: 'Brand A', amount: 15000, when: 'อีก 3 วัน', tone: 'orange' as const, strip: '#E65F2B' },
  { name: 'คลาสติวสอบ (4 ครั้ง)', client: 'คุณแพร', amount: 4800, when: 'อีก 12 วัน', tone: 'neutral' as const, strip: '#D9D4CE' },
];

export function ReceivablesVisual() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const total = OWED.reduce((s, r) => s + r.amount, 0);
  return (
    <div ref={ref}>
      <Frame title="เงินที่ยังไม่ได้รับ">
        <div className="flex items-end justify-between gap-4 px-4 pb-4 pt-5 sm:px-6">
          <div>
            <p className="text-[12px] text-[#77716B]">ยังไม่ได้รับทั้งหมด</p>
            <p className="mt-0.5 font-mono text-[clamp(1.6rem,1.2rem+1.2vw,2.25rem)] font-semibold tracking-tight text-[#1C1917]">{baht(total)}</p>
          </div>
          <p className="pb-1.5 text-[12px] text-[#77716B]">{OWED.length} งาน · เกินกำหนด 1</p>
        </div>
        <ul className="border-t border-[#EFECE8]">
          {OWED.map((row, i) => (
            <motion.li key={row.name} {...show(seen, 0.12 + i * 0.09)} className="flex items-center gap-3 border-b border-[#EFECE8] px-4 py-3.5 last:border-b-0 sm:px-6">
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: row.strip }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-[#1C1917]">{row.name}</p>
                <p className="mt-0.5 truncate text-[12px] text-[#77716B]">{row.client}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-[14px] font-semibold text-[#1C1917]">{baht(row.amount)}</span>
                <Pill tone={row.tone}>{row.when}</Pill>
              </div>
            </motion.li>
          ))}
        </ul>
      </Frame>
    </div>
  );
}

// ---- 02 Credit Term ----
export function CreditTermVisual() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.45);
  const reduce = useReducedMotion();
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <div ref={ref}>
      <Frame title="ปฏิทิน · ตุลาคม 2569">
        <div className="px-4 pb-6 pt-5 sm:px-6">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[#A39D96]">
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => <span key={d} className="pb-1">{d}</span>)}
            {[0, 1, 2].map(i => <span key={`pad${i}`} />)}
            {days.map(d => {
              const start = d === 1;
              const due = d === 30;
              const inRange = d > 1 && d < 30;
              return (
                <span key={d} className="relative flex h-9 items-center justify-center sm:h-10">
                  {inRange && (
                    <motion.span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-[#FFE3D3]" style={{ originX: 0 }}
                      initial={reduce ? false : { scaleX: 0 }} animate={seen ? { scaleX: 1 } : { scaleX: 0 }}
                      transition={{ duration: 0.25, ease: 'linear', delay: 0.5 + (d - 2) * 0.045 }} />
                  )}
                  <span className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full text-[12px] sm:h-8 sm:w-8 ${start ? 'bg-[#1C1917] font-medium text-white'
                    : due ? 'font-semibold text-white' : 'text-[#57514B]'}`}>
                    {due && (
                      <motion.span className="absolute inset-0 rounded-full bg-[#E65F2B]" initial={reduce ? false : { scale: 0 }}
                        animate={seen ? { scale: 1 } : { scale: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 1.85 }} />
                    )}
                    <span className="relative">{d}</span>
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <motion.div {...show(seen, 0.2)} className="rounded-xl border border-[#EFECE8] px-3.5 py-3">
              <p className="text-[11px] text-[#77716B]">1 ต.ค. · ส่งงาน</p>
              <p className="mt-0.5 text-[13px] font-medium text-[#1C1917]">TikTok Campaign</p>
              <p className="mt-1 text-[12px] text-[#77716B]">ลูกค้าบอก Credit Term 30 วัน</p>
            </motion.div>
            <motion.div {...show(seen, 2.05)} className="rounded-xl bg-[#FFF1E8] px-3.5 py-3">
              <p className="text-[11px] text-[#C24A16]">30 ต.ค. · คาดว่าเงินเข้า</p>
              <p className="mt-0.5 font-mono text-[15px] font-semibold text-[#1C1917]">฿15,000</p>
              <p className="mt-1 text-[12px] text-[#9A5A3A]">กระรอกเตือนก่อนถึงวัน</p>
            </motion.div>
          </div>
        </div>
      </Frame>
    </div>
  );
}

// ---- 03 Dashboard: why the numbers differ ----
const MONTH = { work: 49335, received: 31000, pending: 18335, spent: 8420 };

export function DashboardVisual() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.4);
  const reduce = useReducedMotion();
  const rows = [
    { label: 'มูลค่างานเดือนนี้', note: 'งานทั้งหมดที่รับไว้', value: MONTH.work, color: '#1C1917' },
    { label: 'รับเงินจริง', note: 'เงินที่เข้าบัญชีแล้ว', value: MONTH.received, color: '#12804F' },
    { label: 'รอรับเงิน', note: 'ส่งงานแล้ว แต่ยังไม่ได้เงิน', value: MONTH.pending, color: '#C24A16' },
    { label: 'รายจ่าย', note: 'เงินที่จ่ายออกไป', value: MONTH.spent, color: '#1C1917' },
  ];
  const receivedPct = (MONTH.received / MONTH.work) * 100;
  return (
    <div ref={ref}>
      <Frame title="ภาพรวม · ตุลาคม 2569">
        <div className="px-4 pb-6 pt-5 sm:px-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {rows.map((r, i) => (
              <motion.div key={r.label} {...show(seen, 0.15 + i * 0.45)}>
                <p className="text-[12px] text-[#77716B]">{r.label}</p>
                <p className="mt-0.5 font-mono text-[clamp(1.25rem,1rem+0.9vw,1.75rem)] font-semibold tracking-tight" style={{ color: r.color }}>{baht(r.value)}</p>
                <p className="mt-0.5 text-[11px] text-[#A39D96]">{r.note}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-6">
            <div className="flex h-3 overflow-hidden rounded-full bg-[#F3F2F0]">
              <motion.span className="h-full bg-[#18A66A]" initial={reduce ? false : { width: 0 }} animate={seen ? { width: `${receivedPct}%` } : { width: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.75 }} />
              <motion.span className="h-full bg-[#F3B08C]" initial={reduce ? false : { width: 0 }} animate={seen ? { width: `${100 - receivedPct}%` } : { width: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 1.2 }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-[#77716B]"><span>รับแล้ว {Math.round(receivedPct)}%</span><span>ยังรออยู่ {100 - Math.round(receivedPct)}%</span></div>
          </div>
          <motion.div {...show(seen, 2.1)} className="mt-5 flex items-center justify-between rounded-xl bg-[#FAF8F5] px-4 py-3">
            <span className="text-[13px] text-[#57514B]">เหลือจริง <span className="text-[#A39D96]">(รับจริง − รายจ่าย)</span></span>
            <span className="font-mono text-[17px] font-semibold text-[#1C1917]">{baht(MONTH.received - MONTH.spent)}</span>
          </motion.div>
        </div>
      </Frame>
    </div>
  );
}

// ---- 04 Expenses ----
const SPEND: { label: string; amount: number; icon: LucideIcon }[] = [
  { label: 'ค่าอุปกรณ์/ซอฟต์แวร์', amount: 3600, icon: Laptop },
  { label: 'ค่าบริการ/สาธารณูปโภค', amount: 2150, icon: Receipt },
  { label: 'ค่าเดินทาง/น้ำมัน', amount: 1270, icon: Car },
  { label: 'อาหาร/รับรองลูกค้า', amount: 900, icon: Utensils },
  { label: 'ค่าโฆษณา/ยิงแอด', amount: 500, icon: Megaphone },
];

export function ExpensesVisual() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.45);
  const reduce = useReducedMotion();
  const total = SPEND.reduce((s, r) => s + r.amount, 0);
  const max = SPEND[0].amount;
  return (
    <div ref={ref}>
      <Frame title="รายจ่าย · ตุลาคม 2569">
        <div className="px-4 pb-6 pt-5 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] text-[#77716B]">รายจ่ายทั้งหมด</p>
              <p className="mt-0.5 font-mono text-[clamp(1.6rem,1.2rem+1.2vw,2.25rem)] font-semibold tracking-tight text-[#1C1917]">{baht(total)}</p>
            </div>
            <p className="pb-1.5 text-[12px] text-[#77716B]">เงินเดือนนี้หมดไปกับอะไร</p>
          </div>
          <ul className="mt-5 space-y-3.5">
            {SPEND.map((row, i) => (
              <li key={row.label} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F2F0] text-[#77716B]"><row.icon className="h-3.5 w-3.5" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-[#1C1917]">{row.label}</span>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[#F3F2F0]">
                    <motion.span className="block h-full rounded-full" style={{ backgroundColor: i === 0 ? '#E65F2B' : '#F3B08C' }}
                      initial={reduce ? false : { width: 0 }} animate={seen ? { width: `${(row.amount / max) * 100}%` } : { width: 0 }}
                      transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.1 }} />
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[13px] font-semibold text-[#1C1917]">{baht(row.amount)}</span>
                  <span className="block text-[11px] text-[#A39D96]">{Math.round((row.amount / total) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Frame>
    </div>
  );
}

// ---- 05 Documents: one job, three documents, no retyping ----
const DOCS: { title: string; no: string; icon: LucideIcon; note: string }[] = [
  { title: 'ใบเสนอราคา', no: 'QT-024', icon: ScrollText, note: 'ก่อนเริ่มงาน' },
  { title: 'ใบแจ้งหนี้', no: 'INV-024', icon: FileText, note: 'หลังส่งงาน' },
  { title: 'ใบเสร็จรับเงิน', no: 'RC-024', icon: FileCheck2, note: 'เมื่อเงินเข้า' },
];

export function DocumentsVisual() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.45);
  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center sm:gap-5">
      <motion.div {...show(seen, 0)} className="rounded-2xl border border-[#E7E4DF] bg-white p-4 sm:p-5">
        <p className="text-[11px] font-medium text-[#77716B]">งาน</p>
        <p className="mt-1 text-[15px] font-semibold text-[#1C1917]">TikTok Campaign</p>
        <dl className="mt-3 space-y-1.5 text-[12px]">
          {[['ลูกค้า', 'Brand A'], ['มูลค่า', '฿15,000'], ['หัก ณ ที่จ่าย', '3%'], ['Credit Term', '30 วัน']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-[#77716B]">{k}</dt><dd className="font-medium text-[#1C1917]">{v}</dd></div>
          ))}
        </dl>
      </motion.div>
      <ol className="space-y-2.5">
        {DOCS.map((doc, i) => (
          <motion.li key={doc.no} {...show(seen, 0.5 + i * 0.5, 0)} initial={{ opacity: 0, x: 16 }} animate={seen ? { opacity: 1, x: 0 } : { opacity: 0, x: 16 }}
            className="flex items-center gap-3 rounded-2xl border border-[#E7E4DF] bg-white px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FAF8F5] text-[#77716B]"><doc.icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[#1C1917]">{doc.title} <span className="font-normal text-[#A39D96]">{doc.no}</span></p>
              <p className="mt-0.5 truncate text-[11px] text-[#77716B]">Brand A · ฿15,000 · {doc.note}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#12804F]" title="ดึงข้อมูลจากงาน"><Check className="h-3.5 w-3.5" /><span className="hidden xl:inline">ดึงข้อมูลจากงาน</span><span className="sr-only xl:hidden">ดึงข้อมูลจากงาน</span></span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
