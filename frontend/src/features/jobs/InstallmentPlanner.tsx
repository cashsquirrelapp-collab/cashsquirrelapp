import React from 'react';
import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import { JobInstallment } from '../../../../shared/types';
import NumberInput from '../../components/ui/NumberInput';
import { formatCurrency } from '../../utils';

interface Props {
  installments: JobInstallment[];
  onChange: (value: JobInstallment[]) => void;
  targetAmount: number;
}

const QUICK_COUNTS = [2, 3, 4, 6];

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Same day of the month `months` later, clamped to the month's last day (31 Jan -> 28/29 Feb).
const addMonths = (date: string, months: number) => {
  const [y, m, d] = date.split('-').map(Number);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  const next = new Date(y, m - 1 + months, Math.min(d, lastDay));
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

// Styled like the rest of JobFormDrawer (plain labels, 10px-radius inputs, segment buttons).
const inputClass = 'h-10 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 text-sm text-brand-text placeholder:text-brand-muted outline-none transition-colors focus:border-[#E65F2B] dark:bg-neutral-950';
const segment = (active: boolean) =>
  `h-10 rounded-[10px] border px-3 text-[13px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${active
    ? 'border-[#F3B08C] bg-[#FFF1E8] font-semibold text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
    : 'border-brand-border bg-brand-white text-brand-text hover:bg-brand-faint'}`;

export default function InstallmentPlanner({ installments, onChange, targetAmount }: Props) {
  const total = installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const paid = installments.filter((row) => row.status === 'paid').reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const remaining = Math.round((targetAmount - total) * 100) / 100;
  const hasPaid = installments.some((row) => row.status === 'paid');
  const canSplit = targetAmount > 0 && !hasPaid;

  const update = (id: string, patch: Partial<JobInstallment>) => {
    onChange(installments.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  // A new row takes whatever is still missing, so the total lands on the job value.
  const addRow = () => {
    onChange([...installments, {
      id: `installment-${Date.now()}-${installments.length}`,
      label: `งวดที่ ${installments.length + 1}`,
      amount: Math.max(0, remaining),
      dueDate: null,
      paidAt: null,
      status: 'pending',
    }]);
  };

  // Equal split; the rounding remainder goes to the last installment so the total is exact.
  // Due dates already typed in are kept by position.
  const split = (count: number) => {
    if (!canSplit) return;
    const baseAmount = Math.floor((targetAmount / count) * 100) / 100;
    const now = Date.now();
    onChange(Array.from({ length: count }, (_, index) => ({
      id: `installment-${now}-${index}`,
      label: `งวดที่ ${index + 1}`,
      amount: index === count - 1 ? Number((targetAmount - baseAmount * (count - 1)).toFixed(2)) : baseAmount,
      dueDate: installments[index]?.dueDate ?? null,
      paidAt: null,
      status: 'pending' as const,
    })));
  };

  const firstDue = installments[0]?.dueDate;
  const canFillMonthly = Boolean(firstDue) && installments.length > 1 && installments.slice(1).some((row) => !row.dueDate);
  const fillMonthly = () => {
    if (!firstDue) return;
    onChange(installments.map((row, index) => index === 0 || row.dueDate ? row : { ...row, dueDate: addMonths(firstDue, index) }));
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-brand-text">แบ่งกี่งวด?</p>
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => split(count)}
              disabled={!canSplit}
              aria-pressed={installments.length === count}
              className={segment(installments.length === count)}
            >
              {count} งวด
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-brand-muted">
          {targetAmount <= 0
            ? 'ใส่มูลค่างานด้านบนก่อน แล้วเลือกจำนวนงวด'
            : hasPaid
            ? 'มีงวดที่รับเงินแล้ว จึงแบ่งใหม่ไม่ได้ แต่ยังแก้ยอดงวดที่รอรับได้'
            : 'แบ่งยอดเท่ากันให้ เศษที่ไม่ลงตัวรวมไว้ในงวดสุดท้าย'}
        </p>
      </div>

      {installments.length > 0 && (
        <div className="space-y-2">
          {installments.map((row, index) => {
            const isPaid = row.status === 'paid';
            return (
              <div key={row.id} className="rounded-[10px] border border-brand-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={row.label}
                    onChange={(e) => update(row.id, { label: e.target.value })}
                    aria-label={`ชื่องวดที่ ${index + 1}`}
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-brand-text outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => update(row.id, isPaid ? { status: 'pending', paidAt: null } : { status: 'paid', paidAt: localDate() })}
                    aria-pressed={isPaid}
                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors cursor-pointer ${isPaid
                      ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-brand-border text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`}
                  >
                    {isPaid && <Check className="h-3 w-3" />}
                    {isPaid ? 'รับเงินแล้ว' : 'ยังไม่รับ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(installments.filter((item) => item.id !== row.id))}
                    aria-label={`ลบงวดที่ ${index + 1}`}
                    className="rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-[#FFF0F0] hover:text-[#C43A3A] cursor-pointer dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-brand-muted">ยอด</span>
                    <span className="relative block">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">฿</span>
                      <NumberInput
                        value={String(row.amount || '')}
                        onChange={(value) => update(row.id, { amount: Number(value) || 0 })}
                        placeholder="0"
                        aria-label={`ยอดงวดที่ ${index + 1}`}
                        className={`${inputClass} pl-7 font-mono`}
                      />
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-brand-muted">{isPaid ? 'วันที่รับเงิน' : 'ครบกำหนด'}</span>
                    <span className="relative block">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                      <input
                        type="date"
                        value={(isPaid ? row.paidAt : row.dueDate) || ''}
                        onChange={(e) => update(row.id, isPaid ? { paidAt: e.target.value || null } : { dueDate: e.target.value || null })}
                        aria-label={`${isPaid ? 'วันที่รับเงิน' : 'วันครบกำหนด'}งวดที่ ${index + 1}`}
                        className={`${inputClass} pl-9 text-[13px]`}
                      />
                    </span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#C24A16] hover:underline cursor-pointer dark:text-orange-300"
        >
          <Plus className="h-3.5 w-3.5" />
          {installments.length === 0 ? 'กำหนดงวดเอง' : remaining > 0 ? `เพิ่มงวด (ยอดที่เหลือ ${formatCurrency(remaining)})` : 'เพิ่มงวด'}
        </button>
        {canFillMonthly && (
          <button type="button" onClick={fillMonthly} className="text-xs text-brand-muted hover:text-brand-text hover:underline cursor-pointer">
            ครบกำหนดทุกเดือน ตามวันของงวดแรก
          </button>
        )}
      </div>

      {installments.length > 0 && targetAmount > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-[10px] bg-brand-faint px-3 py-2.5 text-[13px]">
          <span className="text-brand-muted">
            รวม {installments.length} งวด <span className="font-mono font-semibold text-brand-text">{formatCurrency(total)}</span> จาก {formatCurrency(targetAmount)}
            {paid > 0 && <> · รับแล้ว <span className="font-mono text-emerald-700 dark:text-emerald-300">{formatCurrency(paid)}</span></>}
          </span>
          <span className={remaining === 0 ? 'font-medium text-emerald-700 dark:text-emerald-300' : remaining > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : 'font-medium text-[#C43A3A] dark:text-rose-300'}>
            {remaining === 0 ? 'ยอดตรงแล้ว' : remaining > 0 ? `ยังขาด ${formatCurrency(remaining)}` : `เกิน ${formatCurrency(Math.abs(remaining))}`}
          </span>
        </div>
      )}
    </div>
  );
}
