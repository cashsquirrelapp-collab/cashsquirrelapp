import React from 'react';
import { motion, motionValue, useMotionValue, useScroll, useSpring, type MotionValue } from 'motion/react';
import { SHOTS, type ShotName } from './shots.gen';
import type { View } from './content';

// The scroll engine behind the landing story. A tall section holds a stage that sticks to the
// viewport; how far the page has scrolled through the section is the only clock. Each picture on
// the stage has a list of poses along that clock, so scrolling back plays the same story in
// reverse. Native scrolling is never intercepted.

export type Size = { w: number; h: number };
/** Where a picture is: top-left corner on the stage, scale, opacity, rotation in degrees. */
export type Pose = { x: number; y: number; s: number; o: number; r?: number };
export type Keys = readonly (readonly [at: number, pose: Pose])[];

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b, a straight ramp between. */
export const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a || 1));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Rises over [a, b], holds, falls over [c, d]. */
export const window4 = (v: number, a: number, b: number, c: number, d: number) => Math.min(ramp(v, a, b), 1 - ramp(v, c, d));

export function poseAt(keys: Keys, v: number): Pose {
  if (v <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [at, to] = keys[i];
    if (v > at) continue;
    const [from, a] = keys[i - 1];
    const t = easeInOut((v - from) / (at - from || 1));
    return { x: mix(a.x, to.x, t), y: mix(a.y, to.y, t), s: mix(a.s, to.s, t), o: mix(a.o, to.o, t), r: mix(a.r ?? 0, to.r ?? 0, t) };
  }
  return keys[keys.length - 1][1];
}

/** A pose that puts a w-by-h picture's centre at (cx, cy). */
export const centred = (cx: number, cy: number, s: number, w: number, h: number, o = 1, r = 0): Pose => ({ x: cx - (w * s) / 2, y: cy - (h * s) / 2, s, o, r });

export function useSize<T extends HTMLElement>(): [(node: T | null) => void, Size] {
  const [node, setNode] = React.useState<T | null>(null);
  const [size, setSize] = React.useState<Size>(() => (typeof window === 'undefined' ? { w: 1280, h: 800 } : { w: window.innerWidth, h: window.innerHeight }));
  React.useLayoutEffect(() => {
    if (!node) return;
    const read = () => setSize(prev => (prev.w === node.clientWidth && prev.h === node.clientHeight ? prev : { w: node.clientWidth, h: node.clientHeight }));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, size];
}

/** A value recomputed from the scroll clock. Re-reads `fn` on every render, so a resize takes effect at once. */
export function useDerived<T>(p: MotionValue<number>, fn: (v: number) => T): MotionValue<T> {
  const latest = React.useRef(fn);
  latest.current = fn;
  const out = useMotionValue(fn(p.get()));
  React.useLayoutEffect(() => { out.set(latest.current(p.get())); });
  React.useEffect(() => p.on('change', v => out.set(latest.current(v))), [p, out]);
  return out;
}

function usePose(p: MotionValue<number>, keys: Keys) {
  const latest = React.useRef(keys);
  latest.current = keys;
  const mv = React.useMemo(() => ({ x: motionValue(0), y: motionValue(0), scale: motionValue(1), opacity: motionValue(1), rotate: motionValue(0), visibility: motionValue<'visible' | 'hidden'>('visible') }), []);
  const apply = React.useCallback((v: number) => {
    const q = poseAt(latest.current, v);
    mv.x.set(q.x); mv.y.set(q.y); mv.scale.set(q.s); mv.opacity.set(q.o); mv.rotate.set(q.r ?? 0);
    mv.visibility.set(q.o < 0.004 ? 'hidden' : 'visible');
  }, [mv]);
  React.useLayoutEffect(() => { apply(p.get()); });
  React.useEffect(() => p.on('change', apply), [p, apply]);
  return mv;
}

/** Something on the stage that follows its poses. Its box is the picture's natural size; only transforms move it. */
export function Layer({ p, keys, w, h, radius = 0, shadow, z = 1, className = '', children }: {
  p: MotionValue<number>; keys: Keys; w: number; h: number; radius?: number; shadow?: string; z?: number; className?: string; children?: React.ReactNode;
}) {
  const mv = usePose(p, keys);
  return (
    <motion.div aria-hidden="true" className={`absolute left-0 top-0 origin-top-left will-change-transform ${className}`}
      style={{ width: w, height: h, borderRadius: radius, boxShadow: shadow, zIndex: z, ...mv }}>
      {children}
    </motion.div>
  );
}

/** A real screenshot at its natural size. Decorative by default: the stage describes itself once, in text. */
export function Shot({ name, eager = false, radius, className = '', style, alt = '' }: { name: ShotName; eager?: boolean; radius?: number; className?: string; style?: React.CSSProperties; alt?: string }) {
  const shot = SHOTS[name];
  return (
    <img src={shot.file} width={Math.round(shot.w)} height={Math.round(shot.h)} alt={alt} draggable={false}
      loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchPriority: 'high' as const } : {})}
      className={`block h-full w-full select-none ${className}`} style={{ borderRadius: radius ?? ('rects' in shot && 'self' in shot.rects ? shot.rects.self.r : undefined), ...style }} />
  );
}

