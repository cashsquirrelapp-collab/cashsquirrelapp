import React from 'react';
import { createPortal } from 'react-dom';
import { Job } from '../../../../shared/types';
import { jobNetReceivable, roundMoney } from '../../../../shared/wht';
import { formatCurrency } from '../../utils';

export type PaymentMode = 'full' | 'partial';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Amounts net of a custom WHT rate can land on satang; show them rather than rounding.
const formatMoney = (amount: number) => Number.isInteger(amount)
  ? formatCurrency(amount)
  : `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface JobPaymentDialogProps {
  /** The job as stored (not a display copy), since its fields are what gets updated. */
  job: Job | null;
  initialMode: PaymentMode;
  /** Deposits are only offered while nothing has been received yet. */
  allowPartial: boolean;
  /** Full payment; the Jobs page offers it only once the work is delivered. */
  allowFull?: boolean;
  onClose: () => void;
  /** Receives the job fields to save and a short description for the undo bar. */
  onConfirm: (updated: Partial<Job>, message: string) => void;
}

/**
 * Records money on a job: in full, or a first deposit. Always asks for the date the money
 * arrived, since that decides which month's income it counts in. Shared by the Jobs page and
 * the dashboard's quick pay so both record payments the same way.
 */
export default function JobPaymentDialog({ job, initialMode, allowPartial, allowFull = true, onClose, onConfirm }: JobPaymentDialogProps) {
  const [mode, setMode] = React.useState<PaymentMode>(initialMode);
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayKey());

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const jobId = job?.id ?? null;

  // Fresh form whenever a different job is opened (not on every parent re-render).
  React.useEffect(() => {
    if (!jobId) return;
    setMode(!allowFull ? 'partial' : !allowPartial ? 'full' : initialMode);
    setAmount('');
    setDate(todayKey());
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!job) return null;

  const net = jobNetReceivable(job);
  const received = job.received || 0;
  const remaining = roundMoney(Math.max(0, net - received));
  const partialAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const error = !date ? 'กรุณาเลือกวันที่รับเงิน'
    : mode === 'partial' && partialAmount <= 0 ? 'กรุณาใส่ยอดที่ได้รับ'
    : mode === 'partial' && partialAmount >= net ? 'ยอดนี้เท่ากับหรือเกินยอดที่ต้องรับ ให้เลือก "รับเงินครบ" แทน'
    : '';

  const confirm = () => {
    if (error) return;
    if (mode === 'full') {
      onConfirm({
        status: 'done',
        received: net,
        pending: 0,
        paymentStatus: 'paid',
        payDate: date,
        // Paying in full also marks undelivered work as delivered.
        isPosted: true,
      }, 'รับเงินครบแล้ว');
    } else {
      onConfirm({
        status: 'partial',
        received: partialAmount,
        pending: roundMoney(Math.max(0, net - partialAmount)),
        paymentStatus: 'partial',
        depositDate: date,
        depositAmount: partialAmount,
      }, `รับบางส่วน ${formatMoney(partialAmount)}`);
    }
  };

  const segment = (active: boolean) =>
    `h-10 rounded-[10px] border px-3 text-[13px] transition-colors cursor-pointer ${active
      ? 'border-[#F3B08C] bg-[#FFF1E8] font-semibold text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
      : 'border-brand-border bg-brand-white text-brand-text hover:bg-brand-faint'}`;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-payment-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => { event.preventDefault(); confirm(); }}
        className="w-full space-y-4 rounded-t-2xl border border-brand-border bg-brand-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-stone-900 sm:max-w-sm sm:rounded-2xl sm:pb-5"
      >
        <div>
          <h3 id="job-payment-title" className="text-base font-semibold text-brand-text">บันทึกรับเงิน</h3>
          <p className="mt-0.5 truncate text-xs text-brand-muted">{job.name}{job.client ? ` · ${job.client}` : ''}</p>
        </div>

        {allowPartial && allowFull && (
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="รับเงินแบบไหน">
            <button type="button" role="radio" aria-checked={mode === 'full'} onClick={() => setMode('full')} className={segment(mode === 'full')}>รับเงินครบ</button>
            <button type="button" role="radio" aria-checked={mode === 'partial'} onClick={() => setMode('partial')} className={segment(mode === 'partial')}>รับมัดจำ / บางส่วน</button>
          </div>
        )}

        {mode === 'full' ? (
          <div className="rounded-[10px] bg-brand-faint px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-brand-muted">{received > 0 ? 'ยอดที่รับครั้งนี้' : 'ยอดที่ได้รับ'}</span>
              <span className="font-mono text-lg font-semibold text-brand-text">{formatMoney(remaining)}</span>
            </div>
            {received > 0 && (
              <p className="mt-1 text-right text-[11px] text-brand-muted">รับไปแล้ว {formatMoney(received)} · รวม {formatMoney(net)}</p>
            )}
            {net < job.value && (
              <p className="mt-1 text-right text-[11px] text-brand-muted">มูลค่างาน {formatMoney(job.value)} หัก ณ ที่จ่าย {formatMoney(roundMoney(job.value - net))}</p>
            )}
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-brand-text">ยอดที่ได้รับ (บาท)</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="0"
              className="h-11 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 font-mono text-sm text-brand-text outline-none focus:border-[#E65F2B] dark:bg-neutral-950"
            />
            <span className="mt-1 block text-[11px] text-brand-muted">ยอดที่ต้องรับทั้งหมด {formatMoney(net)}</span>
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-brand-text">วันที่รับเงิน</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-11 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 text-sm text-brand-text outline-none focus:border-[#E65F2B] dark:bg-neutral-950"
          />
        </label>

        {error && (mode === 'full' || amount !== '') && (
          <p role="alert" className="text-xs text-[#C43A3A] dark:text-rose-300">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-brand-border text-sm text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={Boolean(error)}
            className="h-11 flex-[2] rounded-xl bg-[#E65F2B] text-sm font-semibold text-white transition-colors hover:bg-[#D85723] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            บันทึกรับเงิน
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
