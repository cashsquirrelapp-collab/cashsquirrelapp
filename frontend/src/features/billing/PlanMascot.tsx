import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Mascot, type MascotAction, type MascotMood } from '../../components/mascot/Mascot';

// The official character on the Pro card; never redrawn or recoloured. Only its mood, action and size
// change. It comes in with a soft fade and scale, then stays still (owner, 2026-10-20: no bounce and
// nothing looping). Touch it and it reacts: rubbing it (a finger, or the cursor moving over it) makes
// it lean into the touch with its eyes closed and little hearts rising, like being petted; a tap
// gives a small squeeze and a few hearts.

type Heart = { id: number; x: number; drift: number };

const PET_IDLE_MS = 420; // no movement for this long ends the petting
const HEART_EVERY_MS = 320; // hearts while petting, at most this often
const MAX_HEARTS = 6;

export function PlanMascot({ label, mood = 'happy', action = 'hold-baht', size = 136, className = '', figureClassName = '' }: {
  label: string; mood?: MascotMood; action?: MascotAction; size?: number; className?: string;
  /** On the character only (not the hearts), e.g. to size it by screen width in CSS. */
  figureClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [petting, setPetting] = useState(false);
  const [lean, setLean] = useState(0); // -1 (touched on the left) .. 1 (on the right)
  const [hearts, setHearts] = useState<Heart[]>([]);
  const petTimer = useRef<number | undefined>(undefined);
  const lastHeart = useRef(0);
  const nextId = useRef(0);
  useEffect(() => () => window.clearTimeout(petTimer.current), []);

  const addHearts = (count: number, around = 0) => setHearts(current => [
    ...current,
    ...Array.from({ length: count }, (_, i) => ({ id: nextId.current++, x: around * 18 + (count > 1 ? (i - (count - 1) / 2) * 12 : 0), drift: (Math.random() - 0.5) * 10 })),
  ].slice(-MAX_HEARTS));

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (reduceMotion) return;
    const box = event.currentTarget.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
    setLean(dx);
    setPetting(true);
    window.clearTimeout(petTimer.current);
    petTimer.current = window.setTimeout(() => { setPetting(false); setLean(0); }, PET_IDLE_MS);
    const now = Date.now();
    if (now - lastHeart.current > HEART_EVERY_MS) { lastHeart.current = now; addHearts(1, dx); }
  };
  const onPointerLeave = () => { window.clearTimeout(petTimer.current); setPetting(false); setLean(0); };
  const onTap = () => {
    if (reduceMotion) return;
    setPlaying(true);
    addHearts(3);
  };

  const blissful = petting || playing;
  return (
    <motion.div className={`flex items-center justify-center ${className}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}>
      <button type="button" aria-label={label}
        className="relative touch-pan-y select-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E65F2B]"
        data-reaction={reduceMotion ? 'reduced' : playing ? 'tap' : petting ? 'pet' : 'idle'}
        onClick={onTap} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerCancel={onPointerLeave}>
        {/* Leaning into the touch: a tilt towards where it is touched, and a little closer. */}
        <motion.span className="inline-flex origin-bottom"
          animate={reduceMotion ? { rotate: 0, x: 0 } : { rotate: petting ? lean * 7 : 0, x: petting ? lean * 3 : 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}>
          {/* A tap: one small squeeze, no hop. */}
          <motion.span className="inline-flex origin-bottom" data-motion={reduceMotion ? 'reduced' : playing ? 'tap' : 'idle'}
            animate={reduceMotion || !playing ? { scaleX: 1, scaleY: 1 } : { scaleX: [1, 1.05, 1], scaleY: [1, 0.94, 1] }}
            transition={reduceMotion || !playing ? { duration: 0 } : { duration: 0.42, ease: 'easeOut' }}
            onAnimationComplete={() => { if (playing) setPlaying(false); }}>
            <Mascot mood={blissful ? 'blissful' : mood} action={action} animated={false} size={size} className={figureClassName} />
          </motion.span>
        </motion.span>
        {/* Small hearts rise from the head and fade (owner, 2026-10-20: keep them small); decoration only. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[24%] flex justify-center">
          <AnimatePresence>
            {hearts.map(heart => (
              <motion.svg key={heart.id} viewBox="0 0 24 24" width={9} height={9} className="absolute"
                initial={{ opacity: 0, x: heart.x, y: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 1, 0], x: heart.x + heart.drift, y: -24, scale: [0.6, 1, 1, 0.9] }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
                onAnimationComplete={() => setHearts(current => current.filter(h => h.id !== heart.id))}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#F0786A" />
              </motion.svg>
            ))}
          </AnimatePresence>
        </span>
      </button>
    </motion.div>
  );
}
