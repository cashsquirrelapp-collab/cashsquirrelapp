import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Clock3, Hourglass } from 'lucide-react';
import { tr } from '../../../i18n/tr';
import { HoloScreen, type ScreenLine } from './HoloScreen';

// The centre of the Credit Radar: the working squirrel (the real picture, headset and laptop; never redrawn or recoloured,
// only lit) floating over a holographic stand, typing its report onto a hologram screen that rises from the laptop (owner,
// 2026-10-30), with radar rings, a turning scan line, orbiting lights, rising sparks and a pulse at the base. Everything
// that loops is CSS (transform and opacity only), so React never redraws it; it pauses with the tab and stops with reduced
// motion. Status chips sit on the radar: two on the left, two on the right below the screen.

export interface RadarChip { key: 'overdue' | 'soon' | 'received' | 'later'; count: number; label: string }

const ICONS = { overdue: AlertTriangle, soon: Clock3, received: CheckCircle2, later: Hourglass } as const;
const SPARKS = Array.from({ length: 14 }, (_, i) => ({ left: 32 + ((i * 37) % 36), delay: -(i * 0.83), duration: 6.5 + (i % 4) * 0.9 }));

export const HolographicSquirrel = React.forwardRef<HTMLDivElement, {
  size: number; chips: RadarChip[]; showChips: boolean; reduce: boolean;
  screen?: { lines: ScreenLine[]; counts: { overdue: number; soon: number; received: number } };
}>(
  function HolographicSquirrel({ size, chips, showChips, reduce, screen }, hubRef) {
    const enter = (delay: number, from: Record<string, number | string> = {}) => (reduce ? {} : {
      initial: { opacity: 0, ...from }, animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' },
      transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
    });
    return (
      <div className="crh" style={{ width: size, height: size, ['--R' as string]: `${size}px` }}>
        <div className="crh-layer crh-depth-far">
          <span className="crh-glow" />
          <motion.span className="crh-disc" {...enter(0.15, { scale: 0.86 })}>
            <span className="crh-sweep" />
          </motion.span>
        </div>
        <div className="crh-layer crh-depth-mid">
          <motion.span className="crh-floor-wrap" {...enter(0.25, { scale: 0.8 })}>
            <span className="crh-floor">
              <span className="crh-floor-pulse" />
              <span className="crh-floor-pulse is-late" />
            </span>
          </motion.span>
          {[0, 1, 2].map(ring => (
            <span key={ring} className={`crh-orbit is-${ring}`}><span className="crh-orbit-spin"><i /><i /></span></span>
          ))}
        </div>
        <div className="crh-layer crh-depth-near">
          <motion.span className="crh-stand" {...enter(0.35, { y: 16 })}>
            <span className="crh-stand-top" />
            <span className="crh-stand-core" />
            <span className="crh-stand-front"><img className="crh-logo is-on-dark" src="/brand/logo01-v1/symbol-white.svg" alt="" width="14" height="14" /><img className="crh-logo is-on-light" src="/brand/logo01-v1/symbol-ci.svg" alt="" width="14" height="14" />Krarok</span>
          </motion.span>
          <span className="crh-beam" />
          <span className="crh-sparks">
            {SPARKS.map((spark, i) => <i key={i} style={{ left: `${spark.left}%`, animationDelay: `${spark.delay}s`, animationDuration: `${spark.duration}s` }} />)}
          </span>
          <div ref={hubRef} className="crh-hub">
            <motion.div className="crh-float" {...enter(0.45, { y: 24, scale: 0.94, filter: 'blur(8px)' })}>
              <img src="/line/mascot-v6-working.png" alt="" aria-hidden="true" className="crh-mascot" draggable={false} />
            </motion.div>
          </div>
        </div>
        {screen && (
          <>
            {/* The light from the laptop up to the screen. */}
            <motion.svg className="crh-projection" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
              {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.6, delay: 0.95 } })}>
              <defs>
                <linearGradient id="crh-projection-fill" x1="0.1" y1="1" x2="0.6" y2="0">
                  <stop offset="0%" stopColor="#FFB070" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#FFB070" stopOpacity="0.06" />
                </linearGradient>
              </defs>
              <polygon points="48.5,67 52.5,67 95,43 58,43" fill="url(#crh-projection-fill)" />
              <line x1="48.5" y1="67" x2="58" y2="43" className="crh-projection-edge" />
              <line x1="52.5" y1="67" x2="95" y2="43" className="crh-projection-edge" />
            </motion.svg>
            <motion.div className="crh-screen"
              {...(reduce ? {} : { initial: { opacity: 0, scale: 0.6, y: 30, filter: 'blur(6px)' }, animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.7, delay: 1.0, ease: [0.22, 1, 0.36, 1] as const } })}>
              <div className="crh-screen-float"><div className="crh-screen-tilt"><HoloScreen lines={screen.lines} counts={screen.counts} reduce={reduce} /></div></div>
            </motion.div>
          </>
        )}
        {showChips && chips.map((chip, n) => {
          const Icon = ICONS[chip.key];
          return (
            <motion.div key={chip.key} className={`crh-chip is-${chip.key} at-${n}`} {...enter(0.9 + n * 0.08, { scale: 0.7 })}
              aria-label={tr("{0} {1} รายการ", chip.label, chip.count)}>
              <Icon className="crh-chip-icon" strokeWidth={2} aria-hidden="true" />
              <span className="crh-chip-count">{tr("{0} รายการ", chip.count)}</span>
              <span className="crh-chip-label">{chip.label}</span>
            </motion.div>
          );
        })}
      </div>
    );
  },
);
