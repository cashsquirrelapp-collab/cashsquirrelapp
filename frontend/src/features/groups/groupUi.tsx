import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { uiPanel as panel, uiInput as input, uiPrimaryButton as primary, uiSecondaryButton as secondary } from '../../components/ui/uiStyles';
export { panel, input, primary, secondary };
export type Confirm = (
  title: string,
  message: string,
  onConfirm: () => void,
) => void;

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
