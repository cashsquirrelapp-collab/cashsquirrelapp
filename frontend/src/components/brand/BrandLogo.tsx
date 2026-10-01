import React from 'react';
import { Mascot } from '../mascot/Mascot';

// Logo system V2. The squirrel is the original <Mascot /> in its "hold-baht" pose -- never
// redrawn here, only cropped tighter (MARK_VIEWBOX) so it fills icon-sized spaces.
// public/favicon.svg and the brand kit are static renders of this same mark.
export const MARK_VIEWBOX = '12 16 80 80';

/** Compact mark: the squirrel holding a ฿ coin, no text. */
export function BrandLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 ${className}`}>
      <Mascot mood="happy" action="hold-baht" animated={false} size={size} viewBox={MARK_VIEWBOX} />
    </span>
  );
}

/**
 * Primary horizontal logo: [mark] กระรอกตุนเงิน, with "ตุนเงิน" in brand orange.
 * No tagline or English line -- those belong to marketing material only.
 */
export function BrandLockup({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(size * 0.3) }}>
      <BrandLogo size={size} />
      <span
        className="whitespace-nowrap leading-none text-brand-text"
        style={{ fontFamily: "'Prompt', 'IBM Plex Sans Thai', sans-serif", fontWeight: 600, fontSize: Math.round(size * 0.56) }}
      >
        กระรอก<span className="text-[#E65F2B] dark:text-[#FF7A45]">ตุนเงิน</span>
      </span>
    </span>
  );
}
