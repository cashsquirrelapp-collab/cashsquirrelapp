import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, ChevronDown, ChevronUp, Download, FileSpreadsheet,
  Mail, MoreHorizontal, TrendingUp, X,
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Job, NotifSettings } from '../../../../shared/types';
import { getJobPaymentEntries, getJobPendingEntries } from '../../../../shared/installmentPayments';
import { formatCurrency, formatMonthKey, getMonthKey } from '../../utils';

interface Props {
  jobs: Job[];
  userEmail: string;
  notifSettings: NotifSettings;
  onSwitchTab: (tabId: string) => void;
  onViewJob?: (jobId: string) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  initialTab?: ReportTab;
  isPro?: boolean;
  onUpgrade?: () => void;
}

type ReportTab = 'overview' | 'clients' | 'types' | 'credit';
type Period = '3' | '6' | '12' | 'all';
type TrendMode = 'monthly' | 'annual';

type Ranking = { key: string; revenue: number; count: number; jobs: Job[] };
type TrendPoint = { key: string; label: string; revenue: number; jobs: number; clients: number };
type AgingBucket = { key: string; label: string; amount: number; count: number; color: string };

const PERIODS: { key: Period; label: string }[] = [
  { key: '3', label: '3 เดือน' }, { key: '6', label: '6 เดือน' },
  { key: '12', label: '12 เดือน' }, { key: 'all', label: 'ทั้งหมด' },
];
const TABS: { key: ReportTab; label: string }[] = [
  { key: 'overview', label: 'ภาพรวม' }, { key: 'clients', label: 'ลูกค้า' },
  { key: 'types', label: 'ประเภทงาน' }, { key: 'credit', label: 'เครดิตเทอม' },
];
const BAR_COLORS = ['#E65F2B', '#C96A3D', '#D78A62', '#B88C75', '#95847A', '#B4AAA3'];

const startOfPeriod = (period: Period) => {
  if (period === 'all') return null;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - Number(period) + 1, 1);
};

const dateInPeriod = (value: string | null | undefined, cutoff: Date | null) => {
  if (!cutoff) return true;
  if (!value) return false;
  return new Date(`${value}T00:00:00`) >= cutoff;
};

