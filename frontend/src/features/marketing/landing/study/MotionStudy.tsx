import React from 'react';
import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Fade, Layer, Pinned, centred, easeInOut, mix, ramp, useDerived, type Keys, type Pose, type Size } from '../story/stage';

// Development-only study of the reference clip's signature motions (docs/landing-draft2/
// reference-breakdown.md). It is reachable at /motion-study under `npm run dev` and is not part of
// the production build. Everything on it is a PROXY: plain labelled boxes standing in for the
// reference's pictures. None of it is product imagery and none of it is used on the landing page.
// The colours are the reference's own (cream, lime, charcoal) so the study can be compared with
// the clip; they are not brand colours.

const CREAM = [250, 246, 238], LIME = [221, 245, 122], INK = '#2B2B2B';
const proxy = 'flex items-center justify-center text-center font-mono text-[11px] font-semibold uppercase tracking-[0.14em]';

/** 1 and 3: objects around a headline travel into a frame rising from the bottom edge, while the page colour changes with them. */
function Handoff({ p, size: { w: W, h: H } }: { p: MotionValue<number>; size: Size }) {
  const device = { w: 300, h: 600 };
  const s = Math.min(1, (H * 0.74) / device.h);
  const rest = centred(W * 0.62, H * 0.54, s, device.w, device.h);
  const frame: Keys = [[0, { ...rest, x: (W - device.w * s) / 2, y: H * 0.86 }], [0.4, centred(W / 2, H * 0.54, s, device.w, device.h)], [0.55, centred(W / 2, H * 0.54, s, device.w, device.h)], [0.8, rest], [1, rest]];
  const spots: [number, number, number][] = [[0.2, 0.3, -8], [0.8, 0.26, 6], [0.14, 0.62, 5], [0.86, 0.6, -6], [0.3, 0.8, 9], [0.7, 0.82, -4]];
  const chip = 72;
  const chips = spots.map(([cx, cy, r], i) => {
    const centre = centred(W / 2, H * 0.54, s, device.w, device.h);
    const seat: Pose = { x: centre.x + (36 + (i % 2) * 124) * s, y: centre.y + (120 + Math.floor(i / 2) * 124) * s, s: s * 1.1, o: 1, r: 0 };
    const moved: Pose = { ...seat, x: seat.x + rest.x - centre.x };
    return [[i * 0.02, centred(W * cx, H * cy, 1, chip, chip, 1, r)], [0.4, seat], [0.55, seat], [0.8, moved], [1, moved]] as Keys;
  });
  const background = useDerived(p, v => { const t = easeInOut(ramp(v, 0.12, 0.42)); return `rgb(${CREAM.map((c, i) => Math.round(mix(c, LIME[i], t))).join(' ')})`; });
  return (
    <>
      <motion.div className="absolute inset-0" style={{ background }} />
      <Fade p={p} show={v => 1 - ramp(v, 0.04, 0.2)} shift={-40} className="absolute inset-x-0 top-[30%] text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-[#6B6B6B]">Scene A → B · object handoff + coordinated background</p>
        <p className="mt-3 text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.05] text-[#1E1E1E]">Proxy headline<br />stays readable at once</p>
      </Fade>
      <Layer p={p} keys={frame} w={device.w} h={device.h} radius={44} z={2} className={`${proxy} border-[6px] border-[#1E1E1E] bg-white text-[#9A9A9A]`}><span className="mt-[-380px]">Proxy device</span></Layer>
      {chips.map((keys, i) => <Layer key={i} p={p} keys={keys} w={chip} h={chip} radius={20} z={3} shadow="0 14px 30px -12px rgba(0,0,0,0.3)" className={`${proxy} bg-[#1E1E1E] text-white`}>Proxy</Layer>)}
      <Fade p={p} show={v => ramp(v, 0.62, 0.8)} shift={30} axis="x" className="absolute left-[8%] top-[42%] max-w-[30%]">
        <p className="text-[clamp(1.6rem,3.2vw,2.75rem)] font-semibold leading-[1.1] text-[#1E1E1E]">Proxy copy enters beside the same object</p>
      </Fade>
    </>
  );
}

