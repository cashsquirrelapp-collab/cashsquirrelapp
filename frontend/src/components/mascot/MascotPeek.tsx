import React from 'react';
import { Mascot, mascotColors, type MascotMood } from './Mascot';

// The mascot holding on to the top edge of a card or banner and peeking over it. The drawing is
// the unchanged <Mascot/>: everything below its paws is hidden behind the edge, and its two paws
// are drawn again in front of the edge so they rest on it. Place it inside a `relative` box with
// e.g. `bottom-[calc(100%-1px)]` so the paw line sits on the box's top border.
// เลขากระรอก's floating chat (2026-10-26) perches it on the window: its own mood and a calm motion. While it works
// (owner, 2026-10-27: no headset, "เหมือนคอลเซ็นเตอร์เกิน ... โฮโลแกรมขึ้นมาแล้วน้องกำลังกดติ๊ดติ๊ด"), a small hologram
// screen rises from the edge in front of it and its paws tap on it. A prop only; the squirrel is unchanged.

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
  /** Working: the hologram screen in front, and the paws tapping on it. */
  holo?: boolean;
  /** false hides the thinking face's thought dots. */
  thoughtDots?: boolean;
  style?: React.CSSProperties;
};

export function MascotPeek({ size = 104, className = '', mood = 'happy', gear = 'none', motion = 'peek', holo = false, thoughtDots = true, style }: Props) {
  const u = size / 100;
  const fur = mascotColors(mood).body;
  const body = motion === 'peek' ? 'mascot-peek-body' : motion === 'calm' ? 'mascot-perch-body' : '';
  const paw = holo ? 'mascot-tap' : motion === 'peek' ? 'mascot-peek-paw' : '';
  const uid = `mpk${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
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
        @keyframes mascotTap { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.6px); } }
        @keyframes mascotHoloIn { from { opacity: 0; transform: scaleY(0.2); } to { opacity: 1; transform: scaleY(1); } }
        @keyframes mascotHoloType { 0% { transform: scaleX(0); } 55%, 100% { transform: scaleX(1); } }
        @keyframes mascotHoloSweep { from { transform: translateX(-22px); } to { transform: translateX(46px); } }
        @keyframes mascotHoloBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes mascotSpark { 0% { opacity: 0; transform: scale(0.4); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1.6); } }
        .mascot-tap { transform-box: fill-box; animation: mascotTap 0.26s ease-in-out infinite; }
        .mascot-tap + .mascot-tap { animation-delay: 0.13s; }
        .mascot-holo { transform-box: fill-box; transform-origin: 50% 100%; animation: mascotHoloIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .mascot-holo-line { transform-box: fill-box; transform-origin: 0 50%; animation: mascotHoloType 1.4s ease-out infinite; }
        .mascot-holo-line.is-2 { animation-delay: 0.25s; }
        .mascot-holo-line.is-3 { animation-delay: 0.5s; }
        .mascot-holo-sweep { animation: mascotHoloSweep 1.8s linear infinite; }
        .mascot-holo-caret { animation: mascotHoloBlink 0.9s step-end infinite; }
        .mascot-spark { transform-box: fill-box; transform-origin: center; animation: mascotSpark 0.52s ease-out infinite; }
        @keyframes mascotBar { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
        @keyframes mascotMote { 0% { opacity: 0; transform: translateY(0); } 25% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-9px); } }
        .mascot-holo-bar { transform-box: fill-box; transform-origin: 50% 100%; animation: mascotBar 1.1s ease-in-out infinite; }
        .mascot-holo-bar.is-2 { animation-delay: 0.18s; }
        .mascot-holo-bar.is-3 { animation-delay: 0.36s; }
        .mascot-mote { transform-box: fill-box; animation: mascotMote 1.6s ease-out infinite; }
        .mascot-mote.is-2 { animation-delay: 0.55s; }
        .mascot-mote.is-3 { animation-delay: 1.1s; }
        .mascot-spark.is-r { animation-delay: 0.26s; }
        @media (prefers-reduced-motion: reduce) {
          .mascot-peek-body, .mascot-peek-paw, .mascot-perch-body, .mascot-tap, .mascot-holo, .mascot-holo-line, .mascot-holo-sweep, .mascot-holo-caret, .mascot-spark, .mascot-holo-bar, .mascot-mote { animation: none; }
          .mascot-peek-body, .mascot-perch-body { transform: none; }
          .mascot-spark, .mascot-mote { opacity: 0; }
        }
      `}</style>
      {/* Everything below the paws stays hidden behind the edge */}
      <span className="absolute inset-x-0 top-0 block overflow-hidden" style={{ height: PAW_Y * u }}>
        <span className={`${body} block`} style={{ width: size, height: size }}>
          <Mascot mood={mood} size={size} gear={gear} animated={motion !== 'still'} thoughtDots={thoughtDots} />
        </span>
      </span>
      {/* The paws, in front of the edge (and, while it works, the hologram screen under them) */}
      <svg className="absolute left-0 top-0 overflow-visible" width={size} height={size} viewBox="0 0 100 100">
        <ellipse cx="50" cy={PAW_Y + 3.2} rx="21" ry="1.6" fill="#3D2314" fillOpacity="0.10" />
        {holo && (
          <g className="mascot-holo" data-holo="">
            <defs>
              <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF3EC" stopOpacity="0.82" /><stop offset="1" stopColor="#FFB48C" stopOpacity="0.62" /></linearGradient>
              <linearGradient id={`${uid}-beam`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></linearGradient>
              <clipPath id={`${uid}-clip`}><path d="M24.5 50.2H75.5L81.5 64.6H18.5Z" /></clipPath>
            </defs>
            {/* The screen, tilted towards the viewer, standing on the window's edge */}
            <path d="M24.5 50.2H75.5L81.5 64.6H18.5Z" fill={`url(#${uid}-glass)`} stroke="#FFFFFF" strokeOpacity="0.95" strokeWidth="0.7" strokeLinejoin="round" />
            <path d="M25.4 51.1H74.6" stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="0.5" strokeLinecap="round" />
            <g clipPath={`url(#${uid}-clip)`}>
              <rect className="mascot-holo-sweep" x="22" y="49" width="6" height="17" fill={`url(#${uid}-beam)`} transform="skewX(-20)" />
              {/* What it is writing, line by line */}
              <rect className="mascot-holo-line" x="27" y="53.6" width="17" height="1.7" rx="0.85" fill="#C24A16" fillOpacity="0.75" />
              <rect className="mascot-holo-line is-2" x="26.4" y="56.8" width="23" height="1.7" rx="0.85" fill="#E65F2B" fillOpacity="0.6" />
              <rect className="mascot-holo-line is-3" x="25.6" y="60" width="13" height="1.7" rx="0.85" fill="#C24A16" fillOpacity="0.7" />
              <rect className="mascot-holo-caret" x="39.6" y="59.6" width="1" height="2.5" fill="#A63F1B" />
              {/* A small chart that keeps counting */}
              <rect className="mascot-holo-bar" x="60" y="54" width="2.6" height="8" rx="0.8" fill="#E65F2B" fillOpacity="0.85" />
              <rect className="mascot-holo-bar is-2" x="64.4" y="54" width="2.6" height="8" rx="0.8" fill="#C17817" fillOpacity="0.85" />
              <rect className="mascot-holo-bar is-3" x="68.8" y="54" width="2.6" height="8" rx="0.8" fill="#A63F1B" fillOpacity="0.85" />
            </g>
            {/* Light rising while it works, and a tap under each paw */}
            <circle className="mascot-mote" cx="30" cy="49" r="0.7" fill="#FFB48C" />
            <circle className="mascot-mote is-2" cx="71" cy="49" r="0.6" fill="#FFB48C" />
            <circle className="mascot-mote is-3" cx="52" cy="49" r="0.5" fill="#FFFFFF" />
            <circle className="mascot-spark" cx="34" cy={PAW_Y - 3.4} r="1" fill="#FFFFFF" />
            <circle className="mascot-spark is-r" cx="66" cy={PAW_Y - 3.4} r="1" fill="#FFFFFF" />
          </g>
        )}
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
