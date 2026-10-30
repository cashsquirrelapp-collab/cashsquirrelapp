import React from 'react';
import { Bell, FileText, Plus } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { LineLogo } from '../../components/ui/LineLogo';
import { GmailLogo } from '../../components/ui/GmailLogo';
import { tr } from '../../i18n/tr';
import './authStage.css';

// The sign-in page in the landing's own look (owner, 2026-10-30: "ดูสร้างสรรค์มากกว่านี้เหมือนกับหน้า landing page"):
// white, with the landing's floating things drifting around the card (LINE, Gmail, a document, the month's money, the
// 08:00 reminder, money received), each arriving in turn and then floating gently. Pictures only (aria-hidden); phones
// show only LINE and Gmail, on the card's edge (AuthCardIcons), so nothing crowds the card. The waving squirrel on the card's edge is drawn by the card itself
// (AuthPerch), so it moves with it.

export function AuthStage() {
  return (
    <div className="auth-stage" aria-hidden="true">
      <span className="auth-float is-line"><span className="auth-float-in"><LineLogo size={58} /></span></span>
      <span className="auth-float is-month"><span className="auth-float-in auth-glass">
        <small><i className="is-in" />{tr('เงินเข้าเดือนนี้')}</small><b>฿38,500</b>
        <svg className="auth-spark" viewBox="0 0 120 32" aria-hidden="true"><path d="M2 28 L22 24 L40 26 L58 16 L76 18 L96 8 L118 4" /></svg>
      </span></span>
      <span className="auth-float is-doc"><span className="auth-float-in"><span className="auth-doc"><FileText size={28} /></span></span></span>
      <span className="auth-float is-gmail"><span className="auth-float-in"><GmailLogo size={58} bare /></span></span>
      <span className="auth-float is-remind"><span className="auth-float-in auth-glass is-solid">
        <span className="auth-chip-icon"><Bell size={16} /></span><span className="auth-pair"><b>08:00</b><small>{tr('เตือนรับเงิน')}</small></span>
      </span></span>
      <span className="auth-float is-paid"><span className="auth-float-in auth-glass">
        <span className="auth-chip-icon is-green"><Plus size={16} strokeWidth={3} /></span><span className="auth-pair"><b className="is-green">+฿5,000</b><small>{tr('รับแล้ว')}</small></span>
      </span></span>
    </div>
  );
}

/** Phones: LINE and Gmail sit on the card's top-left edge (the squirrel has the right), so they move with the card
 *  whichever form it shows. Hidden on computers and iPads, where they float around the page instead. */
export function AuthCardIcons() {
  return (
    <span className="auth-card-icons" aria-hidden="true">
      <span className="auth-float-in" style={{ '--d': '0.2s', '--b': '4.6s' } as React.CSSProperties}><LineLogo size={44} /></span>
      <span className="auth-float-in" style={{ '--d': '0.32s', '--b': '5.1s' } as React.CSSProperties}><GmailLogo size={44} bare /></span>
    </span>
  );
}

/** เลขากระรอก on the card's top edge, waving (the locked mascot, its own wave). */
export function AuthPerch() {
  return <span className="auth-perch" aria-hidden="true"><Mascot gear="headset" mood="wave" action="wave" size={120} /></span>;
}

/** The page stays light while it shows, like the landing (its moon switch is gone). When it closes, the app's own
 *  setting (`appDark`, the latest one, which the evening switch may have changed meanwhile) is put back. */
export function useAuthLight(appDark: boolean) {
  const latest = React.useRef(appDark);
  latest.current = appDark;
  React.useEffect(() => {
    const html = document.documentElement;
    const clear = () => { if (html.classList.contains('dark')) html.classList.remove('dark'); };
    clear();
    const observer = new MutationObserver(clear);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => { observer.disconnect(); html.classList.toggle('dark', latest.current); };
  }, []);
}

/** The official four-colour Google "G" (kept as Google draws it). */
export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FBBC05" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Facebook's "f" in white, for the button in Facebook's own blue. */
export function FacebookF({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={color}>
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}
