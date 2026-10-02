import React from 'react';
import { Car, ChevronDown, Landmark, Laptop, Megaphone, Receipt, Repeat, Tag, Users, Utensils, X, type LucideIcon } from 'lucide-react';
import { formatCurrency } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';
import { FIXED_BUCKET, percentText, type ExpenseSlice } from './expenseMonth';

// The two charts on the รายจ่าย page. Both are filters as well as pictures: clicking a category
// (bar or slice) narrows the table below, and the selection is shared between them.

export type BreakdownMode = 'category' | 'type';

const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/อุปกรณ์|ซอฟต์แวร์/, Laptop],
  [/โฆษณา|แอด/, Megaphone],
  [/เดินทาง|น้ำมัน/, Car],
  [/อาหาร/, Utensils],
  [/จ้างงาน|Outsource/i, Users],
  [/ภาษี|ธรรมเนียม/, Landmark],
  [/บริการ|สาธารณูปโภค/, Receipt],
];

export function categoryIcon(label: string): LucideIcon {
  if (label === FIXED_BUCKET) return Repeat;
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? Tag;
}

// Restrained palette: brand orange for the largest share, then soft pastels, then neutral.
const PALETTE = ['#E65F2B', '#F4A774', '#F2CC6B', '#8FB7E3', '#B5A3E0', '#9ACDB5', '#E8A3B4', '#C9BFB5'];
export const sliceColor = (index: number) => PALETTE[Math.min(index, PALETTE.length - 1)];

const TYPE_COLORS: Record<string, string> = { recurring: '#E65F2B', general: '#F2CC6B' };
const colorFor = (slice: ExpenseSlice, index: number, mode: BreakdownMode) => mode === 'type' ? TYPE_COLORS[slice.key] : sliceColor(index);

interface ChartProps {
  slices: ExpenseSlice[];
  mode: BreakdownMode;
  onModeChange: (mode: BreakdownMode) => void;
  /** The selected category (mode 'category') or type key (mode 'type'), or null. */
  selected: string | null;
  onSelect: (key: string | null) => void;
}

const card = 'rounded-2xl border border-brand-border bg-brand-white';

function EmptyChart() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <Mascot mood="happy" size={48} />
      <p className="text-[13px] text-brand-muted">ยังไม่มีข้อมูลรายจ่ายในเดือนนี้</p>
    </div>
  );
}

function ClearSelection({ onClear }: { onClear: () => void }) {
  return (
    <button type="button" onClick={onClear}
      className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#FFF1E8] px-2 text-[11px] font-medium text-[#C24A16] hover:bg-[#FFE6D6] cursor-pointer dark:bg-orange-500/10 dark:text-orange-300">
      <X className="h-3 w-3" /> ล้างตัวกรอง
    </button>
  );
}

