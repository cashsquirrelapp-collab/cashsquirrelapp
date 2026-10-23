import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Clock, Pencil, Trash2, User } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { jobNetReceivable, jobWhtAmount } from '../../../../shared/wht';
import { formatCurrency, safeFormatThaiDate, toLocalDateKey } from '../../utils';
import { useMobileLayout } from '../mobile/useMobileLayout';

import { tr } from '../../i18n/tr';
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
  const phone = useMobileLayout();
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
          {phone ? (
            <motion.div
              role="dialog" aria-modal="true" aria-label={job.name}
              className="absolute inset-x-0 bottom-0"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose(); }}
            >
              <PhoneJobCard job={job} onOpenInJobs={onOpenInJobs} onEdit={onEdit} onDelete={onDelete} />
            </motion.div>
          ) : (
            // Computers and iPads (owner, 2026-10-21): a centred panel, not a sheet rising from the bottom.
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <motion.div
                role="dialog" aria-modal="true" aria-label={job.name}
                className="pointer-events-auto w-full max-w-[520px]"
                initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <JobCard job={job} onOpenInJobs={onOpenInJobs} onEdit={onEdit} onDelete={onDelete} />
              </motion.div>
            </div>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// Computers and iPads: the job as a calm statement on a wide panel. The value and how much of it is in
// lead; the facts sit in a two-column list; actions line up on the right, the primary one last.
function JobCard({ job, onOpenInJobs, onEdit, onDelete }: { job: Job; onOpenInJobs: (job: Job) => void; onEdit: (job: Job) => void; onDelete: (job: Job) => void }) {
  const net = jobNetReceivable(job);
  const wht = jobWhtAmount(job);
  const received = job.received || 0;
  const pending = Math.max(0, job.pending || 0);
  const status = pending <= 0 && received > 0 ? 'done' : received > 0 ? 'partial' : 'pending';
  const badge = {
    done: { label: tr("รับเงินครบแล้ว"), cls: 'bg-[#E9F7F0] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]' },
    partial: { label: tr("รับบางส่วน"), cls: 'bg-[#FFF4E0] text-[#A65F00] dark:bg-[#F4B63F]/10 dark:text-[#F4C66B]' },
    pending: { label: tr("ยังไม่ได้รับเงิน"), cls: 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/12 dark:text-[#FF9A6B]' },
  }[status];
  const due = pending > 0 && job.payDate && job.isPosted !== false ? daysFromToday(job.payDate) : null;
  const dueText = due === null ? '' : due < 0 ? tr("เกินกำหนด {0} วัน", -due) : due === 0 ? tr("ครบกำหนดวันนี้") : tr("อีก {0} วัน", due);
  const share = net > 0 ? Math.min(1, received / net) : 0;
  const facts: [string, React.ReactNode][] = [
    [tr("วันดีล/ส่งงาน"), job.postDate ? safeFormatThaiDate(job.postDate) : '—'],
    [tr("เครดิต"), job.creditTerm > 0 ? tr("{0} วัน{1}", job.creditTerm, job.payDate ? tr(" · ครบ {0}", safeFormatThaiDate(job.payDate, { day: 'numeric', month: 'short' })) : '') : tr("ไม่มีเครดิต")],
    ...(due !== null ? [[tr("กำหนดชำระเงินที่เหลือ"), <span className={due < 0 ? 'text-[#C43A3A] dark:text-[#F19A9A]' : 'text-[#C24A16] dark:text-[#FF9A6B]'}>{dueText}</span>] as [string, React.ReactNode]] : []),
    ...(wht > 0 ? [[tr("หัก ณ ที่จ่าย {0}%", job.whtRate), tr("-{0} · สุทธิ {1}", formatCurrency(wht), formatCurrency(net))] as [string, React.ReactNode]] : []),
    ...(job.isPosted === false ? [[tr("สถานะงาน"), tr("กำลังทำ")] as [string, React.ReactNode]] : []),
  ];
  return (
    <div className="max-h-[85vh] overflow-y-auto rounded-[22px] border border-brand-border bg-brand-white p-6 shadow-[0_30px_80px_-30px_rgba(48,32,24,0.45)] dark:bg-[#1F2024]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-brand-muted">
            <span>{job.type}</span>
            {job.client && <><span className="opacity-40">·</span><span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{job.client}</span></>}
          </p>
          <h2 className="mt-1 break-words text-[19px] font-semibold leading-snug text-brand-text">{job.name}</h2>
        </div>
        <span className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${badge.cls}`}>{badge.label}</span>
      </div>

      <div className="mt-5 rounded-2xl bg-brand-faint/70 p-4 dark:bg-white/[0.04]">
        <div className="grid grid-cols-3 gap-3">
          <div><p className="text-[12px] text-brand-muted">{tr("มูลค่างาน")}</p><p className="mt-0.5 font-mono text-[24px] font-semibold leading-tight tracking-[-0.02em] text-brand-text">{formatCurrency(job.value || 0)}</p></div>
          <div><p className="text-[12px] text-brand-muted">{tr("รับแล้ว")}</p><p className="mt-0.5 font-mono text-[18px] font-semibold leading-tight text-[#12804F] dark:text-[#6FD3A3]" style={{ marginTop: 7 }}>{formatCurrency(received)}</p></div>
          <div className="text-right"><p className="text-[12px] text-brand-muted">{tr("ค้างรับ")}</p><p className={`font-mono text-[18px] font-semibold leading-tight ${pending > 0 ? 'text-[#C24A16] dark:text-[#FF9A6B]' : 'text-brand-text'}`} style={{ marginTop: 7 }}>{formatCurrency(pending)}</p></div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-border" role="img" aria-label={tr("รับแล้ว {0} จาก {1}", formatCurrency(received), formatCurrency(net))}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#18A66A] to-[#3CC287]" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 px-1">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0"><dt className="text-[12px] text-brand-muted">{label}</dt><dd className="mt-0.5 flex items-center gap-1 text-[13.5px] font-medium text-brand-text">{label === tr("กำหนดชำระเงินที่เหลือ") && <Clock className="h-3.5 w-3.5" aria-hidden />}{value}</dd></div>
        ))}
      </dl>

      {job.note && <p className="mt-4 rounded-xl bg-brand-faint px-3 py-2.5 text-[12.5px] leading-relaxed text-brand-muted">{tr("หมายเหตุ: {0}", job.note)}</p>}

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-brand-border pt-4">
        <button type="button" onClick={() => onDelete(job)}
          className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-[#C43A3A] transition-colors hover:bg-[#FDEEEE] cursor-pointer dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10"><Trash2 className="h-4 w-4" />{tr("ลบงาน")}</button>
        <button type="button" onClick={() => onEdit(job)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-border px-4 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"><Pencil className="h-4 w-4" />{tr("แก้ไขงาน")}</button>
        <button type="button" onClick={() => onOpenInJobs(job)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">{tr("ดูในหน้างาน")}{' '}<ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// Phones (owner, 2026-10-21: "ทางการมากกว่านี้"): a plain bottom sheet set like a statement. The job and
// its status, the value with how much of it is in, the facts as label and value rows, then the actions:
// one clear primary, edit and delete as quiet buttons beside each other.
function PhoneJobCard({ job, onOpenInJobs, onEdit, onDelete }: { job: Job; onOpenInJobs: (job: Job) => void; onEdit: (job: Job) => void; onDelete: (job: Job) => void }) {
  const net = jobNetReceivable(job);
  const wht = jobWhtAmount(job);
  const received = job.received || 0;
  const pending = Math.max(0, job.pending || 0);
  const status = pending <= 0 && received > 0 ? 'done' : received > 0 ? 'partial' : 'pending';
  const label = { done: tr("รับเงินครบแล้ว"), partial: tr("รับบางส่วน"), pending: tr("ยังไม่ได้รับเงิน") }[status];
  const due = pending > 0 && job.payDate && job.isPosted !== false ? daysFromToday(job.payDate) : null;
  const dueText = due === null ? '' : due < 0 ? tr("เกินกำหนด {0} วัน", -due) : due === 0 ? tr("ครบกำหนดวันนี้") : tr("อีก {0} วัน", due);
  const share = net > 0 ? Math.min(1, received / net) : 0;
  return (
    <div className="ksm ksm-peek">
      <span className="ksm-peek-grip" aria-hidden="true" />
      <header className="ksm-peek-head">
        <p className="ksm-peek-meta">{[job.type, job.client].filter(Boolean).join(' · ')}</p>
        <div className="ksm-peek-titlerow">
          <h2 className="ksm-peek-title">{job.name}</h2>
          <span className={`ksm-peek-status is-${status}`}>{label}</span>
        </div>
      </header>
      <section className="ksm-peek-sum" aria-label={tr("ยอดเงินของงาน")}>
        <div className="ksm-peek-value"><small>{tr("มูลค่างาน")}</small><strong>{formatCurrency(job.value || 0)}</strong></div>
        <div className="ksm-peek-bar" role="img" aria-label={tr("รับแล้ว {0} จาก {1}", formatCurrency(received), formatCurrency(net))}><i style={{ width: `${Math.round(share * 100)}%` }} /></div>
        <div className="ksm-peek-split">
          <div><small>{tr("รับแล้ว")}</small><b className="is-received">{formatCurrency(received)}</b></div>
          <div><small>{tr("ค้างรับ")}</small><b className={pending > 0 ? 'is-owed' : ''}>{formatCurrency(pending)}</b></div>
        </div>
      </section>
      <dl className="ksm-peek-facts">
        {job.isPosted === false && <div><dt>{tr("สถานะงาน")}</dt><dd>{tr("กำลังทำ")}</dd></div>}
        <div><dt>{tr("วันดีล/ส่งงาน")}</dt><dd>{job.postDate ? safeFormatThaiDate(job.postDate) : '—'}</dd></div>
        <div><dt>{tr("เครดิต")}</dt><dd>{job.creditTerm > 0 ? tr("{0} วัน{1}", job.creditTerm, job.payDate ? tr(" · ครบ {0}", safeFormatThaiDate(job.payDate, { day: 'numeric', month: 'short' })) : '') : tr("ไม่มีเครดิต")}</dd></div>
        {due !== null && <div><dt>{tr("กำหนดชำระเงินที่เหลือ")}</dt><dd className={due < 0 ? 'is-late' : 'is-soon'}><Clock className="h-3.5 w-3.5" aria-hidden />{dueText}</dd></div>}
        {wht > 0 && <div><dt>{tr("หัก ณ ที่จ่าย")}{' '}{job.whtRate}%</dt><dd>{tr("-{0} · สุทธิ {1}", formatCurrency(wht), formatCurrency(net))}</dd></div>}
      </dl>
      {job.note && <p className="ksm-peek-note">{tr("หมายเหตุ: {0}", job.note)}</p>}
      <div className="ksm-peek-actions">
        <button type="button" className="ksm-primary" onClick={() => onOpenInJobs(job)}>{tr("ดูในหน้างาน")}{' '}<ArrowRight className="h-4 w-4" aria-hidden /></button>
        <div className="ksm-peek-more">
          <button type="button" className="ksm-peek-btn" onClick={() => onEdit(job)}><Pencil className="h-4 w-4" aria-hidden />{tr("แก้ไขงาน")}</button>
          <button type="button" className="ksm-peek-btn is-danger" onClick={() => onDelete(job)}><Trash2 className="h-4 w-4" aria-hidden />{tr("ลบงาน")}</button>
        </div>
      </div>
    </div>
  );
}
