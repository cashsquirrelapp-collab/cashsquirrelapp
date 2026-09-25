import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Job } from '../../../../shared/types';
import { getJobPaymentEntries, getJobPendingEntries } from '../../../../shared/installmentPayments';
import { formatCurrency, getMonthKey, formatMonthKey, safeFormatThaiDate } from '../../utils';
import {
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Users, Briefcase, Crown, AlertTriangle, UserPlus, TrendingUp, Clock, ArrowRight, BarChart3, PieChart as PieChartIcon, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';

interface InsightTabProps {
  jobs: Job[];
  onSwitchTab: (tabId: string) => void;
}

type PeriodOption = '3' | '6' | '12' | 'all';

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: '3', label: '3 เดือนล่าสุด' },
  { value: '6', label: '6 เดือนล่าสุด' },
  { value: '12', label: '12 เดือนล่าสุด' },
  { value: 'all', label: 'ทั้งหมด' }
];

interface Bucket {
  key: string;
  value: number;
  received: number;
  pending: number;
  count: number;
}

const TOP_N = 8;
// Kept separate from TOP_N -- a pie/donut only reads "at a glance" up to ~6 segments (per this
// app's dataviz guidelines), so it caps at fewer real categories than the bar chart before the
// rest fold into "อื่นๆ".
const PIE_N = 5;
const CONCENTRATION_RISK_THRESHOLD = 0.4;
const CHART_COLORS = ['#E65F2B', '#C96B5A', '#D98324', '#C17817', '#7A4419', '#A63F1B', '#557c72', '#7A5C43'];
// A CVD-validated categorical set (see scripts/validate_palette.js) used only for the pie/donut
// view -- unlike the bar chart, where each category is also identified by its axis text label,
// a pie's slices lean on color as the primary way to tell them apart at a glance, so this palette
// is held to the stricter separation bar than CHART_COLORS above.
const PIE_COLORS = ['#eb6834', '#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const OTHER_BUCKET_COLOR = '#a89689';

function clientKey(j: Job): string {
  return (j.client || '').trim() || 'ไม่ระบุลูกค้า';
}

function typeKey(j: Job): string {
  return (j.type || '').trim() || 'ยังไม่ระบุ';
}

function aggregate(
  jobs: Job[],
  keyFn: (j: Job) => string,
  receivedFn: (j: Job) => number = (j) => j.received || 0,
  pendingFn: (j: Job) => number = (j) => j.pending || 0
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const j of jobs) {
    const key = keyFn(j);
    const existing = map.get(key) || { key, value: 0, received: 0, pending: 0, count: 0 };
    existing.value += j.value || 0;
    existing.received += receivedFn(j);
    existing.pending += pendingFn(j);
    existing.count += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.received - a.received);
}

function topNWithRest(buckets: Bucket[], n: number): Bucket[] {
  if (buckets.length <= n) return buckets;
  const top = buckets.slice(0, n);
  const rest = buckets.slice(n);
  const restBucket = rest.reduce<Bucket>(
    (acc, b) => ({
      key: 'อื่นๆ',
      value: acc.value + b.value,
      received: acc.received + b.received,
      pending: acc.pending + b.pending,
      count: acc.count + b.count
    }),
    { key: 'อื่นๆ', value: 0, received: 0, pending: 0, count: 0 }
  );
  return [...top, restBucket];
}

const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }> = ({
  icon,
  label,
  value,
  sub
}) => (
  <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-2xl p-4 space-y-1">
    <div className="flex items-center gap-1.5 text-brand-muted">
      {icon}
      <span className="text-[9px] font-extrabold uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-base font-black font-mono text-brand-text dark:text-white">{value}</p>
    {sub && <p className="text-[9px] text-brand-muted">{sub}</p>}
  </div>
);