const csvEscape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export default function MonthlyReportTab({ jobs, userEmail, notifSettings, onSwitchTab, onViewJob, triggerAlert, initialTab = 'overview', isPro = false, onUpgrade }: Props) {
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [period, setPeriod] = useState<Period>('6');
  const [trendMode, setTrendMode] = useState<TrendMode>('monthly');
  const [exportOpen, setExportOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [drilldown, setDrilldown] = useState<Ranking | null>(null);
  const cutoff = useMemo(() => startOfPeriod(period), [period]);

  const jobRevenue = useMemo(() => jobs.map(job => ({
    job,
    payments: getJobPaymentEntries(job).filter(payment => dateInPeriod(payment.date, cutoff)),
  })).map(item => ({ ...item, revenue: item.payments.reduce((sum, payment) => sum + payment.amount, 0) }))
    .filter(item => item.revenue > 0), [jobs, cutoff]);

  const totalRevenue = jobRevenue.reduce((sum, item) => sum + item.revenue, 0);
  const jobCount = jobRevenue.length;
  const clientCount = new Set(jobRevenue.map(item => item.job.client.trim() || 'ไม่ระบุลูกค้า')).size;
  const averagePerJob = jobCount ? totalRevenue / jobCount : 0;

  const rankBy = (field: 'client' | 'type'): Ranking[] => {
    const map = new Map<string, Ranking>();
    jobRevenue.forEach(({ job, revenue }) => {
      const key = (job[field] || '').trim() || (field === 'client' ? 'ไม่ระบุลูกค้า' : 'ยังไม่ระบุ');
      const current = map.get(key) || { key, revenue: 0, count: 0, jobs: [] };
      current.revenue += revenue; current.count += 1; current.jobs.push(job); map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  };
  const clientRanking = useMemo(() => rankBy('client'), [jobRevenue]);
  const typeRanking = useMemo(() => rankBy('type'), [jobRevenue]);

  const monthlyTrend = useMemo<TrendPoint[]>(() => {
    const map = new Map<string, { revenue: number; jobs: Set<string>; clients: Set<string> }>();
    jobRevenue.forEach(({ job, payments }) => payments.forEach(payment => {
      if (!payment.date) return;
      const key = getMonthKey(payment.date);
      const current = map.get(key) || { revenue: 0, jobs: new Set<string>(), clients: new Set<string>() };
      current.revenue += payment.amount; current.jobs.add(job.id); current.clients.add(job.client.trim() || 'ไม่ระบุลูกค้า'); map.set(key, current);
    }));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, label: formatMonthKey(key).replace(/\s\d{4}$/, ''), revenue: value.revenue, jobs: value.jobs.size, clients: value.clients.size }));
  }, [jobRevenue]);

  const annualTrend = useMemo<TrendPoint[]>(() => {
    const map = new Map<string, { revenue: number; jobs: Set<string>; clients: Set<string> }>();
    jobRevenue.forEach(({ job, payments }) => payments.forEach(payment => {
      if (!payment.date) return;
      const key = payment.date.slice(0, 4);
      const current = map.get(key) || { revenue: 0, jobs: new Set<string>(), clients: new Set<string>() };
      current.revenue += payment.amount; current.jobs.add(job.id); current.clients.add(job.client.trim() || 'ไม่ระบุลูกค้า'); map.set(key, current);
    }));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, label: String(Number(key) + 543), revenue: value.revenue, jobs: value.jobs.size, clients: value.clients.size }));
  }, [jobRevenue]);
  const trend = trendMode === 'monthly' ? monthlyTrend : annualTrend;

  const retention = useMemo(() => {
    const earliest = new Map<string, Date>();
    jobs.forEach(job => {
      const key = job.client.trim() || 'ไม่ระบุลูกค้า';
      const raw = job.postDate || job.startDate || job.payDate;
      if (!raw) return;
      const date = new Date(`${raw}T00:00:00`); const current = earliest.get(key);
      if (!current || date < current) earliest.set(key, date);
    });
    let newCount = 0; let repeatCount = 0;
    clientRanking.forEach(client => {
      const first = earliest.get(client.key);
      const repeat = cutoff ? !!first && first < cutoff : client.jobs.length > 1;
      if (repeat) repeatCount += 1; else newCount += 1;
    });
    const total = newCount + repeatCount;
    return { newCount, repeatCount, newPct: total ? Math.round(newCount / total * 100) : 0, repeatPct: total ? Math.round(repeatCount / total * 100) : 0 };
  }, [jobs, clientRanking, cutoff]);

  const pendingEntries = useMemo(() => jobs.flatMap(job => getJobPendingEntries(job).map(entry => ({ ...entry, job }))), [jobs]);
  const aging = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets: AgingBucket[] = [
      { key: 'overdue', label: 'เกินกำหนด', amount: 0, count: 0, color: '#D85C57' },
      { key: 'today', label: 'ครบกำหนดวันนี้', amount: 0, count: 0, color: '#E65F2B' },
      { key: '7', label: 'ภายใน 7 วัน', amount: 0, count: 0, color: '#D98B3A' },
      { key: '14', label: 'ภายใน 14 วัน', amount: 0, count: 0, color: '#B99B76' },
      { key: '30', label: 'ภายใน 30 วัน', amount: 0, count: 0, color: '#9A918B' },
    ];
    pendingEntries.forEach(entry => {
      if (!entry.dueDate) return;
      const due = new Date(`${entry.dueDate}T00:00:00`);
      const days = Math.round((due.getTime() - today.getTime()) / 86400000);
      const bucket = days < 0 ? buckets[0] : days === 0 ? buckets[1] : days <= 7 ? buckets[2] : days <= 14 ? buckets[3] : days <= 30 ? buckets[4] : null;
      if (bucket) { bucket.amount += entry.amount; bucket.count += 1; }
    });
    return buckets;
  }, [pendingEntries]);
  const pendingTotal = pendingEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const overdueTotal = aging[0]?.amount || 0;

  const exportRows = () => jobRevenue.flatMap(({ job, payments }) => payments.map(payment => ({
    วันที่: payment.date || '', งาน: job.name, ลูกค้า: job.client || 'ไม่ระบุลูกค้า', ประเภทงาน: job.type || 'ยังไม่ระบุ', รายได้: payment.amount,
  })));
  const downloadCsv = () => {
    const rows = exportRows(); const headers = ['วันที่', 'งาน', 'ลูกค้า', 'ประเภทงาน', 'รายได้'];
    const csv = '\ufeff' + [headers.map(csvEscape).join(','), ...rows.map(row => headers.map(header => csvEscape(row[header as keyof typeof row])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a');
    link.href = url; link.download = `cash-squirrel-report-${period}-months.csv`; link.click(); URL.revokeObjectURL(url); setExportOpen(false);
  };
  const downloadXlsx = async () => {
    try {
      const XLSX = await import('xlsx'); const sheet = XLSX.utils.json_to_sheet(exportRows()); const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'รายงานรายได้'); XLSX.writeFile(book, `cash-squirrel-report-${period}-months.xlsx`); setExportOpen(false);
    } catch { triggerAlert('ส่งออกไม่สำเร็จ', 'ไม่สามารถสร้างไฟล์ Excel ได้ กรุณาลองใหม่อีกครั้ง'); }
  };
  const emailReport = async () => {
    const recipient = notifSettings.alertEmail || userEmail;
    const body = `รายงานรายได้จากงาน (${PERIODS.find(item => item.key === period)?.label})\n\nรายได้จากงาน: ${formatCurrency(totalRevenue)}\nจำนวนงาน: ${jobCount}\nเฉลี่ยต่องาน: ${formatCurrency(averagePerJob)}\nลูกค้า / ผู้จ่าย: ${clientCount}\n\nลูกค้าสูงสุด: ${clientRanking[0]?.key || '-'} ${clientRanking[0] ? formatCurrency(clientRanking[0].revenue) : ''}\nประเภทงานสูงสุด: ${typeRanking[0]?.key || '-'} ${typeRanking[0] ? formatCurrency(typeRanking[0].revenue) : ''}`;
    const subject = '[กระรอกตุนเงิน] รายงานรายได้จากงาน';
    setExportOpen(false);
    if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsTemplateId && notifSettings.emailjsPublicKey) {
      try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: notifSettings.emailjsServiceId, template_id: notifSettings.emailjsTemplateId, user_id: notifSettings.emailjsPublicKey, template_params: { to_email: recipient, subject, message: body } }) });
        if (!response.ok) throw new Error('EmailJS rejected the report');
        triggerAlert('ส่งรายงานสำเร็จ', `ส่งรายงานไปที่ ${recipient} เรียบร้อยแล้ว`);
        return;
      } catch {
        triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', 'ระบบจะเปิดแอปอีเมลเพื่อให้คุณตรวจสอบและส่งรายงานแทน', () => { window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; });
        return;
      }
    }
    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return <div className="mx-auto w-full max-w-7xl space-y-5 pb-12 pt-8 lg:pt-0">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="font-display text-3xl font-bold tracking-tight text-brand-text">รายงาน</h1><p className="mt-1 text-sm text-brand-muted">ดูผลงานและรูปแบบรายได้ย้อนหลัง</p></div>
      <div className="relative"><button onClick={() => setExportOpen(value => !value)} className="flex h-10 items-center gap-2 rounded-xl border border-brand-border bg-brand-white px-4 text-xs font-bold text-brand-text hover:bg-brand-faint"><Download className="h-4 w-4" />ส่งออก<ChevronDown className="h-4 w-4" /></button>{exportOpen && <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-xl dark:bg-neutral-900"><ExportItem icon={<Download />} label="ดาวน์โหลด CSV (.csv)" onClick={downloadCsv} /><ExportItem icon={<FileSpreadsheet />} label="Excel (.xlsx)" onClick={downloadXlsx} /><ExportItem icon={<Mail />} label="ส่งรายงานทางอีเมล" onClick={emailReport} /></div>}</div>
    </header>

    <div className="flex flex-col gap-3 border-b border-brand-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-fit rounded-xl bg-brand-faint p-1">{PERIODS.map(item => <button key={item.key} onClick={() => setPeriod(item.key)} className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${period === item.key ? 'bg-[#FFF0E8] text-[#D9551D] shadow-xs' : 'text-brand-muted hover:text-brand-text'}`}>{item.label}</button>)}</div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto">{TABS.map(item => <button key={item.key} onClick={() => setActiveTab(item.key)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition ${activeTab === item.key ? 'bg-[#FFF0E8] text-[#D9551D]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`}>{item.label}</button>)}</div>
    </div>

    {activeTab === 'overview' && <Overview totalRevenue={totalRevenue} jobCount={jobCount} averagePerJob={averagePerJob} clientCount={clientCount} trend={trend} trendMode={trendMode} setTrendMode={setTrendMode} topClient={clientRanking[0]} topType={typeRanking[0]} monthlyTrend={monthlyTrend} showTable={showTable} setShowTable={setShowTable} onSwitchTab={onSwitchTab} />}
    {activeTab === 'clients' && (isPro ? <Clients rankings={clientRanking} totalRevenue={totalRevenue} retention={retention} clientCount={clientCount} setDrilldown={setDrilldown} /> : <BasicRanking title="รายได้ตามลูกค้า / ผู้จ่าย" rankings={clientRanking} onUpgrade={onUpgrade} />)}
    {activeTab === 'types' && (isPro ? <JobTypes rankings={typeRanking} setDrilldown={setDrilldown} /> : <BasicRanking title="รายได้ตามประเภทงาน" rankings={typeRanking} onUpgrade={onUpgrade} />)}
    {activeTab === 'credit' && <Credit aging={aging} pendingTotal={pendingTotal} pendingCount={pendingEntries.length} overdueTotal={overdueTotal} onSwitchTab={onSwitchTab} />}

    <AnimatePresence>{drilldown && <Drilldown ranking={drilldown} close={() => setDrilldown(null)} onViewJob={onViewJob} />}</AnimatePresence>
  </div>;
}

