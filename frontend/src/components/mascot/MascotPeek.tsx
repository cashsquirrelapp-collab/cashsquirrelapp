import React from 'react';
import { Mascot, mascotColors, type MascotMood } from './Mascot';

// The mascot holding on to the top edge of a card or banner and peeking over it. The drawing is
// the unchanged <Mascot/>: everything below its paws is hidden behind the edge, and its two paws
// are drawn again in front of the edge so they rest on it. Place it inside a `relative` box with
// e.g. `bottom-[calc(100%-1px)]` so the paw line sits on the box's top border.
// เลขากระรอก's floating chat (2026-10-26) perches it on the window: its own mood, the headset, and a calm motion.

const PAW_Y = 64; // where the idle paws sit in the 100x100 artwork
const FUR_DARK = '#7A4419';

type Props = {
  size?: number;
  className?: string;
  /** The face; the paws take the same fur colour. */
  mood?: MascotMood;
  /** An outfit over the unchanged squirrel (see Mascot). */
  gear?: 'none' | 'headset';
  /** 'peek' (the default) ducks and looks around; 'calm' only breathes and leans a little now and then; 'still' stays. */
  motion?: 'peek' | 'calm' | 'still';
  style?: React.CSSProperties;
};

export function MascotPeek({ size = 104, className = '', mood = 'happy', gear = 'none', motion = 'peek', style }: Props) {
  const u = size / 100;
  const fur = mascotColors(mood).body;
  const body = motion === 'peek' ? 'mascot-peek-body' : motion === 'calm' ? 'mascot-perch-body' : '';
  const paw = motion === 'peek' ? 'mascot-peek-paw' : '';
  return (
    <span aria-hidden className={`pointer-events-none absolute block ${className}`} style={{ width: size, height: PAW_Y * u, ...style }}>
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
        @keyframes mascotPerch {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          40% { transform: translateY(${-0.8 * u}px) rotate(0deg); }
          62% { transform: translateY(${-0.8 * u}px) rotate(-3deg); }
          78% { transform: translateY(0) rotate(0deg); }
        }
        .mascot-peek-body { animation: mascotPeek 6.5s cubic-bezier(.45,.05,.35,1) infinite; transform-origin: 50% ${PAW_Y}%; }
        .mascot-peek-paw { animation: mascotGrip 6.5s cubic-bezier(.45,.05,.35,1) infinite; transform-box: fill-box; transform-origin: 50% 100%; }
        .mascot-perch-body { animation: mascotPerch 9s ease-in-out infinite; transform-origin: 50% ${PAW_Y}%; }
        @media (prefers-reduced-motion: reduce) {
          .mascot-peek-body, .mascot-peek-paw, .mascot-perch-body { animation: none; }
          .mascot-peek-body, .mascot-perch-body { transform: none; }
        }
      `}</style>
      {/* Everything below the paws stays hidden behind the edge */}
      <span className="absolute inset-x-0 top-0 block overflow-hidden" style={{ height: PAW_Y * u }}>
        <span className={`${body} block`} style={{ width: size, height: size }}>
          <Mascot mood={mood} size={size} gear={gear} animated={motion !== 'still'} />
        </span>
      </span>
      {/* The paws, in front of the edge */}
      <svg className="absolute left-0 top-0 overflow-visible" width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy={PAW_Y + 3.2} rx="21" ry="1.6" fill="#3D2314" fillOpacity="0.10" />
        {[34, 66].map(x => (
          <g key={x} className={paw}>
            <ellipse cx={x} cy={PAW_Y} rx="4.4" ry="3.4" fill={fur} />
            <path d={`M${x - 1.6} ${PAW_Y + 0.6}v2.2M${x} ${PAW_Y + 1}v2.2M${x + 1.6} ${PAW_Y + 0.6}v2.2`} stroke={FUR_DARK} strokeOpacity="0.45" strokeWidth="0.7" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </span>
  );
}
