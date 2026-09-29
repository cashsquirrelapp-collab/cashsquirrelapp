import React, { useState } from 'react';
import { Job, AppSettings, StatusOption } from '../../../../shared/types';
import { formatCurrency, getForecastMonths, formatMonthKey, getMonthKey, getRelativeDaysText, dateLocale } from '../../utils';
import { motion } from 'motion/react';
import {
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { IconCoin, IconWarning, IconCheck } from '../../components/ui/icons';
import { JobDetailModal } from '../jobs/JobDetailModal';
import { useLanguage } from '../../i18n/LanguageContext';
import { getJobPaymentEntries, getJobPendingEntries, getMonthKeyFromDate } from '../../../../shared/installmentPayments';

interface TimelineTabProps {
  jobs: Job[];
  settings: AppSettings;
  statuses: StatusOption[];
  // Called when the user explicitly taps the edit icon inside the read-only detail view --
  // clicking a Timeline row itself only opens that read-only view, never the edit form directly.
  onEditJob?: (jobId: string) => void;
  onDeleteJob: (jobId: string) => void;
  onBack: () => void;
}

export default function TimelineTab({ jobs, settings, statuses, onEditJob, onDeleteJob, onBack }: TimelineTabProps) {
  const { t } = useLanguage();
  const forecastMonths = getForecastMonths();
  const [viewJobId, setViewJobId] = useState<string | null>(null);
  const viewedJob = viewJobId ? jobs.find((j) => j.id === viewJobId) || null : null;

  // Create timeline events grouped by month
  const timelineMonths = forecastMonths.map(monthKey => {
    const monthlyEvents: Array<{
      id: string;
      jobId: string;
      title: string;
      client: string;
      amount: number;
      isConfirmed: boolean;
      dateStr: string;
      daysRemainingText: string;
      isOverdue: boolean;
      isWipMilestone?: boolean;
      isWipPending?: boolean;
    }> = [];

    let totalConfirmed = 0;
    let totalPending = 0;

    jobs.forEach(j => {
      // 1. Confirmed cash: installment jobs create one event per paid installment.
      getJobPaymentEntries(j).filter((entry) => getMonthKeyFromDate(entry.date) === monthKey).forEach((entry) => {
        totalConfirmed += entry.amount;
        monthlyEvents.push({
          id: `${j.id}-rec-${entry.id}`,
          jobId: j.id,
          title: entry.kind === 'installment' ? `${j.name} • ${entry.label}` : j.name,
          client: j.client,
          amount: entry.amount,
          isConfirmed: true,
          dateStr: entry.date || '',
          daysRemainingText: t('timeline.receivedStatus'),
          isOverdue: false,
        });
      });

      // 2. Pending portion: lands on the payDate month (or postDate month if payDate is null).
      // WIP jobs (not yet posted/delivered) are shown for visibility but excluded from the
      // month's total — they're a forecast of work that hasn't happened yet, not expected income.
      // Trust the recorded `pending` field as-is, same as Dashboard/Summary -- don't also gate on
      // isPaid, or a job whose paid flag and pending amount have drifted out of sync silently
      // vanishes from every tab instead of surfacing as money still owed.
      getJobPendingEntries(j).filter((entry) => getMonthKeyFromDate(entry.dueDate) === monthKey).forEach((entry) => {
        const expectedPayDate = entry.dueDate;
          const isWip = j.isPosted === false;
          if (!isWip) {
            totalPending += entry.amount;
          }
          const rel = getRelativeDaysText(expectedPayDate);

          monthlyEvents.push({
            id: `${j.id}-pend-${entry.id}`,
            jobId: j.id,
            title: entry.kind === 'installment' ? `${j.name} • ${entry.label}` : j.name + (isWip ? t('timeline.wipForecastSuffix') : j.creditTerm > 0 ? t('timeline.creditDaysSuffixParen', { n: j.creditTerm }) : ''),
            client: j.client,
            amount: entry.amount,
            isConfirmed: false,
            dateStr: expectedPayDate || '',
            daysRemainingText: isWip ? t('timeline.wipWaitingOnAir', { text: rel.text }) : rel.text,
            isOverdue: rel.isOverdue,
            isWipPending: isWip,
          });
      });

      // 3. WIP Milestone: lands on the postDate month (Target production/on-air)
      if (j.isPosted === false && j.postDate) {
        if (getMonthKey(j.postDate) === monthKey) {
          const rel = getRelativeDaysText(j.postDate);
          monthlyEvents.push({
            id: `${j.id}-milestone`,
            jobId: j.id,
            title: t('timeline.wipMilestoneTitle', { name: j.name }),
            client: j.client,
            amount: 0,
            isConfirmed: false,
            dateStr: j.postDate,
            daysRemainingText: t('timeline.productionTimeLeft', { text: rel.text }),
            isOverdue: rel.isOverdue,
            isWipMilestone: true,
          });
        }
      }
    });

    // Sort monthly events by date ascending
    monthlyEvents.sort((a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime());

    const totalIncome = totalConfirmed + totalPending;
    const isShortfall = totalIncome < settings.monthlyExpense;
    const balance = totalIncome - settings.monthlyExpense;

    return {
      monthKey,
      events: monthlyEvents,
      totalConfirmed,
      totalPending,
      totalIncome,
      isShortfall,
      balance,
    };
  });

  const calendarMonth = timelineMonths[0];
  const [calendarYear, calendarMonthIndex] = calendarMonth.monthKey.split('-').map(Number);
  const calendarDayCount = new Date(calendarYear, calendarMonthIndex, 0).getDate();
  const calendarStartDay = new Date(calendarYear, calendarMonthIndex - 1, 1).getDay();
  const eventsByDay = new Map<number, typeof calendarMonth.events>();
  calendarMonth.events.forEach(event => {
    const day = Number(event.dateStr?.slice(8, 10));
    if (!day) return;
    eventsByDay.set(day, [...(eventsByDay.get(day) || []), event]);
  });

  return (
    <div className="draft10-calendar page-content">
      <div className="draft10-calendar-heading">
        <h1>ปฏิทิน · {formatMonthKey(calendarMonth.monthKey)}</h1>
        <div><button className="is-active">เดือน</button><button>สัปดาห์</button></div>
      </div>
      <div className="draft10-calendar-legend">
        <span className="blue">งาน/นัดหมาย</span><span className="orange">Credit Term</span><span className="amber">ใกล้ครบกำหนด</span><span className="green">เงินเข้า</span><span className="red">เกินกำหนด</span>
      </div>
      <div className="draft10-calendar-layout">
        <section className="draft10-calendar-grid">
          {['อา','จ','อ','พ','พฤ','ศ','ส'].map(day => <span key={day} className="draft10-calendar-dayname">{day}</span>)}
          {Array.from({length: calendarStartDay}, (_, index) => <span key={`blank-${index}`} className="draft10-calendar-cell is-blank" />)}
          {Array.from({length: calendarDayCount}, (_, index) => index + 1).map(day => (
            <button key={day} type="button" className="draft10-calendar-cell">
              <b>{day}</b>
              {(eventsByDay.get(day) || []).slice(0, 2).map(event => (
                <span key={event.id} className={event.isConfirmed ? 'green' : event.isOverdue ? 'red' : event.isWipMilestone ? 'blue' : 'orange'}>{event.title}</span>
              ))}
            </button>
          ))}
        </section>
        <aside className="draft10-calendar-agenda">
          <h2>รายการวันนี้</h2>
          {(calendarMonth.events.length ? calendarMonth.events.slice(0, 4) : []).map(event => (
            <button key={event.id} type="button" onClick={() => setViewJobId(event.jobId)}><i className={event.isConfirmed ? 'green' : event.isOverdue ? 'red' : 'orange'} />{event.title}</button>
          ))}
          {!calendarMonth.events.length && <p>ยังไม่มีรายการในเดือนนี้</p>}
        </aside>
      </div>
      {viewedJob && <JobDetailModal job={viewedJob} statuses={statuses} onClose={() => setViewJobId(null)} onEdit={() => onEditJob?.(viewedJob.id)} onDelete={() => onDeleteJob(viewedJob.id)} />}
    </div>
  );
}
