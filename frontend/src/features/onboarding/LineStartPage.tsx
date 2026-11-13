import React from 'react';
import WelcomeOnboarding, { type OnboardingResult } from './WelcomeOnboarding';
import LineQuickStart, { readKeep, type QuickUse } from './LineQuickStart';
import { tr } from '../../i18n/tr';

// /line-start — signing up inside LINE with the website's own welcome screens (owner, 2026-11-13: "อยากให้มันเป็น UI
// ทรานซิชั่นเหมือนที่เราทำในเว็บไซต์ไว้"). The LINE page (liff-add.js) checks the LINE identity, leaves its one-hour ID
// token and the LINE name in this tab's sessionStorage and comes here; the server checks the token again
// (/api/line-signup). Afterwards the LINE page closes the window (liff-add.html?done=1) or opens where the person was going.

export const LINE_SIGNUP_KEY = 'krarok_line_signup';
const MAX_AGE_MS = 50 * 60_000;

/** use and keep: ใช้แบบไหน and the record tried in the chat, from the LINE link (services/lineTry.ts). */
type Handoff = { idToken: string; name: string; destination: string | null; at: number; use: QuickUse | null; keep: string | null };
const USE_IDS: readonly string[] = ['personal', 'business', 'company'];

export function readLineHandoff(now = Date.now()): Handoff | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(LINE_SIGNUP_KEY) || 'null') as Partial<Handoff> | null;
    if (!value || typeof value.idToken !== 'string' || !value.idToken || typeof value.at !== 'number' || now - value.at > MAX_AGE_MS) return null;
    return { idToken: value.idToken, name: typeof value.name === 'string' ? value.name.slice(0, 60) : '', destination: typeof value.destination === 'string' ? value.destination : null, at: value.at,
      use: typeof value.use === 'string' && USE_IDS.includes(value.use) ? value.use as QuickUse : null, keep: typeof value.keep === 'string' ? value.keep.slice(0, 600) : null };
  } catch { return null; }
}

