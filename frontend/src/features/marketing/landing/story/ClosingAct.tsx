import React from 'react';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { Mascot } from '../../../../components/mascot/Mascot';
import { BrandLockup } from '../../../../components/brand/BrandLogo';
import { Reveal } from '../primitives';
import { CLOSING } from './content';
import { StartButton } from './MoneyAct';

// Chapter 6 and the footer. One thick orange line draws itself behind the closing words as the
// page reaches its end, then stays put. It sweeps under and around the button, never across it.

const EN_FONT = "'IBM Plex Sans', var(--font-sans)";

export function ClosingAct({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end end'] });
  const drawn = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const link = 'text-[14.5px] text-[#CFC6BC] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
  return (
    <footer ref={ref} className="relative overflow-hidden bg-[#1F1A16] text-[#FBF7F2]">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="none" fill="none">
        <motion.path d="M -80 250 C 120 250 150 520 330 620 C 560 748 880 742 1090 628 C 1270 530 1290 300 1520 240"
          stroke="#E65F2B" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="[stroke-width:34px] md:[stroke-width:60px]"
          style={{ pathLength: reduce ? 1 : drawn }} />
      </svg>
      <div className="relative mx-auto flex min-h-[calc(100svh-6.5rem)] max-w-[1200px] flex-col justify-center px-5 pb-[clamp(8rem,6rem+8vw,13rem)] pt-[clamp(6.5rem,5rem+5vw,9rem)] text-center sm:px-8">
        <Reveal className="flex justify-center"><Mascot mood="proud" size={84} /></Reveal>
        <Reveal delay={0.06}>
          <h2 className="mt-7 font-semibold" style={{ fontFamily: EN_FONT, fontSize: 'clamp(2.6rem, 1.3rem + 5.6vw, 6rem)', lineHeight: 1.02, letterSpacing: '-0.035em' }}>
            {CLOSING.en.map(line => <span key={line} className="block">{line}</span>)}
          </h2>
          <p className="mt-6 font-semibold" style={{ fontSize: 'clamp(1.25rem, 1rem + 1vw, 1.85rem)', lineHeight: 1.45 }}>
            {CLOSING.th.map(line => <span key={line} className="block">{line}</span>)}
          </p>
          <div className="mt-9 flex justify-center"><StartButton onClick={onStart} dark /></div>
        </Reveal>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="[&_.text-brand-text]:!text-[#FBF7F2]"><BrandLockup size={28} inverse /></span>
          <nav aria-label="ลิงก์ท้ายหน้า" className="flex flex-wrap items-center gap-x-7 gap-y-2">
            <a href="#plans" className={link}>แพ็กเกจ</a>
            <button type="button" onClick={onLogin} className={`${link} cursor-pointer`}>เข้าสู่ระบบ</button>
            <a href="/privacy.html" className={link}>Privacy</a>
            <a href="/terms.html" className={link}>Terms</a>
          </nav>
          <p className="text-[13.5px] text-[#B8AEA4]">© {new Date().getFullYear()} กระรอกตุนเงิน</p>
        </div>
      </div>
    </footer>
  );
}
