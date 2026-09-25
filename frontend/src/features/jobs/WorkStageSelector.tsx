import { useState } from 'react';
import { BriefcaseBusiness, Check, ChevronDown, PackageCheck } from 'lucide-react';

interface WorkStageSelectorProps {
  isPosted: boolean;
  onChange: (isPosted: boolean) => void;
  accent?: 'emerald' | 'indigo';
}

const stages = [
  {
    value: false,
    title: 'รับดีลแล้ว',
    description: 'ตกลงรับโปรเจกต์จากลูกค้า แต่ยังไม่ได้ส่งมอบงาน',
    Icon: BriefcaseBusiness,
  },
  {
    value: true,
    title: 'ส่งมอบงานแล้ว',
    description: 'ส่งงานเรียบร้อย เริ่มนับวันเครดิตเทอมได้',
    Icon: PackageCheck,
  },
] as const;

export default function WorkStageSelector({ isPosted, onChange, accent = 'emerald' }: WorkStageSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = stages.find((stage) => stage.value === isPosted) ?? stages[0];
  const selectedClass = accent === 'emerald'
    ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-800 dark:text-emerald-300'
    : 'border-indigo-500/30 bg-indigo-500/8 text-indigo-800 dark:text-indigo-300';
  const iconClass = accent === 'emerald'
    ? 'bg-emerald-600 text-white'
    : 'bg-indigo-600 text-white';

  return (
    <section className="space-y-2">
      <div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-brand-muted dark:text-neutral-400">ขั้นตอนของงาน</label>
        <p className="mt-1 text-[10px] font-medium text-brand-muted">เลือกตามว่าตอนนี้งานยังอยู่ระหว่างทำ หรือส่งมอบแล้ว</p>
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all ${selectedClass}`}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <selected.Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-xs font-black">{selected.title}</strong>
          <span className="mt-0.5 block text-[10px] font-medium leading-relaxed text-brand-muted">{selected.description}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="animate-fade-in space-y-2 rounded-2xl border border-brand-border/50 bg-brand-white p-2 shadow-sm dark:bg-stone-800">
          {stages.map((stage) => {
            const active = stage.value === isPosted;
            return (
              <button
                key={String(stage.value)}
                type="button"
                onClick={() => {
                  onChange(stage.value);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? selectedClass
                    : 'border-transparent hover:border-brand-border/50 hover:bg-brand-faint dark:hover:bg-stone-900'
                }`}
              >
                <stage.Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-xs font-black text-brand-text">{stage.title}</strong>
                  <span className="mt-0.5 block text-[10px] font-medium leading-relaxed text-brand-muted">{stage.description}</span>
                </span>
                {active && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
