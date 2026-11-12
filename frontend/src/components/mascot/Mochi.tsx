import React from 'react';
import type { MascotMood } from './Mascot';
import './mochi.css';

// น้องเลขา "โมจิ" (owner, 2026-11-12: "เอาแบบ 1 โมจิ ใส่ในแอปเลย"): เลขากระรอก's own character. A soft brick-red blob with
// round squirrel ears, a dark face window with white LED eyes, pink cheeks and the logo's curled tail behind it. Flat
// colours only (owner, same day: no gradients); only the eyes glow. It is drawn wherever เลขา is the one talking (the chat,
// the corner, the floating window, the arrival, its menu icon). The egg design is kept for a future Pro "advanced" เลขา
// (artifacts/sheet-assistant-ui/mini-final). Everywhere else the app's squirrel (Mascot.tsx) stays as it is.

export type MochiFace = 'idle' | 'listen' | 'think' | 'talk' | 'happy' | 'worried' | 'sleepy';

const BRICK = '#E65F2B';
const DEEP = '#C24A16';
const CREAM = '#FFF1E8';
const INK = '#1F1D1B';
const WHITE = '#FFFFFF';
const PINK = '#FF9DB0';
const TAIL = 'M462 71 C635 59 816 143 886 307 C921 428 924 473 919 516 C906 635 835 739 747 817 C668 885 566 929 461 929 C419 929 359 923 350 870 C349 863 350 856 351 849 C361 800 415 799 454 791 C474 787 495 778 513 768 C592 722 620 620 585 539 C566 493 519 458 474 440 C407 414 328 409 262 441 C229 458 197 489 205 530 C212 564 251 578 281 585 C296 589 312 591 328 592 C339 593 350 592 362 592 C415 592 498 591 514 658 C517 667 519 676 518 686 C518 694 515 702 513 709 C494 760 439 762 393 762 C375 762 354 765 337 758 C312 747 309 710 330 694 C342 684 357 684 371 684 L417 684 C430 684 446 686 456 677 C473 661 454 640 438 634 C419 627 399 628 379 628 C357 628 337 627 315 626 C289 624 262 620 237 612 C168 591 110 537 88 467 C83 448 80 428 80 407 C80 276 182 173 293 118 C316 106 340 96 366 89 C397 79 430 73 462 71 Z';

/** The squirrel's moods, read as โมจิ's faces. Its resting "happy" keeps its eyes open; only real joy closes them. */
export function mochiFace(mood: MascotMood | MochiFace | undefined): MochiFace {
  switch (mood) {
    case 'listen': case 'think': case 'talk': case 'happy': case 'worried': case 'sleepy': case 'idle': return mood;
    case 'celebrate': case 'excited': case 'received-money': case 'blissful': case 'proud': case 'relieved': return 'happy';
    case 'thinking': return 'think';
    // Waiting on the person (a card to confirm, the mic listening): it looks up, attentive.
    case 'checking': case 'waiting': case 'alert': return 'listen';
    case 'error': return 'worried';
    default: return 'idle';
  }
}

