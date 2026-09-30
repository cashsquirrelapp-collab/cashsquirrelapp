import React, { useMemo, useState } from 'react';
import { Job } from '../../../../shared/types';
import { jobNetReceivable } from '../../../../shared/wht';
import { formatCurrency, getRelativeDaysText, safeFormatThaiDate, toLocalDateKey, isReminderDue } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';

interface ReceivablesTabProps {
  jobs: Job[];
  onEditJob: (id: string, updated: Partial<Job>) => void;
  onViewJob: (id: string) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

type GroupKey = 'overdue' | 'dueToday' | 'dueSoon' | 'normal';

const GROUP_META: Record<GroupKey, { label: string; dot: string; badgeBg: string; badgeText: string }> = {
  overdue: { label: 'เกินกำหนด', dot: '#E95454', badgeBg: '#FFF0F0', badgeText: '#C43A3A' },
  dueToday: { label: 'ครบกำหนดวันนี้', dot: '#F2A93B', badgeBg: '#FAEEDA', badgeText: '#8A5A0B' },
  dueSoon: { label: 'ใกล้ครบกำหนด', dot: '#F2A93B', badgeBg: '#FAEEDA', badgeText: '#8A5A0B' },
  normal: { label: 'รอรับปกติ', dot: '#7D7772', badgeBg: '#F2F3F5', badgeText: '#7D7772' },
};

const GROUP_ORDER: GroupKey[] = ['overdue', 'dueToday', 'dueSoon', 'normal'];

export default function ReceivablesTab({ jobs, onEditJob, onViewJob, triggerAlert, triggerConfirm }: ReceivablesTabProps) {
  const unpaidJobs = useMemo(() => jobs.filter(j => j.pending > 0 && j.isPosted !== false), [jobs]);

  const groups = useMemo(() => {
    const buckets: Record<GroupKey, Job[]> = { overdue: [], dueToday: [], dueSoon: [], normal: [] };
    unpaidJobs.forEach(j => {
      const rel = getRelativeDaysText(j.payDate || j.postDate);
      const key: GroupKey = rel.isOverdue ? 'overdue' : rel.daysCount === 0 ? 'dueToday' : rel.daysCount <= 7 ? 'dueSoon' : 'normal';
      buckets[key].push(j);
    });
    return buckets;
  }, [unpaidJobs]);

  const totalPending = unpaidJobs.reduce((sum, j) => sum + j.pending, 0);

  const markReceived = (j: Job) => {
    // Installment jobs track each งวด separately, so closing the whole job here would leave the
    // unpaid rows open -- send them to the job's own per-installment payment flow instead.
    if (j.installments?.length) {
      onViewJob(j.id);
      return;
    }
    triggerConfirm(
      'บันทึกรับเงิน',
      `ยืนยันว่าได้รับเงิน ${formatCurrency(j.pending)} จากงาน "${j.name}" ครบแล้ว?`,
      () => {
        const today = new Date();
        const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        onEditJob(j.id, {
          status: 'done',
          received: jobNetReceivable(j),
          pending: 0,
          paymentStatus: 'paid',
          payDate: localDateStr,
          isPosted: true,
        });
      },
    );
  };

  const [reminderPickerFor, setReminderPickerFor] = useState<string | null>(null);

  const setReminder = (j: Job, daysAhead: number | null) => {
    setReminderPickerFor(null);
    if (daysAhead === null) {
      onEditJob(j.id, { remindAt: null });
      return;
    }
    const at = new Date();
    at.setDate(at.getDate() + daysAhead);
    const remindAt = toLocalDateKey(at);
    onEditJob(j.id, { remindAt });
    triggerAlert('ตั้งเตือนแล้ว', `แอปจะเตือนให้ตามเงินจาก "${j.client || j.name}" วันที่ ${safeFormatThaiDate(remindAt)}`);
  };

  if (unpaidJobs.length === 0) {
    return (
      <div className="page-content">
        <div className="mx-auto max-w-[860px]">
          <div className="rounded-[14px] border border-brand-border bg-brand-white p-10 text-center">
            <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF7F1]">
              <Mascot mood="happy" size={52} />
            </div>
            <p className="text-sm font-medium text-brand-text">ตอนนี้ไม่มีเงินที่ต้องตาม</p>
            <p className="mt-1 text-xs text-brand-muted">สบายใจได้เลย</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="mx-auto max-w-[860px] space-y-5">
        <div>
          <p className="text-xs text-brand-muted">เงินรอรับทั้งหมด</p>
          <p className="mt-1 text-[30px] font-semibold text-brand-text">{formatCurrency(totalPending)}</p>
          <p className="mt-1 text-xs text-brand-muted">{unpaidJobs.length} รายการ</p>
        </div>

        {GROUP_ORDER.filter(key => groups[key].length > 0).map(key => {
          const meta = GROUP_META[key];
          const items = groups[key];
          const groupTotal = items.reduce((sum, j) => sum + j.pending, 0);
          return (
            <div key={key}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                <span className="text-[13px] font-medium text-brand-text">{meta.label}</span>
                <span className="text-[11px] text-brand-muted">{items.length} รายการ · {formatCurrency(groupTotal)}</span>
              </div>
              <div className="space-y-2">
                {items.map(j => {
                  const rel = getRelativeDaysText(j.payDate || j.postDate);
                  return (
                    <div key={j.id} className="rounded-[14px] border border-brand-border bg-brand-white px-[18px] py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-brand-text">{j.name}</p>
                          <p className="mt-0.5 text-[11px] text-brand-muted">{j.client || 'ไม่ระบุลูกค้า'}</p>
                        </div>
                        <p className="whitespace-nowrap text-[15px] font-semibold text-brand-text">{formatCurrency(j.pending)}</p>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-4 border-t border-brand-border pt-2.5 text-[11px] text-brand-muted">
                        <span>{j.creditTerm === 0 ? 'รับเงินทันที' : `Credit ${j.creditTerm} วัน`}</span>
                        <span>เริ่มนับ {safeFormatThaiDate(j.postDate, { day: 'numeric', month: 'short' })}</span>
                        {j.payDate && <span>ครบกำหนด {safeFormatThaiDate(j.payDate, { day: 'numeric', month: 'short' })}</span>}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span
                          className="rounded-md px-2.5 py-[3px] text-[10px]"
                          style={{ background: meta.badgeBg, color: meta.badgeText }}
                        >
                          {rel.text}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setReminderPickerFor(prev => (prev === j.id ? null : j.id))}
                            aria-expanded={reminderPickerFor === j.id}
                            className={`rounded-lg px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer ${
                              isReminderDue(j)
                                ? 'bg-[#FFF1E8] font-medium text-[#C24A16]'
                                : 'bg-brand-faint text-brand-muted hover:bg-brand-border/40'
                            }`}
                          >
                            {isReminderDue(j)
                              ? 'ถึงเวลาตามแล้ว'
                              : j.remindAt
                                ? `เตือน ${safeFormatThaiDate(j.remindAt, { day: 'numeric', month: 'short' })}`
                                : 'เตือนฉัน'}
                          </button>
                          <button
                            type="button"
                            onClick={() => markReceived(j)}
                            className="rounded-lg bg-[#E65F2B] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#D98324] transition-colors cursor-pointer"
                          >
                            {j.installments?.length ? 'รับเงินรายงวด' : 'บันทึกรับเงิน'}
                          </button>
                        </div>
                      </div>
                      {reminderPickerFor === j.id && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-brand-border pt-2.5">
                          <span className="mr-1 text-[11px] text-brand-muted">เตือนฉันอีกครั้ง</span>
                          {[
                            { label: 'พรุ่งนี้', days: 1 },
                            { label: 'อีก 3 วัน', days: 3 },
                            { label: 'อีก 7 วัน', days: 7 },
                          ].map(option => (
                            <button
                              key={option.days}
                              type="button"
                              onClick={() => setReminder(j, option.days)}
                              className="rounded-lg border border-brand-border px-2.5 py-1 text-[11px] text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
                            >
                              {option.label}
                            </button>
                          ))}
                          {j.remindAt && (
                            <button
                              type="button"
                              onClick={() => setReminder(j, null)}
                              className="rounded-lg px-2.5 py-1 text-[11px] text-brand-muted hover:text-brand-text cursor-pointer"
                            >
                              ยกเลิกการเตือน
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
