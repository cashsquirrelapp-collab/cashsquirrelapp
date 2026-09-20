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
  ChevronRight
} from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { IconCoin, IconWarning, IconCheck } from '../../components/ui/icons';
import { JobDetailModal } from '../jobs/JobDetailModal';
import { useLanguage } from '../../i18n/LanguageContext';

interface TimelineTabProps {
  jobs: Job[];
  settings: AppSettings;
  statuses: StatusOption[];
  // Called when the user explicitly taps the edit icon inside the read-only detail view --
  // clicking a Timeline row itself only opens that read-only view, never the edit form directly.
  onEditJob?: (jobId: string) => void;
  onDeleteJob: (jobId: string) => void;
}

export default function TimelineTab({ jobs, settings, statuses, onEditJob, onDeleteJob }: TimelineTabProps) {
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
      // 1. Confirmed portion: lands on the payDate || postDate month
      if (j.received > 0 && getMonthKey(j.payDate || j.postDate) === monthKey) {
        totalConfirmed += j.received;
        const isDone = j.status === 'done' || statuses.find(s => s.id === j.status)?.behavior === 'done';
        monthlyEvents.push({
          id: `${j.id}-rec`,
          jobId: j.id,
          title: j.name + (!isDone ? t('timeline.depositSuffix') : ''),
          client: j.client,
          amount: j.received,
          isConfirmed: true,
          dateStr: j.payDate || j.postDate || '',
          daysRemainingText: t('timeline.receivedStatus'),
          isOverdue: false,
        });
      }

      // 2. Pending portion: lands on the payDate month (or postDate month if payDate is null).
      // WIP jobs (not yet posted/delivered) are shown for visibility but excluded from the
      // month's total — they're a forecast of work that hasn't happened yet, not expected income.
      // Trust the recorded `pending` field as-is, same as Dashboard/Summary -- don't also gate on
      // isPaid, or a job whose paid flag and pending amount have drifted out of sync silently
      // vanishes from every tab instead of surfacing as money still owed.
      if (j.pending > 0) {
        const expectedPayDate = j.payDate || j.postDate;
        if (getMonthKey(expectedPayDate) === monthKey) {
          const isWip = j.isPosted === false;
          if (!isWip) {
            totalPending += j.pending;
          }
          const rel = getRelativeDaysText(expectedPayDate);

          monthlyEvents.push({
            id: `${j.id}-pend`,
            jobId: j.id,
            title: j.name + (isWip ? t('timeline.wipForecastSuffix') : j.creditTerm > 0 ? t('timeline.creditDaysSuffixParen', { n: j.creditTerm }) : ''),
            client: j.client,
            amount: j.pending,
            isConfirmed: false,
            dateStr: expectedPayDate || '',
            daysRemainingText: isWip ? t('timeline.wipWaitingOnAir', { text: rel.text }) : rel.text,
            isOverdue: rel.isOverdue,
            isWipPending: isWip,
          });
        }
      }

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <span className="text-xs font-semibold tracking-wider text-brand-muted uppercase inline-flex items-center gap-1">
            {t('timeline.subtitle')}
          </span>
          <h2 className="text-3xl font-bold font-display text-brand-text tracking-tight mt-0.5">
            {t('timeline.title')}
          </h2>
        </div>
      </div>

      {/* Intro info box */}
      <div className="bg-brand-faint border border-brand-border/60 rounded-2xl p-4 text-xs font-medium text-brand-muted flex items-center gap-3">
        <Mascot mood="happy" size={36} animated={true} className="shrink-0" />
        <p className="leading-relaxed">
{t('timeline.introBefore')} <span className="text-brand-text font-bold">Credit Terms</span> {t('timeline.introAfter')}
        </p>
      </div>

      {/* Month cards */}
      <div className="space-y-6 relative">
        {/* Continuous line connecting months */}
        <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-brand-border pointer-events-none" />

        {timelineMonths.map((m, mIdx) => (
          <motion.div
            key={m.monthKey}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: mIdx * 0.1 }}
            className="relative pl-12 space-y-4"
          >
            {/* Timeline Node Point */}
            <div className={`absolute left-4 top-3 w-4 h-4 rounded-full border-4 border-white dark:border-stone-900 z-10 shadow-sm ${
              m.isShortfall ? 'bg-rose-500 ring-4 ring-rose-500/10' : 'bg-emerald-500 ring-4 ring-emerald-500/10'
            }`} />

            {/* Month title */}
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold font-display text-brand-text tracking-tight">
                {formatMonthKey(m.monthKey)}
              </h3>
            </div>

            {/* Month Header and Total expected income - HIGHLY VISIBLE */}
            <div className="bg-brand-white border border-brand-border rounded-xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[10px] text-brand-muted uppercase font-extrabold tracking-wider flex items-center gap-1">
                  <IconCoin className="w-2.5 h-2.5" /> {t('timeline.totalIncomeLabel')}
                </span>
                <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(m.totalIncome)}
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                  m.isShortfall
                    ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-500/10'
                    : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-100/10'
                }`}>
                  {m.isShortfall ? <IconWarning className="w-2.5 h-2.5" /> : <IconCheck className="w-2.5 h-2.5" />}
                  {m.isShortfall ? t('timeline.shortfallBadge') : t('timeline.safeBadge')}
                </span>
                <span className="text-[10px] text-brand-muted mt-1.5 block">
                  {t('timeline.expenseThreshold', { amount: formatCurrency(settings.monthlyExpense) })}
                </span>
              </div>
            </div>

            {/* List of payment events in this month */}
            <div className="space-y-2.5">
              {m.events.length === 0 ? (
                <div className="bg-brand-white border border-brand-border/60 rounded-xl p-5 text-center text-brand-muted text-xs flex flex-col items-center justify-center gap-2">
                  <Mascot mood="sleepy" size={56} className="mx-auto" />
                  <span>{t('timeline.emptyMonth')}</span>
                </div>
              ) : (
                m.events.map((evt, evtIdx) => {
                  const isWipMilestone = evt.isWipMilestone;
                  const isWipPending = evt.isWipPending;
                  
                  let borderLeftClass = 'border-l-amber-500';
                  if (evt.isConfirmed) {
                    borderLeftClass = 'border-l-emerald-500';
                  } else if (evt.isOverdue) {
                    borderLeftClass = 'border-l-rose-500';
                  } else if (isWipMilestone) {
                    borderLeftClass = 'border-l-indigo-500';
                  } else if (isWipPending) {
                    borderLeftClass = 'border-l-violet-500';
                  }

                  return (
                    <div
                      key={evt.id}
                      onClick={() => setViewJobId(evt.jobId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewJobId(evt.jobId); } }}
                      className={`bg-brand-white border border-brand-border rounded-xl p-4 flex items-center justify-between gap-4 shadow-2xs hover:shadow-xs transition-all border-l-4 ${borderLeftClass} cursor-pointer active:scale-[0.99]`}
                    >
                      <div className="flex items-start gap-1 min-w-0">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-brand-text truncate max-w-[200px]">
                            {evt.title}
                          </h4>
                          <p className="text-[10px] text-brand-muted font-medium flex items-center gap-1">
                            <span>{evt.client || t('timeline.noClient')}</span>
                            <span>•</span>
                            <span>{new Date(evt.dateStr).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}</span>
                          </p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-brand-muted/50 shrink-0 mt-0.5" />
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {isWipMilestone ? (
                          <p className="text-xs font-semibold text-brand-muted italic">
                            {t('timeline.awaitingDelivery')}
                          </p>
                        ) : (
                          <p className={`text-sm font-bold font-mono ${evt.isConfirmed ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {formatCurrency(evt.amount)}
                          </p>
                        )}
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md border ${
                          evt.isConfirmed
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : evt.isOverdue
                            ? 'bg-rose-500/10 text-rose-600 border-rose-500/20 animate-pulse'
                            : isWipMilestone
                            ? 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20'
                            : isWipPending
                            ? 'bg-violet-500/10 text-violet-700 border-violet-500/20'
                            : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                        }`}>
                          <Clock className="w-2.5 h-2.5 shrink-0" /> {evt.daysRemainingText}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Month Summary strip */}
            <div className={`p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold ${
              m.isShortfall 
                ? 'bg-rose-50/60 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-rose-800 dark:text-rose-200' 
                : 'bg-emerald-50/40 dark:bg-emerald-500/10 border border-emerald-100/50 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-1.5">
                {m.isShortfall ? (
                  <ArrowDownRight className="w-4 h-4 text-rose-500" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                )}
                <span>
                  {m.isShortfall 
                    ? t('timeline.shortfallSummary', { amount: formatCurrency(Math.abs(m.balance)) })
                    : t('timeline.profitSummary', { amount: formatCurrency(m.balance) })
                  }
                </span>
              </div>
              <div className="text-[10px] text-brand-muted font-normal flex gap-3">
                <span>{t('timeline.receivedColon')} <strong className="font-mono text-brand-text font-bold">{formatCurrency(m.totalConfirmed)}</strong></span>
                <span>{t('timeline.pendingColon')} <strong className="font-mono text-brand-text font-bold">{formatCurrency(m.totalPending)}</strong></span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <JobDetailModal
        job={viewedJob}
        statuses={statuses}
        onClose={() => setViewJobId(null)}
        onEdit={() => {
          const id = viewJobId;
          setViewJobId(null);
          if (id) onEditJob?.(id);
        }}
        onDelete={() => {
          const id = viewJobId;
          setViewJobId(null);
          if (id) onDeleteJob(id);
        }}
      />
    </div>
  );
}
