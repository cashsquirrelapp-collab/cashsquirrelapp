import React, { useMemo } from 'react';
import { Job } from '../../../../shared/types';
import { formatCurrency, getRelativeDaysText, safeFormatThaiDate } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';

interface ReceivablesTabProps {
  jobs: Job[];
  onEditJob: (id: string, updated: Partial<Job>) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
}

type GroupKey = 'overdue' | 'dueToday' | 'dueSoon' | 'normal';

const GROUP_META: Record<GroupKey, { label: string; dot: string; badgeBg: string; badgeText: string }> = {
  overdue: { label: 'เกินกำหนด', dot: '#E95454', badgeBg: '#FFF0F0', badgeText: '#C43A3A' },
  dueToday: { label: 'ครบกำหนดวันนี้', dot: '#F2A93B', badgeBg: '#FAEEDA', badgeText: '#8A5A0B' },
  dueSoon: { label: 'ใกล้ครบกำหนด', dot: '#F2A93B', badgeBg: '#FAEEDA', badgeText: '#8A5A0B' },
  normal: { label: 'รอรับปกติ', dot: '#7D7772', badgeBg: '#F2F3F5', badgeText: '#7D7772' },
};

const GROUP_ORDER: GroupKey[] = ['overdue', 'dueToday', 'dueSoon', 'normal'];

export default function ReceivablesTab({ jobs, onEditJob, triggerAlert }: ReceivablesTabProps) {
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
    const today = new Date();
    const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    onEditJob(j.id, {
      status: 'done',
      received: j.value - Math.round(j.value * ((j.whtRate || 0) / 100)),
      pending: 0,
      paymentStatus: 'paid',
      payDate: localDateStr,
      isPosted: true,
    });
  };

  const remindMe = (j: Job) => {
    triggerAlert('ตั้งเตือนแล้ว', `จะเตือนให้ติดตามเงินค้างรับจาก "${j.client || j.name}" อีกครั้ง`);
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
                            onClick={() => remindMe(j)}
                            className="rounded-lg bg-brand-faint px-2.5 py-1.5 text-[11px] text-brand-muted hover:bg-brand-border/40 transition-colors cursor-pointer"
                          >
                            เตือนฉัน
                          </button>
                          <button
                            type="button"
                            onClick={() => markReceived(j)}
                            className="rounded-lg bg-[#E65F2B] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#D98324] transition-colors cursor-pointer"
                          >
                            บันทึกรับเงิน
                          </button>
                        </div>
                      </div>
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
