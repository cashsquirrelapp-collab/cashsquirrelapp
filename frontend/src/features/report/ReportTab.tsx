import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowRight, ChevronDown, Download, Lock, X } from 'lucide-react';
import { Job } from '../../../../shared/types';
import { csvCell, exportJobsToCSV, formatAxisBaht, formatCurrency, formatMonthKey, safeFormatThaiDate, toLocalDateKey } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';
import PageHeader from '../../components/ui/PageHeader';
import { uiSurface } from '../../components/ui/uiStyles';
import { IncomeExportDialog } from './IncomeExport';
import { AGING_LABELS, UNNAMED_CLIENT, buildReport, creditAging, jobsInBucket, type AgingKey, type Bucket, type Report, type ReportPeriod } from './reportData';

import { tr, T } from '../../i18n/tr';
// รายงาน: looking back. Where job income came from (clients, job types), how it moved month to
// month, and when the money still owed falls due. Current to-dos stay on the dashboard and
// following up on payments stays in เงินที่ยังไม่ได้รับ.

export type ViewKey = 'overview' | 'clients' | 'types' | 'credit';

interface ReportTabProps {
  jobs: Job[];
  onSwitchTab: (tabId: string) => void;
  /** Members get period filters, job drill-down and client mix; others see all-time figures. */
  isPro: boolean;
  onUpgrade?: () => void;
  initialView?: ViewKey;
  triggerAlert?: (title: string, message: string) => void;
}

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'overview', label: T("ภาพรวม") },
  { key: 'clients', label: T("ลูกค้า") },
  { key: 'types', label: T("ประเภทงาน") },
  { key: 'credit', label: T("ระยะเวลารับเงิน") },
];

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: '3', label: T("3 เดือน") },
  { key: '6', label: T("6 เดือน") },
  { key: '12', label: T("12 เดือน") },
  { key: 'all', label: T("ทั้งหมด") },
];

const TOP_N = 8;
const CONCENTRATION_THRESHOLD = 0.4;

const card = uiSurface;
const chip = (active: boolean) => `inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-3.5 text-xs font-medium transition-colors cursor-pointer ${active
  ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`;
const shortMonth = (key: string) => safeFormatThaiDate(`${key}-01`, { month: 'short' });
const pct = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;

function topWithRest(buckets: Bucket[]): Bucket[] {
  if (buckets.length <= TOP_N) return buckets;
  const rest = buckets.slice(TOP_N).reduce((acc, b) => ({ key: 'อื่นๆ', received: acc.received + b.received, count: acc.count + b.count }), { key: 'อื่นๆ', received: 0, count: 0 });
  return [...buckets.slice(0, TOP_N), rest];
}

