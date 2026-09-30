import React from 'react';
import { Briefcase, Info } from 'lucide-react';
import { Job } from '../../../../shared/types';
import { workValueForMonth } from '../../../../shared/monthlySummary';
import { dateLocale, formatCurrency } from '../../utils';

const TOOLTIP_TEXT = 'มูลค่าเต็มของงานที่มีเงินเข้าหรือครบกำหนดรับเงินในเดือนนี้ ไม่ว่าจะได้รับเงินแล้วหรือยัง';
const TREND_MONTHS = 6;

const shiftMonth = (monthKey: string, delta: number) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function MonthlyWorkValueBanner({ jobs, monthKey }: { jobs: Job[]; monthKey: string }) {
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const tooltipId = React.useId();

  const series = React.useMemo(() => Array.from({ length: TREND_MONTHS }, (_, i) => {
    const key = shiftMonth(monthKey, i - (TREND_MONTHS - 1));
    const [y, m] = key.split('-').map(Number);
    return {
      key,
      label: new Date(y, m - 1, 1).toLocaleDateString(dateLocale(), { month: 'short' }),
      ...workValueForMonth(jobs, key),
    };
  }), [jobs, monthKey]);

  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const hasHistory = series.slice(0, -1).some(point => point.count > 0);
  const changePct = previous.value > 0 ? Math.round(((current.value - previous.value) / previous.value) * 100) : null;
  const maxValue = Math.max(...series.map(point => point.value), 1);

  const comparison = changePct === null ? null : (
    <p className={`text-xs font-medium ${changePct > 0 ? 'text-[#18A66A]' : 'text-brand-muted'}`}>
      {changePct > 0 ? '↑' : changePct < 0 ? '↓' : '='} {Math.abs(changePct)}% <span className="font-normal text-brand-muted">จากเดือนก่อน</span>
    </p>
  );

  return (
    <section
      aria-labelledby="work-value-label"
      className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-white p-[18px] sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
    >
      <div className="flex items-center gap-4">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#FFF1E8] sm:flex" aria-hidden="true">
          <Briefcase className="h-6 w-6 text-[#E65F2B]" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="relative flex items-center gap-1.5">
            <p id="work-value-label" className="text-sm font-medium text-brand-muted">มูลค่างานเดือนนี้</p>
            <button
              type="button"
              aria-label="มูลค่างานเดือนนี้คืออะไร"
              aria-describedby={tooltipOpen ? tooltipId : undefined}
              aria-expanded={tooltipOpen}
              onClick={() => setTooltipOpen(true)}
              onMouseEnter={() => setTooltipOpen(true)}
              onMouseLeave={() => setTooltipOpen(false)}
              onFocus={() => setTooltipOpen(true)}
              onBlur={() => setTooltipOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setTooltipOpen(false); }}
              className="rounded-full p-0.5 text-brand-muted hover:text-brand-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E65F2B] cursor-pointer"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            {tooltipOpen && (
              <span
                id={tooltipId}
                role="tooltip"
                className="absolute bottom-full left-0 z-20 mb-1.5 w-64 rounded-lg border border-brand-border bg-brand-white px-3 py-2 text-xs leading-5 text-brand-text shadow-md"
              >
                {TOOLTIP_TEXT}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[30px] font-semibold leading-9 text-brand-text">{formatCurrency(current.value)}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-sm text-brand-muted">
              {current.count > 0 ? `${current.count} งาน` : 'ยังไม่มีงานที่มีเงินเข้าหรือครบกำหนดในเดือนนี้'}
            </p>
            <div className="sm:hidden">{comparison}</div>
          </div>
        </div>
      </div>

      {(hasHistory || current.count > 0) && (
        <div className="hidden shrink-0 items-end gap-4 sm:flex">
          <div className="flex h-12 items-end gap-1.5" aria-hidden="true">
            {series.map((point, i) => (
              <span
                key={point.key}
                title={`${point.label}: ${formatCurrency(point.value)}`}
                className="w-3 rounded-t-[3px]"
                style={{
                  height: `${Math.max(4, Math.round((point.value / maxValue) * 48))}px`,
                  background: i === series.length - 1 ? '#F7B584' : 'var(--color-brand-border, #EAE7E3)',
                }}
              />
            ))}
          </div>
          {comparison && <div className="pb-0.5 text-right">{comparison}</div>}
        </div>
      )}
    </section>
  );
}
