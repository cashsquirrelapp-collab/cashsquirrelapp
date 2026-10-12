import React from 'react';
import { useReducedMotion } from 'motion/react';
import { BrandLockup } from '../../components/brand/BrandLogo';
import { LIGHT_VARS } from './landing/primitives';
import { CTA } from './landing/story/content';
import { MoneyAct } from './landing/story/MoneyAct';
import { DocsAct } from './landing/story/DocsAct';
import { FreeAct } from './landing/story/FreeAct';
import { ClosingAct } from './landing/story/ClosingAct';
import { StaticStory } from './landing/story/StaticStory';

// Public landing page, Draft 2. One story told by scrolling: many projects to remember, the
// screen that puts their payment dates in order, one job opened up, the same check from LINE,
// documents, what Free includes, and a close. Every product picture is a screenshot of the
// running app (docs/landing-draft2/asset-manifest.md); this page only frames, crops and moves them.
// It reads no account data and calls no API.

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

const NAV = [
  { href: '#due', label: 'กำหนดรับเงิน' },
  { href: '#line', label: 'LINE' },
  { href: '#documents', label: 'เอกสาร' },
  { href: '#plans', label: 'แพ็กเกจ' },
];

/** A floating bar that sits on its own white pill, so it reads on the light and the dark scenes alike. */
function Nav({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B]';
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div className="pointer-events-auto mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 rounded-full border border-[#E7E0D8] bg-white pl-4 pr-2 shadow-[0_10px_30px_-18px_rgba(40,26,12,0.45)] sm:pl-5">
        <a href="/" aria-label="กระรอกตุนเงิน หน้าแรก" className={`rounded-full ${focus}`}><BrandLockup size={28} /></a>
        <nav className="hidden items-center gap-7 md:flex" aria-label="เมนูหลัก">
          {NAV.map(item => <a key={item.href} href={item.href} className={`rounded text-[14.5px] text-[#57514B] transition-colors hover:text-[#1C1917] ${focus}`}>{item.label}</a>)}
        </nav>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onLogin} className={`h-10 rounded-full px-3 text-[14.5px] font-medium text-[#1C1917] hover:text-[#C24A16] cursor-pointer ${focus}`}>เข้าสู่ระบบ</button>
          <button type="button" onClick={onStart} className={`hidden h-10 items-center rounded-full bg-[#1C1917] px-4 text-[14.5px] font-medium text-white transition-colors hover:bg-black min-[420px]:inline-flex cursor-pointer ${focus}`}>{CTA}</button>
        </div>
      </div>
    </header>
  );
}

/** True while the window is too short to hold a pinned stage (a phone on its side, a squeezed window). */
function useShortWindow() {
  const [short, setShort] = React.useState(() => typeof window !== 'undefined' && window.innerHeight < 560);
  React.useEffect(() => {
    const read = () => setShort(window.innerHeight < 560);
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => { window.removeEventListener('resize', read); window.removeEventListener('orientationchange', read); };
  }, []);
  return short;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const goLogin = () => onNavigate('/login');
  const reduce = useReducedMotion();
  const short = useShortWindow();
  const still = Boolean(reduce) || short;

  return (
    <div className="landing-story min-h-screen bg-[#FAF8F5] text-[#1C1917] antialiased" style={{ ...LIGHT_VARS, fontFamily: 'var(--font-sans)', colorScheme: 'light' }}>
      <Nav onStart={goLogin} onLogin={goLogin} />
      <main>
        {still ? <StaticStory onStart={goLogin} /> : <><MoneyAct onStart={goLogin} /><DocsAct /></>}
        <FreeAct onStart={goLogin} />
      </main>
      <ClosingAct onStart={goLogin} onLogin={goLogin} />
    </div>
  );
}
