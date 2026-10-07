import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Info, Plus } from 'lucide-react';
import { AppSettings, Expense, Job } from '../../../../shared/types';
import { firstActivityMonth, fixedExpenseForMonth } from '../../../../shared/monthlySummary';
import { formatCurrency, formatMonthKey, safeFormatThaiDate, toLocalDateKey } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';
import { buildCashTimeline, shiftMonthKey, type TimelineItem, type TimelineStatus } from './cashTimeline';

// Same status colours as the calendar legend (CalendarTab EVENT_STYLES): one language for both views.
const STATUS: Record<TimelineStatus, { dot: string; text: string; bg: string }> = {
  expected: { dot: '#F36A2D', text: '#C24A16', bg: '#FFF1E8' },
  dueSoon: { dot: '#F2A93B', text: '#8A5A0B', bg: '#FAEEDA' },
  received: { dot: '#18A66A', text: '#12724A', bg: '#E9F8F1' },
  overdue: { dot: '#E95454', text: '#C43A3A', bg: '#FFF0F0' },
};

type Filter = 'all' | 'pending' | 'received' | 'overdue';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รอรับเงิน' },
  { key: 'received', label: 'รับแล้ว' },
  { key: 'overdue', label: 'เกินกำหนดชำระ' },
];
const matches = (item: TimelineItem, filter: Filter) =>
  filter === 'all' || (filter === 'received' ? item.status === 'received' : filter === 'overdue' ? item.status === 'overdue' : item.status !== 'received');

const DEFAULT_MONTHS = 4; // current month + next 3: this is a forecast first
const ESTIMATE_NOTE = 'ประมาณจากวันส่งงาน/ให้บริการ และ Credit Term ของแต่ละงาน';

const statusText = (item: TimelineItem) =>
  item.status === 'received' ? `รับแล้ว ✓ ${safeFormatThaiDate(item.date, { day: 'numeric', month: 'short' })}`
    : item.status === 'overdue' ? `เกินกำหนดชำระ ${-item.days} วัน`
    : item.days === 0 ? 'ครบกำหนดชำระวันนี้'
    : item.days === 1 ? 'ครบกำหนดชำระพรุ่งนี้'
    : `ครบกำหนดชำระอีก ${item.days} วัน`;

interface TimelineViewProps {
  jobs: Job[];
  expenses: Expense[];
  settings: AppSettings;
  onViewJob: (jobId: string) => void;
  onAddJob: () => void;
  /** Month to start from (e.g. the month that was open in the calendar). */
  initialMonth?: string;
}