export function CategoryBars({ slices, mode, onModeChange, selected, onSelect }: ChartProps) {
  const max = slices.reduce((m, s) => Math.max(m, s.amount), 0);
  return (
    <section aria-label="เงินเดือนนี้หมดไปกับอะไร?" className={`${card} flex flex-col p-4 sm:p-5 lg:min-h-[320px]`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-brand-text">เงินเดือนนี้หมดไปกับอะไร?</h2>
          <p className="mt-0.5 text-xs text-brand-muted">{mode === 'category' ? 'ดูรายจ่ายแยกตามหมวดหมู่' : 'ดูรายจ่ายแยกตามประเภท'}</p>
        </div>
        <div className="flex items-center gap-2">
          {selected && <ClearSelection onClear={() => onSelect(null)} />}
          <div className="flex items-center rounded-xl border border-brand-border p-0.5" role="tablist" aria-label="มุมมองกราฟ">
            {([['category', 'ตามหมวดหมู่'], ['type', 'ประจำ vs ทั่วไป']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => onModeChange(key)}
                className={`h-7 rounded-[9px] px-2.5 text-[11px] font-medium transition-colors cursor-pointer ${mode === key
                  ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'text-brand-muted hover:text-brand-text'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {slices.length === 0 ? <EmptyChart /> : (
        <ul className="space-y-1">
          {slices.map((slice, index) => {
            const Icon = mode === 'type' ? (slice.key === 'recurring' ? Repeat : Tag) : categoryIcon(slice.label);
            const active = selected === slice.key;
            const dimmed = selected !== null && !active;
            return (
              <li key={slice.key}>
                <button type="button" onClick={() => onSelect(active ? null : slice.key)} aria-pressed={active}
                  aria-label={`${slice.label} ${formatCurrency(slice.amount)} ${percentText(slice.percent)}`}
                  className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2 py-1.5 text-left transition-colors cursor-pointer ${active
                    ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : 'hover:bg-brand-faint'} ${dimmed ? 'opacity-55' : ''}`}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-faint text-brand-muted"><Icon className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-brand-text">{slice.label}</span>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-brand-faint">
                      <span className="block h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${max > 0 ? Math.max(2, (slice.amount / max) * 100) : 0}%`, backgroundColor: colorFor(slice, index, mode) }} />
                    </span>
                  </span>
                  <span className="flex min-w-[96px] items-baseline justify-end gap-2 self-end">
                    <span className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(slice.amount)}</span>
                    <span className="w-9 text-right text-[11px] text-brand-muted">{percentText(slice.percent)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// SVG donut: one arc per slice on a circle of circumference 100, so dash lengths are percents.
export function ExpenseDonut({ slices, mode, onModeChange, selected, onSelect, total }: ChartProps & { total: number }) {
  const [hover, setHover] = React.useState<string | null>(null);
  const radius = 15.9155; // circumference = 100
  const gap = slices.length > 1 ? 0.6 : 0;
  let offset = 0;
  const arcs = slices.map((slice, index) => {
    const length = total > 0 ? (slice.amount / total) * 100 : 0;
    const arc = { slice, index, start: offset, length };
    offset += length;
    return arc;
  });
  const focus = slices.find(s => s.key === (hover ?? selected));

  return (
    <section aria-label="สัดส่วนรายจ่าย" className={`${card} flex flex-col p-4 sm:p-5 lg:min-h-[320px]`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-brand-text">สัดส่วนรายจ่าย</h2>
        <div className="flex items-center gap-2">
          {selected && <ClearSelection onClear={() => onSelect(null)} />}
          <div className="relative">
            <select aria-label="สัดส่วนตาม" value={mode} onChange={(e) => onModeChange(e.target.value as BreakdownMode)}
              className="h-8 appearance-none rounded-xl border border-brand-border bg-brand-white pl-3 pr-7 text-[11px] text-brand-text outline-none hover:bg-brand-faint focus:border-[#E65F2B] cursor-pointer">
              <option value="category">ตามหมวดหมู่</option>
              <option value="type">ประจำ vs ทั่วไป</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-muted" />
          </div>
        </div>
      </div>
      {slices.length === 0 ? <EmptyChart /> : (
        <div className="flex flex-1 flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative h-[150px] w-[150px] shrink-0">
            <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" role="img" aria-label="กราฟโดนัทสัดส่วนรายจ่าย">
              <circle cx="21" cy="21" r={radius} fill="none" stroke="var(--color-brand-faint)" strokeWidth="5" />
              {arcs.map(({ slice, index, start, length }) => {
                const active = (hover ?? selected) === slice.key;
                const dimmed = (hover ?? selected) !== null && !active;
                return (
                  <circle key={slice.key} cx="21" cy="21" r={radius} fill="none"
                    stroke={colorFor(slice, index, mode)} strokeWidth={active ? 6.2 : 5}
                    strokeDasharray={`${Math.max(0, length - gap)} ${100 - Math.max(0, length - gap)}`}
                    strokeDashoffset={-start}
                    className={`cursor-pointer transition-[stroke-width,opacity] duration-200 ${dimmed ? 'opacity-35' : ''}`}
                    onMouseEnter={() => setHover(slice.key)} onMouseLeave={() => setHover(null)}
                    onClick={() => onSelect(selected === slice.key ? null : slice.key)}>
                    <title>{`${slice.label} · ${formatCurrency(slice.amount)} · ${percentText(slice.percent)}`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="font-mono text-[17px] font-semibold leading-tight text-brand-text">{formatCurrency(focus ? focus.amount : total)}</span>
              <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-brand-muted">{focus ? `${focus.label} · ${percentText(focus.percent)}` : 'รายจ่ายทั้งหมด'}</span>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-0.5">
            {slices.map((slice, index) => {
              const active = selected === slice.key;
              return (
                <li key={slice.key}>
                  <button type="button" onClick={() => onSelect(active ? null : slice.key)} aria-pressed={active}
                    onMouseEnter={() => setHover(slice.key)} onMouseLeave={() => setHover(null)}
                    className={`grid w-full grid-cols-[10px_minmax(0,1fr)_36px_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors cursor-pointer ${active
                      ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : 'hover:bg-brand-faint'} ${selected !== null && !active ? 'opacity-55' : ''}`}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorFor(slice, index, mode) }} />
                    <span className="line-clamp-2 leading-tight text-brand-text">{slice.label}</span>
                    <span className="text-right text-brand-muted">{percentText(slice.percent)}</span>
                    <span className="min-w-[64px] text-right font-mono text-brand-text">{formatCurrency(slice.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
