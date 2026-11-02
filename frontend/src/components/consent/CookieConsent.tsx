import React from 'react';
import { Cookie } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { tr } from '../../i18n/tr';
import { COOKIE_SETTINGS_EVENT, readCookieConsent, saveCookieConsent } from '../../services/cookieConsent';
import './cookieConsent.css';

// The cookie banner (owner, 2026-11-02): on the first visit to any page, until a choice is made; the footer's
// ตั้งค่าคุกกี้ brings it back. It says what the site really does (services/cookieConsent.ts) and offers the one real
// choice: everything, or essential cookies only (no usage statistics).
export function CookieConsent() {
  useLanguage(); // re-render in the language the visitor switches to
  const [open, setOpen] = React.useState(() => readCookieConsent() === null);
  React.useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);
  if (!open) return null;
  const choose = (stats: boolean) => { saveCookieConsent(stats); setOpen(false); };
  return (
    <section className="ck-banner" role="dialog" aria-modal="false" aria-labelledby="ck-title" aria-describedby="ck-text">
      <div className="ck-head">
        <span className="ck-icon" aria-hidden="true"><Cookie size={18} strokeWidth={2} /></span>
        <h2 id="ck-title">{tr('เว็บไซต์นี้ใช้คุกกี้')}</h2>
      </div>
      <p id="ck-text">
        {tr('เราใช้คุกกี้ที่จำเป็นต่อการเข้าสู่ระบบและความปลอดภัย และเก็บสถิติการใช้งาน เช่น ฟีเจอร์ที่ใช้และช่วงเวลาที่เข้าใช้ เพื่อดูแลและปรับปรุงบริการ ไม่มีคุกกี้โฆษณาหรือการติดตามข้ามเว็บไซต์')}{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{tr('นโยบายความเป็นส่วนตัว')}</a>
      </p>
      <div className="ck-actions">
        <button type="button" className="ck-btn is-secondary" onClick={() => choose(false)}>{tr('เฉพาะที่จำเป็น')}</button>
        <button type="button" className="ck-btn is-primary" onClick={() => choose(true)}>{tr('ยอมรับทั้งหมด')}</button>
      </div>
    </section>
  );
}
