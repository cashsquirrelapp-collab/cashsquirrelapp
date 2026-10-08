import { motion, useReducedMotion } from 'motion/react';
import { Mascot } from './Mascot';

/**
 * Loading state for document pages: the official mascot (never redrawn) keying in a document.
 * The paws, keys and document lines animate inside <Mascot action="typing" />; this wrapper adds
 * the body's small bob in time with the typing and a slow lean, so it reads as working, not floating.
 */
export function DocumentLoader({ title = 'กำลังโหลดเอกสาร…', detail = 'กำลังเตรียมเอกสารของคุณ กรุณารอสักครู่' }: { title?: string; detail?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center px-6 py-14 text-center">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { rotate: [-1.5, 1.5, -1.5] }}
          transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
          style={{ transformOrigin: '50% 90%' }}
        >
          <motion.div
            animate={reduceMotion ? undefined : { y: [0, -1.5, 0] }}
            transition={{ duration: 0.84, ease: 'easeInOut', repeat: Infinity }}
          >
            <Mascot mood="waiting" action="typing" size={150} />
          </motion.div>
        </motion.div>
      </motion.div>
      <p className="mt-2 text-[15px] font-semibold text-brand-text">{title}</p>
      <p className="mt-1 text-[13px] text-brand-muted">{detail}</p>
      <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-brand-faint" aria-hidden>
        <motion.span
          className="block h-full w-1/3 rounded-full bg-[#E65F2B]"
          animate={reduceMotion ? undefined : { x: ['-100%', '300%'] }}
          transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
        />
      </div>
    </div>
  );
}
