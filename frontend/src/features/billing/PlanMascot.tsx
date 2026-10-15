import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Mascot, type MascotAction, type MascotMood } from '../../components/mascot/Mascot';

// The official character; never redrawn or recoloured. Only its mood, action and size change
// between plans. Touch it and it reacts: rubbing it (a finger, or the cursor moving over it)
// makes it lean into the touch with its eyes closed and little hearts rising, like being petted;
// a tap squishes it with a happy hop and a burst of hearts.

type Heart = { id: number; x: number; drift: number };

const PET_IDLE_MS = 420; // no movement for this long ends the petting
const HEART_EVERY_MS = 320; // hearts while petting, at most this often
const MAX_HEARTS = 6;

export function PlanMascot({ featured = false, label, mood = 'happy', action, size, stageClassName }: {
  featured?: boolean; label?: string; mood?: MascotMood; action?: MascotAction; size?: number; stageClassName?: string;
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
    ...Array.from({ length: count }, (_, i) => ({ id: nextId.current++, x: around * 22 + (count > 1 ? (i - (count - 1) / 2) * 18 : 0), drift: (Math.random() - 0.5) * 16 })),
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
  const resolvedSize = size ?? (featured ? 176 : 152);
  return <div className={stageClassName ? `flex items-center justify-center ${stageClassName}` : 'plan-mascot-stage'}>
    <button type="button" aria-label={label ?? (featured ? 'ทักทายน้องกระรอก Pro' : 'ทักทายน้องกระรอก Free')}
      className="relative touch-pan-y select-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E65F2B]"
      data-reaction={reduceMotion ? 'reduced' : playing ? 'tap' : petting ? 'pet' : 'idle'}
      onClick={onTap} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerCancel={onPointerLeave}>
      {/* Leaning into the touch: a tilt towards where it is touched, and a little closer. */}
      <motion.span className="inline-flex origin-bottom"
        animate={reduceMotion ? { rotate: 0, x: 0 } : { rotate: petting ? lean * 9 : 0, x: petting ? lean * 4 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
        <motion.span className="inline-flex origin-bottom" data-motion={reduceMotion ? 'reduced' : playing ? 'tap' : 'idle'}
          animate={reduceMotion ? { y: 0, rotate: 0, scaleX: 1, scaleY: 1 } : playing
            ? { y: [0, 3, -14, 1, -4, 0], scaleX: [1, 1.08, 0.94, 1.03, 1, 1], scaleY: [1, 0.88, 1.06, 0.97, 1, 1], rotate: [0, 0, -2.5, 2, -0.8, 0] }
            : { y: [0, featured ? -5 : -3, 0], rotate: [0, 0.5, 0], scaleX: 1, scaleY: 1 }}
          transition={reduceMotion ? { duration: 0 } : playing
            ? { duration: 0.8, ease: 'easeOut' }
            : { duration: featured ? 4.6 : 5.2, ease: 'easeInOut', repeat: Infinity }}
          onAnimationComplete={() => { if (playing) setPlaying(false); }}>
          <Mascot mood={blissful ? 'blissful' : mood} action={action ?? (featured ? 'hold-baht' : 'idle')} animated={!reduceMotion} size={resolvedSize} />
        </motion.span>
      </motion.span>
      {/* Hearts rise from the head and fade; decoration only. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[24%] flex justify-center">
        <AnimatePresence>
          {hearts.map(heart => (
            <motion.svg key={heart.id} viewBox="0 0 24 24" width={16} height={16} className="absolute"
              initial={{ opacity: 0, x: heart.x, y: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 1, 0], x: heart.x + heart.drift, y: -30, scale: [0.5, 1.1, 1, 0.9] }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              onAnimationComplete={() => setHearts(current => current.filter(h => h.id !== heart.id))}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#F0786A" />
            </motion.svg>
          ))}
        </AnimatePresence>
      </span>
    </button>
  </div>;
}
