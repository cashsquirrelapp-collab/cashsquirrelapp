import React, { useMemo } from 'react';
import { Job, Expense } from '../../../../shared/types';
import { getJobPaymentEntries } from '../../../../shared/installmentPayments';
import { formatAxisBaht, formatCurrency, getMonthKey, formatMonthKey, safeFormatThaiDate } from '../../utils';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface IncomeExpenseTabProps {
  jobs: Job[];
  expenses: Expense[];
}

export default function IncomeExpenseTab({ jobs, expenses }: IncomeExpenseTabProps) {
  const totals = useMemo(() => {
    const income = jobs.flatMap(getJobPaymentEntries).reduce((sum, e) => sum + e.amount, 0);
    const expense = expenses.reduce((sum, e) => sum + e.amount, 0);
    return { income, expense, profit: income - expense };
  }, [jobs, expenses]);

  const trend = useMemo(() => {
    const monthsList: string[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const totalsByMonth = new Map(monthsList.map(m => [m, { income: 0, expense: 0 }]));
    jobs.forEach(j => getJobPaymentEntries(j).forEach(entry => {
      const m = totalsByMonth.get(getMonthKey(entry.date));
      if (m) m.income += entry.amount;
    }));
    expenses.forEach(e => {
      const m = totalsByMonth.get(getMonthKey(e.date));
      if (m) m.expense += e.amount;
    });
    return monthsList.map(m => ({
      monthLabel: formatMonthKey(m).split(' ')[0],
      income: totalsByMonth.get(m)!.income,
      expense: totalsByMonth.get(m)!.expense,
    }));
  }, [jobs, expenses]);

  const recentActivity = useMemo(() => {
    const incomeEvents = jobs.flatMap(j => getJobPaymentEntries(j).map(entry => ({
      key: entry.id, date: entry.date || '', name: entry.jobName, isIncome: true, amount: entry.amount,
    })));
    const expenseEvents = expenses.map(e => ({
      key: e.id, date: e.date, name: e.name, isIncome: false, amount: e.amount,
    }));
    return [...incomeEvents, ...expenseEvents]
      .filter(ev => ev.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [jobs, expenses]);

  return (
    <div className="page-content space-y-4">
      <h2 className="text-[19px] font-semibold text-brand-text">รายรับ–รายจ่าย</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
          <p className="text-xs text-brand-muted">เงินเข้า</p>
          <p className="mt-1 text-xl font-semibold text-[#18A66A]">{formatCurrency(totals.income)}</p>
        </div>
        <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
          <p className="text-xs text-brand-muted">เงินออก</p>
          <p className="mt-1 text-xl font-semibold text-[#E95454]">{formatCurrency(totals.expense)}</p>
        </div>
        <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
          <p className="text-xs text-brand-muted">กำไร</p>
          <p className="mt-1 text-xl font-semibold text-brand-text">{formatCurrency(totals.profit)}</p>
        </div>
      </div>

      <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
        <h4 className="mb-3 text-[13px] font-medium text-brand-text">แนวโน้มเงินเข้า-เงินออก</h4>
        <div className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfd9cd" opacity={0.3} vertical={false} />
              <XAxis dataKey="monthLabel" stroke="#7D7772" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#7D7772" fontSize={10} tickLine={false} axisLine={false} tickCount={3} tickFormatter={(v) => formatAxisBaht(Number(v))} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as { monthLabel: string; income: number; expense: number };
                    return (
                      <div className="rounded-xl border border-brand-border bg-brand-white p-2.5 text-[11px] shadow-lg">
                        <p className="mb-1 font-bold text-brand-text">{d.monthLabel}</p>
                        <p className="text-[#18A66A]">เข้า: {formatCurrency(d.income)}</p>
                        <p className="text-[#E95454]">ออก: {formatCurrency(d.expense)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line type="monotone" dataKey="income" stroke="#18A66A" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="expense" stroke="#E95454" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
        <h4 className="mb-1 text-[13px] font-medium text-brand-text">รายการล่าสุด</h4>
        {recentActivity.length === 0 ? (
          <p className="py-6 text-center text-xs text-brand-muted">ยังไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">รายการ</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">วันที่</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">ประเภท</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-brand-muted">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map(ev => (
                  <tr key={ev.key} className="border-b border-brand-border last:border-b-0">
                    <td className="px-3 py-3 text-brand-text">{ev.name}</td>
                    <td className="px-3 py-3 text-brand-muted">{safeFormatThaiDate(ev.date)}</td>
                    <td className="px-3 py-3">
                      <span
                        className="rounded-md px-2.5 py-[3px] text-[11px]"
                        style={ev.isIncome ? { background: '#E9F8F1', color: '#12724A' } : { background: '#FFF0F0', color: '#C43A3A' }}
                      >
                        {ev.isIncome ? 'เงินเข้า' : 'เงินออก'}
                      </span>
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${ev.isIncome ? 'text-[#18A66A]' : 'text-[#E95454]'}`}>
                      {ev.isIncome ? '+' : '-'}{formatCurrency(ev.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
