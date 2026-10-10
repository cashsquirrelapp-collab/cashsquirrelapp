import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { ArrowRight, ClipboardList, Receipt, X } from 'lucide-react';
import type { Expense } from '../../../../shared/types';
import { formatCurrency } from '../../utils';
import { getThaiMonthName } from '../../../../shared/calendar';

// Dashboard › กำไรสุทธิ › รายละเอียดการเงินเดือนนี้: a statement, not a dashboard. Two parts:
//  1. สรุปเดือนนี้ -- the selected month's received money, expenses and net profit (the same
//     figures the dashboard cards use, passed in).
//  2. รายละเอียดรายจ่ายเดือนนี้ -- the month's expense lines.

interface Props {
  monthKey: string;
  received: number;
  receivedCount: number;
  fixedExpense: number;
  variableExpense: number;
  variableExpenses: Expense[];
  profit: number;
  /** Savings set aside this month from the month's money (cash-funded goal deposits). */
  savedThisMonth: number;
  savedCount: number;
  onOpenExpenses: () => void;
  onClose: () => void;
}

const fullMonth = (key: string) => `${getThaiMonthName(Number(key.slice(5, 7)) - 1)} ${Number(key.slice(0, 4)) + 543}`;
const signed = (amount: number, sign: '+' | '-' | '') => `${amount !== 0 && sign ? (sign === '-' ? '−' : '+') : ''}${formatCurrency(Math.abs(amount))}`;
const GREEN = 'text-[#12804F] dark:text-[#6FD3A3]';
const RED = 'text-[#C43A3A] dark:text-[#F19A9A]';

function Row({ label, value, tone = 'text-brand-text', strong = false }: { label: React.ReactNode; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className={`min-w-0 flex-1 ${strong ? 'text-[16px] font-semibold text-brand-text' : 'text-[14px] text-brand-text/90'}`}>{label}</span>
      <span className={`shrink-0 whitespace-nowrap text-right font-mono tabular-nums ${strong ? 'text-[17px] font-semibold' : 'text-[14.5px] font-medium'} ${tone}`}>{value}</span>
    </div>
  );
}

function SectionHead({ icon: Icon, title, sub, action }: { icon: React.ComponentType<{ className?: string }>; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#E65F2B]" />
      <div className="min-w-0 flex-1">
        <h3 className="text-[16px] font-semibold text-brand-text">{title}</h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-brand-muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export function FinancialDetailsModal(props: Props) {
  const { monthKey, received, receivedCount, fixedExpense, variableExpense, variableExpenses, profit, savedThisMonth, savedCount, onOpenExpenses, onClose } = props;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const totalExpense = fixedExpense + variableExpense;
  const topExpenses = [...variableExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);

  // Esc closes; Tab stays inside the modal.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <motion.div
        ref={panelRef}
        role="dialog" aria-modal="true" aria-labelledby="fin-details-title"
        initial={{ opacity: 0, scale: 0.985, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.985, y: 6 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-brand-white shadow-2xl sm:h-auto sm:max-h-[88vh] sm:max-w-[560px] sm:rounded-[22px] sm:border sm:border-brand-border dark:bg-[#1F2024]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-border px-6 pb-4 pt-5 sm:px-7">
          <div>
            <h2 id="fin-details-title" className="text-[22px] font-semibold leading-tight text-brand-text">รายละเอียดการเงินเดือนนี้</h2>
            <p className="mt-0.5 text-[13px] text-brand-muted">{fullMonth(monthKey)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" autoFocus className="-mr-1.5 rounded-full p-2 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"><X className="h-5 w-5" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-7">
          {/* 1. สรุปเดือนนี้ */}
          <section className="py-5" aria-label="สรุปเดือนนี้">
            <SectionHead icon={ClipboardList} title="สรุปเดือนนี้" sub="รายรับ รายจ่าย และกำไรสุทธิของเดือนนี้" />
            <Row label={`รับเงินจริงแล้ว (${receivedCount} รายการ)`} value={signed(received, '+')} tone={received > 0 ? GREEN : 'text-brand-text'} />
            <Row label="รายจ่ายประจำ" value={signed(fixedExpense, '-')} tone={fixedExpense > 0 ? RED : 'text-brand-text'} />
            <Row label={`รายจ่ายทั่วไป (${variableExpenses.length} รายการ)`} value={signed(variableExpense, '-')} tone={variableExpense > 0 ? RED : 'text-brand-text'} />
            <div className="mt-2 border-t border-brand-border pt-2.5">
              <Row label="กำไรสุทธิเดือนนี้" value={signed(profit, profit < 0 ? '-' : profit > 0 ? '+' : '')} tone={profit > 0 ? GREEN : profit < 0 ? RED : 'text-brand-text'} strong />
            </div>
            {/* What's left of this month's money after expenses and the savings set aside. */}
            <Row label={`แบ่งออมเข้าเป้าหมาย (${savedCount} รายการ)`} value={signed(savedThisMonth, '-')} tone={savedThisMonth > 0 ? RED : 'text-brand-text'} />
            <div className="mt-2 rounded-xl bg-brand-faint/70 px-3 py-2.5" data-testid="left-this-month">
              <Row label="เงินที่เหลือเดือนนี้" value={signed(profit - savedThisMonth, profit - savedThisMonth < 0 ? '-' : '')} tone={profit - savedThisMonth < 0 ? RED : 'text-brand-text'} strong />
              <p className="text-[12px] text-brand-muted">รับเงินจริง − รายจ่าย − เงินที่แบ่งออม ของเดือนนี้</p>
            </div>
          </section>

          {/* 2. รายละเอียดรายจ่ายเดือนนี้ */}
          <section className="border-t border-brand-border pt-5" aria-label="รายละเอียดรายจ่ายเดือนนี้">
            <SectionHead icon={Receipt} title="รายละเอียดรายจ่ายเดือนนี้" sub="รายการรายจ่ายทั้งหมดของเดือนนี้"
              action={<button type="button" onClick={onOpenExpenses} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-[#C24A16] hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10">ดูทั้งหมด <ArrowRight className="h-3.5 w-3.5" /></button>} />
            {fixedExpense > 0 && <Row label="รายจ่ายประจำ" value={signed(fixedExpense, '-')} tone={RED} />}
            {topExpenses.map(e => <Row key={e.id} label={<span className="block truncate">{e.name}</span>} value={signed(e.amount, '-')} tone={RED} />)}
            {variableExpenses.length > topExpenses.length && <p className="py-1 text-[12px] text-brand-muted">และอีก {variableExpenses.length - topExpenses.length} รายการ</p>}
            {totalExpense === 0 && <p className="py-2 text-[13px] text-brand-muted">ยังไม่มีรายจ่ายในเดือนนี้</p>}
            <div className="mt-2 border-t border-brand-border pt-2.5">
              <Row label="รวมรายจ่ายเดือนนี้" value={signed(totalExpense, '-')} tone={totalExpense > 0 ? RED : 'text-brand-text'} strong />
            </div>
          </section>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
