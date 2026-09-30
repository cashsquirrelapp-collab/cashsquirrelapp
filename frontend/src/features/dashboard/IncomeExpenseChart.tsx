import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { AppSettings, Expense, Job } from '../../../../shared/types';
import { getJobPaymentEntries } from '../../../../shared/installmentPayments';
import { fixedExpenseForMonth } from '../../../../shared/monthlySummary';
import { dateLocale, formatCurrency, toLocalDateKey } from '../../utils';

type RangeKey = '7d' | '30d' | '3m' | '12m';
type Granularity = 'day' | 'week' | 'month';

const RANGES: { key: RangeKey; label: string; granularities: Granularity[] }[] = [
  { key: '7d', label: '7 วันล่าสุด', granularities: ['day'] },
  { key: '30d', label: '30 วันล่าสุด', granularities: ['day', 'week'] },
  { key: '3m', label: '3 เดือนล่าสุด', granularities: ['week', 'month'] },
  { key: '12m', label: '12 เดือนล่าสุด', granularities: ['month'] },
];

const GRANULARITY_LABELS: Record<Granularity, string> = { day: 'แบบวัน', week: 'แบบสัปดาห์', month: 'แบบเดือน' };

const INCOME_COLOR = '#F7B584';
const EXPENSE_COLOR = '#F2A59B';
const NET_COLOR = '#E65F2B';

interface Bucket {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

const parseDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

const mondayKey = (dateKey: string) => {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toLocalDateKey(d);
};

function buildBuckets(range: RangeKey, granularity: Granularity, jobs: Job[], expenses: Expense[], settings: AppSettings): Bucket[] {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (range === '7d') start.setDate(start.getDate() - 6);
  if (range === '30d') start.setDate(start.getDate() - 29);
  if (range === '3m') start.setMonth(start.getMonth() - 2, 1);
  if (range === '12m') start.setMonth(start.getMonth() - 11, 1);

  const keys: string[] = [];
  const cursor = new Date(start);
  if (granularity === 'week') cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  if (granularity === 'month') cursor.setDate(1);
  while (cursor <= today) {
    keys.push(granularity === 'month' ? toLocalDateKey(cursor).slice(0, 7) : toLocalDateKey(cursor));
    if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  const startKey = toLocalDateKey(start);
  const bucketOf = (dateKey: string | null | undefined) => {
    if (!dateKey || dateKey.slice(0, 10) < startKey) return null;
    const day = dateKey.slice(0, 10);
    return granularity === 'day' ? day : granularity === 'week' ? mondayKey(day) : day.slice(0, 7);
  };

  const totals = new Map(keys.map(key => [key, { income: 0, expense: 0, expenseNames: [] as string[] }]));
  jobs.forEach(job => getJobPaymentEntries(job).forEach(entry => {
    const bucket = totals.get(bucketOf(entry.date) || '');
    if (bucket) bucket.income += entry.amount;
  }));
  expenses.forEach(expense => {
    const bucket = totals.get(bucketOf(expense.date) || '');
    if (bucket) {
      bucket.expense += expense.amount;
      bucket.expenseNames.push(expense.name);
    }
  });

  // Fixed costs are a monthly budget line with no date, so they only fit the monthly view -- and
  // only from the first month the account has any record, not for months before it existed.
  if (granularity === 'month') {
    const activityDates = [
      ...jobs.flatMap(job => [job.startDate, job.postDate, ...getJobPaymentEntries(job).map(entry => entry.date)]),
      ...expenses.map(expense => expense.date),
    ].filter((date): date is string => !!date).sort();
    const firstMonth = activityDates[0]?.slice(0, 7);
    totals.forEach((bucket, monthKey) => {
      if (firstMonth && monthKey >= firstMonth) {
        bucket.expense += fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, bucket.expenseNames);
      }
    });
  }

  return keys.map(key => {
    const bucket = totals.get(key)!;
    const date = parseDateKey(key);
    const label = granularity === 'month'
      ? date.toLocaleDateString(dateLocale(), { month: 'short', ...(range === '12m' && date.getMonth() === 0 ? { year: '2-digit' } : {}) })
      : date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
    return { key, label, income: bucket.income, expense: bucket.expense, net: bucket.income - bucket.expense };
  });
}

function ChartSelect<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        disabled={options.length < 2}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-[10px] border border-brand-border bg-brand-white py-1.5 pl-3 pr-8 text-xs text-brand-text outline-none transition-colors hover:bg-brand-faint focus-visible:border-[#E65F2B] disabled:cursor-default disabled:hover:bg-brand-white cursor-pointer"
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
    </div>
  );
}