export function TimelineView({ jobs, expenses, settings, onViewJob, onAddJob, initialMonth }: TimelineViewProps) {
  const todayKey = toLocalDateKey();
  const currentMonth = todayKey.slice(0, 7);
  const [fromMonth, setFromMonth] = React.useState(initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : currentMonth);
  const [monthCount, setMonthCount] = React.useState(DEFAULT_MONTHS);
  const [filter, setFilter] = React.useState<Filter>('all');

  const timeline = React.useMemo(
    () => buildCashTimeline(jobs, { todayKey, fromMonth, months: monthCount }),
    [jobs, todayKey, fromMonth, monthCount],
  );

  // Planned spending: fixed monthly costs the user set (from the account's first month on) plus
  // expenses actually recorded in that month. Nothing is assumed beyond that.
  const fixedFrom = React.useMemo(() => firstActivityMonth(jobs, expenses) ?? currentMonth, [jobs, expenses, currentMonth]);
  const expensesFor = (monthKey: string) => {
    const recorded = expenses.filter(e => (e.date || '').slice(0, 7) === monthKey);
    const fixed = monthKey >= fixedFrom
      ? fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, recorded.map(e => e.name))
      : 0;
    return fixed + recorded.reduce((sum, e) => sum + e.amount, 0);
  };

  const hasAnyMoney = jobs.some(j => j.pending > 0 || j.received > 0);
  const rangeLabel = `${formatMonthKey(fromMonth)} เป็นต้นไป`;
  const navButton = 'flex h-9 w-9 items-center justify-center rounded-xl text-brand-muted transition-colors hover:bg-[#FFF1E8] hover:text-[#C24A16] cursor-pointer dark:hover:bg-orange-500/10 dark:hover:text-orange-300';

  return (
    <div className="space-y-4">
      {/* Controls: period + one compact filter (calendar's month/week toggle doesn't apply here). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setFromMonth(m => shiftMonthKey(m, -1))} aria-label="เดือนก่อนหน้า" className={navButton}><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[150px] text-center text-[13px] font-medium text-brand-text">{rangeLabel}</span>
          <button type="button" onClick={() => setFromMonth(m => shiftMonthKey(m, 1))} aria-label="เดือนถัดไป" className={navButton}><ChevronRight className="h-4 w-4" /></button>
          {fromMonth !== currentMonth && (
            <button type="button" onClick={() => { setFromMonth(currentMonth); setMonthCount(DEFAULT_MONTHS); }} className="ml-1 rounded-lg border border-brand-border px-2.5 py-1.5 text-[11px] font-medium text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">
              เดือนนี้
            </button>
          )}
        </div>
        <div className="relative">
          <select
            aria-label="กรองรายการในไทม์ไลน์"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="h-9 appearance-none rounded-xl border border-brand-border bg-brand-white pl-3 pr-8 text-xs text-brand-text outline-none transition-colors hover:bg-brand-faint focus:border-[#E65F2B] cursor-pointer"
          >
            {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
        </div>
      </div>

      {/* Lightweight context */}
      <div className="flex items-center gap-3 rounded-[14px] border border-brand-border bg-brand-white px-4 py-3">
        <span className="shrink-0"><Mascot mood="waiting" size={40} animated={false} /></span>
        <div className="min-w-0">
          <p className="text-[13px] text-brand-text">ไทม์ไลน์นี้ประเมินเงินที่คาดว่าจะได้รับ จากกำหนดส่งงานและ Credit Term เพื่อช่วยให้เห็นว่าเงินจะเข้าช่วงไหน</p>
          <p className="mt-0.5 text-[11px] text-brand-muted">ใช้สำหรับวางแผนกระแสเงินล่วงหน้า</p>
        </div>
      </div>

      {!hasAnyMoney ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-brand-border bg-brand-white px-6 py-10 text-center">
          <Mascot mood="sleepy" size={72} />
          <p className="mt-1 text-sm font-semibold text-brand-text">ยังไม่มีรายการในไทม์ไลน์</p>
          <p className="max-w-sm text-xs text-brand-muted">เพิ่มงานพร้อมกำหนดส่งหรือ Credit Term แล้วกระรอกจะช่วยคาดการณ์ช่วงรับเงินให้</p>
          <button type="button" onClick={onAddJob} className="mt-2 flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer">
            <Plus className="h-4 w-4" /> เพิ่มงาน
          </button>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[1000px] pl-9 sm:pl-12">
          {/* The timeline line */}
          <div className="absolute bottom-2 left-[11px] top-2 w-px bg-brand-border sm:left-[15px]" aria-hidden="true" />
          {timeline.months.map(month => {
            const isCurrent = month.monthKey === currentMonth;
            const isPast = month.monthKey < currentMonth;
            const items = month.items.filter(i => matches(i, filter));
            const planned = expensesFor(month.monthKey);
            const balance = month.total - planned;
            const carried = items.filter(i => i.carriedOver);
            const inMonth = items.filter(i => !i.carriedOver);
            return (
              <section key={month.monthKey} className="relative pb-7" aria-label={formatMonthKey(month.monthKey)}>
                <span
                  aria-hidden="true"
                  className={`absolute -left-8 top-2 h-[14px] w-[14px] rounded-full border-2 sm:-left-10 ${
                    isCurrent ? 'border-[#E65F2B] bg-[#E65F2B]' : isPast ? 'border-brand-border bg-brand-white' : 'border-[#F3B08C] bg-brand-white'
                  }`}
                />
                <h3 className={`text-[22px] font-semibold leading-tight sm:text-2xl ${isPast ? 'text-brand-muted' : 'text-brand-text'}`}>
                  {formatMonthKey(month.monthKey)}
                  {isCurrent && <span className="ml-2 align-middle text-xs font-medium text-[#C24A16] dark:text-orange-300">เดือนนี้</span>}
                </h3>

                {month.items.length === 0 ? (
                  <p className="mt-1.5 text-xs text-brand-muted">ยังไม่มีเงินที่คาดว่าจะเข้า</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {/* Monthly summary */}
                    <div className="flex flex-wrap items-end justify-between gap-3 rounded-[14px] border border-brand-border bg-brand-white px-4 py-3">
                      <div>
                        <p className="flex items-center gap-1 text-xs text-brand-muted">
                          {isPast ? 'เงินเข้า' : `เงินคาดว่าจะเข้า${isCurrent ? 'เดือนนี้' : ''}`}
                          <span title={ESTIMATE_NOTE} aria-label={ESTIMATE_NOTE}><Info className="h-3 w-3" /></span>
                        </p>
                        <p className="mt-0.5 font-mono text-xl font-semibold text-brand-text">{formatCurrency(month.total)}</p>
                        <p className="text-[11px] text-brand-muted">{month.items.length} รายการ</p>
                      </div>
                      <div className="text-right text-xs text-brand-muted">
                        <p>รับแล้ว <span className="font-mono text-brand-text">{formatCurrency(month.received)}</span></p>
                        <p className="mt-0.5">รอรับ <span className="font-mono text-brand-text">{formatCurrency(month.expected)}</span></p>
                      </div>
                    </div>

                    {carried.length > 0 && <p className="px-1 pt-1 text-[11px] font-medium text-[#C43A3A] dark:text-rose-300">ค้างชำระจากเดือนก่อน</p>}
                    {[...carried, ...(carried.length > 0 && inMonth.length > 0 ? [null] : []), ...inMonth].map((item, index) =>
                      item === null
                        ? <p key="in-month" className="px-1 pt-1 text-[11px] font-medium text-brand-muted">ครบกำหนดชำระเดือนนี้</p>
                        : <TimelineRow key={`${item.id}-${index}`} item={item} onOpen={() => onViewJob(item.jobId)} />
                    )}
                    {items.length === 0 && <p className="px-1 text-xs text-brand-muted">ไม่มีรายการตามตัวกรองนี้</p>}

                    {/* Cash position: only when there is real expense data for the month */}
                    {planned > 0 && (
                      <dl className="rounded-[14px] bg-brand-faint px-4 py-3 text-[13px]">
                        <div className="flex justify-between"><dt className="text-brand-muted">คาดว่าจะเข้า</dt><dd className="font-mono text-brand-text">{formatCurrency(month.total)}</dd></div>
                        <div className="mt-0.5 flex justify-between">
                          <dt className="text-brand-muted" title="ค่าใช้จ่ายคงที่ที่ตั้งไว้ รวมกับรายจ่ายที่บันทึกในเดือนนี้">รายจ่ายที่วางไว้</dt>
                          <dd className="font-mono text-brand-text">{formatCurrency(planned)}</dd>
                        </div>
                        <div className="mt-1.5 flex justify-between border-t border-brand-border pt-1.5">
                          <dt className="text-brand-muted">ส่วนต่าง</dt>
                          <dd className={`font-mono font-semibold ${balance < 0 ? 'text-[#C43A3A] dark:text-rose-300' : 'text-[#18A66A]'}`}>{balance < 0 ? '-' : ''}{formatCurrency(Math.abs(balance))}</dd>
                        </div>
                        <p className={`mt-1 text-[11px] ${balance < 0 ? 'text-[#C43A3A]/80 dark:text-rose-300/80' : 'text-[#18A66A]'}`}>
                          {balance < 0 ? `ขาดอีก ${formatCurrency(-balance)} ถึงจะคุ้มทุน` : `เหลือประมาณ ${formatCurrency(balance)}`}
                        </p>
                      </dl>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          <div className="relative flex flex-wrap items-center gap-3 pb-2">
            <button type="button" onClick={() => setMonthCount(n => n + 3)} className="rounded-xl border border-brand-border bg-brand-white px-4 py-2 text-xs font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
              ดูเพิ่มเติม 3 เดือน
            </button>
            {timeline.undated.count > 0 && (
              <p className="text-[11px] text-brand-muted">
                อีก {timeline.undated.count} รายการ ({formatCurrency(timeline.undated.amount)}) ยังไม่มีวันส่งงาน จึงยังไม่อยู่ในไทม์ไลน์
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ item, onOpen }: { item: TimelineItem; onOpen: () => void }) {
  const style = STATUS[item.status];
  const received = item.status === 'received';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-[14px] border border-brand-border bg-brand-white px-4 py-3 text-left transition-colors hover:bg-brand-faint cursor-pointer ${
        item.status === 'overdue' ? 'shadow-[inset_3px_0_0_#E95454]' : ''
      } ${received ? 'opacity-70' : ''}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: style.dot }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-brand-text">
          {item.jobName}
          {item.part && <span className="ml-1.5 text-[11px] font-normal text-brand-muted">· {item.part}</span>}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-brand-muted">
          {[item.client || '—', safeFormatThaiDate(item.date, { day: 'numeric', month: 'short', year: 'numeric' }), !received && item.creditTerm > 0 ? `Credit ${item.creditTerm} วัน` : '']
            .filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(item.amount)}</span>
        <span className="mt-0.5 inline-block rounded-md px-1.5 py-px text-[11px] font-medium" style={{ background: style.bg, color: style.text }}>
          {statusText(item)}
        </span>
      </span>
    </button>
  );
}