const SLIDES = ['#C9B8F5', '#F2C9A0', '#A9D6C2'];
/** 2: the outgoing picture's visible area folds to a strip while the next unfolds; copy changes side. */
function Folds({ p, size: { w: W, h: H } }: { p: MotionValue<number>; size: Size }) {
  const n = SLIDES.length, half = 0.06;
  const pw = Math.min(W * 0.44, 620), ph = Math.min(H * 0.7, 560);
  return (
    <>
      <div className="absolute inset-0 bg-[#FAF6EE]" />
      <p className="absolute inset-x-0 top-24 text-center font-mono text-[12px] uppercase tracking-[0.2em] text-[#6B6B6B]">Scene F · collapse to a strip, unfold the next, swap sides (clip-path, the box inside never scales)</p>
      {SLIDES.map((colour, i) => <Fold key={colour} p={p} i={i} n={n} half={half} colour={colour} rect={{ x: i % 2 === 0 ? W * 0.94 - pw : W * 0.06, y: (H - ph) / 2 + 20, w: pw, h: ph }} textX={i % 2 === 0 ? W * 0.08 : W * 0.06 + pw + W * 0.06} />)}
    </>
  );
}
function Fold({ p, i, n, half, colour, rect, textX }: { p: MotionValue<number>; i: number; n: number; half: number; colour: string; rect: { x: number; y: number; w: number; h: number }; textX: number }) {
  const start = i / n, end = (i + 1) / n;
  const state = (v: number) => {
    const entering = i > 0 && v < (start + end) / 2;
    const open = Math.min(i === 0 ? 1 : easeInOut(ramp(v, start - half * 0.4, start + half)), i === n - 1 ? 1 : 1 - easeInOut(ramp(v, end - half, end + half * 0.4)));
    return { open, right: (entering ? i : i + 1) % 2 === 1 };
  };
  const clipPath = useDerived(p, v => { const { open, right } = state(v); const cut = (1 - open) * 100; return `inset(0% ${right ? 0 : cut}% 0% ${right ? cut : 0}% round 32px)`; });
  return (
    <>
      <motion.div className={`${proxy} absolute text-[#1E1E1E]`} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, background: `linear-gradient(135deg, ${colour}, #ffffff)`, clipPath }}>
        {/* The grid shows the box is clipped, not squeezed: the squares stay square through the fold. */}
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(#1E1E1E 1px, transparent 1px), linear-gradient(90deg, #1E1E1E 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <span className="relative rounded bg-white/80 px-3 py-1">Proxy image {i + 1}</span>
      </motion.div>
      <Fade p={p} show={v => Math.min(i === 0 ? 1 : ramp(v, start + half * 0.4, start + half * 1.4), i === n - 1 ? 1 : 1 - ramp(v, end - half * 1.2, end - half * 0.3))} shift={20}
        className="absolute top-[42%]" style={{ left: textX, width: '26%' }}>
        <p className="text-[clamp(1.5rem,2.8vw,2.5rem)] font-semibold leading-[1.15] text-[#1E1E1E]">Proxy feature {i + 1}</p>
        <p className="mt-3 text-[16px] leading-relaxed text-[#5A5A5A]">Copy for this slide sits opposite its picture and changes side with it.</p>
      </Fade>
    </>
  );
}

/** Extra: a card arrives as an empty shell, then its content fills in. */
function Shell({ index }: { index: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 95%', 'start 45%'] });
  const shell = useTransform(scrollYProgress, [0, 0.5], [0, 1]);
  const y = useTransform(scrollYProgress, [0, 0.5], [50, 0]);
  const fill = useTransform(scrollYProgress, [0.45, 1], [0, 1]);
  const rise = useTransform(scrollYProgress, [0.45, 1], [18, 0]);
  return (
    <motion.div ref={ref} className="h-64 rounded-[28px] bg-white p-6" style={{ opacity: shell, y }}>
      <motion.div className="h-full" style={{ opacity: fill, y: rise }}>
        <p className="text-[18px] font-semibold text-[#1E1E1E]">Proxy card {index + 1}</p>
        <div className={`${proxy} mt-4 h-[70%] rounded-2xl bg-[#EFEFEF] text-[#9A9A9A]`}>Proxy content</div>
      </motion.div>
    </motion.div>
  );
}

/** Extra: one thick stroke draws itself behind the closing words, then stays. */
function Closing() {
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end end'] });
  const pathLength = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  return (
    <section ref={ref} className="relative flex min-h-screen items-center justify-center overflow-hidden" style={{ background: INK }}>
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="none" fill="none">
        <motion.path d="M -80 250 C 120 250 150 520 330 620 C 560 748 880 742 1090 628 C 1270 530 1290 300 1520 240" stroke="#DDF57A" strokeWidth={60} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ pathLength }} />
      </svg>
      <div className="relative text-center text-white">
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-[#BDBDBD]">Scene G · the line draws once and rests</p>
        <p className="mt-4 text-[clamp(2rem,5vw,4rem)] font-semibold">Proxy closing line</p>
      </div>
    </section>
  );
}

export default function MotionStudy() {
  return (
    <div className="bg-[#FAF6EE] text-[#1E1E1E]" style={{ fontFamily: "'IBM Plex Sans', var(--font-sans)" }}>
      <p className="fixed inset-x-0 top-0 z-50 bg-[#1E1E1E] px-4 py-2 text-center font-mono text-[12px] text-white">
        MOTION STUDY · development only · proxy boxes, not product images · reference colours, not brand colours
      </p>
      <Pinned screens={4} label="Study: object handoff and coordinated background">{(p, size) => <Handoff p={p} size={size} />}</Pinned>
      <Pinned screens={4} label="Study: collapse and unfold">{(p, size) => <Folds p={p} size={size} />}</Pinned>
      <section className="px-6 py-32" style={{ background: INK }}>
        <p className="text-center font-mono text-[12px] uppercase tracking-[0.2em] text-[#BDBDBD]">Scene C · shells first, content after</p>
        <div className="mx-auto mt-10 grid max-w-[1100px] grid-cols-1 gap-5 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <Shell key={i} index={i} />)}</div>
      </section>
      <Closing />
    </div>
  );
}
