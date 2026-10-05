import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, X } from 'lucide-react';
import type { Goal } from '../../../../shared/types';
import { goalIcon, goalIconKey } from './goalIcons';

// Presentational pieces of จัดสรรเงิน & เป้าหมาย. No money logic lives here -- SplitTab keeps every
// calculation and handler; these only lay things out.

/**
 * Right-side drawer (full-screen sheet on phones). The page keeps a single one: changing
 * `viewKey` swaps its content in place (with `onBack` for a back arrow) rather than opening a
 * second panel on top.
 */
export function Drawer({ open, title, onClose, onBack, children, footer, width = 520, z = 200, viewKey }: {
  open: boolean; title: string; onClose: () => void; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number; z?: number; viewKey?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: z }}>
          <motion.div className="absolute inset-0 bg-[rgba(20,18,16,0.38)]" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-white shadow-[0_0_40px_rgba(20,18,16,0.2)] dark:bg-[#1B1C20]"
            style={{ maxWidth: width }}>
            <div className="flex items-center justify-between gap-3 border-b border-brand-border px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-1.5">
                {onBack && <button type="button" onClick={onBack} aria-label="กลับ" className="-ml-1.5 rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>}
                <h2 className="truncate text-base font-semibold text-brand-text">{title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <motion.div key={viewKey} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
              {footer && <div className="border-t border-brand-border px-5 py-4 sm:px-6">{footer}</div>}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** The goal's picture: the user's own image, else its line icon in the goal's colour. */
export function GoalAvatar({ goal, size = 44 }: { goal: Pick<Goal, 'imageUrl' | 'type' | 'bg' | 'acc'> & { icon?: string; emoji?: string }; size?: number }) {
  const Icon = goalIcon(goalIconKey(goal));
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand-border/40"
      style={{ width: size, height: size, backgroundColor: goal.imageUrl ? 'var(--faint)' : goal.bg || 'var(--faint)', color: goal.acc || '#E65F2B' }}>
      {goal.imageUrl
        ? <img src={goal.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        : <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} aria-hidden />}
    </span>
  );
}

/** Goal progress, 0-100. Orange while in progress, green once reached -- low progress is not an error. */
export function ProgressBar({ pct, done, height = 6 }: { pct: number; done?: boolean; height?: number }) {
  return (
    <span className="block overflow-hidden rounded-full bg-brand-faint" style={{ height }}
      role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.span className={`block h-full rounded-full ${done ? 'bg-[#18A66A]' : 'bg-[#E65F2B]'}`}
        initial={{ width: 0 }} animate={{ width: `${Math.max(pct > 0 ? 1.5 : 0, Math.min(100, pct))}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
    </span>
  );
}

/** "0.1%" / "28%" -- small shares keep one decimal so they never read as zero. */
export const pctText = (pct: number) => `${pct > 0 && pct < 10 ? pct.toFixed(1).replace(/\.0$/, '') : Math.round(pct)}%`;

export const goalPct = (g: Pick<Goal, 'current' | 'target'>) => g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;

export const field = 'h-11 w-full rounded-xl border border-brand-border bg-brand-white px-3.5 text-sm text-brand-text outline-none transition-colors placeholder:text-brand-muted focus:border-[#E65F2B] dark:bg-[#232428]';
export const label = 'mb-1.5 block text-[13px] font-medium text-brand-text';
export const primaryBtn = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#D35221] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer';
export const secondaryBtn = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-4 text-sm font-medium text-brand-text transition-colors hover:bg-brand-faint disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer dark:bg-transparent';

/** Older history entries were saved with emoji in their text (e.g. "... 🔄"); show them without. */
export const stripEmoji = (text: string) =>
  text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '').replace(/\s{2,}/g, ' ').trim();
