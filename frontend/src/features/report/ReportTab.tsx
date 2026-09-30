import React, { useMemo, useState } from 'react';
import { Job, Expense } from '../../../../shared/types';
import { getJobPaymentEntries } from '../../../../shared/installmentPayments';
import { formatAxisBaht, formatCurrency, dateLocale, getRelativeDaysText } from '../../utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowDown, ArrowUp, Wallet, Clock, ArrowRight, TriangleAlert } from 'lucide-react';

interface ReportTabProps {
  jobs: Job[];
  expenses: Expense[];
  onSwitchTab: (tabId: string) => void;
}

type ViewKey = 'overview' | 'income' | 'clients' | 'credit';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'income', label: 'รายได้' },
  { key: 'clients', label: 'ลูกค้า' },
  { key: 'credit', label: 'Credit Term' },
];

export default function ReportTab({
  jobs, expenses, onSwitchTab,
}: ReportTabProps) {
  const [view, setView] = useState<ViewKey>('overview');

  const totalIncome = useMemo(() => jobs.flatMap(getJobPaymentEntries).reduce((s, e) => s + e.amount, 0), [jobs]);
  const totalExpense = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalPending = useMemo(() => jobs.reduce((s, j) => s + j.pending, 0), [jobs]);
  const profit = totalIncome - totalExpense;

  const trend = useMemo(() => {
    const monthsList: string[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const byMonth = new Map(monthsList.map(m => [m, 0]));
    jobs.forEach(j => getJobPaymentEntries(j).forEach(entry => {
      const key = (entry.date || '').slice(0, 7);
      if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) || 0) + entry.amount);
    }));
    return monthsList.map(m => ({
      month: new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString(dateLocale(), { month: 'short' }),
      value: byMonth.get(m) || 0,
    }));
  }, [jobs]);

  const jobCount = jobs.length;
  const clientCount = new Set(jobs.map(j => j.client).filter(Boolean)).size;
  const avgPerJob = jobCount > 0 ? totalIncome / jobCount : 0;
  const avgPerClient = clientCount > 0 ? totalIncome / clientCount : 0;

  const incomeByType = useMemo(() => {
    const byType = new Map<string, number>();
    jobs.forEach(j => byType.set(j.type, (byType.get(j.type) || 0) + j.value));
    const total = Array.from(byType.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(byType.entries())
      .map(([type, value]) => ({ type, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [jobs]);

  const clientRevenue = useMemo(() => {
    const byClient = new Map<string, { revenue: number; count: number; pending: number }>();
    jobs.forEach(j => {
      const name = j.client || 'ไม่ระบุชื่อลูกค้า';
      const existing = byClient.get(name) || { revenue: 0, count: 0, pending: 0 };
      existing.revenue += j.value;
      existing.count += 1;
      existing.pending += j.pending;
      byClient.set(name, existing);
    });
    return Array.from(byClient.entries()).map(([name, v]) => ({ name, ...v }));
  }, [jobs]);

  const topClients = [...clientRevenue].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const repeatClients = clientRevenue.filter(c => c.count > 1).length;
  const highestOutstanding = [...clientRevenue].sort((a, b) => b.pending - a.pending)[0];

  const receivables = useMemo(() => jobs.filter(job => job.pending > 0 && job.isPosted !== false), [jobs]);
  const creditSummary = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    for (const job of receivables) {
      const relative = getRelativeDaysText(job.payDate || job.postDate);
      if (relative.isOverdue) overdue += 1;
      else if (relative.daysCount <= 7) dueSoon += 1;
    }
    return {
      total: receivables.reduce((sum, job) => sum + job.pending, 0),
      overdue,
      dueSoon,
    };
  }, [receivables]);

  const tabSwitcher = (
    <div className="flex flex-wrap gap-2">
      {VIEWS.map(v => (
        <button
          key={v.key}
          type="button"
          onClick={() => setView(v.key)}
          className={`rounded-lg px-3.5 py-2 text-xs cursor-pointer transition-colors ${
            view === v.key ? 'bg-[#FFF1E8] font-medium text-[#C24A16]' : 'bg-brand-faint text-brand-muted hover:text-brand-text'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page-content space-y-4">
      <h2 className="text-[19px] font-semibold text-brand-text">รายงาน</h2>

      {tabSwitcher}

      {view === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'รายรับ', value: totalIncome, Icon: ArrowDown },
              { label: 'รายจ่าย', value: totalExpense, Icon: ArrowUp },
              { label: 'กำไร', value: profit, Icon: Wallet },
              { label: 'เงินค้างรับ', value: totalPending, Icon: Clock },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
                <kpi.Icon className="h-5 w-5 text-[#C24A16]" strokeWidth={1.8} />
                <p className="mt-2 text-xs text-brand-muted">{kpi.label}</p>
                <p className="mt-0.5 text-lg font-semibold text-brand-text">{formatCurrency(kpi.value)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
            <h4 className="mb-3 text-[13px] font-medium text-brand-text">แนวโน้มรายเดือน</h4>
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dfd9cd" opacity={0.3} vertical={false} />
                  <XAxis dataKey="month" stroke="#7D7772" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#7D7772" fontSize={10} tickLine={false} axisLine={false} tickCount={3} tickFormatter={(v) => formatAxisBaht(Number(v))} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Line type="monotone" dataKey="value" stroke="#E65F2B" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {view === 'income' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <p className="text-xs text-brand-muted">รายได้เฉลี่ย / งาน</p>
              <p className="mt-1 text-lg font-semibold text-brand-text">{formatCurrency(avgPerJob)}</p>
            </div>
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <p className="text-xs text-brand-muted">รายได้เฉลี่ย / ลูกค้า</p>
              <p className="mt-1 text-lg font-semibold text-brand-text">{formatCurrency(avgPerClient)}</p>
            </div>
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <p className="text-xs text-brand-muted">รายรับรวม</p>
              <p className="mt-1 text-lg font-semibold text-brand-text">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
          <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
            <h4 className="mb-2.5 text-[13px] font-medium text-brand-text">รายได้ตามประเภทงาน</h4>
            {incomeByType.map(item => (
              <div key={item.type} className="flex items-center justify-between border-t border-brand-border py-2 text-xs first:border-t-0">
                <span className="text-brand-text">{item.type}</span>
                <span className="font-medium text-brand-text">{item.pct}%</span>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'clients' && (
        <>
          <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
            <h4 className="mb-2.5 text-[13px] font-medium text-brand-text">ลูกค้าที่สร้างรายได้สูง</h4>
            {topClients.length === 0 ? (
              <p className="py-4 text-center text-xs text-brand-muted">ยังไม่มีข้อมูลลูกค้า</p>
            ) : topClients.map(c => (
              <div key={c.name} className="flex items-center justify-between border-t border-brand-border py-2 text-xs first:border-t-0">
                <span className="text-brand-text">{c.name}</span>
                <span className="font-medium text-brand-text">{formatCurrency(c.revenue)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <p className="text-xs text-brand-muted">ลูกค้าประจำ (Repeat)</p>
              <p className="mt-1 text-lg font-semibold text-brand-text">{repeatClients} ราย</p>
            </div>
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <p className="text-xs text-brand-muted">เงินค้างรับสูงสุด</p>
              <p className="mt-1 text-lg font-semibold text-brand-text">
                {highestOutstanding && highestOutstanding.pending > 0 ? `${highestOutstanding.name} · ${formatCurrency(highestOutstanding.pending)}` : '—'}
              </p>
            </div>
          </div>
        </>
      )}

      {view === 'credit' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <Clock className="h-5 w-5 text-[#C24A16]" strokeWidth={1.8} />
              <p className="mt-2 text-xs text-brand-muted">เงินค้างรับทั้งหมด</p>
              <p className="mt-0.5 text-lg font-semibold text-brand-text">{formatCurrency(creditSummary.total)}</p>
              <p className="mt-1 text-[11px] text-brand-muted">{receivables.length} รายการ</p>
            </div>
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <TriangleAlert className="h-5 w-5 text-[#C43A3A]" strokeWidth={1.8} />
              <p className="mt-2 text-xs text-brand-muted">เกินกำหนด</p>
              <p className="mt-0.5 text-lg font-semibold text-brand-text">{creditSummary.overdue} รายการ</p>
            </div>
            <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
              <Clock className="h-5 w-5 text-[#B97816]" strokeWidth={1.8} />
              <p className="mt-2 text-xs text-brand-muted">ครบกำหนดภายใน 7 วัน</p>
              <p className="mt-0.5 text-lg font-semibold text-brand-text">{creditSummary.dueSoon} รายการ</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-[14px] border border-brand-border bg-brand-white p-[18px] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[13px] font-medium text-brand-text">ติดตาม Credit Term</h3>
              <p className="mt-1 max-w-xl text-xs leading-5 text-brand-muted">
                ดูรายการครบกำหนด ตั้งเตือน และบันทึกรับเงินได้ที่หน้า “เงินที่ยังไม่ได้รับ”
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab('receivables')}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#E65F2B] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#D85723]"
            >
              ไปจัดการเงินค้างรับ <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
