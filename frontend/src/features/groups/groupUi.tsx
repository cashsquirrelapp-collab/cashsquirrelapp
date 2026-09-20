import React from 'react';
import { ArrowLeft } from 'lucide-react';
export type Confirm = (
  title: string,
  message: string,
  onConfirm: () => void,
) => void;

export const panel =
  'rounded-3xl border border-brand-border/50 bg-brand-white p-5 sm:p-6 shadow-sm';
export const input =
  'w-full min-w-0 rounded-xl border border-brand-border bg-brand-bg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-blue-acc/50';
export const primary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue-acc px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50';
export const secondary =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-sm font-semibold transition hover:bg-brand-faint disabled:opacity-50';
export function Pagination({
  page,
  total,
  size,
  onChange,
  disabled,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (total <= size) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-4">
      <button
        className={secondary}
        disabled={disabled || page === 0}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <ArrowLeft size={16} />
      </button>
      <span className="text-xs text-brand-muted">
        {page + 1} / {Math.ceil(total / size)}
      </span>
      <button
        className={secondary}
        disabled={disabled || (page + 1) * size >= total}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <ArrowLeft size={16} className="rotate-180" />
      </button>
    </div>
  );
}