export function IncomeExpenseChart({ jobs, expenses, settings }: { jobs: Job[]; expenses: Expense[]; settings: AppSettings }) {
  const [range, setRange] = React.useState<RangeKey>('7d');
  const [granularity, setGranularity] = React.useState<Granularity>('day');
  const rangeMeta = RANGES.find(r => r.key === range)!;

  const changeRange = (next: RangeKey) => {
    setRange(next);
    const allowed = RANGES.find(r => r.key === next)!.granularities;
    if (!allowed.includes(granularity)) setGranularity(allowed[0]);
  };

  const data = React.useMemo(
    () => buildBuckets(range, granularity, jobs, expenses, settings),
    [range, granularity, jobs, expenses, settings],
  );

  return (
    <div className="bg-brand-white border border-brand-border rounded-[14px] p-[18px]">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <h4 className="text-[15px] font-semibold text-brand-text">รายรับ-รายจ่าย</h4>
        <div className="flex items-center gap-2">
          <ChartSelect
            label="ช่วงเวลา"
            value={range}
            options={RANGES.map(r => ({ value: r.key, label: r.label }))}
            onChange={changeRange}
          />
          <ChartSelect
            label="ความละเอียด"
            value={granularity}
            options={rangeMeta.granularities.map(g => ({ value: g, label: GRANULARITY_LABELS[g] }))}
            onChange={setGranularity}
          />
        </div>
      </div>

      <div className="h-64 w-full text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barGap={3}>
            <CartesianGrid stroke="#dfd9cd" strokeOpacity={0.45} />
            <XAxis dataKey="label" stroke="#7D7772" fontSize={10} tickLine={false} axisLine={false} dy={8} interval="preserveStartEnd" minTickGap={8} />
            <YAxis stroke="#7D7772" fontSize={10} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => Number(v).toLocaleString('th-TH')} />
            <Tooltip
              cursor={{ fill: 'rgba(230, 95, 43, 0.05)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Bucket;
                return (
                  <div className="min-w-[170px] space-y-1.5 rounded-xl border border-brand-border bg-brand-white p-3 shadow-lg dark:bg-stone-900">
                    <p className="border-b border-brand-border/50 pb-1 text-xs font-semibold text-brand-text">{d.label}</p>
                    {[
                      { name: 'รายรับ', value: d.income, color: INCOME_COLOR },
                      { name: 'รายจ่าย', value: d.expense, color: EXPENSE_COLOR },
                      { name: 'ยอดสุทธิ', value: d.net, color: NET_COLOR },
                    ].map(row => (
                      <div key={row.name} className="flex items-center justify-between gap-4 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 text-brand-muted">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: row.color }} />
                          {row.name}
                        </span>
                        <span className="font-mono font-semibold text-brand-text">{formatCurrency(row.value)}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Bar dataKey="income" name="รายรับ" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expense" name="รายจ่าย" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line type="linear" dataKey="net" name="ยอดสุทธิ" stroke={NET_COLOR} strokeWidth={2.5} dot={{ r: 4, fill: NET_COLOR, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-brand-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: INCOME_COLOR }} />รายรับ</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: EXPENSE_COLOR }} />รายจ่าย</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: NET_COLOR }} />ยอดสุทธิ</span>
      </div>
      {granularity !== 'month' && (
        <p className="mt-2 text-[10px] text-brand-muted">
          แบบวัน/สัปดาห์นับเฉพาะรายจ่ายที่บันทึกไว้ ค่าใช้จ่ายคงที่รายเดือนจะรวมอยู่ในมุมมองแบบเดือน
        </p>
      )}
    </div>
  );
}
