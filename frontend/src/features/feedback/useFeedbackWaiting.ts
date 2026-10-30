import React from 'react';
import { FEEDBACK_CHANGED_EVENT, FEEDBACK_WAITING_EVENT, feedbackApi } from '../../services/feedback';

/**
 * How many บอกเรา conversations wait for the team's answer, for an admin (owner, 2026-10-27: messages came in and the
 * admin was never told). Read on open, every 20 seconds while the app is on screen (owner, 2026-10-30: live like a
 * messaging app), when the window is focused again and after the team answers;
 * null until known, or while the inbox cannot be read (then no count is shown).
 */
export function useFeedbackWaiting(account: string | null | undefined): number | null {
  const [count, setCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    setCount(null);
    if (!account) return;
    let controller = new AbortController();
    const read = () => {
      controller.abort();
      controller = new AbortController();
      feedbackApi.adminList(account, { box: 'waiting' }, controller.signal).catch(() => { /* the count stays as it was */ });
    };
    const heard = (event: Event) => { const value = (event as CustomEvent<number>).detail; if (typeof value === 'number') setCount(value); };
    window.addEventListener(FEEDBACK_WAITING_EVENT, heard);
    window.addEventListener(FEEDBACK_CHANGED_EVENT, read);
    window.addEventListener('focus', read);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') read(); }, 20_000);
    read();
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener(FEEDBACK_WAITING_EVENT, heard);
      window.removeEventListener(FEEDBACK_CHANGED_EVENT, read);
      window.removeEventListener('focus', read);
    };
  }, [account]);
  return count;
}
