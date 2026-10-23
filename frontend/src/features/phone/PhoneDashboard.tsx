import React from 'react';
import { ArrowDownToLine, Plus, Receipt, MoreHorizontal, ChevronRight, Briefcase, CalendarDays, Clock } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { workValueForMonth, nowInBangkok, currentMonthKey } from '../../../../shared/monthlySummary';
import { buildCalendarEvents } from '../calendar/calendarEvents';

const money = (amount: number) => '฿' + new Intl.NumberFormat('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
interface Props {
  fullFeatureAccess?: boolean;
  jobs: Job[];
  month: string;
  periodPicker: React.ReactNode;
  received: number;
  expense: number;
  profit: number;
  pending: number;
  onBreakdown: (kind: 'profit' | 'received' | 'expense' | 'workValue') => void;
  onReceivables: () => void;
  onQuickPay: () => void;
  onRecord: (kind: 'income' | 'expense') => void;
  onTools: () => void;
  onCalendar: (date?: string) => void;
  onViewJob: (id: string) => void;
}

export default function PhoneDashboard({ jobs, month, periodPicker, received, expense, profit, pending, onBreakdown, onReceivables, onQuickPay, onRecord, onTools, onCalendar, onViewJob, fullFeatureAccess = false }: Props) {
  const work = workValueForMonth(jobs, month);
  const monthLabel = month === currentMonthKey() ? 'เดือนนี้' : new Intl.DateTimeFormat('th-TH', { month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${month}-01T12:00:00+07:00`));
  const today = nowInBangkok().toISOString().slice(0, 10);
  const next = [...buildCalendarEvents(jobs, today).values()].flat().filter(event => event.date >= today && event.kind !== 'paid' && (fullFeatureAccess || event.kind === 'post')).sort((a, b) => a.date.localeCompare(b.date))[0];
  const shortcuts = [
    ...(fullFeatureAccess ? [{ label: 'รับเงินด่วน', icon: ArrowDownToLine, action: onQuickPay, primary: true }] : [{ label: 'ปฏิทิน', icon: CalendarDays, action: () => onCalendar(), primary: true }]),
    { label: 'เพิ่มรายรับ', icon: Plus, action: () => onRecord('income'), primary: false },
    { label: 'เพิ่มรายจ่าย', icon: Receipt, action: () => onRecord('expense'), primary: false },
    { label: 'เพิ่มเติม', icon: MoreHorizontal, action: onTools, primary: false },
  ];
  return <div className="phone-overview" data-testid="phone-overview">
    <div className="phone-page-heading"><div><h1>ภาพรวม</h1><p>สรุป{monthLabel}</p></div><div className="phone-period">{periodPicker}</div></div>
    <section className="phone-bank-card" aria-label="สรุปเงินประจำเดือน">
      <div className="phone-bank-face"><span className="phone-bank-eyebrow">กระรอกตุนเงิน</span><span className="phone-month-tag">สรุป{monthLabel}</span><button type="button" className="phone-net" onClick={() => onBreakdown('profit')}><span>กำไรสุทธิ</span><strong data-testid="phone-profit">{money(profit)}</strong><small>ดูที่มา <ChevronRight /></small></button></div>
      <div className="phone-bank-cash"><button type="button" onClick={() => onBreakdown('received')}><span>รับเงินจริง</span><strong data-testid="phone-received">{money(received)}</strong><ChevronRight /></button><button type="button" onClick={() => onBreakdown('expense')}><span>รายจ่ายรวม</span><strong data-testid="phone-expenses">{money(expense)}</strong><ChevronRight /></button></div>
      <button type="button" className="phone-work-line" onClick={() => onBreakdown('workValue')}><span className="phone-work-icon"><Briefcase /></span><span><b>มูลค่างาน{monthLabel}</b><small>{work.count} งานในเดือน</small></span><strong>{money(work.value)}</strong><ChevronRight /></button>
    </section>
    {fullFeatureAccess && <button type="button" className="phone-pending" onClick={onReceivables}><span className="phone-pending-symbol"><Clock /></span><b>เงินรอรับ</b><span className="phone-pending-status">{pending > 0 && <i />} {pending > 0 ? 'มีรายการรอรับ' : 'ไม่มีรายการรอรับ'}</span><ChevronRight /></button>}
    <div className="phone-shortcuts">{shortcuts.map(({ label, icon: Icon, action, primary }) => <button key={label} type="button" onClick={action} className={primary ? 'primary' : undefined}><span><Icon /></span>{label}</button>)}</div>
    <div className="phone-section-heading"><h2>กำหนดถัดไป</h2><button type="button" onClick={() => onCalendar()}>ปฏิทิน <ChevronRight /></button></div>
    {next ? <button type="button" className="phone-agenda" onClick={() => onViewJob(next.jobId)}><span className="phone-date"><b>{Number(next.date.slice(8))}</b><small>{new Date(next.date + 'T12:00:00').toLocaleDateString('th-TH', { month: 'short' })}</small></span><span><small>{next.kind === 'post' ? 'กำหนดส่งงาน' : 'กำหนดรับเงิน'}</small><b>{next.jobName}</b></span><ChevronRight /></button> : <button type="button" className="phone-agenda" onClick={() => onCalendar()}><CalendarDays /><span><b>ดูปฏิทินการเงิน</b><small>ยังไม่มีกำหนดถัดไป</small></span><ChevronRight /></button>}
  </div>;
}
