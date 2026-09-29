import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mascot, MascotMood } from './Mascot';

export type LoadingMascotState = 'appear' | 'loading-spin' | 'success' | 'idle';

interface LoadingMascotProps {
  state: LoadingMascotState;
  mood?: MascotMood;
  size?: number;
  className?: string;
}

const SPIN_EASE = [0.45, 0, 0.2, 1] as const;

/**
 * Motion wrapper around the official <Mascot/> -- never redraws or recolors it, only moves it.
 * Reusable across every loading/transition moment instead of each call site hand-rolling its own
 * spin/bounce timing.
 */
export function LoadingMascot({ state, mood = 'happy', size = 104, className = '' }: LoadingMascotProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    // Section 11: no 360deg spin under prefers-reduced-motion -- just a gentle fade/scale-in,
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

  if (state === 'loading-spin') {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{
          opacity: 1,
          rotate: [0, 120, 280, 360, 360, 360],
          scale: [0.92, 0.96, 1.04, 1, 1.03, 1],
          y: [0, 0, 0, 0, -4, 0],
        }}
        transition={{
          opacity: { duration: 0.2, ease: 'easeOut' },
          default: {
            duration: 1.25,
            times: [0, 0.27, 0.54, 0.77, 0.92, 1],
            ease: [SPIN_EASE, SPIN_EASE, SPIN_EASE, 'easeOut', 'easeOut'],
            repeat: Infinity,
            repeatDelay: 0.14,
          },
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
        initial={{ rotate: 0, scale: 1 }}
        animate={{ rotate: 360, scale: [1, 1.06, 1] }}
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
