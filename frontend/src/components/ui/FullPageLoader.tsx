import React from 'react';
import { hideSplash, showSplash } from '../../app/splash';

import { tr, T } from '../../i18n/tr';
// Plain, honest wording: the app is loading, nothing more specific is happening.
const DEFAULT_MESSAGES = [T("กำลังโหลดข้อมูล กรุณารอสักครู่")];

interface FullPageLoaderProps {
  /** Main headline -- keep this the same across contexts per the loading-system spec. */
  title?: string;
  /** Secondary line(s), cycled every ~1.8s. Override per context (e.g. Tax: "กำลังคำนวณข้อมูลภาษี"). */
  messages?: string[];
}

/**
 * Full-screen loading moment -- reserved for the handful of cases the loading-system spec calls
 * out (first app open, session init, a major workspace switch, first Dashboard load). Everything
 * else uses a skeleton instead; see useDelayedLoader for the show-delay/min-visible gating that
 * keeps this from flashing on fast loads.
 *
 * It shows the logo (owner, 2026-11-02: the phone's opening logo on every device instead of the waiting squirrel;
 * app/splash.ts): drawn over the page while this is mounted, then it finishes its entrance and fades into the page.
 * The default wording is not printed (the logo says it); a specific one ("กำลังย้ายไปพื้นที่ทำงานใหม่…") is.
 */
export function FullPageLoader({ title = tr("กำลังโหลด…"), messages = DEFAULT_MESSAGES }: FullPageLoaderProps) {
  const defaultTitle = title === tr("กำลังโหลด…");
  React.useEffect(() => {
    showSplash({ caption: defaultTitle ? undefined : title, label: title });
    return () => hideSplash();
  }, [defaultTitle, title]);
  return (
    <div className="min-h-screen bg-brand-bg" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{title} {tr(messages[0] ?? DEFAULT_MESSAGES[0])}</span>
    </div>
  );
}
