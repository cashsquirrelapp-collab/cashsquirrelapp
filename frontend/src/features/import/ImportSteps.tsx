import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { tr } from '../../i18n/tr';

// The check of a file, step by step, as เลขา works through it (owner, 2026-11-04: "เวลาโยนไปก็ให้แบบมันคุยกับ AI ประมวลผล ...
// ขึ้นสถานะแล้วก็แจ้งมาว่าอะไรเป็นยังไงบ้าง"). Every step is work the import really does (reading, matching columns, asking
// เลขา about unknown columns, checking the file's own totals, comparing with the account's records); the steps tick one
// after another so the person sees what was checked, and the report cards follow. With reduced motion they show done at once.

export interface ImportStep { key: string; label: string; detail?: string; /** Still running (เลขา is looking at columns). */ waiting?: boolean }

const STEP_MS = 420;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** How many steps are done: one more every STEP_MS, never past a step that is still running. Restarts for a new run. */
export function useStepReveal(steps: ImportStep[], run: string): number {
  const [done, setDone] = React.useState(0);
  React.useEffect(() => { setDone(reducedMotion() ? Number.MAX_SAFE_INTEGER : 0); }, [run]);
  const waitingAt = steps.findIndex(step => step.waiting);
  const limit = waitingAt < 0 ? steps.length : waitingAt;
  React.useEffect(() => {
    if (!run || done >= limit) return;
    const timer = window.setTimeout(() => setDone(value => Math.min(value + 1, limit)), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [run, done, limit]);
  return Math.min(done, limit);
}

export function ImportSteps({ steps, done }: { steps: ImportStep[]; done: number }) {
  const finished = done >= steps.length;
  const list = (
    <ol className="ic-steps-list">
      {steps.slice(0, Math.min(steps.length, done + 1)).map((step, index) => {
        const live = index >= done;
        return (
          <li key={step.key} className={live ? 'is-live' : 'is-done'} data-testid="import-step" data-state={live ? 'live' : 'done'}>
            <span className="ic-step-mark" aria-hidden="true">{live ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</span>
            <span className="min-w-0"><span className="ic-step-label">{step.label}</span>{!live && step.detail && <span className="ic-step-detail">{step.detail}</span>}</span>
          </li>
        );
      })}
    </ol>
  );
  if (!finished) {
    return (
      <section className="ic-card ic-steps" aria-live="polite" aria-label={tr("กำลังตรวจไฟล์")} data-testid="import-steps" data-state="live">
        <p className="ic-steps-head"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{tr("กำลังตรวจไฟล์…")}</p>
        {list}
      </section>
    );
  }
  return (
    <details className="ic-card ic-steps is-done" data-testid="import-steps" data-state="done">
      <summary className="ic-steps-head"><span className="ic-step-mark is-ok" aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>{tr("ตรวจไฟล์ครบ {0} ขั้นตอน", steps.length)}<span className="ic-steps-more">{tr("ดูขั้นตอน")}</span></summary>
      {list}
    </details>
  );
}