/** The face inside the window: eyes centred at 100±16, 104 on the 200×200 drawing. */
function Face({ face }: { face: MochiFace }) {
  const cy = 104;
  const eye = (x: number, y: number, h: number) => <rect key={x} x={x - 4.5} y={y - h / 2} width={9} height={h} rx={4.5} fill={WHITE} />;
  let eyes: React.ReactNode;
  let mouth: React.ReactNode = <path d="M95 115.2 Q100 119.7 105 115.2" fill="none" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" />;
  if (face === 'happy') {
    eyes = [84, 116].map(x => <path key={x} d={`M${x - 7.7} ${cy + 2.5} Q${x} ${cy - 5.9} ${x + 7.7} ${cy + 2.5}`} fill="none" stroke={WHITE} strokeWidth={5} strokeLinecap="round" />);
  } else if (face === 'sleepy') {
    eyes = [84, 116].map(x => <path key={x} d={`M${x - 7} ${cy - 1} Q${x} ${cy + 5} ${x + 7} ${cy - 1}`} fill="none" stroke={WHITE} strokeWidth={4} strokeLinecap="round" />);
    mouth = <path d="M96.5 116.5 H103.5" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" />;
  } else if (face === 'think') {
    eyes = <>{[84, 116].map(x => <rect key={x} x={x - 8.1} y={cy - 2.5} width={16.2} height={5} rx={2.5} fill={WHITE} />)}
      <circle cx={130.4} cy={91.4} r={2} fill={WHITE} opacity={0.85} /><circle cx={135.8} cy={85.8} r={2.7} fill={WHITE} opacity={0.85} /></>;
    mouth = <path d="M96.6 117 H103.4" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" />;
  } else if (face === 'worried') {
    eyes = [84, 116].map(x => eye(x, cy + 2, 10));
    mouth = <path d="M95 118 Q100 114 105 118" fill="none" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" />;
  } else {
    const h = face === 'talk' ? 10 : 14;
    eyes = [84, 116].map(x => eye(x, face === 'listen' ? cy - 3 : cy, h));
    if (face === 'talk') mouth = <rect x={96.2} y={113.8} width={7.6} height={5.4} rx={2.7} fill={WHITE} />;
  }
  return <g className="mochi-eyes">{eyes}{mouth}</g>;
}

interface Props {
  mood?: MascotMood | MochiFace;
  size?: number;
  /** A close-up of the head for round avatars. */
  face?: boolean;
  /** A slow float and a blink now and then (off for small avatars and reduced motion). */
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Mochi({ mood = 'idle', size = 96, face = false, animated = true, className = '', style }: Props) {
  const glow = `mochi${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const look = mochiFace(mood);
  return (
    <svg viewBox={face ? '40 30 120 120' : '0 0 200 200'} width={size} height={size} aria-hidden="true" focusable="false"
      className={`mochi${animated ? ' is-animated' : ''} ${className}`} style={style} data-face={look}>
      <defs>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="mochi-body">
        <g transform="translate(118 96) scale(.07) rotate(20 500 500)" fill={DEEP}><path d={TAIL} /></g>
        <ellipse cx="74" cy="56" rx="12" ry="19" fill={BRICK} transform="rotate(-10 74 56)" />
        <ellipse cx="126" cy="56" rx="12" ry="19" fill={BRICK} transform="rotate(10 126 56)" />
        <ellipse cx="74" cy="58" rx="5.5" ry="9.9" fill={CREAM} transform="rotate(-10 74 56)" />
        <ellipse cx="126" cy="58" rx="5.5" ry="9.9" fill={CREAM} transform="rotate(10 126 56)" />
        <rect x="46" y="58" width="108" height="112" rx="52" fill={BRICK} />
        <rect x="62" y="84" width="76" height="48" rx="24" fill={INK} />
        <rect x="66" y="118" width="10" height="5" rx="2.5" fill={PINK} opacity={0.85} />
        <rect x="124" y="118" width="10" height="5" rx="2.5" fill={PINK} opacity={0.85} />
        <g filter={`url(#${glow})`}><Face face={look} /></g>
      </g>
    </svg>
  );
}

/** โมจิ looking over an edge (the chat's perch, the floating window): the same box as MascotPeek (its width by 64% of it,
 *  placed by the caller's class), showing the ears, the face and the top of the body. While it works, it thinks. */
export function MochiPeek({ size = 104, className = '', mood = 'idle', motion = 'calm', holo = false, style }: {
  size?: number; className?: string; mood?: MascotMood | MochiFace; motion?: 'peek' | 'calm' | 'still'; holo?: boolean; style?: React.CSSProperties;
}) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute block ${className}`} style={{ width: size, height: size * 0.64, ...style }}
      {...(holo ? { 'data-holo': '' } : {})}>
      <Mochi mood={holo ? 'think' : mood} animated={motion !== 'still'} size={size}
        style={{ position: 'absolute', left: 0, top: -size * 0.16, width: size, height: size }} className="mochi-peek" />
    </span>
  );
}
