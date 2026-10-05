import React from 'react';
import { Mascot } from './Mascot';

// The mascot holding on to the top edge of a card or banner and peeking over it. The drawing is
// the unchanged <Mascot/>: everything below its paws is hidden behind the edge, and its two paws
// are drawn again in front of the edge so they rest on it. Place it inside a `relative` box with
// e.g. `bottom-[calc(100%-1px)]` so the paw line sits on the box's top border.

const PAW_Y = 64; // where the idle paws sit in the 100x100 artwork
const FUR = '#C27A3F'; // happy palette body colour (same as the drawing's paws)
const FUR_DARK = '#7A4419';

export function MascotPeek({ size = 104, className = '' }: { size?: number; className?: string }) {
  const u = size / 100;
  return (
    <span aria-hidden className={`pointer-events-none absolute block ${className}`} style={{ width: size, height: PAW_Y * u }}>
      <style>{`
        @keyframes mascotPeek {
          0%, 100% { transform: translateY(${8 * u}px) rotate(0deg); }
          14%, 40% { transform: translateY(0) rotate(0deg); }
          50%, 70% { transform: translateY(${-1.5 * u}px) rotate(-7deg); }
          80% { transform: translateY(0) rotate(2deg); }
          88% { transform: translateY(0) rotate(0deg); }
        }
        @keyframes mascotGrip {
          0%, 100% { transform: scale(1, 1); }
          14%, 40% { transform: scale(1.04, 0.92); }
          50%, 70% { transform: scale(1.06, 0.88); }
          88% { transform: scale(1.04, 0.92); }
        }
        .mascot-peek-body { animation: mascotPeek 6.5s cubic-bezier(.45,.05,.35,1) infinite; transform-origin: 50% ${PAW_Y}%; }
        .mascot-peek-paw { animation: mascotGrip 6.5s cubic-bezier(.45,.05,.35,1) infinite; transform-box: fill-box; transform-origin: 50% 100%; }
        @media (prefers-reduced-motion: reduce) {
          .mascot-peek-body, .mascot-peek-paw { animation: none; }
          .mascot-peek-body { transform: none; }
        }
      `}</style>
      {/* Everything below the paws stays hidden behind the edge */}
      <span className="absolute inset-x-0 top-0 block overflow-hidden" style={{ height: PAW_Y * u }}>
        <span className="mascot-peek-body block" style={{ width: size, height: size }}>
          <Mascot mood="happy" size={size} />
        </span>
      </span>
      {/* The paws, in front of the edge */}
      <svg className="absolute left-0 top-0 overflow-visible" width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy={PAW_Y + 3.2} rx="21" ry="1.6" fill="#3D2314" fillOpacity="0.10" />
        {[34, 66].map(x => (
          <g key={x} className="mascot-peek-paw">
            <ellipse cx={x} cy={PAW_Y} rx="4.4" ry="3.4" fill={FUR} />
            <path d={`M${x - 1.6} ${PAW_Y + 0.6}v2.2M${x} ${PAW_Y + 1}v2.2M${x + 1.6} ${PAW_Y + 0.6}v2.2`} stroke={FUR_DARK} strokeOpacity="0.45" strokeWidth="0.7" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </span>
  );
}
