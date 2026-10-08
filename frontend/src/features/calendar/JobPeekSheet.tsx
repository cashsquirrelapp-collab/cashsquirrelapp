import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Clock, Pencil, Trash2, User } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { jobNetReceivable, jobWhtAmount } from '../../../../shared/wht';
import { formatCurrency, safeFormatThaiDate, toLocalDateKey } from '../../utils';

// A job opened from the timeline: a card that springs up from the bottom over a blurred page,
// with the same facts as the job's row on the Jobs page. Edit / delete / open-in-Jobs stay as
// deliberate taps; tapping outside or Esc closes it.

const dayMs = 86400000;
const daysFromToday = (dateKey: string) =>
  Math.round((new Date(`${dateKey}T00:00:00`).getTime() - new Date(`${toLocalDateKey()}T00:00:00`).getTime()) / dayMs);

export function JobPeekSheet({ job, onClose, onOpenInJobs, onEdit, onDelete }: {
  job: Job | null;
  onClose: () => void;
  onOpenInJobs: (job: Job) => void;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
}) {
  React.useEffect(() => {
    if (!job) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [job, onClose]);

  return createPortal(
    <AnimatePresence>
      {job && (
        <div className="fixed inset-0 z-[200]" key="job-peek">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={job.name}
            className="absolute bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 240 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose(); }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/80 dark:bg-white/30" aria-hidden />
            <JobCard job={job} onOpenInJobs={onOpenInJobs} onEdit={onEdit} onDelete={onDelete} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function JobCard({ job, onOpenInJobs, onEdit, onDelete }: { job: Job; onOpenInJobs: (job: Job) => void; onEdit: (job: Job) => void; onDelete: (job: Job) => void }) {
  const net = jobNetReceivable(job);
  const wht = jobWhtAmount(job);
  const received = job.received || 0;
  const pending = Math.max(0, job.pending || 0);
  const status = pending <= 0 && received > 0 ? 'done' : received > 0 ? 'partial' : 'pending';
  const badge = {
    done: { label: 'รับเงินครบแล้ว', cls: 'bg-[#E9F7F0] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]' },
    partial: { label: 'รับบางส่วน', cls: 'bg-[#FFF4E0] text-[#A65F00] dark:bg-[#F4B63F]/10 dark:text-[#F4C66B]' },
    pending: { label: 'ยังไม่ได้รับเงิน', cls: 'bg-[#FDEEEE] text-[#C43A3A] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]' },
  }[status];
  const due = pending > 0 && job.payDate && job.isPosted !== false ? daysFromToday(job.payDate) : null;
  const dueText = due === null ? '' : due < 0 ? `เกินกำหนด ${-due} วัน` : due === 0 ? 'ครบกำหนดวันนี้' : `อีก ${due} วัน`;

  return (
    <div className="relative max-h-[80vh] space-y-4 overflow-y-auto rounded-[20px] border border-brand-border bg-brand-white p-5 pl-6 shadow-2xl dark:bg-[#1F2024]">
      <span className="absolute inset-y-0 left-0 w-1 bg-[#E65F2B]" aria-hidden />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="break-words text-[18px] font-semibold leading-snug text-brand-text">{job.name}</h2>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-brand-muted">
            <span>{job.type}</span>
            {job.client && <><span className="opacity-40">•</span><span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{job.client}</span></>}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[24px] font-semibold text-brand-text">{formatCurrency(job.value || 0)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {job.isPosted === false && <span className="rounded-lg bg-brand-faint px-2.5 py-1 text-[11px] font-semibold text-brand-muted">กำลังทำ</span>}
        <span className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
      </div>

      <p className="flex flex-wrap items-center gap-2 border-t border-brand-border pt-3 text-xs text-brand-muted">
        <span>วันดีล/ส่งงาน {job.postDate ? safeFormatThaiDate(job.postDate) : '—'}</span>
        <span className="opacity-40">|</span>
        {job.creditTerm > 0
          ? <span><span className="font-semibold text-brand-text">เครดิต {job.creditTerm} วัน</span>{job.payDate ? ` (ครบกำหนดชำระ ${safeFormatThaiDate(job.payDate, { day: 'numeric', month: 'short' })})` : ''}</span>
          : <span className="font-semibold text-[#12804F] dark:text-[#6FD3A3]">ไม่มีเครดิต</span>}
      </p>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-brand-faint px-3 py-2.5">
          <span className="block text-[11px] font-medium text-brand-muted">รับแล้ว</span>
          <span className="font-mono text-[15px] font-semibold text-[#12804F] dark:text-[#6FD3A3]">{formatCurrency(received)}</span>
        </div>
        <div className={`rounded-2xl px-3 py-2.5 ${pending > 0 ? 'bg-[#FFF1E8] dark:bg-[#E65F2B]/12' : 'bg-brand-faint'}`}>
          <span className={`block text-[11px] font-medium ${pending > 0 ? 'text-[#C24A16] dark:text-[#FF9A6B]' : 'text-brand-muted'}`}>ค้างรับ</span>
          <span className={`font-mono text-[15px] font-semibold ${pending > 0 ? 'text-[#C24A16] dark:text-[#FF9A6B]' : 'text-brand-muted'}`}>{formatCurrency(pending)}</span>
        </div>
      </div>

      {wht > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-[#F3D9B5] bg-[#FFF8EE] px-3 py-2 text-xs font-medium text-[#8A5A00] dark:border-[#F4B63F]/25 dark:bg-[#F4B63F]/10 dark:text-[#F4C66B]">
          <span>หัก ณ ที่จ่าย {job.whtRate}%</span><span className="font-mono">-{formatCurrency(wht)}</span>
        </div>
      )}
      {wht > 0 && <p className="-mt-2 text-right text-[11px] text-brand-muted">ยอดรับสุทธิ {formatCurrency(net)}</p>}

      {due !== null && (
        <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-medium ${due < 0 ? 'bg-[#FDEEEE] text-[#B83434] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]' : 'bg-[#FFF8F2] text-[#A8481C] dark:bg-[#E65F2B]/10 dark:text-[#FF9A6B]'}`}>
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />กำหนดชำระเงินที่เหลือ</span>
          <span className="font-semibold">{dueText}</span>
        </div>
      )}

      {job.note && <p className="rounded-xl bg-brand-faint px-3 py-2.5 text-xs text-brand-muted">หมายเหตุ: {job.note}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={() => onOpenInJobs(job)}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-border text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
          ดูในหน้างาน <ArrowRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onEdit(job)} aria-label="แก้ไขงาน" title="แก้ไข"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#C24A16] transition-colors hover:bg-[#FFF1E8] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10"><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={() => onDelete(job)} aria-label="ลบงาน" title="ลบ"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#C43A3A] transition-colors hover:bg-[#FDEEEE] cursor-pointer dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