export const InsightTab: React.FC<InsightTabProps> = ({ jobs, onSwitchTab }) => {
  const [period, setPeriod] = useState<PeriodOption>('6');
  const [categoryChartMode, setCategoryChartMode] = useState<'bar' | 'pie'>('pie');
  // Which client/type bucket the user clicked on a chart, to drill into the list of jobs behind
  // it. `otherKeys` is only populated for the "อื่นๆ" bucket -- the real keys folded into it in
  // THIS chart (bar's top 8 vs pie's top 5 fold different sets into "Other"), so we know which
  // jobs to exclude rather than which to include.
  const [drilldown, setDrilldown] = useState<{ dimension: 'client' | 'type'; bucket: Bucket; otherKeys?: string[] } | null>(null);

  const periodCutoff = useMemo(() => {
    if (period === 'all') return null;
    const months = parseInt(period, 10);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    cutoff.setHours(0, 0, 0, 0);
    return cutoff;
  }, [period]);

  const filteredJobs = useMemo(() => {
    if (!periodCutoff) return jobs;
    return jobs.filter((j) => {
      const activityDates = [j.postDate || j.payDate, ...getJobPaymentEntries(j).map((entry) => entry.date), ...getJobPendingEntries(j).map((entry) => entry.date)].filter(Boolean) as string[];
      if (activityDates.length === 0) return true;
      return activityDates.some((dateStr) => new Date(dateStr + 'T00:00:00') >= periodCutoff);
    });
  }, [jobs, periodCutoff]);

  const receivedInPeriod = (job: Job) => getJobPaymentEntries(job).reduce((sum, entry) => {
    if (periodCutoff && (!entry.date || new Date(entry.date + 'T00:00:00') < periodCutoff)) return sum;
    return sum + entry.amount;
  }, 0);
  const pendingInPeriod = (job: Job) => getJobPendingEntries(job).reduce((sum, entry) => {
    if (periodCutoff && (!entry.date || new Date(entry.date + 'T00:00:00') < periodCutoff)) return sum;
    return sum + entry.amount;
  }, 0);

  const drilldownJobs = useMemo(() => {
    if (!drilldown) return [];
    const keyFn = drilldown.dimension === 'client' ? clientKey : typeKey;
    if (drilldown.bucket.key === 'อื่นๆ') {
      const otherKeys = new Set(drilldown.otherKeys || []);
      return filteredJobs.filter((j) => otherKeys.has(keyFn(j)));
    }
    return filteredJobs.filter((j) => keyFn(j) === drilldown.bucket.key);
  }, [drilldown, filteredJobs]);

  const byClient = useMemo(() => topNWithRest(aggregate(filteredJobs, clientKey, receivedInPeriod, pendingInPeriod), TOP_N), [filteredJobs, periodCutoff]);
  const byType = useMemo(() => topNWithRest(aggregate(filteredJobs, typeKey, receivedInPeriod, pendingInPeriod), TOP_N), [filteredJobs, periodCutoff]);
  // The top PIE_N entries here are always the same items, in the same order, as the first PIE_N
  // of byClient/byType above (both come from the same sorted aggregate() call) -- so a category's
  // color stays consistent whether you're looking at the bar or the pie view.
  const byClientPie = useMemo(() => topNWithRest(aggregate(filteredJobs, clientKey, receivedInPeriod, pendingInPeriod), PIE_N), [filteredJobs, periodCutoff]);
  const byTypePie = useMemo(() => topNWithRest(aggregate(filteredJobs, typeKey, receivedInPeriod, pendingInPeriod), PIE_N), [filteredJobs, periodCutoff]);

  const topClient = byClient.find((b) => b.key !== 'อื่นๆ');
  const totalReceived = filteredJobs.reduce((sum, j) => sum + receivedInPeriod(j), 0);
  const totalPending = filteredJobs.reduce((sum, j) => sum + pendingInPeriod(j), 0);
  const distinctClientCount = new Set(filteredJobs.map(clientKey)).size;

  const avgPerClient = distinctClientCount > 0 ? totalReceived / distinctClientCount : 0;
  const avgPerJob = filteredJobs.length > 0 ? totalReceived / filteredJobs.length : 0;

  const hoursStat = useMemo(() => {
    const hoursJobs = filteredJobs.filter((j) => (j.hoursSpent || 0) > 0);
    const totalHours = hoursJobs.reduce((s, j) => s + (j.hoursSpent || 0), 0);
    const totalRev = hoursJobs.reduce((s, j) => s + receivedInPeriod(j), 0);
    return totalHours > 0 ? totalRev / totalHours : null;
  }, [filteredJobs]);

  const unidentifiedCount = useMemo(() => filteredJobs.filter((j) => !(j.client || '').trim()).length, [filteredJobs]);

  const concentrationPct = topClient && totalReceived > 0 ? topClient.received / totalReceived : 0;

  const trendData = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of filteredJobs) {
      for (const entry of getJobPaymentEntries(j)) {
        if (!entry.date || (periodCutoff && new Date(entry.date + 'T00:00:00') < periodCutoff)) continue;
        const key = getMonthKey(entry.date);
        map.set(key, (map.get(key) || 0) + entry.amount);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, received]) => ({ month: key, monthLabel: formatMonthKey(key), received }));
  }, [filteredJobs, periodCutoff]);

  const retention = useMemo(() => {
    if (!periodCutoff) return null; // "ทั้งหมด" has no prior period to compare against
    const earliestByClient = new Map<string, Date>();
    for (const j of jobs) {
      const dateStr = j.postDate || j.payDate;
      if (!dateStr) continue;
      const key = clientKey(j);
      const d = new Date(dateStr + 'T00:00:00');
      const existing = earliestByClient.get(key);
      if (!existing || d < existing) earliestByClient.set(key, d);
    }
    const seenClients = new Set<string>();
    let newCount = 0;
    let newRevenue = 0;
    let recurringCount = 0;
    let recurringRevenue = 0;
    for (const j of filteredJobs) {
      const key = clientKey(j);
      const earliest = earliestByClient.get(key);
      const isNew = !earliest || earliest >= periodCutoff;
      if (isNew) newRevenue += receivedInPeriod(j);
      else recurringRevenue += receivedInPeriod(j);
      if (!seenClients.has(key)) {
        seenClients.add(key);
        if (isNew) newCount += 1;
        else recurringCount += 1;
      }
    }
    return { newCount, newRevenue, recurringCount, recurringRevenue };
  }, [jobs, filteredJobs, periodCutoff]);

  const effortRanking = useMemo(() => {
    const map = new Map<string, { type: string; received: number; hours: number }>();
    for (const j of filteredJobs) {
      if (!j.hoursSpent || j.hoursSpent <= 0) continue;
      const key = typeKey(j);
      const existing = map.get(key) || { type: key, received: 0, hours: 0 };
      existing.received += receivedInPeriod(j);
      existing.hours += j.hoursSpent;
      map.set(key, existing);
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, rate: e.hours > 0 ? e.received / e.hours : 0 }))
      .sort((a, b) => b.rate - a.rate);
  }, [filteredJobs]);

  const handleBucketClick = (dimension: 'client' | 'type', data: Bucket[], bucket: Bucket) => {
    if (bucket.key === 'อื่นๆ') {
      const shownKeys = new Set<string>(data.filter((b) => b.key !== 'อื่นๆ').map((b) => b.key));
      const keyFn = dimension === 'client' ? clientKey : typeKey;
      const otherKeys = Array.from(new Set<string>(filteredJobs.map(keyFn))).filter((k) => !shownKeys.has(k));
      setDrilldown({ dimension, bucket, otherKeys });
    } else {
      setDrilldown({ dimension, bucket });
    }
  };

  const renderBarChart = (data: Bucket[], title: string, icon: React.ReactNode, dimension: 'client' | 'type') => (
    <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
      <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-1">
        {icon}
        {title}
      </h3>
      {data.length > 0 && <p className="text-[10px] text-brand-muted mb-4">คลิกที่แท่งเพื่อดูรายการงาน</p>}
      {data.length === 0 ? (
        <p className="text-xs text-brand-muted text-center py-10">ยังไม่มีข้อมูลในช่วงเวลานี้</p>
      ) : (
        <div className="w-full text-xs font-bold" style={{ height: Math.max(220, data.length * 42) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfd9cd" opacity={0.3} horizontal={false} />
              <XAxis
                type="number"
                stroke="#4f5350"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`}
              />
              <YAxis type="category" dataKey="key" stroke="#4f5350" fontSize={10} tickLine={false} axisLine={false} width={110} />
              <Tooltip
                cursor={{ fill: 'rgba(230, 95, 43, 0.05)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as Bucket;
                    return (
                      <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 p-3.5 rounded-2xl shadow-lg space-y-1.5 min-w-[180px]">
                        <p className="text-xs font-black text-brand-text dark:text-white mb-1 border-b border-brand-border/40 pb-1">
                          {d.key}
                        </p>
                        <div className="flex justify-between gap-4 text-[11px]">
                          <span className="text-brand-muted font-bold">รับแล้ว:</span>
                          <span className="font-extrabold text-[#E65F2B] dark:text-[#FFA473] font-mono">{formatCurrency(d.received)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-[11px]">
                          <span className="text-brand-muted font-bold">ค้างรับ:</span>
                          <span className="font-extrabold text-brand-text dark:text-white font-mono">{formatCurrency(d.pending)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-brand-border/20">
                          <span className="text-brand-muted font-bold">จำนวนงาน:</span>
                          <span className="font-extrabold text-brand-text dark:text-white font-mono">{d.count} งาน</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="received"
                radius={[0, 6, 6, 0]}
                maxBarSize={26}
                style={{ cursor: 'pointer' }}
                onClick={(entry) => entry?.payload && handleBucketClick(dimension, data, entry.payload as Bucket)}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.key === 'อื่นๆ' ? OTHER_BUCKET_COLOR : CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  const renderPieChart = (data: Bucket[], title: string, icon: React.ReactNode, dimension: 'client' | 'type') => {
    const total = data.reduce((sum, d) => sum + d.received, 0);
    return (
      <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-1">
          {icon}
          {title}
        </h3>
        {data.length > 0 && <p className="text-[10px] text-brand-muted mb-4">คลิกที่ชิ้นหรือรายชื่อด้านล่างเพื่อดูรายการงาน</p>}
        {data.length === 0 ? (
          <p className="text-xs text-brand-muted text-center py-10">ยังไม่มีข้อมูลในช่วงเวลานี้</p>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <div className="relative w-full" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={data}
                    dataKey="received"
                    nameKey="key"
                    innerRadius="58%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                    style={{ cursor: 'pointer' }}
                    onClick={(entry) => entry?.payload && handleBucketClick(dimension, data, entry.payload as Bucket)}
                  >
                    {data.map((entry, index) => (
                      <Cell
                        key={`pie-cell-${index}`}
                        fill={entry.key === 'อื่นๆ' ? OTHER_BUCKET_COLOR : PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload as Bucket;
                        const pct = total > 0 ? Math.round((d.received / total) * 100) : 0;
                        return (
                          <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 p-3.5 rounded-2xl shadow-lg space-y-1.5 min-w-[180px]">
                            <p className="text-xs font-black text-brand-text dark:text-white mb-1 border-b border-brand-border/40 pb-1">
                              {d.key}
                            </p>
                            <div className="flex justify-between gap-4 text-[11px]">
                              <span className="text-brand-muted font-bold">รับแล้ว:</span>
                              <span className="font-extrabold text-[#E65F2B] dark:text-[#FFA473] font-mono">{formatCurrency(d.received)}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-[11px]">
                              <span className="text-brand-muted font-bold">สัดส่วน:</span>
                              <span className="font-extrabold text-brand-text dark:text-white font-mono">{pct}%</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
              {/* Center total -- a donut's hole is otherwise wasted space, and "how much in total"
                  is the one number every slice below is a fraction of. */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-brand-muted">รวม</span>
                <span className="text-sm font-black font-mono text-brand-text dark:text-white">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Legend doubles as the direct label -- color is never the only way to tell two
                slices apart here. */}
            <div className="w-full space-y-1.5">
              {data.map((d, index) => {
                const pct = total > 0 ? Math.round((d.received / total) * 100) : 0;
                return (
                  <button
                    type="button"
                    key={d.key}
                    onClick={() => handleBucketClick(dimension, data, d)}
                    className="w-full flex items-center justify-between gap-2 text-[11px] p-1 -m-1 rounded-lg hover:bg-brand-faint dark:hover:bg-neutral-800/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: d.key === 'อื่นๆ' ? OTHER_BUCKET_COLOR : PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="font-bold text-brand-text dark:text-neutral-200 truncate">{d.key}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono">
                      <span className="font-extrabold text-brand-text dark:text-white">{formatCurrency(d.received)}</span>
                      <span className="text-brand-muted">({pct}%)</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-content space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-black text-lg text-brand-text dark:text-white">วิเคราะห์รายได้เชิงลึก</h2>
          <p className="text-xs text-brand-muted mt-0.5">ดูว่าลูกค้าคนไหนหรืองานประเภทไหนทำเงินให้คุณมากที่สุด</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodOption)}
          className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Users className="w-3.5 h-3.5" />}
          label="รายรับเฉลี่ย/ลูกค้า"
          value={formatCurrency(avgPerClient)}
        />
        <StatTile icon={<Briefcase className="w-3.5 h-3.5" />} label="รายรับเฉลี่ย/งาน" value={formatCurrency(avgPerJob)} />
        <StatTile
          icon={<ArrowRight className="w-3.5 h-3.5" />}
          label="รับแล้ว / ค้างรับ"
          value={formatCurrency(totalReceived)}
          sub={`ค้างรับ ${formatCurrency(totalPending)}`}
        />
        <StatTile
          icon={<Clock className="w-3.5 h-3.5" />}
          label="฿/ชั่วโมงเฉลี่ย"
          value={hoursStat !== null ? formatCurrency(hoursStat) : '—'}
          sub={hoursStat === null ? 'ยังไม่มีข้อมูลชั่วโมง' : undefined}
        />
      </div>

      {/* Concentration risk & unidentified-client nudges */}
      {topClient && concentrationPct >= CONCENTRATION_RISK_THRESHOLD && (
        <div className="flex items-start gap-2.5 bg-pink-bg border border-pink-acc/15 rounded-2xl p-4">
          <AlertTriangle className="w-4.5 h-4.5 text-pink-acc shrink-0 mt-0.5" />
          <p className="text-xs text-pink-acc leading-relaxed">
            <span className="font-black">รายได้ {Math.round(concentrationPct * 100)}% มาจากลูกค้าเจ้าเดียว ({topClient.key})</span>
            <br />
            ลองกระจายฐานลูกค้าเพิ่มเติมเพื่อลดความเสี่ยงหากลูกค้ารายนี้หายไป
          </p>
        </div>
      )}
      {unidentifiedCount > 0 && (
        <div className="flex items-center gap-2.5 bg-brand-faint dark:bg-neutral-800/40 border border-brand-border/40 dark:border-neutral-800 rounded-2xl p-4">
          <UserPlus className="w-4.5 h-4.5 text-brand-muted shrink-0" />
          <p className="text-xs text-brand-text dark:text-neutral-200 leading-relaxed flex-1">
            มี {unidentifiedCount} งานที่ยังไม่ได้ระบุชื่อลูกค้า ระบุให้ครบเพื่อให้การวิเคราะห์แม่นยำขึ้น
          </p>
          <button
            type="button"
            onClick={() => onSwitchTab('jobs')}
            className="shrink-0 text-[11px] font-black text-[#E65F2B] dark:text-[#FFA473] hover:underline cursor-pointer flex items-center gap-0.5"
          >
            ไปที่งานดีล <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Top client hero card */}
      {topClient ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#3D2314] dark:bg-[#261810] text-white rounded-3xl p-6 flex items-center gap-4 relative overflow-hidden"
        >
          <div className="absolute -right-6 -top-6 opacity-10">
            <Crown className="w-32 h-32" />
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#E65F2B]/20 flex items-center justify-center shrink-0 relative">
            <Crown className="w-7 h-7 text-[#FFA473]" />
          </div>
          <div className="min-w-0 relative">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/60">ลูกค้าอันดับ 1 ของช่วงนี้</p>
            <p className="text-lg font-display font-black truncate">{topClient.key}</p>
            <p className="text-sm font-mono font-black text-[#FFA473] mt-0.5">
              {formatCurrency(topClient.received)}
              <span className="text-[10px] font-sans font-bold text-white/50 ml-1.5">
                ({totalReceived > 0 ? Math.round((topClient.received / totalReceived) * 100) : 0}% ของรายรับทั้งหมด)
              </span>
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="bg-brand-faint dark:bg-neutral-800/40 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-8 text-center">
          <Mascot mood="wave" size={56} className="mx-auto mb-3" />
          <p className="text-xs text-brand-muted">ยังไม่มีข้อมูลรายรับในช่วงเวลานี้ ลองเปลี่ยนช่วงเวลาดูครับ</p>
        </div>
      )}

      {/* Revenue trend over time */}
      <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-5">
          <TrendingUp className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
          แนวโน้มรายรับรายเดือน
        </h3>
        {trendData.length === 0 ? (
          <p className="text-xs text-brand-muted text-center py-10">ยังไม่มีข้อมูลในช่วงเวลานี้</p>
        ) : (
          <div className="h-64 w-full text-xs font-bold">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dfd9cd" opacity={0.3} vertical={false} />
                <XAxis dataKey="monthLabel" stroke="#4f5350" fontSize={10} tickLine={false} axisLine={false} dy={8} />
                <YAxis
                  stroke="#4f5350"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(230, 95, 43, 0.05)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload as { monthLabel: string; received: number };
                      return (
                        <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 p-3.5 rounded-2xl shadow-lg space-y-1.5 min-w-[160px]">
                          <p className="text-xs font-black text-brand-text dark:text-white mb-1 border-b border-brand-border/40 pb-1">
                            {d.monthLabel}
                          </p>
                          <div className="flex justify-between gap-4 text-[11px]">
                            <span className="text-brand-muted font-bold">รับแล้ว:</span>
                            <span className="font-extrabold text-[#E65F2B] dark:text-[#FFA473] font-mono">{formatCurrency(d.received)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="received" fill="#E65F2B" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* By-client / by-job-type charts */}
      <div className="space-y-3">
        <div className="flex items-center justify-end">
          <div className="flex items-center bg-brand-faint dark:bg-stone-850 border border-brand-border dark:border-neutral-800 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setCategoryChartMode('pie')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                categoryChartMode === 'pie'
                  ? 'bg-brand-white dark:bg-stone-700 text-brand-text dark:text-white shadow-xs'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" /> วงกลม
            </button>
            <button
              type="button"
              onClick={() => setCategoryChartMode('bar')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                categoryChartMode === 'bar'
                  ? 'bg-brand-white dark:bg-stone-700 text-brand-text dark:text-white shadow-xs'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> แท่ง
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {categoryChartMode === 'bar'
            ? renderBarChart(byClient, 'รายรับตามลูกค้า', <Users className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />, 'client')
            : renderPieChart(byClientPie, 'รายรับตามลูกค้า', <Users className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />, 'client')}
          {categoryChartMode === 'bar'
            ? renderBarChart(byType, 'รายรับตามประเภทงาน', <Briefcase className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />, 'type')
            : renderPieChart(byTypePie, 'รายรับตามประเภทงาน', <Briefcase className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />, 'type')}
        </div>
      </div>

      {/* Client retention */}
      {retention && (
        <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
          <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-5">
            <UserPlus className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
            ลูกค้าใหม่ vs. ลูกค้าเดิม
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-brand-faint dark:bg-neutral-800/40 rounded-2xl p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-muted">ลูกค้าใหม่</p>
              <p className="text-lg font-black font-mono text-brand-text dark:text-white mt-0.5">{retention.newCount} ราย</p>
              <p className="text-[10px] text-brand-muted mt-0.5">{formatCurrency(retention.newRevenue)}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-2xl p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">ลูกค้าเดิม (ซื้อซ้ำ)</p>
              <p className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">{retention.recurringCount} ราย</p>
              <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">{formatCurrency(retention.recurringRevenue)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Effort vs Return */}
      <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-1">
          <Clock className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
          ความคุ้มค่าต่อชั่วโมง (฿/ชม.) ตามประเภทงาน
        </h3>
        <p className="text-[11px] text-brand-muted mb-4">รู้ว่างานประเภทไหนทำแล้วได้เงินเยอะแต่ใช้เวลาน้อย</p>
        {effortRanking.length === 0 ? (
          <p className="text-xs text-brand-muted text-center py-8">
            ยังไม่มีข้อมูลชั่วโมงที่ใช้ ลองกรอกตอนเพิ่ม/แก้ไขงานดีลได้เลย
          </p>
        ) : (
          <div className="space-y-2">
            {effortRanking.map((e, i) => (
              <div
                key={e.type}
                className="flex items-center justify-between gap-3 p-3 bg-brand-faint dark:bg-neutral-800/40 rounded-2xl"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-[#E65F2B]/10 text-[#E65F2B] dark:text-[#FFA473] text-[10px] font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs font-bold text-brand-text dark:text-neutral-200 truncate">{e.type}</span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black font-mono text-[#E65F2B] dark:text-[#FFA473]">{formatCurrency(e.rate)}/ชม.</p>
                  <p className="text-[9px] text-brand-muted">{e.hours} ชม. รวม</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drilldown: which jobs make up the client/type bucket the user just clicked */}
      <AnimatePresence>
        {drilldown && (
          <div className="fixed inset-0 z-200">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrilldown(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl shadow-2xl p-6 overflow-y-auto max-h-[85vh] space-y-4 border-t border-brand-border/40"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mx-auto mb-1 shrink-0" />

              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <span className="text-[9px] font-black tracking-wider text-[#E65F2B] dark:text-[#FFA473] uppercase">
                    {drilldown.dimension === 'client' ? 'ลูกค้า' : 'ประเภทงาน'}
                  </span>
                  <h3 className="text-lg font-black text-brand-text dark:text-white font-display mt-0.5 truncate">
                    {drilldown.bucket.key}
                  </h3>
                </div>
                <button
                  onClick={() => setDrilldown(null)}
                  className="w-8 h-8 shrink-0 rounded-full bg-brand-faint dark:bg-stone-850 hover:bg-brand-border/40 text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-brand-faint dark:bg-neutral-800/40 rounded-xl p-3">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-muted">จำนวนงาน</p>
                  <p className="text-sm font-black font-mono text-brand-text dark:text-white mt-0.5">{drilldownJobs.length} งาน</p>
                </div>
                <div className="bg-brand-faint dark:bg-neutral-800/40 rounded-xl p-3">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-muted">รับแล้ว</p>
                  <p className="text-sm font-black font-mono text-[#E65F2B] dark:text-[#FFA473] mt-0.5">
                    {formatCurrency(drilldownJobs.reduce((s, j) => s + (j.received || 0), 0))}
                  </p>
                </div>
                <div className="bg-brand-faint dark:bg-neutral-800/40 rounded-xl p-3">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-muted">ค้างรับ</p>
                  <p className="text-sm font-black font-mono text-brand-text dark:text-white mt-0.5">
                    {formatCurrency(drilldownJobs.reduce((s, j) => s + (j.pending || 0), 0))}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {drilldownJobs.map((j) => (
                  <div
                    key={j.id}
                    className="p-3 bg-brand-faint dark:bg-neutral-800/40 rounded-2xl border border-brand-border/30 dark:border-neutral-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-brand-text dark:text-white truncate">{j.name}</p>
                        <p className="text-[10px] text-brand-muted mt-0.5">
                          {drilldown.dimension === 'client' ? (j.type || 'ยังไม่ระบุ') : (j.client || 'ไม่ระบุลูกค้า')}
                          {(j.postDate || j.payDate) && ` · ${safeFormatThaiDate(j.postDate || j.payDate, { day: 'numeric', month: 'short', year: '2-digit' })}`}
                        </p>
                      </div>
                      <p className="text-xs font-black font-mono text-brand-text dark:text-white shrink-0">{formatCurrency(j.received)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setDrilldown(null);
                  onSwitchTab('jobs');
                }}
                className="w-full py-3 bg-brand-faint dark:bg-stone-850 hover:bg-brand-border/40 text-brand-text dark:text-neutral-200 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                ไปที่งานดีล <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
