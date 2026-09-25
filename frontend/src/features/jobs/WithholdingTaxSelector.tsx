import { Check, ReceiptText } from 'lucide-react';

interface WithholdingTaxSelectorProps {
  rate: number;
  onChange: (rate: number) => void;
  value: string;
  accent?: 'emerald' | 'indigo';
}

const options = [
  { rate: 0, label: 'ไม่หัก', hint: 'รับยอดเต็ม' },
  { rate: 1, label: 'ขนส่ง', hint: 'อัตรา 1%' },
  { rate: 3, label: 'งานทั่วไป', hint: 'ฟรีแลนซ์ 3%' },
  { rate: 5, label: 'ค่าเช่า', hint: 'อัตรา 5%' },
];

export default function WithholdingTaxSelector({ rate, onChange, value, accent = 'emerald' }: WithholdingTaxSelectorProps) {
  const gross = Math.max(0, Number.parseFloat(value) || 0);
  const deducted = Math.round(gross * (rate / 100));
  const net = gross - deducted;
  const activeClass = accent === 'emerald'
    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
    : 'border-indigo-600 bg-indigo-600 text-white shadow-sm';
  const netClass = accent === 'emerald'
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-indigo-700 dark:text-indigo-400';

  return (
    <section className="space-y-2.5 rounded-2xl border border-brand-border/50 bg-brand-white p-3.5 dark:bg-stone-800">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <ReceiptText className="h-4 w-4" />
        </span>
        <div>
          <h4 className="text-xs font-black text-brand-text">หัก ณ ที่จ่าย</h4>
          <p className="mt-0.5 text-[10px] font-medium text-brand-muted">เลือกอัตราตามประเภทงาน ระบบจะคำนวณยอดรับสุทธิให้ทันที</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((option) => {
          const selected = rate === option.rate;
          return (
            <button
              key={option.rate}
              type="button"
              onClick={() => onChange(option.rate)}
              className={`relative rounded-xl border px-2 py-2.5 text-left transition-all ${
                selected
                  ? activeClass
                  : 'border-brand-border/50 bg-brand-faint text-brand-text hover:border-brand-text/25 dark:bg-stone-900'
              }`}
            >
              {selected && <Check className="absolute right-2 top-2 h-3.5 w-3.5" />}
              <span className="block text-sm font-black">{option.rate}%</span>
              <span className={`mt-0.5 block text-[9px] font-bold ${selected ? 'text-white/80' : 'text-brand-muted'}`}>{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-brand-border/40 bg-brand-faint/60 dark:bg-stone-900">
        <div className="px-3 py-2.5">
          <span className="block text-[9px] font-bold text-brand-muted">ยอดเต็ม</span>
          <strong className="mt-0.5 block text-xs font-black tabular-nums text-brand-text">฿{gross.toLocaleString()}</strong>
        </div>
        <div className="border-x border-brand-border/40 px-3 py-2.5">
          <span className="block text-[9px] font-bold text-brand-muted">ภาษีที่หัก</span>
          <strong className="mt-0.5 block text-xs font-black tabular-nums text-amber-700 dark:text-amber-400">-฿{deducted.toLocaleString()}</strong>
        </div>
        <div className="px-3 py-2.5">
          <span className="block text-[9px] font-bold text-brand-muted">รับสุทธิ</span>
          <strong className={`mt-0.5 block text-xs font-black tabular-nums ${netClass}`}>฿{net.toLocaleString()}</strong>
        </div>
      </div>
    </section>
  );
}
