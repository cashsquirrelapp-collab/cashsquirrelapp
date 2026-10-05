import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Check, FileText } from 'lucide-react';
import { EASE, Pill } from './primitives';

// One demo job as an app-style card, drawn at a given point of its life: in progress, delivered
// with a Credit Term, invoiced, waiting for money, paid. Used by "ทำงานยังไง".

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.45, ease: EASE } };

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