export default function LineStartPage() {
  const [handoff] = React.useState(() => readLineHandoff());
  // /line-start?preview=1: the same screens to look at (owner, 2026-11-13: "กูจะดู ... UI ตรงที่แบบกรอกข้อมูลเบื้องต้น"),
  // nothing is sent and no account is made.
  const [preview] = React.useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview'));
  const [previewDone, setPreviewDone] = React.useState(false);
  // The website's own welcome, every question (owner, 2026-11-13: "กูชอบธีมเดิม มึงไปตัดของกูออกทำไม", after the one-tap
  // screen had become the default): where records are kept now (Google Sheets, Excel…) is asked, so the chat can offer to
  // connect them. The one-tap screen stays on ?quick=1.
  const [full] = React.useState(() => typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('quick'));
  const mobile = typeof window !== 'undefined' && window.innerWidth < 744;
  // A new LINE account has no test features: the Sheets goal shows only away from the real site (staging, previews).
  const showUnreleased = typeof window !== 'undefined' && !/(^|\.)krarok\.com$/.test(window.location.hostname);

  const finish = async (result: OnboardingResult) => {
    if (!handoff) throw new Error(tr("กรุณาเปิดหน้านี้ใหม่จากแชท LINE"));
    // Everything the website's first run keeps (App.tsx saveOnboarding), and the agreements.
    const { answers } = result;
    const body: Record<string, unknown> = { idToken: handoff.idToken, name: result.name ?? '', workType: answers.workType, occupations: answers.occupations, goals: answers.goals, agreed: true };
    if (answers.workType === 'other' && answers.workTypeOther.trim()) body.workTypeOther = answers.workTypeOther.trim();
    if (answers.occupations.includes('other') && answers.occupationOther.trim()) body.occupationOther = answers.occupationOther.trim();
    if (answers.recordsIn) body.recordsIn = answers.recordsIn;
    if (result.skippedAtStep) body.skippedAtStep = result.skippedAtStep;
    // ใช้แบบไหน picked on the greeting card, and the record tried in the chat (kept as the first one).
    if (handoff.use) body.use = handoff.use;
    if (handoff.keep) body.keep = handoff.keep;
    // Where they were going (a menu button tapped before signing up), otherwise back to the chat.
    if (handoff.destination) body.destination = handoff.destination;
    const response = await fetch('/api/line-signup', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' },
      body: JSON.stringify(body),
    });
    const reply = await response.json().catch(() => ({})) as { error?: string; destination?: string | null };
    if (!response.ok) throw new Error(reply.error || tr("เริ่มใช้งานไม่สำเร็จ กรุณาลองอีกครั้ง"));
    try { sessionStorage.removeItem(LINE_SIGNUP_KEY); } catch { /* the token expires on its own */ }
    const target = reply.destination ? new URL(reply.destination, window.location.origin) : null;
    window.location.replace(target && target.origin === window.location.origin && !target.hash ? target.href : '/liff-add.html?done=1');
  };

  const quick = async ({ name, use }: { name: string; use: QuickUse | null }) => {
    if (!handoff) throw new Error(tr("กรุณาเปิดหน้านี้ใหม่จากแชท LINE"));
    // The rest of the welcome questions come later, one at a time in the chat: the record says so (skipped at step 2).
    const body: Record<string, unknown> = { idToken: handoff.idToken, name, skippedAtStep: 2, agreed: true };
    if (use) body.use = use;
    if (handoff.keep) body.keep = handoff.keep;
    if (handoff.destination) body.destination = handoff.destination;
    const response = await fetch('/api/line-signup', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' },
      body: JSON.stringify(body),
    });
    const reply = await response.json().catch(() => ({})) as { error?: string; destination?: string | null };
    if (!response.ok) throw new Error(reply.error || tr("เริ่มใช้งานไม่สำเร็จ กรุณาลองอีกครั้ง"));
    try { sessionStorage.removeItem(LINE_SIGNUP_KEY); } catch { /* the token expires on its own */ }
    const target = reply.destination ? new URL(reply.destination, window.location.origin) : null;
    window.location.replace(target && target.origin === window.location.origin && !target.hash ? target.href : '/liff-add.html?done=1');
  };

  if (preview) {
    if (previewDone) return (
      <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24, background: '#FFFFFF', color: '#1C1917', textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.45, margin: '0 0 8px' }}>{tr("จบหน้าตัวอย่าง")}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6B645F', margin: '0 0 20px' }}>{tr("ของจริงจะปิดหน้านี้และกลับไปที่แชท LINE พร้อมการ์ดต้อนรับ ไม่มีการสร้างบัญชีจากหน้าตัวอย่าง")}</p>
          <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0 22px', border: 0, borderRadius: 999, background: '#E65F2B', color: '#FFFFFF', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr("ดูอีกครั้ง")}</button>
        </div>
      </main>
    );
    if (!full) return <LineQuickStart mobile={mobile} initialName="" initialUse={null} keep={readKeep(new URLSearchParams(window.location.search).get('keep'))} onStart={async () => { setPreviewDone(true); }} />;
    return <WelcomeOnboarding mode="line" mobile={mobile} accountName="" showUnreleased={showUnreleased} onFinish={async () => { setPreviewDone(true); }} onSkip={async () => undefined} onClose={() => undefined} />;
  }
  if (!handoff) {
    return (
      <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24, background: '#FFFFFF', color: '#1C1917', textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.45, margin: '0 0 8px' }}>{tr("เปิดหน้านี้จากแชท LINE")}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6B645F', margin: 0 }}>{tr("กดปุ่มเริ่มใช้งานในแชทกระรอกตุนเงินอีกครั้งครับ")}</p>
        </div>
      </main>
    );
  }
  if (!full) return <LineQuickStart mobile={mobile} initialName={handoff.name} initialUse={handoff.use} keep={readKeep(handoff.keep)} onStart={quick} />;
  return <WelcomeOnboarding mode="line" mobile={mobile} accountName={handoff.name} showUnreleased={showUnreleased} onFinish={finish} onSkip={async () => undefined} onClose={() => undefined} />;
}
