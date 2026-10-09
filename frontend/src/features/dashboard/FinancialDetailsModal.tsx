import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { ArrowRight, ChevronRight, ClipboardList, Info, Receipt, Target, Wallet, X } from 'lucide-react';
import type { AppSettings, Expense, Goal, Job } from '../../../../shared/types';
import { currentCash, openingForCurrent, saveOpening } from '../../../../shared/cashBalance';
import { currentMonthKeyNow, formatCurrency } from '../../utils';
import { getThaiMonthName } from '../../../../shared/calendar';
import NumberInput from '../../components/ui/NumberInput';

// Dashboard › กำไรสุทธิ › รายละเอียดการเงินเดือนนี้: a statement, not a dashboard. Three parts:
//  1. สรุปเดือนนี้ -- the selected month's received money, expenses and net profit (the same
//     figures the dashboard cards use, passed in).
//  2. เงินจริงที่มีอยู่ตอนนี้ -- the current balance (ยอดตั้งต้น + all received - all expenses), split
//     into ready-to-spend and money set aside in goals. Always today's balance, whatever month.
//  3. รายละเอียดรายจ่ายเดือนนี้ -- the month's expense lines.

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
  jobs: Job[];
  expenses: Expense[];
  goals: Goal[];
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
  onOpenExpenses: () => void;
  onOpenGoals: () => void;
  onClose: () => void;
}

const fullMonth = (key: string) => `${getThaiMonthName(Number(key.slice(5, 7)) - 1)} ${Number(key.slice(0, 4)) + 543}`;
const signed = (amount: number, sign: '+' | '-' | '') => `${amount !== 0 && sign ? (sign === '-' ? '−' : '+') : ''}${formatCurrency(Math.abs(amount))}`;
const GREEN = 'text-[#12804F] dark:text-[#6FD3A3]';
const RED = 'text-[#C43A3A] dark:text-[#F19A9A]';

