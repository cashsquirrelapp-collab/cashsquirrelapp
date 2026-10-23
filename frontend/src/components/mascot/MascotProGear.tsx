import React from 'react';

// เลขากระรอก's Pro outfit (owner chose option ก. "Pro เลขา", 2026-10-23). These are accessories drawn in the
// mascot's own 100 × 100 artwork, so they sit exactly on the official squirrel; the squirrel itself is never
// redrawn. Behind it: a warm aura and a slowly turning gradient ring. In front: a secretary's headset with a
// microphone and a green status light, a gold star pin, and sparkles by the tail.
// Under 40px only the headset is drawn; the rest would be a blur at that size.

type Layer = { uid: string; full: boolean };

function star(x: number, y: number, r: number) {
  const k = r * 0.18;
  return `M${x} ${y - r} C${x + k} ${y - k} ${x + k} ${y - k} ${x + r} ${y} C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + r} C${x - k} ${y + k} ${x - k} ${y + k} ${x - r} ${y} C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - r}Z`;
}

export function ProGearDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#E65F2B" /><stop offset="0.35" stopColor="#FFB347" /><stop offset="0.65" stopColor="#FF6F91" /><stop offset="1" stopColor="#A18BFF" />
      </linearGradient>
      <radialGradient id={`${uid}-aura`} cx="0.5" cy="0.55" r="0.5">
        <stop offset="0" stopColor="#FFB48A" stopOpacity="0.55" /><stop offset="0.6" stopColor="#FF8FB0" stopOpacity="0.18" /><stop offset="1" stopColor="#FF8FB0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-star`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#FF8A3D" />
      </linearGradient>
      <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" /></filter>
    </defs>
  );
}

/** Behind the squirrel: the aura and the ring. */
export function ProGearBack({ uid, full }: Layer) {
  if (!full) return null;
  return (
    <g className="mpg-back">
      <circle cx="50" cy="56" r="42" fill={`url(#${uid}-aura)`} />
      <circle cx="50" cy="56" r="35" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="2.2" opacity="0.55" filter={`url(#${uid}-glow)`} />
      <circle className="mpg-ring" cx="50" cy="56" r="35" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="0.7" strokeDasharray="20 6 3 6" opacity="0.95" />
    </g>
  );
}

/** In front of the squirrel: the headset, and at larger sizes the star pin and the sparkles. */
export function ProGearFront({ uid, full }: Layer) {
  return (
    <g className="mpg-front">
      <g className="mpg-headset">
        <path d="M70.6 46 C70.6 33 62.5 28.2 50 28.2 C37.5 28.2 29.4 33 29.4 46" stroke="#2B2420" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M68.8 41 C67.5 33.5 60.5 30.2 50 30.2" stroke="#8C7A6E" strokeWidth="0.7" strokeLinecap="round" fill="none" opacity="0.9" />
        <rect x="26.2" y="42.5" width="5.6" height="11.5" rx="2.8" fill="#2B2420" /><rect x="27.6" y="44.6" width="2.8" height="7.3" rx="1.4" fill="#E65F2B" />
        <rect x="68.2" y="42.5" width="5.6" height="11.5" rx="2.8" fill="#2B2420" /><rect x="69.6" y="44.6" width="2.8" height="7.3" rx="1.4" fill="#E65F2B" />
        <path d="M71 53.6 C70.6 59.4 64.8 61.6 59.2 61.2" stroke="#2B2420" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <circle cx="58.3" cy="61.1" r="2" fill="#2B2420" /><circle cx="58.3" cy="61.1" r="1.1" fill="#E65F2B" />
        <g className="mpg-led">
          <circle cx="71" cy="44.4" r="1.4" fill="#7CFFB2" filter={`url(#${uid}-glow)`} /><circle cx="71" cy="44.4" r="0.6" fill="#E9FFF2" />
        </g>
      </g>
      {full && (
        <>
          <g className="mpg-pin">
            <path d={star(59.5, 60.8, 2.6)} fill={`url(#${uid}-star)`} />
            <circle cx="59.5" cy="60.8" r="3.6" fill="none" stroke="#FFD27A" strokeWidth="0.4" opacity="0.8" />
          </g>
          <path className="mpg-spark" d={star(25.5, 37, 2.2)} fill={`url(#${uid}-star)`} />
          <path className="mpg-spark is-2" d={star(31.5, 27.5, 1.5)} fill="#FF8FB0" />
          <path className="mpg-spark is-3" d={star(21.5, 47, 1.2)} fill="#A18BFF" />
        </>
      )}
    </g>
  );
}

/** The outfit's motion: the ring turns slowly, the light blinks, the sparkles twinkle. Off with reduced motion. */
export const PRO_GEAR_CSS = `
  .mpg-ring { transform-box: fill-box; transform-origin: center; animation: mpgTurn 14s linear infinite; }
  .mpg-led { animation: mpgLed 1.8s ease-in-out infinite; }
  .mpg-spark { transform-box: fill-box; transform-origin: center; animation: mpgTwinkle 2.4s ease-in-out infinite; }
  .mpg-spark.is-2 { animation-delay: 0.8s; }
  .mpg-spark.is-3 { animation-delay: 1.6s; }
  .mpg-still .mpg-ring, .mpg-still .mpg-led, .mpg-still .mpg-spark { animation: none; }
  @keyframes mpgTurn { to { transform: rotate(360deg); } }
  @keyframes mpgLed { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @keyframes mpgTwinkle { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.55); opacity: 0.55; } }
  @media (prefers-reduced-motion: reduce) { .mpg-ring, .mpg-led, .mpg-spark { animation: none !important; } }
`;
