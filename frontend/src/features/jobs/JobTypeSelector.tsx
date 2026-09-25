import type { Dispatch, SetStateAction } from 'react';
import { Check, ChevronDown, ListFilter, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_JOB_TYPES } from '../../utils';
import { useLanguage } from '../../i18n/LanguageContext';

type Accent = 'emerald' | 'indigo';

interface JobTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  customInput: string;
  onCustomInputChange: (value: string) => void;
  jobTypes: string[];
  setJobTypes: Dispatch<SetStateAction<string[]>>;
  accent?: Accent;
}

const styles = {
  emerald: {
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-sm',
    panel: 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10',
    focus: 'focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15',
    button: 'bg-emerald-600 hover:bg-emerald-700',
    selected: 'text-emerald-700 dark:text-emerald-400',
  },
  indigo: {
    active: 'border-indigo-600 bg-indigo-600 text-white shadow-sm',
    panel: 'border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10',
    focus: 'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15',
    button: 'bg-indigo-600 hover:bg-indigo-700',
    selected: 'text-indigo-700 dark:text-indigo-400',
  },
} as const;

export default function JobTypeSelector({
  value,
  onChange,
  customInput,
  onCustomInputChange,
  jobTypes,
  setJobTypes,
  accent = 'emerald',
}: JobTypeSelectorProps) {
  const { t } = useLanguage();
  const theme = styles[accent];
  const isCustomMode = value === '__custom__';
  const customTypes = Array.from(new Set(jobTypes)).filter(
    (type) => type && !DEFAULT_JOB_TYPES.includes(type),
  );
  const existingTypes = ['ยังไม่ระบุ', ...DEFAULT_JOB_TYPES, ...customTypes];

  const saveCustomType = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!jobTypes.includes(trimmed)) setJobTypes((previous) => [...previous, trimmed]);
    onChange(trimmed);
    onCustomInputChange('');
  };

  return (
    <div className="space-y-2.5">
      <div>
        <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted dark:text-neutral-300">
          {t('jobs.fieldType')}
        </label>
        <p className="mt-1 text-[11px] font-medium text-brand-muted">
          เลือกจากรายการที่มีอยู่ หรือกำหนดประเภทงานใหม่ของคุณ
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-brand-border/50 bg-brand-faint/70 p-1.5 dark:bg-stone-900">
        <button
          type="button"
          onClick={() => onChange(value === '__custom__' ? 'ยังไม่ระบุ' : value)}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[11px] font-black transition-all ${
            !isCustomMode
              ? theme.active
              : 'border-transparent bg-transparent text-brand-muted hover:bg-brand-white dark:hover:bg-stone-800'
          }`}
        >
          <ListFilter className="h-3.5 w-3.5" />
          เลือกจากรายการ
        </button>
        <button
          type="button"
          onClick={() => onChange('__custom__')}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[11px] font-black transition-all ${
            isCustomMode
              ? theme.active
              : 'border-transparent bg-transparent text-brand-muted hover:bg-brand-white dark:hover:bg-stone-800'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          สร้างประเภทเอง
        </button>
      </div>

      {!isCustomMode ? (
        <div className="space-y-2 rounded-2xl border border-brand-border/50 bg-brand-white p-3 dark:bg-stone-800">
          <div className="relative">
            <select
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className={`w-full appearance-none rounded-xl border border-brand-border/60 bg-brand-faint px-3 py-3 pr-10 text-xs font-bold text-brand-text outline-none transition-all dark:bg-stone-900 ${theme.focus}`}
            >
              {existingTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            <span className={`flex min-w-0 items-center gap-1.5 truncate text-[10px] font-extrabold ${theme.selected}`}>
              <Check className="h-3.5 w-3.5 shrink-0" />
              เลือกแล้ว: {value}
            </span>
            {customTypes.includes(value) && (
              <button
                type="button"
                onClick={() => {
                  setJobTypes((previous) => previous.filter((type) => type !== value));
                  onChange('ยังไม่ระบุ');
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                title={t('jobs.removeTypeTooltip')}
              >
                <Trash2 className="h-3 w-3" />
                ลบประเภทนี้
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={`space-y-2 rounded-2xl border p-3 ${theme.panel}`}>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-brand-text">
            {t('jobs.customTypeNameLabel')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              autoFocus
              placeholder={t('jobs.customTypePlaceholder')}
              value={customInput}
              onChange={(event) => onCustomInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveCustomType();
                }
              }}
              className={`min-w-0 flex-1 rounded-xl border border-brand-border/60 bg-brand-white p-3 text-xs font-semibold text-brand-text outline-none dark:bg-stone-800 ${theme.focus}`}
            />
            <button
              type="button"
              disabled={!customInput.trim()}
              onClick={saveCustomType}
              className={`rounded-xl px-4 py-3 text-xs font-black text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${theme.button}`}
            >
              เพิ่มและเลือก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
