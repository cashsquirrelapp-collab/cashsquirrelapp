import React from 'react';
import { createPortal } from 'react-dom';
import { Job, StatusOption } from '../../../../shared/types';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrency, safeFormatThaiDate, getRelativeDaysText } from '../../utils';
import { motion, AnimatePresence } from 'motion/react';
import { User, Clock, Edit2, Trash2 } from 'lucide-react';

interface JobDetailModalProps {
  job: Job | null;
  statuses: StatusOption[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function getStatusDisplay(statuses: StatusOption[], statusId: string, t: (key: string) => string) {
  const s = statuses.find((opt) => opt.id === statusId);
  if (!s) {
    if (statusId === 'unspecified') return { label: t('jobs.statusUnspecifiedLabel'), behavior: 'pending' as const };
    if (statusId === 'done') return { label: t('jobs.statusDoneLabel'), behavior: 'done' as const };
    if (statusId === 'partial') return { label: t('jobs.statusPartialLabel'), behavior: 'partial' as const };
    return { label: t('jobs.statusPendingLabel'), behavior: 'pending' as const };
  }
  return { label: s.label, behavior: s.behavior };
}

function getCategoryColor(type: string) {
  switch (type) {
    case 'Sponsored':
    case 'Sponsored Post':
      return { dot: 'bg-indigo-600' };
    case 'Video Production':
      return { dot: 'bg-emerald-600' };
    case 'Digital Product':
      return { dot: 'bg-purple-600' };
    case 'Consulting':
    case 'Consulting / Advisory':
      return { dot: 'bg-amber-600' };
    default:
      return { dot: 'bg-cyan-600' };
  }
}

// Read-only "what is this, how was it recorded" view -- mirrors the same card layout used
// in the Jobs tab list (same fields, same edit/delete icon pair), just shown for one job at
// a time when a Timeline entry is clicked. Editing/deleting stays a deliberate icon tap.
export function JobDetailModal({ job, statuses, onClose, onEdit, onDelete }: JobDetailModalProps) {
  const { t } = useLanguage();
  if (!job) return null;

  const statusInfo = getStatusDisplay(statuses, job.status, t);
  const isDone = statusInfo.behavior === 'done';
  const isPartial = statusInfo.behavior === 'partial';
  const catColors = getCategoryColor(job.type);
  const showPayCountdown = job.pending > 0 && job.payDate && job.isPosted !== false;
  const relText = showPayCountdown ? getRelativeDaysText(job.payDate) : null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-200">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/45 backdrop-blur-xs"
        />

        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-4"
        >
          <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mx-auto mb-3 shrink-0" />

          <div className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-stone-800 rounded-[var(--radius-lg)] p-5 space-y-4 relative overflow-hidden max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${catColors.dot}`} />

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <h4 className="text-lg font-extrabold text-brand-text dark:text-white leading-snug break-words">
                  {job.name}
                </h4>
                <div className="flex items-center gap-1.5 text-[11px] text-brand-muted font-medium flex-wrap">
                  <span>{job.type}</span>
                  {job.client && (
                    <>
                      <span className="opacity-40">•</span>
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{job.client}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-black font-mono text-brand-text dark:text-white">
                  {formatCurrency(job.value)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {job.isPosted === false && (
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-brand-faint text-brand-muted">
                  {t('jobs.badgeWip')}
                </span>
              )}
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${
                isDone
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                  : isPartial
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
              }`}>
                {statusInfo.label}
              </span>
            </div>

            {job.isPosted === false ? (
              <div className="flex items-center gap-2 text-[11px] text-brand-muted font-medium border-t border-brand-faint pt-3 flex-wrap">
                <span>{t('jobs.startedOn', { date: safeFormatThaiDate(job.startDate || job.postDate, { day: 'numeric', month: 'short' }) })}</span>
                <span className="opacity-40">|</span>
                <span>{job.postDate ? t('jobs.targetOnAir', { date: safeFormatThaiDate(job.postDate, { day: 'numeric', month: 'short' }) }) : t('jobs.statusUnspecifiedLabel')}</span>
                <span className="opacity-40">|</span>
                <span className="font-bold">
                  {t('jobs.creditColon', { text: job.creditTerm === 0 ? t('jobs.creditImmediate') : t('jobs.creditDaysSuffix', { n: job.creditTerm }) })}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-brand-muted font-medium border-t border-brand-faint pt-3 flex-wrap">
                <span>{t('jobs.dealDate', { date: safeFormatThaiDate(job.postDate) })}</span>
                <span className="opacity-40">|</span>
                {job.creditTerm === 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{t('jobs.noCreditLabel')}</span>
                ) : (
                  <>
                    <span className="font-bold">{t('jobs.creditDaysLabel', { n: job.creditTerm })}</span>
                    {job.payDate && (
                      <span>{t('jobs.dueDateParen', { date: safeFormatThaiDate(job.payDate, { day: 'numeric', month: 'short' }) })}</span>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-brand-faint p-2.5 rounded-xl">
                <span className="text-[9px] text-brand-muted uppercase font-extrabold tracking-wider block">{t('jobs.received')}</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm">{formatCurrency(job.received)}</span>
              </div>
              <div className={`p-2.5 rounded-xl ${job.pending > 0 ? 'bg-amber-500/10' : 'bg-brand-faint'}`}>
                <span className={`text-[9px] uppercase font-extrabold tracking-wider block ${job.pending > 0 ? 'text-amber-600 dark:text-amber-400/80' : 'text-brand-muted'}`}>{t('jobs.pendingAmount')}</span>
                <span className={`font-extrabold font-mono text-sm ${job.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-brand-muted'}`}>
                  {formatCurrency(job.pending)}
                </span>
              </div>
            </div>

            {job.installments && job.installments.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-brand-border/60 bg-brand-faint/50 p-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-black text-brand-text dark:text-white">ตารางชำระ</h5>
                  <span className="text-[10px] font-bold text-brand-muted">{job.installments.filter((row) => row.status === 'paid').length}/{job.installments.length} งวดแล้ว</span>
                </div>
                {job.installments.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-2.5 dark:bg-stone-850">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-black text-brand-text dark:text-white">{row.label}</p>
                      <p className="text-[9px] font-semibold text-brand-muted">{row.status === 'paid' ? `รับแล้ว ${safeFormatThaiDate(row.paidAt)}` : row.dueDate ? `ครบกำหนด ${safeFormatThaiDate(row.dueDate)}` : 'ยังไม่ระบุวันครบกำหนด'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black font-mono ${row.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{formatCurrency(row.amount)}</p>
                      <span className={`text-[9px] font-bold ${row.status === 'paid' ? 'text-emerald-600' : 'text-brand-muted'}`}>{row.status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {job.whtRate && job.whtRate > 0 ? (
              <div className="flex items-center justify-between text-[10px] bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl text-amber-800 dark:text-amber-400 font-bold leading-none select-none">
                <span>{t('jobs.whtDeducted', { rate: job.whtRate })}</span>
                <span className="font-mono">-{formatCurrency(job.whtAmount || 0)}</span>
              </div>
            ) : null}

            {showPayCountdown && relText && (
              <div className={`p-2.5 rounded-xl text-xs flex items-center justify-between font-semibold border ${
                relText.isOverdue
                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-100/40 dark:border-rose-500/10'
                  : 'bg-amber-50/50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-100/40 dark:border-amber-500/10'
              }`}>
                <span className="flex items-center gap-1">
                  <Clock className={`w-4 h-4 shrink-0 ${relText.isOverdue ? 'text-rose-500' : 'text-amber-500'}`} /> {t('jobs.timeUntilDue')}
                </span>
                <span className="font-black">{relText.text}</span>
              </div>
            )}

            {job.note && (
              <p className="text-xs text-brand-muted bg-brand-faint p-2.5 rounded-xl border border-brand-border/40 italic">
                {t('jobs.noteLabel', { note: job.note })}
              </p>
            )}

            <div className="flex items-center justify-end gap-1 pt-1">
              <button
                onClick={onEdit}
                className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 rounded-lg transition-colors cursor-pointer"
                title={t('jobs.editTooltip')}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                title={t('jobs.deleteTooltip')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
