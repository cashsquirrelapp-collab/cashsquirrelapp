import { uiSurface } from '../../components/ui/uiStyles';
import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React, { useMemo, useState } from 'react';
import { Job } from '../../../../shared/types';
import { jobNetReceivable } from '../../../../shared/wht';
import { installmentLabel, formatCurrency, formatMonthKey, getRelativeDaysText, safeFormatThaiDate, toLocalDateKey, isReminderDue, currentMonthKeyNow } from '../../utils';
import { getJobPendingEntries, type JobPendingEntry } from '../../../../shared/installmentPayments';
import { DashboardPeriodPicker } from '../dashboard/DashboardPeriodPicker';
import { KsIcon } from '../mobile/icons';
import { useMobileLayout } from '../mobile/useMobileLayout';
import { MobilePageHero } from '../mobile/MobilePageHero';
import { useLanguage } from '../../i18n/LanguageContext';
import { Mascot } from '../../components/mascot/Mascot';

import { tr, T } from '../../i18n/tr';
interface ReceivablesTabProps {
  jobs: Job[];
  onEditJob: (id: string, updated: Partial<Job>, notice?: { title: string; message: string }) => void;
  onViewJob: (id: string) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  /** Phones: back to the menu, drawn in this page's own terracotta header. */
  onMobileBack?: () => void;
}

type GroupKey = 'overdue' | 'dueToday' | 'dueSoon' | 'normal';

const GROUP_META: Record<GroupKey, { label: string; dot: string; badgeBg: string; badgeText: string }> = {
  overdue: { label: T("เกินกำหนด"), dot: '#E95454', badgeBg: '#FFF0F0', badgeText: '#C43A3A' },
  dueToday: { label: T("ครบกำหนดวันนี้"), dot: '#F2A93B', badgeBg: '#FAEEDA', badgeText: '#8A5A0B' },
  dueSoon: { label: T("ใกล้ครบกำหนด"), dot: '#F2A93B', badgeBg: '#FAEEDA', badgeText: '#8A5A0B' },
  normal: { label: T("ยังไม่ถึงกำหนด"), dot: '#7D7772', badgeBg: '#F2F3F5', badgeText: '#7D7772' },
};

const GROUP_ORDER: GroupKey[] = ['overdue', 'dueToday', 'dueSoon', 'normal'];