function Row({ label, value, tone = 'text-brand-text', strong = false, onClick }: { label: React.ReactNode; value: string; tone?: string; strong?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className={`min-w-0 flex-1 ${strong ? 'text-[16px] font-semibold text-brand-text' : 'text-[14px] text-brand-text/90'}`}>{label}</span>
      <span className={`shrink-0 whitespace-nowrap text-right font-mono tabular-nums ${strong ? 'text-[17px] font-semibold' : 'text-[14.5px] font-medium'} ${tone}`}>{value}</span>
    </>
  );
  // The chevron hangs outside the value column so every amount shares one right edge.
  return onClick
    ? <button type="button" onClick={onClick} className="group relative -ml-2 flex w-[calc(100%+0.5rem)] items-baseline gap-3 rounded-lg py-2 pl-2 text-left transition-colors hover:bg-brand-faint cursor-pointer sm:-mr-5 sm:w-[calc(100%+1.75rem)] sm:pr-5">
        {inner}<ChevronRight className="absolute right-0 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-brand-muted sm:block" />
      </button>
    : <div className="flex items-baseline gap-3 py-1.5">{inner}</div>;
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
  const { monthKey, received, receivedCount, fixedExpense, variableExpense, variableExpenses, profit, savedThisMonth, savedCount, jobs, expenses, goals, settings, onUpdateSettings, onOpenExpenses, onOpenGoals, onClose } = props;
  const [editing, setEditing] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const opening = settings.cashOpening;
  const cash = opening ? currentCash(opening, jobs, expenses, goals) : null;
  const isCurrentMonth = monthKey === currentMonthKeyNow();
  const totalExpense = fixedExpense + variableExpense;
  const topExpenses = [...variableExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);

  // Esc closes (unless the opening-balance form is on top); Tab stays inside the modal.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose();
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, onClose]);

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
            <Row label={`แบ่งออมเข้าเป้าหมาย (${savedCount} รายการ)`} value={signed(savedThisMonth, '-')} tone={savedThisMonth > 0 ? RED : 'text-brand-text'} />
          </section>

          {/* 2. เงินจริงที่มีอยู่ตอนนี้ */}
          <section className="border-t border-brand-border py-5" aria-label="เงินจริงที่มีอยู่ตอนนี้">
            <SectionHead icon={Wallet} title="เงินจริงที่มีอยู่ตอนนี้" sub="ยอดเงินที่คุณถืออยู่จริง ณ ตอนนี้ ไม่ใช่กำไรเฉพาะเดือนนี้" />
            {!isCurrentMonth && (
              <p className="mb-3 flex items-start gap-1.5 text-[12px] text-brand-muted"><Info className="mt-px h-3.5 w-3.5 shrink-0" />เงินจริงที่มีอยู่ตอนนี้เป็นยอดปัจจุบัน ไม่ได้เปลี่ยนตามเดือนที่เลือก</p>
            )}
            {cash ? (
              <>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <p className="font-mono text-[34px] font-semibold leading-none tabular-nums text-brand-text" data-testid="current-cash">{cash.balance < 0 ? '−' : ''}{formatCurrency(Math.abs(cash.balance))}</p>
                  {onUpdateSettings && (
                    <button type="button" onClick={() => setEditing(true)} className="-mr-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#C24A16] transition-colors hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10">แก้ไขยอดตั้งต้น</button>
                  )}
                </div>
                <Row label="ยอดตั้งต้น" value={signed(cash.opening, cash.opening < 0 ? '-' : '')} />
                <Row label="เงินรับจริงสะสม" value={signed(cash.received, '+')} tone={cash.received > 0 ? GREEN : 'text-brand-text'} />
                <Row label="รายจ่ายจริงสะสม" value={signed(cash.spent, '-')} tone={cash.spent > 0 ? RED : 'text-brand-text'} />
                <div className="mt-2 border-t border-brand-border pt-2.5">
                  <Row label="เงินจริงที่มีอยู่ตอนนี้" value={signed(cash.balance, cash.balance < 0 ? '-' : '')} strong />
                </div>
                <div className="mt-4 space-y-0.5">
                  <Row label={<span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4 text-brand-muted" />พร้อมใช้ตอนนี้</span>} value={signed(cash.readyToSpend, cash.readyToSpend < 0 ? '-' : '')} tone={cash.readyToSpend < 0 ? RED : 'text-brand-text'} onClick={onOpenExpenses} />
                  <Row label={<span className="inline-flex items-center gap-2"><Target className="h-4 w-4 text-brand-muted" />กันไว้ในเป้าหมาย</span>} value={formatCurrency(cash.inGoals)} onClick={onOpenGoals} />
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-brand-muted"><Info className="mt-px h-3.5 w-3.5 shrink-0" />เงินที่จัดสรรเข้าเป้าหมายยังเป็นเงินของคุณ จึงไม่ถูกหักออกจากยอดเงินจริงทั้งหมด</p>
              </>
            ) : (
              <div className="rounded-xl bg-brand-faint/60 px-4 py-4">
                <p className="text-[15px] font-semibold text-brand-text">ยังคำนวณไม่ได้</p>
                <p className="mt-1 text-[13px] leading-relaxed text-brand-muted">ตั้งยอดเงินเริ่มต้นครั้งเดียว แล้วกระรอกจะคำนวณยอดปัจจุบันต่อให้</p>
                {onUpdateSettings && (
                  <button type="button" onClick={() => setEditing(true)} className="mt-3 inline-flex h-10 items-center rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">ตั้งยอดเริ่มต้น</button>
                )}
              </div>
            )}
          </section>

          {/* 3. รายละเอียดรายจ่ายเดือนนี้ */}
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
      {editing && onUpdateSettings && (
        <OpeningBalanceDialog
          jobs={jobs} expenses={expenses} existing={opening ?? null} currentBalance={cash?.balance ?? null}
          onSave={amount => { onUpdateSettings({ ...settings, cashOpening: saveOpening(amount, opening) }); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>,
    document.body,
  );
}

// ยอดตั้งต้น form. People know what they hold today more easily than what they had before they
// started, so they can type either; both are stored as the same ยอดตั้งต้น.
function OpeningBalanceDialog({ jobs, expenses, existing, currentBalance, onSave, onClose }: {
  jobs: Job[]; expenses: Expense[]; existing: { amount: number } | null; currentBalance: number | null;
  onSave: (opening: number) => void; onClose: () => void;
}) {
  const [mode, setMode] = React.useState<'now' | 'opening'>('now');
  const [value, setValue] = React.useState(() => existing && currentBalance !== null ? String(currentBalance) : '');
  const [confirming, setConfirming] = React.useState(false);
  const typed = parseFloat(value);
  const valid = value.trim() !== '' && Number.isFinite(typed);
  const opening = valid ? (mode === 'now' ? openingForCurrent(typed, jobs, expenses) : typed) : null;
  const newBalance = opening !== null ? currentCash({ amount: opening }, jobs, expenses).balance : null;
  const changes = existing && currentBalance !== null && newBalance !== null && Math.abs(newBalance - currentBalance) >= 0.01;
  const switchMode = (next: 'now' | 'opening') => {
    if (next === mode) return;
    // Keep the meaning: convert what's typed into the other kind of figure.
    if (valid) setValue(String(next === 'opening' ? openingForCurrent(typed, jobs, expenses) : currentCash({ amount: typed }, jobs, expenses).balance));
    setMode(next); setConfirming(false);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (opening === null) return;
    if (changes && !confirming) { setConfirming(true); return; }
    onSave(opening);
  };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={e => { e.stopPropagation(); onClose(); }}>
      <motion.form
        role="dialog" aria-modal="true" aria-label="ตั้งยอดเงินตั้งต้น" onSubmit={submit} onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.985, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18 }}
        className="w-full max-w-[420px] rounded-t-[22px] border border-brand-border bg-brand-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[20px] dark:bg-[#1F2024]"
      >
        <p className="text-[17px] font-semibold text-brand-text">ตอนนี้คุณมีเงินอยู่เท่าไหร่?</p>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-brand-faint p-1" role="radiogroup" aria-label="ใส่ยอดแบบไหน">
          {([['now', 'ยอดที่มีตอนนี้'], ['opening', 'ยอดตั้งต้น']] as const).map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => switchMode(key)}
              className={`h-9 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${mode === key ? 'bg-brand-white text-brand-text shadow-sm dark:bg-[#2A2B30]' : 'text-brand-muted hover:text-brand-text'}`}>{label}</button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-brand-text">{mode === 'now' ? 'ยอดเงินที่มีอยู่ตอนนี้' : 'ยอดเงินตั้งต้น'}</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[17px] text-brand-muted">฿</span>
            <NumberInput value={value} onChange={v => { setValue(v); setConfirming(false); }} autoFocus aria-label={mode === 'now' ? 'ยอดเงินที่มีอยู่ตอนนี้' : 'ยอดเงินตั้งต้น'}
              className="h-12 w-full rounded-xl border border-brand-border bg-brand-white pl-8 pr-3 font-mono text-[18px] text-brand-text outline-none focus:border-[#E65F2B] dark:bg-[#141518]" />
          </div>
        </label>
        <p className="mt-2 text-[12.5px] leading-relaxed text-brand-muted">
          {mode === 'now'
            ? 'ใส่ยอดรวมที่ถืออยู่จริงตอนนี้ (บัญชี + เงินสด) ระบบจะคำนวณยอดตั้งต้นให้ แล้วคิดเงินจริงที่มีอยู่ต่อจากนี้'
            : 'ใส่ยอดเงินที่คุณมีอยู่ก่อนเริ่มติดตาม ระบบจะใช้ยอดนี้คำนวณเงินจริงที่มีอยู่ต่อจากนี้'}
        </p>
        {opening !== null && (
          <dl className="mt-3 space-y-1 border-t border-brand-border pt-3 text-[13px]">
            <div className="flex justify-between gap-3"><dt className="text-brand-muted">ยอดตั้งต้น</dt><dd className="font-mono tabular-nums text-brand-text">{opening < 0 ? '−' : ''}{formatCurrency(Math.abs(opening))}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-brand-muted">เงินจริงที่มีอยู่ตอนนี้</dt><dd className="font-mono font-semibold tabular-nums text-brand-text">{newBalance! < 0 ? '−' : ''}{formatCurrency(Math.abs(newBalance!))}</dd></div>
          </dl>
        )}
        {confirming && changes && (
          <p role="alert" className="mt-3 text-[12.5px] leading-relaxed text-brand-text">ยอดเงินจริงที่มีอยู่จะเปลี่ยนจาก {formatCurrency(currentBalance!)} เป็น {formatCurrency(newBalance!)} โดยไม่สร้างรายรับหรือรายจ่ายใหม่ กดยืนยันอีกครั้งเพื่อบันทึก</p>
        )}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-brand-border text-[14px] font-medium text-brand-text hover:bg-brand-faint cursor-pointer">ยกเลิก</button>
          <button type="submit" disabled={opening === null} className="h-11 flex-[1.4] rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            {confirming && changes ? 'ยืนยันเปลี่ยนยอด' : 'บันทึกยอดตั้งต้น'}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
