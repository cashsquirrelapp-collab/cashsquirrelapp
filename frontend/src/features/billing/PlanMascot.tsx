import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mascot, type MascotAction, type MascotMood } from '../../components/mascot/Mascot';

/** Animate the official happy-palette character; never redraw or recolor it. Only its mood,
 * action and size change between plans. */
export function PlanMascot({ featured = false, label, mood = 'happy', action, size, stageClassName }: {
  featured?: boolean; label?: string; mood?: MascotMood; action?: MascotAction; size?: number; stageClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  return <div className={stageClassName ? `flex items-center justify-center ${stageClassName}` : 'plan-mascot-stage'}>
    <button type="button" aria-label={label ?? (featured ? 'ทักทายน้องกระรอก Pro' : 'ทักทายน้องกระรอก Free')}
      className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E65F2B]"
      onClick={() => { if (!reduceMotion) setPlaying(true); }}>
      <motion.span className="inline-flex" data-motion={reduceMotion ? 'reduced' : playing ? 'tap' : 'idle'}
        animate={reduceMotion ? { y: 0, rotate: 0 } : playing
          ? { y: [0, -12, 1, -4, 0], rotate: [0, -2.5, 2.2, -0.8, 0] }
          : { y: [0, featured ? -5 : -3, 0], rotate: [0, 0.5, 0] }}
        transition={reduceMotion ? { duration: 0 } : playing
          ? { duration: 0.72, ease: 'easeOut' }
          : { duration: featured ? 4.6 : 5.2, ease: 'easeInOut', repeat: Infinity }}
        onAnimationComplete={() => { if (playing) setPlaying(false); }}>
        <Mascot mood={mood} action={action ?? (featured ? 'hold-baht' : 'idle')} animated={!reduceMotion} size={size ?? (featured ? 176 : 152)} />
      </motion.span>
    </button>
  </div>;
}
