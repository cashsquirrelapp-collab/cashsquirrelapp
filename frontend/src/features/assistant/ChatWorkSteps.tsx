import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { useSeconds, type FinishedWork, type Work } from './workSteps';

// What เลขากระรอก is doing, as Claude and ChatGPT show it (owner, 2026-11-04): while it works, each step with a tick when
// done and the current one turning, with the seconds so far; after the answer, the same list folded above it. Formal, like
// the rest of the chat: no glow, no animation beyond the small turning mark (none with reduced motion).

const secondsText = (seconds: number) => tr("{0} วิ", seconds);

export function WorkLive({ work }: { work: Work }) {
  const seconds = useSeconds(work.startedAt);
  const current = work.steps.find(step => !step.done) ?? work.steps.at(-1);
  return (
    <div className="asx-work" role="status" aria-live="polite" aria-label={current ? tr("เลขากระรอกกำลัง{0}", current.label) : tr("เลขากระรอกกำลังทำงาน")} data-testid="chat-work-live">
      <p className="asx-work-head"><span>{tr("เลขากระรอกกำลังทำงาน")}</span><span className="asx-work-time">{secondsText(seconds)}</span></p>
      <ol className="asx-work-list">
        {work.steps.map((step, index) => (
          <li key={`${index}-${step.label}`} className={step.done ? 'is-done' : 'is-doing'}>
            {step.done ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <Loader2 size={14} className="asx-work-spin" aria-hidden="true" />}
            <span>{step.label}{step.count > 1 ? ` (${step.count})` : ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The steps of an answer, folded: "ขั้นตอนที่ทำ 4 ขั้น · 12 วิ". */
export function WorkDone({ work }: { work: FinishedWork }) {
  const seconds = Math.max(1, Math.round(work.ms / 1000));
  return (
    <details className="asx-work-done" data-testid="chat-work-done">
      <summary>{tr("ขั้นตอนที่ทำ {0} ขั้น · {1}", work.steps.length, secondsText(seconds))}</summary>
      <ol className="asx-work-list">
        {work.steps.map((step, index) => (
          <li key={`${index}-${step.label}`} className="is-done"><Check size={14} strokeWidth={2.4} aria-hidden="true" /><span>{step.label}{step.count > 1 ? ` (${step.count})` : ''}</span></li>
        ))}
      </ol>
    </details>
  );
}
