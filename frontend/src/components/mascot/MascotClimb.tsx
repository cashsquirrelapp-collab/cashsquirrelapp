import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mascot, mascotColors, type MascotMood } from './Mascot';
import { PRO_GEAR_CSS, ProGearBack, ProGearDefs } from './MascotProGear';

// เลขากระรอก climbing out of its own ring (owner, 2026-10-26: "อยากให้น้องแบบมุดออกมาจากวงกลมแล้วก็เกาะอยู่"). The
// ring is the outfit's ring (MascotProGear) and stays where it is. The squirrel is the official drawing, unchanged,
// wearing only the headset: it rises until the line where its paws rest (y 64, as in MascotPeek) meets the ring's
// top (y 21). Whatever is still inside the ring's top half is hidden, so the body stays in the ring, and two paws in
// the MascotPeek style hold the rim. Drawn in the mascot's own 100 × 100 units, so it scales with `size`.

const PAW_Y = 64;
const RING = { cx: 50, cy: 56, r: 35 };
const LIFT = PAW_Y - (RING.cy - RING.r);
/** Before it climbs: low enough inside the ring that not even the ear tips show. */
const SUNK = 12;
const PAW_DX = 12;
const CLAW = '#7A4419';
const box: React.CSSProperties = { position: 'absolute', left: 0, top: 0, display: 'block', overflow: 'visible' };

type Props = {
  mood: MascotMood;
  /** The 100 × 100 artwork's size in px. */
  size: number;
  /** true: out of the ring, holding its rim. false: back down, then gone (onGone). */
  out: boolean;
  onGone?: () => void;
  style?: React.CSSProperties;
};

/** Where the top of the squirrel's ears is once it is out, in px from the top of the box (for the words above). */
export const climbEarTop = (size: number) => ((14 - LIFT) * size) / 100;

export function MascotClimb({ mood, size, out, onGone, style }: Props) {
  const reduce = useReducedMotion();
  const u = size / 100;
  const uid = `mcl${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cx = RING.cx * u, cy = RING.cy * u, r = RING.r * u;
  // Seen: everything above the ring's middle except the inside of its top half.
  const clip = `path('M${-size} ${-2 * size}H${2 * size}V${cy}H${cx + r}A${r} ${r} 0 0 0 ${cx - r} ${cy}H${-size}Z')`;
  const fur = mascotColors(mood).body;
  const rise = reduce ? { duration: 0 } : out ? { type: 'spring' as const, stiffness: 300, damping: 22, delay: 0.1 } : { duration: 0.26, ease: [0.4, 0, 0.7, 0.2] as const };
  return (
    <span className="mascot-climb" aria-hidden="true" style={{ position: 'absolute', display: 'block', width: size, height: size, lineHeight: 0, pointerEvents: 'none', ...style }}>
      {/* The ring grows from the button's size as the squirrel comes out, and shrinks back after it has gone down. */}
      <motion.svg viewBox="0 0 100 100" width={size} height={size} style={{ ...box, transformOrigin: '50% 56%' }}
        initial={reduce ? false : { opacity: 0, scale: 0.7 }} animate={out ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
        transition={reduce ? { duration: 0 } : { duration: out ? 0.28 : 0.22, delay: out ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => { if (!out) onGone?.(); }}>
        <style>{PRO_GEAR_CSS}</style>
        <ProGearDefs uid={uid} />
        <ProGearBack uid={uid} full />
      </motion.svg>
      <span style={{ ...box, width: size, height: size, clipPath: clip, WebkitClipPath: clip }}>
        <motion.span style={{ ...box, width: size, height: size }} initial={reduce ? false : { y: SUNK * u }} animate={{ y: (out ? -LIFT : SUNK) * u }} transition={rise}>
          <Mascot mood={mood} gear="pro-front" size={size} animated={out} />
        </motion.span>
      </span>
      <motion.svg viewBox="0 0 100 100" width={size} height={size} style={box}
        initial={reduce ? false : { opacity: 0, y: 3 * u }} animate={out ? { opacity: 1, y: 0 } : { opacity: 0, y: 3 * u }}
        transition={reduce ? { duration: 0 } : { duration: out ? 0.2 : 0.1, delay: out ? 0.3 : 0 }}>
        {[-PAW_DX, PAW_DX].map(dx => {
          const h = Math.sqrt(RING.r * RING.r - dx * dx);
          const angle = (Math.atan2(dx, h) * 180) / Math.PI;
          return (
            <g key={dx} transform={`translate(${RING.cx + dx} ${(RING.cy - h - 0.6).toFixed(2)}) rotate(${angle.toFixed(1)})`}>
              <ellipse rx="4.4" ry="3.4" fill={fur} />
              <path d="M-1.6 0.6v2.2M0 1v2.2M1.6 0.6v2.2" stroke={CLAW} strokeOpacity="0.45" strokeWidth="0.7" strokeLinecap="round" />
            </g>
          );
        })}
      </motion.svg>
    </span>
  );
}
