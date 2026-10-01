import React from 'react';
import { Mascot } from '../mascot/Mascot';

/**
 * The กระรอกตุนเงิน logo: the original mascot, unchanged, in its existing "hold-coin" action.
 * Never redraw the character here -- only pick a mood/action of <Mascot />.
 * public/favicon.svg is a static render of this same configuration.
 */
export function BrandLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex ${className}`}>
      <Mascot mood="happy" action="hold-coin" animated={false} size={size} />
    </span>
  );
}
