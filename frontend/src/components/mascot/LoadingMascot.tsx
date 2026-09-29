import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mascot, MascotMood } from './Mascot';

export type LoadingMascotState = 'appear' | 'loading-wait' | 'success' | 'idle';

interface LoadingMascotProps {
  state: LoadingMascotState;
  mood?: MascotMood;
  size?: number;
  className?: string;
}

/**
 * Motion wrapper around the official <Mascot/> -- never redraws or recolors it, only moves it.
 * Reusable across every loading/transition moment instead of each call site hand-rolling its own
 * timing.
 *
 * The loading state is a gentle float (matches the reference mockup's own loaderFloat keyframe --
 * translateY + a touch of scale, no body rotation). An earlier pass spun the mascot 360deg per
 * loop; that read as "a spinner wearing a mascot skin" rather than the squirrel actually waiting,
 * and the mockup's own motion notes explicitly rule out spinning the body. Reaction comes from the
 * mood (default 'waiting', which already carries its own clock accessory + calm expression) rather
 * than from rotating it.
 */
export function LoadingMascot({ state, mood = 'happy', size = 104, className = '' }: LoadingMascotProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    // Section 11: no motion loop under prefers-reduced-motion -- just a gentle fade/scale-in,
    // held steady while loading and settling on success.
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Mascot mood={state === 'success' ? 'celebrate' : mood} size={size} animated />
      </motion.div>
    );
  }

  if (state === 'loading-wait') {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{
          opacity: 1,
          y: [0, -5, 0],
          scale: [1, 1.02, 1],
        }}
        transition={{
          opacity: { duration: 0.2, ease: 'easeOut' },
          default: { duration: 2.2, ease: 'easeInOut', repeat: Infinity },
        }}
      >
        <Mascot mood={mood} size={size} animated />
      </motion.div>
    );
  }

  if (state === 'success') {
    return (
      <motion.div
        className={className}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 0.38, ease: 'easeOut' }}
      >
        <Mascot mood={mood} size={size} animated />
      </motion.div>
    );
  }

  // 'appear' / 'idle' -- simple entrance, no loop.
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Mascot mood={mood} size={size} animated />
    </motion.div>
  );
}
