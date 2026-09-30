import React from 'react';
import { createPortal } from 'react-dom';
import { Job } from '../../../../shared/types';

/**
 * Applies a quick status/payment change to a job and offers to take it back: a bar at the
 * bottom of the screen for 8 seconds (paused while hovered) whose "เลิกทำ" restores exactly
 * the fields the change touched. Returns the apply function and the bar to render.
 */
export function useQuickUndo(onEditJob: (id: string, updated: Partial<Job>) => void) {
  const [undo, setUndo] = React.useState<{ jobId: string; message: string; previous: Partial<Job> } | null>(null);
  const [hovered, setHovered] = React.useState(false);

  React.useEffect(() => {
    if (!undo || hovered) return;
    const timer = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [undo, hovered]);

  const apply = (job: Job, updated: Partial<Job>, message: string) => {
    const previous = Object.fromEntries(
      (Object.keys(updated) as (keyof Job)[]).map(key => [key, job[key]])
    ) as Partial<Job>;
    onEditJob(job.id, updated);
    setUndo({ jobId: job.id, message: `${message} · ${job.name}`, previous });
  };

  const dismiss = () => { setUndo(null); setHovered(false); };
  const revert = () => {
    if (!undo) return;
    onEditJob(undo.jobId, undo.previous);
    dismiss();
  };

  const bar = undo ? createPortal(
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[160] flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl bg-stone-900 py-2.5 pl-4 pr-2 text-[13px] text-white shadow-lg dark:border dark:border-stone-700 dark:bg-stone-800"
    >
      <span className="min-w-0 flex-1 truncate">{undo.message}</span>
      <button type="button" onClick={revert} className="h-8 shrink-0 rounded-lg px-3 font-semibold text-[#FFA473] transition-colors hover:bg-white/10 cursor-pointer">
        เลิกทำ
      </button>
      <button type="button" onClick={dismiss} aria-label="ปิด" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white cursor-pointer">
        ×
      </button>
    </div>,
    document.body
  ) : null;

  return { apply, bar };
}