export default function ReceivablesTab({ jobs, onEditJob, onViewJob, triggerConfirm, onMobileBack }: ReceivablesTabProps) {
  const { language } = useLanguage();
  const unpaidJobs = useMemo(() => jobs.filter(j => j.pending > 0 && j.isPosted !== false), [jobs]);

  const groups = useMemo(() => {
    const buckets: Record<GroupKey, Job[]> = { overdue: [], dueToday: [], dueSoon: [], normal: [] };
    unpaidJobs.forEach(j => {
      const rel = getRelativeDaysText(j.payDate || j.postDate);
      const key: GroupKey = rel.isOverdue ? 'overdue' : rel.daysCount === 0 ? 'dueToday' : rel.daysCount <= 7 ? 'dueSoon' : 'normal';
      buckets[key].push(j);
    });
    return buckets;
  }, [unpaidJobs, language]);

  const totalPending = unpaidJobs.reduce((sum, j) => sum + j.pending, 0);

  const markReceived = (j: Job) => {
    // Installment jobs track each งวด separately, so closing the whole job here would leave the
    // unpaid rows open -- send them to the job's own per-installment payment flow instead.
    if (j.installments?.length) {
      onViewJob(j.id);
      return;
    }
    triggerConfirm(
      tr("บันทึกรับเงิน"),
      tr("ยืนยันว่าได้รับเงิน {0} จากงาน \"{1}\" ครบแล้ว?", formatCurrency(j.pending), j.name),
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
  const mobile = useMobileLayout();
  const [month, setMonth] = useState(() => currentMonthKeyNow());
  const [scope, setScope] = useState<'month' | 'overdue'>('month');

  const setReminder = (j: Job, daysAhead: number | null) => {
    setReminderPickerFor(null);
    if (daysAhead === null) {
      onEditJob(j.id, { remindAt: null });
      return;
    }
    const at = new Date();
    at.setDate(at.getDate() + daysAhead);
    const remindAt = toLocalDateKey(at);
    // Said in the save toast; a dialog on top of it repeated the news and had to be dismissed.
    onEditJob(j.id, { remindAt }, {
      title: tr("ตั้งการแจ้งเตือนแล้ว"),
      message: tr("แอปจะเตือนให้ตามเงินจาก \"{0}\" วันที่ {1}", j.client || j.name, safeFormatThaiDate(remindAt)),
    });
  };

  // Phones: the mobile design's month view. One card per outstanding amount (an instalment job
  // shows each unpaid instalment), counted on its due date, with earlier months and undated
  // amounts listed underneath. Recording money and reminders call the same handlers as below.
  if (mobile) {
    type Row = { job: Job; entry: JobPendingEntry; due: string };
    const today = toLocalDateKey();
    const soonCutoff = toLocalDateKey(new Date(Date.now() + 7 * 86400000));
    const rows: Row[] = unpaidJobs.flatMap(job => getJobPendingEntries(job)
      .filter(entry => entry.amount > 0)
      .map(entry => ({ job, entry, due: entry.dueDate ? entry.dueDate.slice(0, 10) : '' })));
    const byDue = (a: Row, b: Row) => a.due.localeCompare(b.due);
    const current = rows.filter(row => row.due.slice(0, 7) === month).sort(byDue);
    const overdue = current.filter(row => row.due < today);
    const carry = rows.filter(row => row.due && row.due < `${month}-01`).sort(byDue);
    const undated = rows.filter(row => !row.due);
    const shown = scope === 'overdue' ? overdue : current;
    const total = (list: Row[]) => list.reduce((sum, row) => sum + row.entry.amount, 0);
    const jobCount = (list: Row[]) => new Set(list.map(row => row.job.id)).size;
    const card = ({ job, entry, due }: Row) => {
      const key = `${job.id}:${entry.id}`;
      const late = Boolean(due) && due < today;
      const soon = Boolean(due) && due >= today && due <= soonCutoff;
      const daysLate = late ? Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime()) / 86400000) : 0;
      const status = late ? tr("เลยกำหนดรับเงิน {0} วัน", daysLate) : due === today ? tr("ครบกำหนดรับเงินวันนี้") : due ? tr("ยังไม่ถึงกำหนดรับเงิน") : tr("ยังไม่กำหนดวันรับเงิน");
      const reminderLabel = isReminderDue(job) ? tr("ถึงเวลาตามแล้ว") : job.remindAt ? tr("เตือน {0}", safeFormatThaiDate(job.remindAt, { day: 'numeric', month: 'short' })) : tr("เตือนฉัน");
      return (
        <article key={key} className={`ksm-due ${late ? 'is-overdue' : soon ? 'is-soon' : ''}`}>
          <button type="button" className="ksm-due-body" onClick={() => onViewJob(job.id)}>
            <div className="ksm-grow">
              <p className="ksm-jobclient">{job.client || tr("ไม่ระบุลูกค้า")}</p>
              <h3>{job.name}</h3>
              {entry.kind === 'installment' && entry.label && <p className="ksm-due-part">{installmentLabel(entry.label)}</p>}
            </div>
            <div className="ksm-due-money"><small>{tr("ยอดค้างรับ")}</small><strong>{formatCurrency(entry.amount)}</strong></div>
          </button>
          <div className="ksm-due-foot">
            <div className="ksm-grow">
              <span className="ksm-due-state"><KsIcon name={late ? 'alert' : 'clock'} size={17} />{status}</span>
              <small className="ksm-due-date">
                {due ? tr("ครบกำหนดรับเงิน {0}", safeFormatThaiDate(due)) : tr("กำหนดวันรับเงินได้ในรายละเอียดงาน")}
                {' · '}
                <button
                  type="button"
                  className={`ksm-remind${job.remindAt ? ' is-set' : ''}`}
                  onClick={() => setReminderPickerFor(prev => (prev === key ? null : key))}
                  aria-expanded={reminderPickerFor === key}
                >
                  {reminderLabel}
                </button>
              </small>
            </div>
            <button type="button" className={`ksm-btn ${late ? 'is-primary' : 'is-soft'}`} onClick={() => markReceived(job)}>{tr("รับเงิน")}</button>
          </div>
          {reminderPickerFor === key && (
            <div className="ksm-remind-row">
              <span>{reminderLabel === tr("เตือนฉัน") ? tr("เตือนฉันอีกครั้ง") : reminderLabel}</span>
              {[{ label: tr("พรุ่งนี้"), days: 1 }, { label: tr("อีก 3 วัน"), days: 3 }, { label: tr("อีก 7 วัน"), days: 7 }].map(option => (
                <button key={option.days} type="button" onClick={() => setReminder(job, option.days)}>{tr(option.label)}</button>
              ))}
              {job.remindAt && <button type="button" onClick={() => setReminder(job, null)}>{tr("ยกเลิกการเตือน")}</button>}
            </div>
          )}
        </article>
      );
    };
    return (
      <div className="page-content ksm ksm-screen">
        <MobilePageHero title={tr("เงินรอรับ")} onBack={onMobileBack} box={{
          label: scope === 'overdue' ? tr("งานที่เลยกำหนดรับเงิน") : tr("เงินรอรับของเดือน"),
          icon: 'wallet',
          amount: formatCurrency(total(shown)),
          region: tr("สรุปเงินรอรับ"),
          detail: <>
            <p>{tr("{0} งาน · กำหนดรับเงินใน {1}", jobCount(shown), formatMonthKey(month))}</p>
            {scope === 'overdue' && <p>{tr("ยอดนี้รวมอยู่ในเงินรอรับของเดือน {0} แล้ว", formatCurrency(total(current)))}</p>}
          </>,
        }} />
        <DashboardPeriodPicker monthKey={month} onChange={setMonth} compact />
        <div className="ksm-scope" role="tablist" aria-label={tr("กรองเงินรอรับ")}>
          <button type="button" role="tab" aria-selected={scope === 'month'} onClick={() => setScope('month')}>{tr("ของเดือนนี้")}</button>
          <button type="button" role="tab" aria-selected={scope === 'overdue'} onClick={() => setScope('overdue')}>
            {tr("เลยกำหนดรับเงิน")}{overdue.length > 0 && <span>{jobCount(overdue)}</span>}
          </button>
        </div>
        <div className="ksm-duelist">
          {shown.length > 0 ? shown.map(card) : (
            <div className="ksm-empty"><h3>{scope === 'overdue' ? tr("ไม่มีงานที่เลยกำหนดรับเงินในเดือนนี้") : tr("เดือนนี้ไม่มีเงินรอรับ")}</h3></div>
          )}
        </div>
        {carry.length > 0 && (
          <>
            <div className="ksm-group-title"><h3>{tr("ค้างรับจากเดือนก่อน")}</h3><span>{formatCurrency(total(carry))}</span></div>
            <div className="ksm-duelist" style={{ marginTop: 0 }}>{carry.map(card)}</div>
          </>
        )}
        {scope !== 'overdue' && undated.length > 0 && (
          <>
            <div className="ksm-group-title"><h3>{tr("ยังไม่กำหนดวันรับ")}</h3><span>{formatCurrency(total(undated))}</span></div>
            <div className="ksm-duelist" style={{ marginTop: 0 }}>{undated.map(card)}</div>
          </>
        )}
        <p className="ksm-micro">{tr("เงินที่ยังไม่ได้รับของงานส่งแล้ว · นับตามวันครบกำหนดรับเงิน ไม่ใช่วันส่งงาน")}</p>
      </div>
    );
  }

  if (unpaidJobs.length === 0) {
    return (
      <div className="page-content space-y-4">
        <PageHeader page="receivables" />
        <div className="mx-auto max-w-[860px]">
          <div className={`${uiSurface} p-10 text-center`}>
            {/* The mascot on its own, without a tile (owner, 2026-10-21: "เอากรอบกระรอกออก"). */}
            <div className="mx-auto mb-3 flex w-fit justify-center" aria-hidden="true">
              <Mascot mood="happy" size={72} />
            </div>
            <p className="text-sm font-medium text-brand-text">{tr("ไม่มีเงินค้างรับ")}</p>
            <p className="mt-1 text-xs text-brand-muted">{tr("เมื่อมีงานที่ยังรับเงินไม่ครบ รายการจะแสดงที่นี่")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content space-y-4">
        <PageHeader page="receivables" />
      <div className="mx-auto max-w-[860px] space-y-5">
        <div>
          <p className="text-xs text-brand-muted">{tr("เงินค้างรับทั้งหมด")}</p>
          <p className="mt-1 text-[30px] font-semibold text-brand-text">{formatCurrency(totalPending)}</p>
          <p className="mt-1 text-xs text-brand-muted">{tr("{0} รายการ", unpaidJobs.length)}</p>
        </div>

        {GROUP_ORDER.filter(key => groups[key].length > 0).map(key => {
          const meta = GROUP_META[key];
          const items = groups[key];
          const groupTotal = items.reduce((sum, j) => sum + j.pending, 0);
          return (
            <div key={key}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                <span className="text-[13px] font-medium text-brand-text">{tr(meta.label)}</span>
                <span className="text-[11px] text-brand-muted">{tr("{0} รายการ · {1}", items.length, formatCurrency(groupTotal))}</span>
              </div>
              <div className="space-y-2">
                {items.map(j => {
                  const rel = getRelativeDaysText(j.payDate || j.postDate);
                  return (
                    <div key={j.id} className={`${uiSurface} px-[18px] py-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-brand-text">{j.name}</p>
                          <p className="mt-0.5 text-[11px] text-brand-muted">{j.client || tr("ไม่ระบุลูกค้า")}</p>
                        </div>
                        <p className="whitespace-nowrap text-[15px] font-semibold text-brand-text">{formatCurrency(j.pending)}</p>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-4 border-t border-brand-border pt-2.5 text-[11px] text-brand-muted">
                        <span>{j.creditTerm === 0 ? tr("รับเงินทันที") : tr("ระยะเวลารับเงิน {0} วัน", j.creditTerm)}</span>
                        <span>{tr("เริ่มนับ {0}", safeFormatThaiDate(j.postDate, { day: 'numeric', month: 'short' }))}</span>
                        {j.payDate && <span>{tr("ครบกำหนด {0}", safeFormatThaiDate(j.payDate, { day: 'numeric', month: 'short' }))}</span>}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span
                          className="rounded-md px-2.5 py-[3px] text-[10px]"
                          style={{ background: meta.badgeBg, color: meta.badgeText }}
                        >
                          {tr(rel.text)}
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
                              ? tr("ถึงเวลาตามแล้ว")
                              : j.remindAt
                                ? tr("เตือน {0}", safeFormatThaiDate(j.remindAt, { day: 'numeric', month: 'short' }))
                                : tr("เตือนฉัน")}
                          </button>
                          <button
                            type="button"
                            onClick={() => markReceived(j)}
                            className={`${uiPrimaryButton} px-3 py-1.5 text-xs`}
                          >
                            {j.installments?.length ? tr("รับเงินรายงวด") : tr("บันทึกรับเงิน")}
                          </button>
                        </div>
                      </div>
                      {reminderPickerFor === j.id && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-brand-border pt-2.5">
                          <span className="mr-1 text-[11px] text-brand-muted">{tr("เตือนฉันอีกครั้ง")}</span>
                          {[
                            { label: tr("พรุ่งนี้"), days: 1 },
                            { label: tr("อีก 3 วัน"), days: 3 },
                            { label: tr("อีก 7 วัน"), days: 7 },
                          ].map(option => (
                            <button
                              key={option.days}
                              type="button"
                              onClick={() => setReminder(j, option.days)}
                              className="rounded-lg border border-brand-border px-2.5 py-1 text-[11px] text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
                            >
                              {tr(option.label)}
                            </button>
                          ))}
                          {j.remindAt && (
                            <button
                              type="button"
                              onClick={() => setReminder(j, null)}
                              className="rounded-lg px-2.5 py-1 text-[11px] text-brand-muted hover:text-brand-text cursor-pointer"
                            >
                              {tr("ยกเลิกการเตือน")}</button>
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
