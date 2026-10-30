import React from 'react';
import { motion } from 'motion/react';
import { Mascot } from '../../../components/mascot/Mascot';
import { HoloScreen, type ScreenLine } from './HoloScreen';

// The centre of the Credit Radar: the squirrel (the app's own Mascot, headset on, paws typing; never redrawn — only its
// little keyboard and paper are left out) floating over a holographic stand, with a blue sci-fi screen hovering in front of
// it (owner, 2026-10-30: "จอด้านหน้าน้อง ... จอสีฟ้าๆ เหมือนในหนังแฟนตาซี", instead of the laptop and the hologram rising from
// it), radar rings, a turning scan line, orbiting lights, rising sparks and a pulse at the base. Everything that loops is
// CSS (transform and opacity only); it pauses with the tab and stops with reduced motion. (The status chips that sat on the
// radar were taken off, owner 2026-10-30: the tabs above say which status shows.)

const SPARKS = Array.from({ length: 14 }, (_, i) => ({ left: 32 + ((i * 37) % 36), delay: -(i * 0.83), duration: 6.5 + (i % 4) * 0.9 }));

export const HolographicSquirrel = React.forwardRef<HTMLDivElement, {
  size: number; reduce: boolean;
  /** The squirrel swipes (its wave) while the radar turns to the next page or status by itself. */
  swiping?: boolean;
  screen?: { lines: ScreenLine[]; counts: { overdue: number; soon: number; received: number }; rows?: number };
}>(
  function HolographicSquirrel({ size, reduce, screen, swiping = false }, hubRef) {
    const enter = (delay: number, from: Record<string, number | string> = {}) => (reduce ? {} : {
      initial: { opacity: 0, ...from }, animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' },
      transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
    });
    return (
      <div className={`crh${swiping ? ' is-swiping' : ''}`} style={{ width: size, height: size, ['--R' as string]: `${size}px` }}>
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
            <span className="crh-stand-front">{(size >= 420 || !screen) && <span className="crh-brand"><img className="crh-logo is-on-dark" src="/brand/logo01-v1/symbol-white.svg" alt="" width="14" height="14" /><img className="crh-logo is-on-light" src="/brand/logo01-v1/symbol-ci.svg" alt="" width="14" height="14" />Krarok</span>}</span>
          </motion.span>
          <span className="crh-beam" />
          <span className="crh-sparks">
            {SPARKS.map((spark, i) => <i key={i} style={{ left: `${spark.left}%`, animationDelay: `${spark.delay}s`, animationDuration: `${spark.duration}s` }} />)}
          </span>
          <div ref={hubRef} className="crh-hub">
            <motion.div className="crh-float" {...enter(0.45, { y: 24, scale: 0.94, filter: 'blur(8px)' })}>
              <div className="crh-mascot" aria-hidden="true">
                <Mascot mood="happy" action={swiping ? 'wave' : 'typing'} typingKit={false} glance gear="headset" animated={!reduce} size={Math.round(size * 0.5)} />
              </div>
            </motion.div>
          </div>
        </div>
        {screen && (
          // The blue screen in front of the squirrel, at its chest, the face above it, the typing paws faint behind it.
          <motion.div className={`crh-console${size < 420 ? ' is-small' : ''}`}
            {...(reduce ? {} : { initial: { opacity: 0, scaleY: 0.2, filter: 'blur(6px)' }, animate: { opacity: 1, scaleY: 1, filter: 'blur(0px)' }, transition: { duration: 0.7, delay: 0.95, ease: [0.22, 1, 0.36, 1] as const } })}>
            <div className="crh-console-float"><div className="crh-console-tilt"><HoloScreen lines={screen.lines} counts={screen.counts} rows={screen.rows} reduce={reduce} compact={size < 420} swiping={swiping} /></div></div>
          </motion.div>
        )}
      </div>
    );
  },
);
