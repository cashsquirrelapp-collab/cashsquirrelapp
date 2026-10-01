import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { currentMonthKeyNow, dateLocale } from '../../utils';

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
  const navButton = 'flex h-10 w-9 shrink-0 items-center justify-center text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer';

  return (
    <div ref={rootRef} className="relative">
      <div className="flex h-10 items-stretch overflow-hidden rounded-2xl border border-brand-border bg-brand-white">
        <button type="button" onClick={() => onChange(shiftMonth(monthKey, -1))} aria-label="เดือนก่อนหน้า" className={navButton}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`ช่วงเวลาที่แสดง: ${monthLabel(monthKey)} เปลี่ยนเดือน`}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 border-x border-brand-border px-3 text-[13px] font-medium transition-colors hover:bg-brand-faint cursor-pointer sm:min-w-[140px] sm:flex-none ${isCurrent ? 'text-brand-text' : 'text-[#C24A16] dark:text-orange-300'}`}
        >
          <span className="truncate">{monthLabel(monthKey)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-brand-muted" />
        </button>
        <button type="button" onClick={() => onChange(shiftMonth(monthKey, 1))} aria-label="เดือนถัดไป" className={navButton}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="เลือกเดือน"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-brand-border bg-brand-white p-3 shadow-lg dark:bg-stone-900 sm:left-1/2 sm:right-auto sm:w-72 sm:-translate-x-1/2"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setViewYear(y => y - 1)} aria-label="ปีก่อนหน้า" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-[13px] font-semibold text-brand-text">{yearLabel(viewYear)}</p>
            <button type="button" onClick={() => setViewYear(y => y + 1)} aria-label="ปีถัดไป" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">
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
                  className={`relative h-10 rounded-[10px] border text-[13px] transition-colors cursor-pointer ${selected
                    ? 'border-[#F3B08C] bg-[#FFF1E8] font-semibold text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
                    : 'border-brand-border text-brand-text hover:bg-brand-faint'}`}
                >
                  {new Date(viewYear, i, 1).toLocaleDateString(dateLocale(), { month: 'short' })}
                  {isThisMonth && !selected && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#E65F2B]" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => choose(currentMonth)}
            disabled={isCurrent}
            className="mt-3 h-9 w-full rounded-[10px] border border-brand-border text-xs font-medium text-brand-text transition-colors hover:bg-brand-faint disabled:cursor-default disabled:text-brand-muted disabled:hover:bg-transparent cursor-pointer"
          >
            กลับมาที่เดือนนี้
          </button>
        </div>
      )}
    </div>
  );
}