function Overview({ totalRevenue, jobCount, averagePerJob, clientCount, trend, trendMode, setTrendMode, topClient, topType, monthlyTrend, showTable, setShowTable, onSwitchTab }: any) {
  return <div className="space-y-5">
    <SummaryStrip items={[["รายได้จากงาน", formatCurrency(totalRevenue)], ["จำนวนงาน", `${jobCount} งาน`], ["เฉลี่ยต่องาน", formatCurrency(averagePerJob)], ["ลูกค้า / ผู้จ่าย", `${clientCount} ราย`]]} />
    <section className="report-card"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="report-title">แนวโน้มรายได้จากงาน</h2><p className="report-subtitle">รายได้ที่รับจริงตามช่วงเวลา</p></div><div className="flex rounded-lg bg-brand-faint p-1"><button onClick={() => setTrendMode('monthly')} className={`report-mode ${trendMode === 'monthly' ? 'is-active' : ''}`}>รายเดือน</button><button onClick={() => setTrendMode('annual')} className={`report-mode ${trendMode === 'annual' ? 'is-active' : ''}`}>รายปี</button></div></div>{trend.length ? <RevenueChart data={trend} /> : <Empty onSwitchTab={onSwitchTab} />}</section>
    {trend.length > 0 && <section><h2 className="mb-3 text-sm font-bold text-brand-text">ข้อมูลเชิงลึก</h2><div className="grid gap-3 md:grid-cols-3"><Insight label="ลูกค้าที่สร้างรายได้สูงสุด" value={topClient?.key || '—'} amount={topClient ? formatCurrency(topClient.revenue) : '—'} /><Insight label="ประเภทงานที่สร้างรายได้สูงสุด" value={topType?.key || '—'} amount={topType ? formatCurrency(topType.revenue) : '—'} /><Insight label="รายได้เฉลี่ยต่องาน" value={formatCurrency(averagePerJob)} amount={`${jobCount} งานในช่วงนี้`} /></div></section>}
    <section className="report-card !p-0"><button onClick={() => setShowTable((value: boolean) => !value)} className="flex w-full items-center justify-between px-5 py-4 text-sm font-bold text-brand-text sm:px-6">ดูรายละเอียด 12 เดือน{showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{showTable && <div className="overflow-x-auto border-t border-brand-border"><div className="min-w-[620px]"><div className="report-table-row report-table-head"><span>เดือน</span><span>รายได้</span><span>จำนวนงาน</span><span>ลูกค้า</span></div>{monthlyTrend.slice(-12).map((row: TrendPoint) => <div key={row.key} className="report-table-row"><span>{formatMonthKey(row.key)}</span><span>{formatCurrency(row.revenue)}</span><span>{row.jobs}</span><span>{row.clients}</span></div>)}</div></div>}</section>
  </div>;
}

function Clients({ rankings, totalRevenue, retention, clientCount, setDrilldown }: any) {
  const concentration = totalRevenue && rankings[0] ? Math.round(rankings[0].revenue / totalRevenue * 100) : 0;
  return <div className="space-y-5"><section className="report-card"><h2 className="report-title">รายได้ตามลูกค้า / ผู้จ่าย</h2><p className="report-subtitle">เรียงจากรายได้ที่รับจริงสูงสุด</p><RankingBars rankings={rankings} onClick={setDrilldown} /></section><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Insight label="ลูกค้าสูงสุด" value={rankings[0]?.key || '—'} amount={rankings[0] ? formatCurrency(rankings[0].revenue) : '—'} /><Insight label="ลูกค้าเดิม" value={`${retention.repeatPct}%`} amount={`${retention.repeatCount} ราย`} /><Insight label="ลูกค้าใหม่" value={`${retention.newPct}%`} amount={`${retention.newCount} ราย`} /><Insight label="เฉลี่ยต่อลูกค้า" value={formatCurrency(clientCount ? totalRevenue / clientCount : 0)} amount={`${clientCount} ราย`} /></div>{concentration >= 40 && <div className="rounded-2xl border border-[#E8D7B7] bg-[#FFF9EC] px-5 py-4 text-sm text-brand-text dark:border-amber-900/50 dark:bg-amber-950/20"><p className="font-bold">รายได้จำนวนมากมาจากลูกค้าไม่กี่ราย</p><p className="mt-1 text-xs text-brand-muted">{rankings[0].key} คิดเป็น {concentration}% ของรายได้ในช่วงนี้</p></div>}<section className="report-card"><div className="mb-3 flex items-center justify-between"><h2 className="report-title">ลูกค้าใหม่ vs. ลูกค้าเดิม</h2><span className="text-xs text-brand-muted">{clientCount} ราย</span></div><div className="flex h-2.5 overflow-hidden rounded-full bg-brand-faint"><span className="bg-[#E65F2B]" style={{ width: `${retention.repeatPct}%` }} /><span className="bg-[#D8D3CE]" style={{ width: `${retention.newPct}%` }} /></div><div className="mt-3 flex justify-between text-xs"><span className="font-semibold text-[#D9551D]">ลูกค้าเดิม {retention.repeatPct}%</span><span className="text-brand-muted">ลูกค้าใหม่ {retention.newPct}%</span></div></section></div>;
}

function JobTypes({ rankings, setDrilldown }: any) {
  const bestAverage = [...rankings].sort((a: Ranking, b: Ranking) => b.revenue / b.count - a.revenue / a.count)[0];
  return <div className="space-y-5"><section className="report-card"><h2 className="report-title">รายได้ตามประเภทงาน</h2><p className="report-subtitle">งานแบบไหนสร้างรายได้ให้คุณมากที่สุด?</p><RankingBars rankings={rankings} onClick={setDrilldown} showAverage /></section><div className="grid gap-3 sm:grid-cols-2"><Insight label="ประเภทที่สร้างรายได้สูงสุด" value={rankings[0]?.key || '—'} amount={rankings[0] ? `${formatCurrency(rankings[0].revenue)} · ${rankings[0].count} งาน` : '—'} /><Insight label="ค่าเฉลี่ยต่องานสูงสุด" value={bestAverage?.key || '—'} amount={bestAverage ? `${formatCurrency(bestAverage.revenue / bestAverage.count)} / งาน` : '—'} /></div></div>;
}

function Credit({ aging, pendingTotal, pendingCount, overdueTotal, onSwitchTab }: any) {
  const max = Math.max(...aging.map((item: AgingBucket) => item.amount), 1);
  return <div className="space-y-5"><SummaryStrip items={[["ยอดที่ยังรอรับ", formatCurrency(pendingTotal)], ["จำนวนรายการ", `${pendingCount} รายการ`], ["เกินกำหนด", formatCurrency(overdueTotal)]]} /><section className="report-card"><h2 className="report-title">พฤติกรรมเครดิตเทอม</h2><p className="report-subtitle">วิเคราะห์ช่วงเวลาที่เงินควรเข้าจากงาน</p><div className="mt-6 space-y-4">{aging.map((item: AgingBucket) => <div key={item.key} className="grid grid-cols-[120px_1fr_auto] items-center gap-3"><div><p className={`text-xs font-semibold ${item.key === 'overdue' ? 'text-red-600' : 'text-brand-text'}`}>{item.label}</p><p className="text-[10px] text-brand-muted">{item.count} รายการ</p></div><div className="h-2 overflow-hidden rounded-full bg-brand-faint"><span className="block h-full rounded-full" style={{ width: `${item.amount / max * 100}%`, background: item.color }} /></div><span className="min-w-24 text-right font-mono text-xs font-bold text-brand-text">{formatCurrency(item.amount)}</span></div>)}</div><button onClick={() => onSwitchTab('receivables')} className="mt-7 flex items-center gap-1 text-xs font-bold text-[#D9551D] hover:underline">ดูเงินที่ยังไม่ได้รับ<ArrowRight className="h-3.5 w-3.5" /></button></section></div>;
}

function BasicRanking({ title, rankings, onUpgrade }: { title: string; rankings: Ranking[]; onUpgrade?: () => void }) {
  return <div className="space-y-4">
    <button type="button" onClick={onUpgrade} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#F3D2BE] bg-[#FFF7F1] px-5 py-4 text-left text-xs text-brand-text transition hover:bg-[#FFF1E8] dark:border-orange-400/20 dark:bg-orange-500/10">
      <span>ปลดล็อกกราฟเชิงลึก การเปรียบเทียบ และรายละเอียดงานในแต่ละกลุ่ม</span>
      <span className="inline-flex shrink-0 items-center gap-1 font-bold text-[#C24A16] dark:text-orange-300">อัปเกรด <ArrowRight className="h-3.5 w-3.5" /></span>
    </button>
    <section className="report-card"><h2 className="report-title">{title}</h2><p className="report-subtitle">ข้อมูลสรุปจากรายได้ที่รับจริงในช่วงนี้</p><div className="mt-5 divide-y divide-brand-border">{rankings.slice(0, 5).map(item => <div key={item.key} className="flex items-center justify-between gap-4 py-3 text-xs"><div className="min-w-0"><p className="truncate font-semibold text-brand-text">{item.key}</p><p className="mt-1 text-[10px] text-brand-muted">{item.count} งาน</p></div><span className="shrink-0 font-mono font-bold text-brand-text">{formatCurrency(item.revenue)}</span></div>)}{rankings.length === 0 && <p className="py-10 text-center text-sm text-brand-muted">ยังมีข้อมูลไม่พอสำหรับรายงานช่วงนี้</p>}</div></section>
  </div>;
}

function SummaryStrip({ items }: { items: [string, string][] }) { return <section className={`grid rounded-2xl border border-brand-border bg-brand-white p-5 dark:bg-neutral-900 sm:p-6 ${items.length === 3 ? 'grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0' : 'grid-cols-2 lg:grid-cols-4'}`}>{items.map(([label, value], index) => <div key={label} className={`py-3 sm:px-5 sm:py-0 ${items.length === 4 && index % 2 === 1 ? 'border-l border-brand-border pl-4' : ''} ${items.length === 4 && index > 0 ? 'lg:border-l lg:border-brand-border lg:pl-5' : ''} ${items.length === 4 && index >= 2 ? 'border-t border-brand-border pt-4 lg:border-t-0 lg:pt-0' : ''}`}><p className="text-[11px] font-semibold text-brand-muted">{label}</p><p className="mt-1 font-mono text-xl font-bold text-brand-text sm:text-2xl">{value}</p></div>)}</section>; }

function RevenueChart({ data }: { data: TrendPoint[] }) { return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}><CartesianGrid vertical={false} stroke="#E7E3DF" strokeDasharray="3 3" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#77716B', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#77716B', fontSize: 10 }} tickFormatter={value => `฿${Math.round(value / 1000)}k`} /><Tooltip cursor={{ stroke: '#E65F2B', strokeOpacity: .18 }} content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border border-brand-border bg-brand-white p-3 shadow-lg"><p className="text-[11px] text-brand-muted">{payload[0].payload.label}</p><p className="mt-1 font-mono text-sm font-bold text-brand-text">{formatCurrency(Number(payload[0].value))}</p></div> : null} /><Line type="monotone" dataKey="revenue" stroke="#E65F2B" strokeWidth={2.5} dot={{ r: 3, fill: '#E65F2B', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#E65F2B', stroke: '#FFF', strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div>; }

function RankingBars({ rankings, onClick, showAverage = false }: { rankings: Ranking[]; onClick: (ranking: Ranking) => void; showAverage?: boolean }) {
  const max = rankings[0]?.revenue || 1;
  return rankings.length ? <div className="mt-6 space-y-2">{rankings.slice(0, 8).map((item, index) => <button key={item.key} onClick={() => onClick(item)} className="grid w-full grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-brand-faint/60"><div className="min-w-0"><p className="truncate text-xs font-semibold text-brand-text">{item.key}</p><p className="mt-0.5 text-[10px] text-brand-muted">{item.count} งาน{showAverage ? ` · เฉลี่ย ${formatCurrency(item.revenue / item.count)}` : ''}</p></div><div className="h-2.5 overflow-hidden rounded-full bg-brand-faint"><span className="block h-full rounded-full" style={{ width: `${Math.max(3, item.revenue / max * 100)}%`, background: BAR_COLORS[index % BAR_COLORS.length] }} /></div><span className="min-w-24 text-right font-mono text-xs font-bold text-brand-text">{formatCurrency(item.revenue)}</span></button>)}</div> : <div className="py-14 text-center text-sm text-brand-muted">ยังมีข้อมูลไม่พอสำหรับรายงานช่วงนี้</div>;
}

function Insight({ label, value, amount }: { label: string; value: string; amount: string }) { return <article className="rounded-2xl border border-brand-border bg-brand-white p-4 dark:bg-neutral-900"><p className="text-[11px] font-semibold text-brand-muted">{label}</p><p className="mt-2 truncate text-sm font-bold text-brand-text">{value}</p><p className="mt-1 font-mono text-xs text-brand-muted">{amount}</p></article>; }
function Empty({ onSwitchTab }: { onSwitchTab: (tab: 'jobs') => void }) { return <div className="flex flex-col items-center py-14 text-center"><TrendingUp className="h-7 w-7 text-brand-muted" /><p className="mt-3 text-sm font-bold text-brand-text">ยังมีข้อมูลไม่พอสำหรับรายงานช่วงนี้</p><button onClick={() => onSwitchTab('jobs')} className="mt-4 text-xs font-bold text-[#D9551D] hover:underline">ดูงาน</button></div>; }
function ExportItem({ icon, label, onClick }: { icon: React.ReactElement<{ className?: string }>; label: string; onClick: () => void }) { return <button onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-brand-text hover:bg-brand-faint">{React.cloneElement(icon, { className: 'h-4 w-4 text-brand-muted' })}{label}</button>; }

function Drilldown({ ranking, close, onViewJob }: { ranking: Ranking; close: () => void; onViewJob?: (id: string) => void }) { return <div className="fixed inset-0 z-[200]"><motion.button aria-label="ปิด" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="absolute inset-0 h-full w-full bg-black/35 backdrop-blur-[2px]" /><motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-white shadow-2xl dark:bg-neutral-900 sm:w-[460px]"><header className="flex items-start justify-between border-b border-brand-border px-6 py-5"><div><p className="text-[10px] font-bold text-[#D9551D]">รายละเอียดรายงาน</p><h2 className="mt-1 text-xl font-bold text-brand-text">{ranking.key}</h2><p className="mt-1 font-mono text-sm text-brand-muted">{formatCurrency(ranking.revenue)} · {ranking.count} งาน</p></div><button onClick={close} className="rounded-lg p-2 text-brand-muted hover:bg-brand-faint"><X className="h-5 w-5" /></button></header><div className="flex-1 divide-y divide-brand-border overflow-y-auto px-6">{ranking.jobs.map(job => <button key={job.id} onClick={() => { close(); onViewJob?.(job.id); }} className="flex w-full items-center justify-between gap-4 py-4 text-left"><div className="min-w-0"><p className="truncate text-sm font-semibold text-brand-text">{job.name}</p><p className="mt-1 text-[11px] text-brand-muted">{job.client || 'ไม่ระบุลูกค้า'} · {job.type || 'ยังไม่ระบุ'}</p></div><MoreHorizontal className="h-4 w-4 shrink-0 text-brand-muted" /></button>)}</div></motion.aside></div>; }
