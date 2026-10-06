import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarCheck, X } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { calculatePayDate, safeFormatThaiDate } from '../../utils';

// "บันทึกว่างานเสร็จแล้ว": delivery date + Credit Term, with the expected payment date shown
// before saving. The preview calls the same calculatePayDate the save uses (weekend and Thai
// holiday skipping included), so what the user sees is what gets stored.

export const CREDIT_TERM_PRESETS = [0, 30, 45, 60, 90];

export interface DeliveryValues {
  postDate: string;
  creditTerm: number;
  excludeHolidays: boolean;
}

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

export function JobDeliveryDialog({ job, defaultDate, paidInFull, onClose, onSave }: {
  job: Job | null;
  defaultDate: string;
  /** Already paid in full: no Credit Term to set, the job closes on delivery. */
  paidInFull: boolean;
  onClose: () => void;
  onSave: (values: DeliveryValues) => void;
}) {
  const [postDate, setPostDate] = React.useState('');
  const [creditTerm, setCreditTerm] = React.useState<number | null>(0);
  const [excludeHolidays, setExcludeHolidays] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!job) return;
    setPostDate(job.postDate || defaultDate);
    setCreditTerm(job.creditTerm ?? 0);
    setExcludeHolidays(Boolean(job.excludeHolidays));
    setTouched(false);
  }, [job, defaultDate]);

  React.useEffect(() => {
    if (!job) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [job, onClose]);

  // Older jobs may carry a term outside the presets; keep showing it instead of silently changing it.
  const terms = creditTerm != null && !CREDIT_TERM_PRESETS.includes(creditTerm) ? [...CREDIT_TERM_PRESETS, creditTerm].sort((a, b) => a - b) : CREDIT_TERM_PRESETS;
  const dateError = !postDate ? 'กรุณาเลือกวันที่ส่งงาน / ให้บริการ' : !isValidDate(postDate) ? 'วันที่ไม่ถูกต้อง' : '';
  const termError = !paidInFull && creditTerm == null ? 'กรุณาเลือก Credit Term' : '';
  const expected = !dateError && creditTerm != null ? calculatePayDate(postDate, creditTerm, creditTerm > 0 && excludeHolidays) : null;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (dateError || termError || creditTerm == null) return;
    onSave({ postDate, creditTerm, excludeHolidays });
  };

  const chip = (active: boolean) =>
    `h-11 rounded-full border px-3 text-[13px] font-medium transition-colors duration-200 cursor-pointer ${active
      ? 'border-[#E65F2B] bg-[#E65F2B] text-white'
      : 'border-brand-border bg-brand-white text-brand-text hover:border-[#F3B08C] hover:bg-brand-faint dark:bg-[#232428]'}`;

  return createPortal(
    <AnimatePresence>
      {job && (
        <motion.div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose}>
          <motion.form
            role="dialog" aria-modal="true" aria-labelledby="job-delivery-title" noValidate
            onClick={(event) => event.stopPropagation()} onSubmit={save}
            initial={{ opacity: 0, scale: 0.98, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-brand-border bg-brand-white shadow-xl dark:bg-[#1B1C20] sm:max-w-[500px] sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
              <div className="min-w-0">
                <h3 id="job-delivery-title" className="text-[17px] font-semibold text-brand-text">บันทึกว่างานเสร็จแล้ว</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-brand-muted">
                  {paidInFull ? 'กำหนดวันที่ส่งงาน งานนี้รับเงินครบแล้ว' : 'กำหนดวันที่ส่งงานและระยะเวลารับเงิน เพื่อคำนวณวันที่คาดว่าจะได้รับเงิน'}
                </p>
                <p className="mt-1 truncate text-xs text-brand-muted">{job.name}{job.client ? ` · ${job.client}` : ''}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="ปิด" className="-mr-1.5 rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
              <div>
                <label htmlFor="job-delivery-date" className="mb-1.5 block text-[13px] font-medium text-brand-text">วันที่ส่งงาน / ให้บริการ</label>
                <input
                  id="job-delivery-date" type="date" value={postDate}
                  onChange={(e) => { setPostDate(e.target.value); setTouched(true); }}
                  onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* not supported: typing still works */ } }}
                  aria-invalid={touched && Boolean(dateError)}
                  className={`h-11 w-full rounded-[10px] border bg-brand-white px-3.5 text-sm text-brand-text outline-none transition-colors focus:border-[#E65F2B] cursor-pointer dark:bg-[#141518] ${touched && dateError ? 'border-[#E95454]' : 'border-brand-border'}`}
                />
                {touched && dateError && <p className="mt-1.5 text-xs text-[#C43A3A] dark:text-[#F19A9A]">{dateError}</p>}
              </div>

              {paidInFull ? (
                <p className="rounded-xl bg-[#E9F7F0] px-4 py-3 text-[13px] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]">งานนี้รับเงินครบแล้ว บันทึกแล้วจะย้ายไปปิดงานทันที</p>
              ) : (<>
                <div>
                  <p className="text-[13px] font-medium text-brand-text">Credit Term</p>
                  <p className="mt-0.5 text-xs text-brand-muted">ลูกค้าจะชำระหลังส่งงานกี่วัน</p>
                  <div className={`mt-3 grid gap-2 grid-cols-3 ${terms.length > 5 ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`} role="radiogroup" aria-label="Credit Term">
                    {terms.map(days => (
                      <button key={days} type="button" role="radio" aria-checked={creditTerm === days} onClick={() => setCreditTerm(days)} className={chip(creditTerm === days)}>
                        {days === 0 ? 'ทันที' : `${days} วัน`}
                      </button>
                    ))}
                  </div>
                  {touched && termError && <p className="mt-1.5 text-xs text-[#C43A3A] dark:text-[#F19A9A]">{termError}</p>}
                  {creditTerm != null && creditTerm > 0 && (
                    <label className="mt-3 flex cursor-pointer select-none items-center gap-2.5 text-[13px] text-brand-text">
                      <input type="checkbox" checked={excludeHolidays} onChange={(e) => setExcludeHolidays(e.target.checked)} className="h-4 w-4 cursor-pointer rounded accent-[#E65F2B]" />
                      นับเฉพาะวันทำการ (ไม่นับเสาร์-อาทิตย์และวันหยุดราชการ)
                    </label>
                  )}
                </div>

                <div className="flex gap-3.5 rounded-2xl border border-[#F6D9C6] bg-[#FFF8F2] p-4 dark:border-[#E65F2B]/30 dark:bg-[#232428]" aria-live="polite">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFE9DA] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]"><CalendarCheck className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-xs text-brand-muted">คาดว่าจะได้รับเงิน</p>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p key={expected || 'none'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                        data-testid="expected-pay-date" className="mt-0.5 text-[22px] font-semibold leading-tight text-brand-text">
                        {expected ? safeFormatThaiDate(expected, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </motion.p>
                    </AnimatePresence>
                    <p className="mt-1 text-xs text-brand-muted">
                      {creditTerm == null ? 'เลือก Credit Term เพื่อดูวันที่'
                        : creditTerm === 0 ? 'ชำระทันที (วันเดียวกับวันที่ส่งงาน)'
                        : `Credit Term ${creditTerm} ${excludeHolidays ? 'วันทำการ' : 'วัน'} (นับจากวันที่ส่งงาน)`}
                    </p>
                  </div>
                </div>
              </>)}
            </div>

            <div className="flex gap-2 border-t border-brand-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
              <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-brand-border text-sm font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">ยกเลิก</button>
              <button type="submit" disabled={Boolean(dateError || termError)}
                className="h-11 flex-[1.6] rounded-xl bg-[#E65F2B] text-sm font-semibold text-white transition-colors hover:bg-[#D35221] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                บันทึกงานเสร็จแล้ว
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