/**
 * A window onto part of a real screenshot. The picture keeps its proportions: the window only
 * decides which part shows (like `object-fit: cover` aimed at `view`).
 */
export function Crop({ name, view, className = '', style, alt, eager = false, children }: { name: ShotName; view: View; className?: string; style?: React.CSSProperties; alt?: string; eager?: boolean; children?: (scale: number, offset: { x: number; y: number }) => React.ReactNode }) {
  const shot = SHOTS[name];
  const [ref, size] = useSize<HTMLDivElement>();
  const scale = Math.max(size.w / view.w, size.h / view.h) || 1;
  // Centre the view in the window, then keep the picture's edges from coming inside it.
  const fit = (want: number, picture: number, box: number) => (picture <= box ? (box - picture) / 2 : Math.min(0, Math.max(box - picture, want)));
  const offset = {
    x: fit(size.w / 2 - (view.x + view.w / 2) * scale, shot.w * scale, size.w),
    y: fit(size.h / 2 - (view.y + view.h / 2) * scale, shot.h * scale, size.h),
  };
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`} style={style} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
      <img src={shot.file} alt="" draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async"
        className="absolute left-0 top-0 max-w-none origin-top-left select-none"
        style={{ width: shot.w, height: shot.h, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }} />
      {children?.(scale, offset)}
    </div>
  );
}

/**
 * A tall section whose stage stays on screen while the page scrolls through it. `children` get the
 * scroll clock (0 at the top of the section, 1 when its end reaches the bottom of the screen) and
 * the stage's size.
 */
export function Pinned({ id, screens, className = '', background, label, children }: {
  id?: string; screens: number; className?: string; background?: MotionValue<string> | string; label: string;
  children: (p: MotionValue<number>, size: Size) => React.ReactNode;
}) {
  const section = React.useRef<HTMLElement>(null);
  const [stage, size] = useSize<HTMLDivElement>();
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  // A short, firm spring: wheel steps become a glide, and the picture never lags far behind the page.
  const p = useSpring(scrollYProgress, { stiffness: 210, damping: 32, mass: 0.32, restDelta: 0.0004 });
  return (
    <section ref={section} id={id} aria-label={label} className={`relative ${className}`} style={{ height: `${screens * 100}svh` }}>
      <motion.div ref={stage} className="sticky top-0 h-[100svh] w-full overflow-hidden" style={{ background }}>
        {children(p, size)}
      </motion.div>
    </section>
  );
}

/** A block of copy on the stage whose opacity and offset follow the scroll clock. */
export function Fade({ p, show, shift = 0, axis = 'y', className = '', style, children }: {
  p: MotionValue<number>; show: (v: number) => number; shift?: number; axis?: 'x' | 'y'; className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const opacity = useDerived(p, v => show(v));
  const move = useDerived(p, v => (1 - easeOut(show(v))) * shift);
  const visibility = useDerived(p, v => (show(v) < 0.004 ? 'hidden' : 'visible') as 'hidden' | 'visible');
  return <motion.div className={className} style={{ ...style, opacity, visibility, [axis]: move }}>{children}</motion.div>;
}
