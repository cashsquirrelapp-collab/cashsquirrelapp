import React from 'react';
import './brand.css';

import { tr } from '../../i18n/tr';
import { currentLanguage } from '../../i18n/currentLanguage';
/** Official tail symbol; the squirrel character remains a separate mascot. */
export function BrandLogo({ size = 32, className = '', inverse = false }: { size?: number; className?: string; inverse?: boolean }) {
  return <span aria-hidden="true" className={`krarok-brand-symbol inline-flex shrink-0 ${className}`}>
    <img src={`/brand/logo01-v1/symbol-${inverse ? 'white' : 'ci'}.svg`} width={size} height={size} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
  </span>;
}

/**
 * Keep the established Thai name and typography; only the symbol changes. The English name
 * (owner, 2026-10-22) reads larger and looser than Thai at the same size, so it is set a step
 * smaller and tighter, with a narrow gap between the words instead of a full space.
 */
export function BrandLockup({ size = 32, className = '', inverse = false }: { size?: number; className?: string; latin?: boolean; inverse?: boolean }) {
  const en = currentLanguage === 'en';
  return <span className={`krarok-brand-lockup inline-flex items-center${inverse ? ' krarok-brand-inverse' : ''} ${className}`} style={{ gap: Math.round(size * (en ? 0.26 : 0.3)) }}>
    <BrandLogo size={size} inverse={inverse} />
    <span className="krarok-brand-name whitespace-nowrap leading-none text-brand-text" style={{ fontFamily: "'Prompt', 'IBM Plex Sans Thai', sans-serif", fontWeight: 600, fontSize: Math.round(size * (en ? 0.47 : 0.56)), letterSpacing: en ? '-0.015em' : undefined }}>
      {tr("กระรอก")}<span className="text-[#E65F2B] dark:text-[#FF7A45]" style={en ? { marginLeft: '0.22em' } : undefined}>{tr("ตุนเงิน")}</span>
    </span>
  </span>;
}
