import React from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';

// Shared building blocks for the marketing page: the easing, a scroll reveal, and
// the small app-style pieces (frame, status pill) the product visuals are made of. They copy
// the app's own look (thin borders, near-black text, orange only as an accent) rather than
// inventing a separate marketing UI.

export const EASE = [0.22, 1, 0.36, 1] as const;

export const C = {
  page: '#FAF8F5',
  white: '#FFFFFF',
  soft: '#F6F2EC',
  text: '#1C1917',
  muted: '#77716B',
  faint: '#F3F2F0',
  border: '#E7E4DF',
  orange: '#E65F2B',
  orangeText: '#C24A16',
  cream: '#FFF1E8',
  green: '#18A66A',
  greenBg: '#E9F7F0',
  amber: '#B7791F',
  amberBg: '#FFF6E5',
  red: '#D64545',
  redBg: '#FDEEEE',
  ink: '#141416',
} as const;

/** Light-mode tokens for the whole page, so a visitor's saved dark theme never leaks in. */
export const LIGHT_VARS = {
  '--bg': C.page, '--white': C.white, '--text': C.text, '--muted': C.muted, '--faint': C.faint, '--border': C.border,
  // The Tailwind brand colours resolve their var()s on :root, so set them here directly too.
  '--color-brand-bg': C.page, '--color-brand-white': C.white, '--color-brand-text': C.text,
  '--color-brand-muted': C.muted, '--color-brand-faint': C.faint, '--color-brand-border': C.border,
} as React.CSSProperties;

export function Reveal({ children, delay = 0, y = 20, className, as = 'div' }: {
  children: React.ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' | 'section' | 'p' | 'h2';
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}>
      {children}
    </Tag>
  );
}

/** True once the element has scrolled into view (always true with reduced motion). */
export function useSeen<T extends Element>(amount = 0.35) {
  const ref = React.useRef<T>(null);
  const inView = useInView(ref, { once: true, amount });
  const reduce = useReducedMotion();
  return [ref, Boolean(reduce) || inView] as const;
}

export const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;

export type PillTone = 'neutral' | 'orange' | 'amber' | 'green' | 'red' | 'blue';
const PILL: Record<PillTone, string> = {
  neutral: 'bg-[#F3F2F0] text-[#77716B]',
  orange: 'bg-[#FFF1E8] text-[#C24A16]',
  amber: 'bg-[#FFF6E5] text-[#9A6412]',
  green: 'bg-[#E9F7F0] text-[#12804F]',
  red: 'bg-[#FDEEEE] text-[#B83434]',
  blue: 'bg-[#EEF4FD] text-[#2F63B8]',
};

export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors duration-300 ${PILL[tone]}`}>{children}</span>;
}

/** Thin app frame: the product is the visual, so the frame stays nearly invisible. */
export function Frame({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={`overflow-hidden rounded-[18px] border border-[#E7E4DF] bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-[#EFECE8] px-4 py-2.5 sm:px-5">
          <span className="text-[12px] font-medium text-[#1C1917]">{title}</span>
          <span className="flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#E7E4DF]" /><span className="h-1.5 w-1.5 rounded-full bg-[#E7E4DF]" /><span className="h-1.5 w-1.5 rounded-full bg-[#E7E4DF]" /></span>
        </div>
      )}
      {children}
    </div>
  );
}

export function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <p className={`text-[13px] font-medium tracking-wide ${dark ? 'text-[#FF9A6B]' : 'text-[#C24A16]'}`}>{children}</p>;
}

/** Section headline: large, calm, balanced Thai line breaks come from explicit <br/>s. */
export function Headline({ children, className = '', dark = false }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <h2 className={`text-[clamp(1.9rem,1.1rem+2.4vw,3.1rem)] font-semibold leading-[1.12] tracking-[-0.01em] [text-wrap:balance] ${dark ? 'text-[#F5F2EE]' : 'text-[#1C1917]'} ${className}`}>
      {children}
    </h2>
  );
}

export function Lead({ children, className = '', dark = false }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return <p className={`text-[clamp(1rem,0.92rem+0.35vw,1.2rem)] leading-[1.7] [text-wrap:pretty] ${dark ? 'text-[#A9A39C]' : 'text-[#77716B]'} ${className}`}>{children}</p>;
}
