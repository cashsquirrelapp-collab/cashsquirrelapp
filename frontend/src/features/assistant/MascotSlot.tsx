import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mascot } from '../../components/mascot/Mascot';
import { poseFor, type AssistantMode } from './assistantMock';

// The place where เลขากระรอก appears (brief §8). It shows the official mascot only -- the drawing is
// locked; a mode just picks one of its existing moods and actions. The props are the interface for
// later work (a floating squirrel that opens the chat, reactions, outfits, page context); none of that
// is built yet.
export type MascotSlotProps = {
  mode: AssistantMode;
  size: number;
  /** Later: tap the squirrel to open the chat. */
  onOpen?: () => void;
  label?: string;
  className?: string;
};

/** A small bulb beside the squirrel while it thinks (an accessory, the squirrel itself is unchanged). */
function Bulb() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 3.2a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1v.6h5v-.6c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3.2Z" fill="#FFD25E" stroke="#C17817" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.8 18.8h4.4M10.5 21h3" stroke="#8A5A0B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MascotSlot({ mode, size, onOpen, label, className = '' }: MascotSlotProps) {
  const reduce = useReducedMotion();
  const pose = poseFor(mode);
  const figure = (
    <span className={`asx-figure is-${mode} ${className}`}>
      <motion.span key={`${pose.mood}-${pose.action}`} className="asx-figure-pose" initial={reduce ? false : { opacity: 0.55, scale: 0.94, y: 3 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 26 }}>
        <Mascot gear="pro" mood={pose.mood} action={pose.action} size={size} />
      </motion.span>
      {mode === 'thinking' && <span className="asx-bulb"><Bulb /></span>}
    </span>
  );
  return onOpen ? <button type="button" className="asx-figure-btn" onClick={onOpen} aria-label={label}>{figure}</button> : figure;
}
