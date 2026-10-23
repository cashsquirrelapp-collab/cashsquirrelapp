import React from 'react';
import { motion } from 'motion/react';
import type { Goal } from '../../../../shared/types';
import { goalIcon, goalIconKey } from './goalIcons';

// Presentational pieces of จัดสรรเงิน & เป้าหมาย. No money logic lives here -- SplitTab keeps every
// calculation and handler; these only lay things out.

export { Drawer } from '../../components/ui/Drawer';

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
