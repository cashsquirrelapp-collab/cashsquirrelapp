import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mascot } from '../../components/mascot/Mascot';
import { tr } from '../../i18n/tr';
import './assistant.css';

// The squirrel's arrival (owner, 2026-10-23). It plays only right after a payment for Pro is confirmed (App.tsx),
// never on ordinary visits. The owner first asked for a game feel, then turned that down: it should open like
// OpenAI's launch for dots, formal, a secretary or an accountant arriving to help ("ไม่ใช่เกม ... ต้องดูเหมือน
// นักบัญชี หรือเลขาที่พร้อมเข้ามาช่วย UI จะต้องทางการ").
//   arrive: the page goes behind frosted glass; a doorway of soft light rises from a horizon with a glowing
//           rim and soft orbs float around it. The squirrel in its Pro outfit appears in the light of the
//           doorway and walks out toward you on its own feet (owner: "เดินออกมาจากประตู แล้วก็กระโดด แล้วก็โบกมือ
//           ติ๊ง ๆ ๆ", then "ขามันเดินออกมา ... ตามรูปร่างของมนุษย์", not the whole body bouncing): Mascot action 'walk'.
//   jump:   a real jump (Mascot action 'jump'): crouch, push off, feet tucked, land.
//   ready:  it waves with little twinkles by its paw; the greeting types itself out, then one formal line.
//   open / fly: the glass opens from the squirrel outward and it flies to its corner (AssistantBuddy).
// The drawing is always the official Mascot with the Pro outfit (MascotProGear).
// Skippable at any moment (ข้าม, Escape, or a tap once it is ready); still with reduced motion.

type Phase = 'arrive' | 'jump' | 'ready' | 'open' | 'fly';

type Props = {
  /** The person's name for the greeting, when known. */
  name?: string;
  /** Where the squirrel lands: the corner squirrel's button. */
  target: () => DOMRect | null;
  onDone: () => void;
};

// Six steps out of the doorway (1.2–2.85 s), a jump (0.65 s), then the wave and the greeting.
const TIMES = { walk: 1.2, walkFor: 1.65, jump: 2850, ready: 3500, type: 3700, open: 6600, fly: 7100, safety: 9100 };
const TWINKLE = 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z';

/** Thai letters carry vowel and tone marks; splitting by grapheme keeps each letter whole while it types. */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as any).Segmenter;
  if (typeof Segmenter === 'function') return Array.from(new Segmenter('th', { granularity: 'grapheme' }).segment(text), (part: any) => part.segment as string);
  return Array.from(text);
}

function useTyping(text: string, running: boolean, instant: boolean) {
  const letters = React.useMemo(() => graphemes(text), [text]);
  const [count, setCount] = React.useState(instant ? letters.length : 0);
  React.useEffect(() => {
    if (instant) { setCount(letters.length); return; }
    if (!running) return;
    const step = Math.max(34, Math.min(70, 1100 / Math.max(letters.length, 1)));
    let shown = 0;
    const timer = window.setInterval(() => {
      shown += 1;
      setCount(shown);
      if (shown >= letters.length) window.clearInterval(timer);
    }, step);
    return () => window.clearInterval(timer);
  }, [letters, running, instant]);
  return { typed: letters.slice(0, count).join(''), rest: letters.slice(count).join(''), done: count >= letters.length };
}