function exportReportCSV(report: Report, periodLabel: string): boolean {
  if (report.jobCount === 0) return false;
  const cell = csvCell;
  const lines = [
    [tr("รายงาน ({0})", periodLabel)].join(','),
    '',
    [tr("รายได้จากงาน"), tr("จำนวนงาน"), tr("เฉลี่ยต่องาน"), tr("ลูกค้า / ผู้จ่าย")].join(','),
    [report.totalReceived, report.jobCount, Math.round(report.avgPerJob), report.clientCount].join(','),
    '',
    [tr("เดือน"), tr("รายได้ที่รับ (บาท)"), tr("งานที่รับเงิน")].join(','),
    ...report.months.map(m => [cell(formatMonthKey(m.monthKey)), m.received, m.paidJobs].join(',')),
    '',
    [tr("ลูกค้า / ผู้จ่าย"), tr("รายได้ที่รับ (บาท)"), tr("จำนวนงาน")].join(','),
    ...report.byClient.map(b => [cell(tr(b.key)), b.received, b.count].join(',')),
    '',
    [tr("ประเภทงาน"), tr("รายได้ที่รับ (บาท)"), tr("จำนวนงาน"), tr("เฉลี่ยต่องาน (บาท)")].join(','),
    ...report.byType.map(b => [cell(tr(b.key)), b.received, b.count, Math.round(b.count ? b.received / b.count : 0)].join(',')),
  ];
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = tr("รายงาน_{0}_{1}.csv", periodLabel, toLocalDateKey());
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

export default function ReportTab({ jobs, onSwitchTab, isPro, onUpgrade, initialView, triggerAlert }: ReportTabProps) {
  const [view, setView] = useState<ViewKey>(initialView ?? 'overview');
  const [period, setPeriod] = useState<ReportPeriod>(isPro ? '6' : 'all');
  const [exportOpen, setExportOpen] = useState(false);
  const [incomeExportOpen, setIncomeExportOpen] = useState(false);
  const [drill, setDrill] = useState<{ dimension: 'client' | 'type'; key: string } | null>(null);
  const report = useMemo(() => buildReport(jobs, period), [jobs, period]);
  const periodLabel = tr(PERIODS.find(p => p.key === period)?.label ?? '');
  const alert = (title: string, message: string) => triggerAlert ? triggerAlert(title, message) : window.alert(`${title}\n${message}`);

  React.useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('[data-report-export]')) setExportOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [exportOpen]);

  const choosePeriod = (key: ReportPeriod) => {
    if (!isPro && key !== 'all') { onUpgrade?.(); return; }
    setPeriod(key);
  };
  const openDrill = isPro ? (dimension: 'client' | 'type', key: string) => { if (key !== 'อื่นๆ') setDrill({ dimension, key }); } : undefined;
  const empty = report.jobCount === 0;

  return (
    <div className="page-content space-y-4">
      <PageHeader page="report">
        <div className="relative shrink-0" data-report-export>
          <button type="button" onClick={() => setExportOpen(v => !v)} aria-haspopup="menu" aria-expanded={exportOpen} aria-label={tr("ส่งออก")}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
            <Download className="h-4 w-4" /><span>{tr("ส่งออก")}</span><ChevronDown className="h-3.5 w-3.5 text-brand-muted" />
          </button>
          {exportOpen && (
            <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 lg-glass is-menu rounded-[20px] p-1.5 sm:left-auto sm:right-0">
              {[
                { label: tr("รายรับรายเดือน / ทั้งปี (Excel)"), run: () => setIncomeExportOpen(true) },
                { label: tr("สรุปรายงาน {0} (CSV)", periodLabel), run: () => { if (!exportReportCSV(report, periodLabel)) alert(tr("ไม่พบข้อมูล"), tr("ยังไม่มีงานในช่วงเวลานี้")); } },
                { label: tr("ข้อมูลงานทั้งหมด (CSV)"), run: () => { if (!exportJobsToCSV(jobs)) alert(tr("ไม่พบข้อมูล"), tr("ยังไม่มีข้อมูลงานสำหรับส่งออก")); } },
              ].map(item => (
                <button key={tr(item.label)} type="button" role="menuitem" onClick={() => { setExportOpen(false); item.run(); }}
                  className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-brand-text hover:bg-brand-faint cursor-pointer">{tr(item.label)}</button>
              ))}
              <p className="px-3 pb-1 pt-1.5 text-[11px] leading-relaxed text-brand-muted">{tr("ไฟล์ Excel (.xlsx) รายเดือนส่งให้ทางอีเมลทุกต้นเดือน")}</p>
            </div>
          )}
        </div>
      </PageHeader>
      <IncomeExportDialog open={incomeExportOpen} jobs={jobs} onClose={() => setIncomeExportOpen(false)} notify={alert} />

      {/* Period (not for ระยะเวลารับเงิน, which is always "as of today") + tabs */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:px-0" role="tablist" aria-label={tr("หมวดรายงาน")}>
          {VIEWS.map(v => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)} className={chip(view === v.key)}>{tr(v.label)}</button>
          ))}
        </div>
        {view !== 'credit' && (
          <div className="flex w-fit items-center gap-0.5 rounded-xl border border-brand-border bg-brand-white p-0.5" role="radiogroup" aria-label={tr("ช่วงเวลา")}>
            {PERIODS.map(p => (
              <button key={p.key} type="button" role="radio" aria-checked={period === p.key} onClick={() => choosePeriod(p.key)}
                className={`flex h-8 items-center gap-1 rounded-[10px] px-3 text-xs font-medium transition-colors cursor-pointer ${period === p.key
                  ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'text-brand-muted hover:text-brand-text'}`}>
                {!isPro && p.key !== 'all' && <Lock className="h-3 w-3" />}{tr(p.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {view !== 'credit' && empty ? (
        <EmptyPeriod canChange={isPro && period !== 'all'} onShowAll={() => setPeriod('all')} onJobs={() => onSwitchTab('jobs')} />
      ) : view === 'overview' ? (
        <Overview report={report} />
      ) : view === 'clients' ? (
        <Clients report={report} period={period} isPro={isPro} onUpgrade={onUpgrade} onDrill={openDrill} onJobs={() => onSwitchTab('jobs')} />
      ) : view === 'types' ? (
        <Types report={report} onDrill={openDrill} />
      ) : (
        <Credit jobs={jobs} onOpenReceivables={() => onSwitchTab('receivables')} />
      )}

      {drill && <DrillPanel jobs={jobsInBucket(jobs, period, drill.dimension, drill.key)} title={tr(drill.key)} subtitle={tr("{0} · {1}", drill.dimension === 'client' ? tr("งานของลูกค้านี้") : tr("งานประเภทนี้"), periodLabel)} onClose={() => setDrill(null)} />}
    </div>
  );
}

function EmptyPeriod({ canChange, onShowAll, onJobs }: { canChange: boolean; onShowAll: () => void; onJobs: () => void }) {
  return (
    <div className={`${card} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
      <Mascot mood="thinking" size={56} />
      <p className="mt-1 text-sm font-medium text-brand-text">{tr("ยังมีข้อมูลไม่พอสำหรับรายงานช่วงนี้")}</p>
      <div className="mt-1 flex gap-2">
        {canChange && <button type="button" onClick={onShowAll} className="h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text hover:bg-brand-faint cursor-pointer">{tr("ดูทั้งหมด")}</button>}
        <button type="button" onClick={onJobs} className="h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text hover:bg-brand-faint cursor-pointer">{tr("ดูงาน")}</button>
      </div>
    </div>
  );
}

function SummaryStrip({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className={`${card} grid grid-cols-2 gap-y-3 px-4 py-3.5 sm:grid-cols-4 sm:divide-x sm:divide-brand-border sm:px-0`}>
      {items.map(item => (
        <div key={tr(item.label)} className="min-w-0 sm:px-5">
          <dt className="text-xs text-brand-muted">{tr(item.label)}</dt>
          <dd className="mt-0.5 truncate font-mono text-lg font-semibold text-brand-text sm:text-xl">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Fact({ label, title, value, sub }: { label: string; title: string; value?: string; sub?: string }) {
  return (
    <div className={`${card} min-w-0 px-4 py-3.5`}>
      <p className="text-xs text-brand-muted">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold text-brand-text">{title}</p>
      {value && <p className="mt-0.5 font-mono text-[13px] text-brand-text">{value}{sub && <span className="ml-1.5 font-sans text-xs text-brand-muted">{sub}</span>}</p>}
    </div>
  );
}

function Overview({ report }: { report: Report }) {
  const [tableOpen, setTableOpen] = useState(false);
  const topClient = report.byClient.find(b => b.key !== UNNAMED_CLIENT && b.received > 0);
  const topType = report.byType.find(b => b.received > 0);
  return (
    <>
      <SummaryStrip items={[
        { label: tr("รายได้จากงาน"), value: formatCurrency(report.totalReceived) },
        { label: tr("จำนวนงาน"), value: report.jobCount.toLocaleString() },
        { label: tr("เฉลี่ยต่องาน"), value: formatCurrency(report.avgPerJob) },
        { label: tr("ลูกค้า / ผู้จ่าย"), value: report.clientCount.toLocaleString() },
      ]} />

      <section className={`${card} p-4 sm:p-5`} aria-label={tr("แนวโน้มรายได้จากงาน")}>
        <h2 className="mb-3 text-[15px] font-semibold text-brand-text">{tr("แนวโน้มรายได้จากงาน")}</h2>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.months.map(m => ({ ...m, label: shortMonth(m.monthKey) }))} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-brand-border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--color-brand-muted)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis stroke="var(--color-brand-muted)" fontSize={11} tickLine={false} axisLine={false} tickCount={4} tickFormatter={(v) => formatAxisBaht(Number(v))} />
              <Tooltip cursor={{ fill: 'var(--color-brand-faint)' }} formatter={(v) => [formatCurrency(Number(v ?? 0)), tr("รายได้")]}
                labelFormatter={(_, payload) => payload?.[0] ? formatMonthKey(payload[0].payload.monthKey) : ''}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--color-brand-border)', background: 'var(--color-brand-white)', fontSize: 12 }} />
              <Bar dataKey="received" fill="#E65F2B" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label={tr("ลูกค้าที่สร้างรายได้สูงสุด")} title={topClient ? tr(topClient.key) : '—'} value={topClient ? formatCurrency(topClient.received) : undefined} sub={topClient ? tr("{0}% ของรายได้", pct(topClient.received, report.totalReceived)) : undefined} />
        <Fact label={tr("ประเภทงานที่สร้างรายได้สูงสุด")} title={topType ? tr(topType.key) : '—'} value={topType ? formatCurrency(topType.received) : undefined} sub={topType ? tr("{0} งาน", topType.count) : undefined} />
      </div>

      <section className={card}>
        <button type="button" onClick={() => setTableOpen(v => !v)} aria-expanded={tableOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[13px] font-medium text-brand-text hover:bg-brand-faint/60 cursor-pointer rounded-2xl">
          {tr("ดูรายละเอียด {0} เดือน", report.months.length)}<ChevronDown className={`h-4 w-4 text-brand-muted transition-transform ${tableOpen ? 'rotate-180' : ''}`} />
        </button>
        {tableOpen && (
          <table className="w-full border-t border-brand-border text-left text-[13px]">
            <thead><tr className="text-xs text-brand-muted">
              <th className="px-4 py-2 font-medium">{tr("เดือน")}</th>
              <th className="px-4 py-2 text-right font-medium">{tr("รายได้ที่รับ")}</th>
              <th className="px-4 py-2 text-right font-medium">{tr("งานที่รับเงิน")}</th>
            </tr></thead>
            <tbody>
              {[...report.months].reverse().map(m => (
                <tr key={m.monthKey} className="border-t border-brand-border">
                  <td className="px-4 py-2 text-brand-text">{formatMonthKey(m.monthKey)}</td>
                  <td className="px-4 py-2 text-right font-mono text-brand-text">{formatCurrency(m.received)}</td>
                  <td className="px-4 py-2 text-right text-brand-muted">{m.paidJobs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function RankingBars({ buckets, total, onPick, meta }: { buckets: Bucket[]; total: number; onPick?: (key: string) => void; meta?: (b: Bucket) => string }) {
  const max = buckets.reduce((m, b) => Math.max(m, b.received), 0);
  return (
    <ul className="space-y-0.5">
      {buckets.map(b => {
        const clickable = Boolean(onPick) && b.key !== 'อื่นๆ';
        const body = (
          <>
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-[13px] text-brand-text">{tr(b.key)}</span>
                {meta && <span className="shrink-0 text-[11px] text-brand-muted">{meta(b)}</span>}
              </span>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-brand-faint">
                <span className="block h-full rounded-full bg-[#E65F2B]" style={{ width: `${max > 0 ? Math.max(b.received > 0 ? 2 : 0, (b.received / max) * 100) : 0}%`, opacity: b.key === 'อื่นๆ' ? 0.45 : 1 }} />
              </span>
            </span>
            <span className="flex items-baseline justify-end gap-2 self-end">
              <span className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(b.received)}</span>
              <span className="w-9 text-right text-[11px] text-brand-muted">{pct(b.received, total)}%</span>
            </span>
          </>
        );
        const cls = 'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-xl px-2 py-2 text-left';
        return (
          <li key={b.key}>
            {clickable
              ? <button type="button" onClick={() => onPick?.(b.key)} className={`${cls} transition-colors hover:bg-brand-faint cursor-pointer`}>{body}</button>
              : <div className={cls}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function ProNote({ text, onUpgrade }: { text: string; onUpgrade?: () => void }) {
  return (
    <button type="button" onClick={onUpgrade} className={`${card} flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs text-brand-muted hover:bg-brand-faint/60 cursor-pointer`}>
      <span className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 shrink-0" />{text}</span>
      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#C24A16] dark:text-orange-300">{tr("อัปเกรด")}{' '}<ArrowRight className="h-3.5 w-3.5" /></span>
    </button>
  );
}

function Clients({ report, period, isPro, onUpgrade, onDrill, onJobs }: {
  report: Report; period: ReportPeriod; isPro: boolean; onUpgrade?: () => void; onDrill?: (d: 'client', key: string) => void; onJobs: () => void;
}) {
  const topClient = report.byClient.find(b => b.key !== UNNAMED_CLIENT && b.received > 0);
  const r = report.retention;
  const retentionTotal = r ? r.newClients + r.repeatClients : 0;
  return (
    <>
      <section className={`${card} p-4 sm:p-5`} aria-label={tr("รายได้ตามลูกค้า / ผู้จ่าย")}>
        <h2 className="text-[15px] font-semibold text-brand-text">{tr("รายได้ตามลูกค้า / ผู้จ่าย")}</h2>
        <p className="mb-3 mt-0.5 text-xs text-brand-muted">{onDrill ? tr("กดที่ชื่อเพื่อดูงานของลูกค้านั้น") : tr("เรียงจากรายได้มากไปน้อย")}</p>
        <RankingBars buckets={topWithRest(report.byClient)} total={report.totalReceived} onPick={onDrill ? (key) => onDrill('client', key) : undefined} meta={(b) => tr("{0} งาน", b.count)} />
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Fact label={tr("ลูกค้าสูงสุด")} title={topClient ? tr(topClient.key) : '—'} value={topClient ? formatCurrency(topClient.received) : undefined} />
        <Fact label={tr("เฉลี่ยต่อลูกค้า")} title={formatCurrency(report.avgPerClient)} sub={tr("{0} ราย", report.clientCount)} />
        {isPro ? (
          r && retentionTotal > 0 ? (
            <div className={`${card} px-4 py-3.5`}>
              <p className="text-xs text-brand-muted">{tr("ลูกค้าเดิม vs ลูกค้าใหม่")}</p>
              <p className="mt-1 text-[15px] font-semibold text-brand-text">{tr("เดิม {0}% · ใหม่ {1}%", pct(r.repeatClients, retentionTotal), pct(r.newClients, retentionTotal))}</p>
              <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#F2CC6B]/60">
                <span className="h-full bg-[#E65F2B]" style={{ width: `${pct(r.repeatClients, retentionTotal)}%` }} />
              </span>
              <p className="mt-1.5 text-[11px] text-brand-muted">{tr("เดิม {0} ราย · ใหม่ {1} ราย", r.repeatClients, r.newClients)}</p>
            </div>
          ) : (
            <Fact label={tr("ลูกค้าเดิม vs ลูกค้าใหม่")} title="—" sub={period === 'all' ? tr("เลือก 3/6/12 เดือนเพื่อเทียบ") : undefined} />
          )
        ) : null}
      </div>
      {!isPro && <ProNote text={tr("ดูลูกค้าเดิม vs ใหม่ เลือกช่วงเวลา และกดดูงานของแต่ละลูกค้า")} onUpgrade={onUpgrade} />}

      {isPro && topClient && report.concentration >= CONCENTRATION_THRESHOLD && (
        <p className="rounded-2xl border border-[#F1DDB0] bg-[#FFF8E8] px-4 py-3 text-[13px] text-[#7A5A12] dark:border-[#E8B84A]/25 dark:bg-[#E8B84A]/10 dark:text-[#F3D28A]">
          {tr("รายได้ {0}% มาจาก {1} รายเดียว", pct(topClient.received, report.totalReceived), topClient.key)}</p>
      )}
      {report.unnamedClientJobs > 0 && (
        <button type="button" onClick={onJobs} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-faint px-4 py-3 text-left text-xs text-brand-muted hover:text-brand-text cursor-pointer">
          <span>{tr("มี {0} งานที่ยังไม่ได้ระบุชื่อลูกค้า", report.unnamedClientJobs)}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[#C24A16] dark:text-orange-300">{tr("ไปที่งาน")}{' '}<ArrowRight className="h-3.5 w-3.5" /></span>
        </button>
      )}
    </>
  );
}

function Types({ report, onDrill }: { report: Report; onDrill?: (d: 'type', key: string) => void }) {
  const earning = report.byType.filter(b => b.received > 0);
  const topType = earning[0];
  const bestAvg = [...earning].sort((a, b) => b.received / b.count - a.received / a.count)[0];
  return (
    <>
      <section className={`${card} p-4 sm:p-5`} aria-label={tr("รายได้ตามประเภทงาน")}>
        <h2 className="text-[15px] font-semibold text-brand-text">{tr("รายได้ตามประเภทงาน")}</h2>
        <p className="mb-3 mt-0.5 text-xs text-brand-muted">{tr("งานแบบไหนสร้างรายได้ให้คุณมากที่สุด")}</p>
        <RankingBars buckets={topWithRest(report.byType)} total={report.totalReceived} onPick={onDrill ? (key) => onDrill('type', key) : undefined}
          meta={(b) => tr("{0} งาน · เฉลี่ย {1}", b.count, formatCurrency(b.count ? b.received / b.count : 0))} />
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label={tr("ประเภทที่สร้างรายได้สูงสุด")} title={topType ? tr(topType.key) : '—'} value={topType ? formatCurrency(topType.received) : undefined} sub={topType ? tr("{0} งาน", topType.count) : undefined} />
        <Fact label={tr("ประเภทที่เฉลี่ยต่องานสูงสุด")} title={bestAvg ? tr(bestAvg.key) : '—'} value={bestAvg ? tr("{0} / งาน", formatCurrency(bestAvg.received / bestAvg.count)) : undefined} sub={bestAvg ? tr("จาก {0} งาน", bestAvg.count) : undefined} />
      </div>
    </>
  );
}

const AGING_COLORS: Record<AgingKey, string> = {
  overdue: '#D64545', today: '#E65F2B', within7: '#F08A4B', within14: '#F2B36B', within30: '#C9BFB5', later: '#DDD6CF', undated: '#DDD6CF',
};

function Credit({ jobs, onOpenReceivables }: { jobs: Job[]; onOpenReceivables: () => void }) {
  const aging = useMemo(() => creditAging(jobs, toLocalDateKey()), [jobs]);
  const overdue = aging.buckets.find(b => b.key === 'overdue')?.amount ?? 0;
  const max = aging.buckets.reduce((m, b) => Math.max(m, b.amount), 0);
  return (
    <>
      <SummaryStrip items={[
        { label: tr("ยอดที่ยังรอรับ"), value: formatCurrency(aging.total) },
        { label: tr("จำนวนงาน"), value: aging.count.toLocaleString() },
        { label: tr("เกินกำหนด"), value: <span className={overdue > 0 ? 'text-[#C43A3A] dark:text-rose-300' : ''}>{formatCurrency(overdue)}</span> },
        { label: tr("ครบกำหนดใน 7 วัน"), value: formatCurrency(aging.buckets.filter(b => b.key === 'today' || b.key === 'within7').reduce((s, b) => s + b.amount, 0)) },
      ]} />
      <section className={`${card} p-4 sm:p-5`} aria-label={tr("ช่วงเวลาที่เงินควรเข้า")}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-brand-text">{tr("ช่วงเวลาที่เงินควรเข้า")}</h2>
            <p className="mt-0.5 text-xs text-brand-muted">{tr("ยอดที่ยังรอรับ แยกตามวันครบกำหนด ณ วันนี้")}</p>
          </div>
          <button type="button" onClick={onOpenReceivables} className="inline-flex items-center gap-1 text-xs font-medium text-[#C24A16] hover:underline cursor-pointer dark:text-orange-300">
            {tr("ดูเงินค้างรับ")}{' '}<ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {aging.total === 0 ? (
          <p className="py-6 text-center text-[13px] text-brand-muted">{tr("ไม่มียอดที่รอรับตอนนี้")}</p>
        ) : (
          <ul className="space-y-2">
            {aging.buckets.map(b => (
              <li key={b.key} className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                <span className={`text-[13px] ${b.key === 'overdue' && b.amount > 0 ? 'font-medium text-[#C43A3A] dark:text-rose-300' : 'text-brand-text'}`}>{tr(AGING_LABELS[b.key])}</span>
                <span className="h-2 overflow-hidden rounded-full bg-brand-faint">
                  <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (b.amount / max) * 100 : 0}%`, backgroundColor: AGING_COLORS[b.key] }} />
                </span>
                <span className="min-w-[88px] text-right">
                  <span className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(b.amount)}</span>
                  <span className="ml-1.5 text-[11px] text-brand-muted">{tr("{0} รายการ", b.count)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DrillPanel({ jobs, title, subtitle, onClose }: { jobs: Job[]; title: string; subtitle: string; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-[rgba(33,29,26,0.35)]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-white shadow-[0_0_40px_rgba(33,29,26,0.18)] sm:max-w-[460px] dark:bg-stone-900">
        <div className="flex items-start justify-between gap-3 border-b border-brand-border px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-brand-text">{title}</h2>
            <p className="mt-0.5 text-[13px] text-brand-muted">{tr("{0} · {1} งาน", subtitle, jobs.length)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("ปิด")} className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <ul className="flex-1 overflow-y-auto px-6 py-3">
          {jobs.map(job => (
            <li key={job.id} className="flex items-start justify-between gap-3 border-b border-brand-border py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-brand-text">{job.name}</p>
                <p className="mt-0.5 truncate text-xs text-brand-muted">{[job.type, job.payDate || job.postDate ? safeFormatThaiDate((job.payDate || job.postDate) as string, { day: 'numeric', month: 'short', year: 'numeric' }) : null].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(job.received)}</p>
                {job.pending > 0 && <p className="text-[11px] text-brand-muted">{tr("ค้างรับ {0}", formatCurrency(job.pending))}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
