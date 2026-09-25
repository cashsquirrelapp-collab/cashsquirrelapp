import React from 'react';
import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import { JobInstallment } from '../../../../shared/types';
import NumberInput from '../../components/ui/NumberInput';
import { formatCurrency } from '../../utils';

interface Props {
  installments: JobInstallment[];
  onChange: (value: JobInstallment[]) => void;
  targetAmount: number;
  accent?: 'orange' | 'indigo';
}

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function InstallmentPlanner({ installments, onChange, targetAmount, accent = 'orange' }: Props) {
  const total = installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const paid = installments.filter((row) => row.status === 'paid').reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const remaining = targetAmount - total;

  const update = (id: string, patch: Partial<JobInstallment>) => {
    onChange(installments.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const addRow = () => {
    const amount = Math.max(0, remaining);
    onChange([...installments, {
      id: `installment-${Date.now()}-${installments.length}`,
      label: `งวดที่ ${installments.length + 1}`,
      amount,
      dueDate: null,
      paidAt: null,
      status: 'pending',
    }]);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-brand-text dark:text-white">แผนรับเงินเป็นงวด</h4>
          <p className="mt-0.5 text-[10px] font-semibold text-brand-muted">ระบุยอดและวันครบกำหนดของแต่ละงวด ระบบจะรวมยอดให้อัตโนมัติ</p>
        </div>
        <button type="button" onClick={addRow} className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-black text-white ${accent === 'indigo' ? 'bg-indigo-500' : 'bg-orange-500'}`}>
          <Plus className="h-3.5 w-3.5" /> เพิ่มงวด
        </button>
      </div>

      {installments.length === 0 ? (
        <button type="button" onClick={addRow} className="w-full rounded-xl border border-dashed border-amber-300 p-4 text-xs font-bold text-amber-700 dark:border-amber-500/30 dark:text-amber-300">
          + เพิ่มงวดแรก
        </button>
      ) : installments.map((row, index) => (
        <div key={row.id} className="rounded-xl border border-brand-border/60 bg-white p-3 dark:bg-stone-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <input value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} aria-label={`ชื่องวดที่ ${index + 1}`} className="min-w-0 flex-1 bg-transparent text-xs font-black text-brand-text outline-none dark:text-white" />
            <button type="button" onClick={() => onChange(installments.filter((item) => item.id !== row.id))} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" aria-label={`ลบงวดที่ ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[9px] font-extrabold uppercase text-brand-muted">ยอดงวด (บาท)</label>
              <NumberInput value={String(row.amount || '')} onChange={(value) => update(row.id, { amount: Number(value) || 0 })} placeholder="0" className="w-full rounded-xl border border-brand-border/50 bg-brand-faint p-2.5 text-sm font-bold outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-extrabold uppercase text-brand-muted">วันครบกำหนด</label>
              <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" /><input type="date" value={row.dueDate || ''} onChange={(e) => update(row.id, { dueDate: e.target.value || null })} className="w-full rounded-xl border border-brand-border/50 bg-brand-faint py-2.5 pl-9 pr-2 text-xs font-bold outline-none" /></div>
            </div>
          </div>
          <button type="button" onClick={() => update(row.id, row.status === 'paid' ? { status: 'pending', paidAt: null } : { status: 'paid', paidAt: localDate() })} className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-black ${row.status === 'paid' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-brand-border/60 text-brand-muted'}`}>
            <Check className="h-3.5 w-3.5" /> {row.status === 'paid' ? `รับเงินแล้ว ${row.paidAt || ''}` : 'กดเมื่อรับเงินงวดนี้แล้ว'}
          </button>
        </div>
      ))}

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/80 p-2.5 text-center dark:bg-stone-900/70">
        <div><span className="block text-[9px] font-bold text-brand-muted">รวมงวด</span><strong className="text-xs font-black">{formatCurrency(total)}</strong></div>
        <div><span className="block text-[9px] font-bold text-brand-muted">รับแล้ว</span><strong className="text-xs font-black text-emerald-600">{formatCurrency(paid)}</strong></div>
        <div><span className="block text-[9px] font-bold text-brand-muted">{remaining === 0 ? 'ยอดตรงแล้ว' : remaining > 0 ? 'ยังขาด' : 'เกินยอด'}</span><strong className={`text-xs font-black ${remaining === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(Math.abs(remaining))}</strong></div>
      </div>
    </section>
  );
}