export default function AssistantBirth({ name, target, onDone }: Props) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = React.useState<Phase>(reduce ? 'ready' : 'arrive');
  const [typing, setTyping] = React.useState(false);
  const [flight, setFlight] = React.useState<{ x: number; y: number; scale: number } | null>(null);
  const figureRef = React.useRef<HTMLDivElement>(null);
  const done = React.useRef(false);
  const skipRef = React.useRef<HTMLButtonElement>(null);

  const finish = React.useCallback(() => { if (done.current) return; done.current = true; onDone(); }, [onDone]);
  const fly = React.useCallback(() => {
    if (done.current) return;
    if (reduce) { finish(); return; }
    const from = figureRef.current?.getBoundingClientRect();
    const to = target();
    setPhase('fly');
    if (!from || !to) { window.setTimeout(finish, 450); return; }
    setFlight({ x: to.left + to.width / 2 - (from.left + from.width / 2), y: to.top + to.height / 2 - (from.top + from.height / 2), scale: Math.max(0.2, Math.min(to.width, to.height) / from.width) });
  }, [finish, reduce, target]);

  React.useEffect(() => {
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    document.addEventListener('keydown', onKey);
    const timers = reduce
      ? [window.setTimeout(finish, 3200)]
      : [
        window.setTimeout(() => setPhase('jump'), TIMES.jump),
        window.setTimeout(() => setPhase('ready'), TIMES.ready),
        window.setTimeout(() => setTyping(true), TIMES.type),
        window.setTimeout(() => setPhase('open'), TIMES.open),
        window.setTimeout(fly, TIMES.fly),
        window.setTimeout(finish, TIMES.safety), // a safety net if the flight never reports back
      ];
    return () => { document.removeEventListener('keydown', onKey); timers.forEach(timer => window.clearTimeout(timer)); };
  }, [finish, fly, reduce]);

  const ready = phase === 'ready' || phase === 'open' || phase === 'fly';
  const greeting = name ? tr("สวัสดีครับ คุณ{0}", name) : tr("สวัสดีครับ");
  const line = useTyping(greeting, typing, !!reduce);
  const showWords = phase === 'ready' || (reduce && phase !== 'fly');

  return (
    <div className={`kb-stage is-${phase}${reduce ? ' is-calm' : ''}`} role="dialog" aria-modal="true" aria-label={tr("เลขากระรอกพร้อมช่วยงานคุณแล้ว")}
      onClick={() => { if ((ready || phase === 'jump') && phase !== 'fly') { if (reduce) finish(); else fly(); } }}>
      <div className="kb-veil" aria-hidden="true" />
      <div className="kb-center">
        <div className="kb-scene">
          <div className="kb-orbs" aria-hidden="true"><i className="is-1" /><i className="is-2" /><i className="is-3" /><i className="is-4" /></div>
          <div className="kb-door" aria-hidden="true" />
          <div className="kb-rise">
            <motion.div ref={figureRef} className="kb-figure" aria-hidden="true"
              initial={false}
              animate={flight ? { x: flight.x, y: flight.y, scale: flight.scale } : { x: 0, y: 0, scale: 1 }}
              transition={flight ? { type: 'spring', stiffness: 120, damping: 18, mass: 0.9 } : { duration: 0 }}
              onAnimationComplete={() => { if (flight) finish(); }}>
              {/* Out of the light of the doorway: small and bright far inside, its own size and colours at the front. */}
              <motion.div className="kb-walk"
                initial={reduce ? false : { opacity: 0, scale: 0.6, y: -12, filter: 'brightness(2.4) blur(3px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'brightness(1) blur(0px)' }}
                transition={{ delay: TIMES.walk, duration: TIMES.walkFor, ease: [0.3, 0, 0.3, 1], opacity: { delay: TIMES.walk, duration: 0.4 }, filter: { delay: TIMES.walk, duration: 0.8 } }}>
                <Mascot gear="pro" mood="wave" action={reduce ? 'wave' : phase === 'arrive' ? 'walk' : phase === 'jump' ? 'jump' : ready && phase !== 'fly' ? 'wave' : 'idle'} size={168} />
              </motion.div>
              {/* ติ๊ง ๆ ๆ: little twinkles by the waving paw. */}
              {!reduce && <span className="kb-tings">{[1, 2, 3].map(n => <svg key={n} className={`is-${n}`} viewBox="0 0 24 24"><path d={TWINKLE} /></svg>)}</span>}
            </motion.div>
          </div>
          <svg className="kb-hill" viewBox="0 0 560 76" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="kb-rim" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#A9C8FF" stopOpacity="0" /><stop offset="0.22" stopColor="#A9C8FF" /><stop offset="0.45" stopColor="#FFC8A8" />
                <stop offset="0.62" stopColor="#FFB3CF" /><stop offset="0.8" stopColor="#B9F0D2" /><stop offset="1" stopColor="#B9F0D2" stopOpacity="0" />
              </linearGradient>
              <filter id="kb-rim-blur" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="5" /></filter>
            </defs>
            <path className="kb-hill-land" d="M0 76 L0 44 C140 18 420 18 560 44 L560 76 Z" />
            <path className="kb-hill-rim is-glow" d="M0 44 C140 18 420 18 560 44" pathLength={100} filter="url(#kb-rim-blur)" />
            <path className="kb-hill-rim" d="M0 44 C140 18 420 18 560 44" pathLength={100} />
          </svg>
        </div>
        <motion.div className="kb-hello" aria-live="polite"
          initial={false}
          // The words leave before the glass opens, so they never sit over the page.
          animate={showWords ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: ready ? -8 : 0, filter: ready ? 'blur(6px)' : 'blur(0px)' }}
          transition={{ duration: showWords ? 0.3 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
          <h2>
            <span className="asx-sr">{greeting}</span>
            <span aria-hidden="true">{line.typed}<span className={`kb-caret${line.done ? ' is-done' : ''}`} /><span className="kb-untyped">{line.rest}</span></span>
          </h2>
          <motion.p initial={false} animate={line.done && showWords ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            {tr("เลขากระรอกพร้อมช่วยดูแลงาน เอกสาร และการเงินของคุณแล้ว")}
          </motion.p>
        </motion.div>
      </div>
      <button ref={skipRef} type="button" className="kb-skip lg-glass" onClick={event => { event.stopPropagation(); finish(); }}>{tr("ข้าม")}</button>
    </div>
  );
}
