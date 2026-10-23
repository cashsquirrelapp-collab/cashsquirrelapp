import React from 'react';
import { ArrowLeft, Bell, Building2, CalendarClock, ChevronRight, FileJson, Globe, Link2, Mail, Moon, PiggyBank, ShieldCheck, Sun, Target, User } from 'lucide-react';
import { uiSurface } from '../../components/ui/uiStyles';

import { tr } from '../../i18n/tr';
// Building blocks for the Settings overview (grouped rows) and its detail pages. Kept at module
// level so inputs inside them keep focus while typing.

type IconType = React.ComponentType<{ className?: string }>;

export const rowShell = 'group flex w-full items-center gap-4 px-5 py-[18px] text-left min-h-[76px]';

export const ProBadge = () => (
  <span className="rounded-md bg-[#FFF1E8] px-1.5 py-0.5 text-[10px] font-semibold text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]">Pro</span>
);

export function Switch({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${on ? 'bg-[#E65F2B]' : 'bg-[#D9D4CE] dark:bg-[#3A3B40]'}`}>
      <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

// iOS Settings look (owner, 2026-10-23): a small grey heading over each group of rows.
export function Section({ title, children, id }: { icon?: IconType; title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="px-4 text-[13px] font-medium leading-5 text-brand-muted">{title}</h2>
      <div className={`${uiSurface} divide-y divide-brand-border overflow-hidden`}>{children}</div>
    </section>
  );
}

export function RowText({ title, desc, descId }: { title: React.ReactNode; desc?: React.ReactNode; descId?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-[15px] font-medium text-brand-text">{title}</span>
      {desc && <span id={descId} className="mt-0.5 block text-[13px] leading-snug text-brand-muted">{desc}</span>}
    </span>
  );
}

// iOS Settings-style tile: a white symbol on a coloured rounded square, one colour per kind of setting.
const TILES = new Map<IconType, string>([
  [User, '#E65F2B'], [ShieldCheck, '#18A66A'], [Globe, '#C17817'], [Moon, '#57524D'], [Sun, '#57524D'],
  [Building2, '#A63F1B'], [CalendarClock, '#D64545'], [Target, '#18A66A'], [Bell, '#E65F2B'],
  [Mail, '#C17817'], [Link2, '#18A66A'], [PiggyBank, '#E65F2B'], [FileJson, '#8E8A85'],
]);
export const RowIcon = ({ icon: Icon }: { icon: IconType }) => (
  <span className="ui-row-icon is-tile inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white"
    style={{ '--tile': TILES.get(Icon) || '#8E8A85', background: 'var(--tile)' } as React.CSSProperties}>
    <Icon className="h-[18px] w-[18px] shrink-0" />
  </span>
);

export function NavRow({ icon, lead, title, desc, value, onClick }: {
  icon?: IconType; lead?: React.ReactNode; title: string; desc?: React.ReactNode; value?: React.ReactNode; onClick: () => void;
}) {
  const descId = React.useId();
  return (
    <button type="button" onClick={onClick} aria-label={title} aria-describedby={desc ? descId : undefined}
      className={`${rowShell} transition-colors duration-200 hover:bg-brand-faint/70 cursor-pointer`}>
      {lead ?? (icon && <RowIcon icon={icon} />)}
      <RowText title={title} desc={desc} descId={descId} />
      {value != null && <span className="shrink-0 text-right text-[14px] text-brand-text">{value}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-brand-muted transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}

export type SettingsHead = { title: string; subtitle?: string; onBack: () => void };
/** Phones: the settings page draws its header on the terracotta; a detail page hands it its title. */
export const SettingsHeadContext = React.createContext<((head: SettingsHead | null) => void) | null>(null);

export function DetailHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  const setHead = React.useContext(SettingsHeadContext);
  const back = React.useRef(onBack);
  back.current = onBack;
  React.useLayoutEffect(() => {
    if (!setHead) return;
    setHead({ title, subtitle, onBack: () => back.current() });
    return () => setHead(null);
  }, [setHead, title, subtitle]);
  if (setHead) return null;
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="-ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">
        <ArrowLeft className="h-4 w-4" />{tr("ตั้งค่า")}</button>
      <div>
        <h1 className="text-[22px] font-semibold text-brand-text sm:text-[24px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-brand-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

/** A labelled block inside a detail page (no card per field). */
export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-brand-text">{label}</label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-brand-muted">{hint}</p>}
    </div>
  );
}

export const Note = ({ children }: { children: React.ReactNode }) => (
  <p className={`${uiSurface} p-5 text-[13px] leading-relaxed text-brand-muted`}>{children}</p>
);

export function Panel({ title, desc, children, tone }: { title?: string; desc?: React.ReactNode; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <section className={`${uiSurface} space-y-4 p-5 sm:p-6 ${tone === 'danger' ? '!border-[#F0C4C4] dark:!border-[#F19A9A]/30' : ''}`}>
      {(title || desc) && (
        <div>
          {title && <h2 className={`text-[15px] font-semibold ${tone === 'danger' ? 'text-[#B83434] dark:text-[#F19A9A]' : 'text-brand-text'}`}>{title}</h2>}
          {desc && <p className="mt-0.5 text-[13px] leading-relaxed text-brand-muted">{desc}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** One option in a small single-choice sheet (language, theme). */
export function Choice({ selected, label, hint, onClick }: { selected: boolean; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors cursor-pointer ${selected ? 'border-[#F3B08C] bg-[#FFF5EE] dark:border-[#E65F2B]/50 dark:bg-[#E65F2B]/10' : 'border-brand-border hover:bg-brand-faint'}`}>
      <span><span className="block text-[14px] font-medium text-brand-text">{label}</span>{hint && <span className="mt-0.5 block text-xs text-brand-muted">{hint}</span>}</span>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-[#E65F2B]' : 'border-brand-border'}`}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-[#E65F2B]" />}</span>
    </button>
  );
}
