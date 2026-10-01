import React from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { currentMonthKeyNow, dateLocale, formatMonthKey } from '../../utils';

const shiftMonth = (monthKey: string, delta: number) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (monthKey: string, month: 'long' | 'short' = 'long') => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(dateLocale(), { month, year: 'numeric' });
};

const yearLabel = (year: number) => new Date(year, 0, 1).toLocaleDateString(dateLocale(), { year: 'numeric' });

interface DashboardPeriodPickerProps {
  monthKey: string;
  onChange: (monthKey: string) => void;
}

/**
 * The dashboard's one period control: ‹ month › with a month/year picker behind the label.
 * Every month-based card and the chart follow it, so no card needs a selector of its own.
 */
export function DashboardPeriodPicker({ monthKey, onChange }: DashboardPeriodPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(() => Number(monthKey.slice(0, 4)));
  const rootRef = React.useRef<HTMLDivElement>(null);
  const currentMonth = currentMonthKeyNow();
  const isCurrent = monthKey === currentMonth;

  React.useEffect(() => {
    if (!open) return;
    setViewYear(Number(monthKey.slice(0, 4)));
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
    // Re-anchor the year only when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (key: string) => { onChange(key); setOpen(false); };
  // Ghost arrows and a light pill: quieter than the header's primary "+ เพิ่มงาน" button.
  const ghostButton = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-brand-muted transition-colors hover:bg-[#FFF1E8] hover:text-[#C24A16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3B08C] cursor-pointer dark:hover:bg-orange-500/10 dark:hover:text-orange-300';
  const smallGhost = 'flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted transition-colors hover:bg-[#FFF1E8] hover:text-[#C24A16] cursor-pointer dark:hover:bg-orange-500/10 dark:hover:text-orange-300';

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(shiftMonth(monthKey, -1))} aria-label="เดือนก่อนหน้า" title="เดือนก่อนหน้า" className={ghostButton}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`ช่วงเวลาที่แสดง: ${monthLabel(monthKey)} เปลี่ยนเดือน`}
          className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3B08C] cursor-pointer ${open
            ? 'border-[#F3B08C] bg-[#FFF7F1] dark:border-orange-400/40 dark:bg-orange-500/10'
            : 'border-brand-border/70 bg-brand-white hover:border-[#F3B08C] hover:bg-[#FFF7F1] dark:hover:border-orange-400/40 dark:hover:bg-orange-500/10'
          } ${isCurrent ? 'text-brand-text' : 'text-[#C24A16] dark:text-orange-300'}`}
        >
          <CalendarDays className="h-4 w-4 shrink-0 opacity-70" />
          <span className="whitespace-nowrap">{formatMonthKey(monthKey)}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-brand-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={() => onChange(shiftMonth(monthKey, 1))} aria-label="เดือนถัดไป" title="เดือนถัดไป" className={ghostButton}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="เลือกเดือน"
          className="absolute left-0 top-[calc(100%+8px)] z-30 w-[272px] rounded-[14px] border border-brand-border/70 bg-brand-white p-3 shadow-[0_8px_24px_rgba(33,29,26,0.08)] dark:bg-stone-900 sm:left-1/2 sm:-translate-x-1/2"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <button type="button" onClick={() => setViewYear(y => y - 1)} aria-label="ปีก่อนหน้า" className={smallGhost}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-[13px] font-semibold text-brand-text">{yearLabel(viewYear)}</p>
            <button type="button" onClick={() => setViewYear(y => y + 1)} aria-label="ปีถัดไป" className={smallGhost}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => {
              const key = `${viewYear}-${String(i + 1).padStart(2, '0')}`;
              const selected = key === monthKey;
              const isThisMonth = key === currentMonth;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => choose(key)}
                  aria-pressed={selected}
                  aria-label={`${monthLabel(key)}${isThisMonth ? ' (เดือนนี้)' : ''}`}
                  className={`relative h-9 rounded-[10px] text-[13px] transition-colors cursor-pointer ${selected
                    ? 'bg-[#E65F2B] font-semibold text-white'
                    : isThisMonth
                    ? 'font-medium text-[#C24A16] hover:bg-[#FFF1E8] dark:text-orange-300 dark:hover:bg-orange-500/10'
                    : 'text-brand-text hover:bg-[#FFF1E8] dark:hover:bg-orange-500/10'}`}
                >
                  {new Date(viewYear, i, 1).toLocaleDateString(dateLocale(), { month: 'short' })}
                  {isThisMonth && !selected && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#E65F2B]" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 border-t border-brand-border/60 pt-2">
            <button
              type="button"
              onClick={() => choose(currentMonth)}
              disabled={isCurrent}
              className="h-8 w-full rounded-lg text-xs font-medium text-[#C24A16] transition-colors hover:bg-[#FFF1E8] disabled:cursor-default disabled:text-brand-muted disabled:hover:bg-transparent cursor-pointer dark:text-orange-300 dark:hover:bg-orange-500/10"
            >
              กลับมาเดือนนี้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
