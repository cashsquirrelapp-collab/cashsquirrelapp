import React from 'react';
import { ArrowRight, Info } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { formatCurrency, formatMonthKey, toLocalDateKey } from '../../utils';
import { uiSurface } from '../../components/ui/uiStyles';
import { buildCashTimeline } from './cashTimeline';

// Money for the month shown in the calendar. Uses the timeline's own month bucket, so both views
// always show the same numbers (net of WHT, installments and deposits split by date, overdue money
// carried into the current month).

const ESTIMATE_NOTE = 'ประมาณจากวันส่งงาน/ให้บริการ และ Credit Term ของแต่ละงาน';

export function MonthMoneySummary({ jobs, monthKey, onOpenTimeline, className = '' }: {
  jobs: Job[];
  monthKey: string;
  onOpenTimeline: () => void;
  className?: string;
}) {
  const todayKey = toLocalDateKey();
  const currentMonth = todayKey.slice(0, 7);
  const month = React.useMemo(
    () => buildCashTimeline(jobs, { todayKey, fromMonth: monthKey, months: 1 }).months[0],
    [jobs, todayKey, monthKey],
  );
  const overdue = month.items.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.amount, 0);
  const waiting = month.expected - overdue;
  const isPast = monthKey < currentMonth;
  const isCurrent = monthKey === currentMonth;
  const title = isPast ? `เงินเข้า ${formatMonthKey(monthKey)}` : isCurrent ? 'เงินเข้าเดือนนี้' : `คาดว่าจะเข้า ${formatMonthKey(monthKey)}`;
  const share = (amount: number) => (month.total > 0 ? `${(amount / month.total) * 100}%` : '0%');

  const rows = [
    { key: 'received', label: 'รับแล้ว', amount: month.received, dot: '#18A66A', show: true },
    { key: 'waiting', label: 'รอรับ', amount: waiting, dot: '#F36A2D', show: !isPast || waiting > 0 },
    { key: 'overdue', label: 'เกินกำหนด', amount: overdue, dot: '#E95454', show: overdue > 0 },
  ].filter(r => r.show);

  return (
    <section className={`${uiSurface} p-[18px] ${className}`} aria-label={title}>
      <p className="flex items-center gap-1 text-xs text-brand-muted">
        {title}
        {!isPast && <span title={ESTIMATE_NOTE} aria-label={ESTIMATE_NOTE}><Info className="h-3 w-3" /></span>}
      </p>
      <p className="mt-1 font-mono text-[26px] font-semibold leading-tight text-brand-text">{formatCurrency(month.total)}</p>

      {month.total > 0 ? (<>
        {/* Received, waiting and overdue as one bar */}
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-brand-faint" role="img"
          aria-label={`รับแล้ว ${formatCurrency(month.received)} จาก ${formatCurrency(month.total)}`}>
          <span className="h-full bg-[#18A66A] transition-[width] duration-500" style={{ width: share(month.received) }} />
          <span className="h-full bg-[#F36A2D]/70 transition-[width] duration-500" style={{ width: share(waiting) }} />
          <span className="h-full bg-[#E95454] transition-[width] duration-500" style={{ width: share(overdue) }} />
        </div>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          {rows.map(r => (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-brand-muted"><span className="h-2 w-2 rounded-full" style={{ background: r.dot }} />{r.label}</dt>
              <dd className={`font-mono font-medium ${r.key === 'overdue' ? 'text-[#C43A3A] dark:text-[#F19A9A]' : 'text-brand-text'}`}>{formatCurrency(r.amount)}</dd>
            </div>
          ))}
        </dl>
      </>) : (
        <p className="mt-1 text-xs text-brand-muted">{isPast ? 'ไม่มีเงินเข้าในเดือนนี้' : 'ยังไม่มีเงินที่คาดว่าจะเข้า'}</p>
      )}

      <button type="button" onClick={onOpenTimeline}
        className="group mt-4 flex w-full items-center justify-between border-t border-brand-border pt-3 text-xs text-brand-muted transition-colors hover:text-[#C24A16] cursor-pointer dark:hover:text-[#FF9A6B]">
        <span>{month.items.length} รายการ · ดูในไทม์ไลน์</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </button>
    </section>
  );
}
