import React from 'react';
import { motion } from 'motion/react';
import type { RadarStatus } from './radarData';

// Light lines from the squirrel to each card, measured from where the cards really are (again whenever the window, the
// stage or a card changes size), so a line always ends at its card. A light runs along each line now and then; the line
// of the card under the pointer lights up and the others step back.

export interface LineTarget { id: string; status: RadarStatus; side: 'left' | 'right' }

interface Path { id: string; status: RadarStatus; d: string }

/** Where an element sits in the stage by layout, ignoring transforms (a card sliding in, the parallax). */
function layoutBox(el: HTMLElement, stage: HTMLElement) {
  let x = 0, y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stage) {
    x += node.offsetLeft; y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== stage) {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function ConnectionLines({ stageRef, hubRef, cardRefs, targets, hovered, reduce, layoutKey }: {
  stageRef: React.RefObject<HTMLElement | null>;
  hubRef: React.RefObject<HTMLElement | null>;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  targets: LineTarget[];
  hovered: string | null;
  reduce: boolean;
  /** Changes when the cards or the stage change, to measure again. */
  layoutKey: string;
}) {
  const [paths, setPaths] = React.useState<Path[]>([]);
  const [box, setBox] = React.useState({ w: 0, h: 0 });

  const measure = React.useCallback(() => {
    const stage = stageRef.current, hub = hubRef.current;
    if (!stage || !hub) return;
    const h = layoutBox(hub, stage);
    const hx = h.x + h.w / 2, hy = h.y + h.h * 0.52;
    const reach = Math.min(h.w, h.h) * 0.36;
    const next: Path[] = [];
    for (const target of targets) {
      const el = cardRefs.current.get(target.id);
      if (!el) continue;
      const r = layoutBox(el, stage);
      const ax = target.side === 'left' ? r.x + r.w : r.x;
      const ay = r.y + r.h / 2;
      // Start at the squirrel's edge, toward the card.
      const angle = Math.atan2(ay - hy, ax - hx);
      const sx = hx + Math.cos(angle) * reach, sy = hy + Math.sin(angle) * reach * 0.85;
      const dx = ax - sx;
      next.push({ id: target.id, status: target.status, d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${(sx + dx * 0.45).toFixed(1)} ${sy.toFixed(1)}, ${(ax - dx * 0.4).toFixed(1)} ${ay.toFixed(1)}, ${ax.toFixed(1)} ${ay.toFixed(1)}` });
    }
    const w = stage.clientWidth, height = stage.clientHeight;
    setBox(current => (current.w === w && current.h === height ? current : { w, h: height }));
    setPaths(current => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [stageRef, hubRef, cardRefs, targets]);

  React.useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(() => measure());
    if (stageRef.current) observer.observe(stageRef.current);
    if (hubRef.current) observer.observe(hubRef.current);
    for (const el of cardRefs.current.values()) observer.observe(el);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, layoutKey, stageRef, hubRef, cardRefs]);

  if (!box.w) return null;
  return (
    <>
      <svg className="crl" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
        <defs>
          <filter id="crl-glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {paths.map((path, i) => {
          const state = hovered === null ? '' : hovered === path.id ? ' is-active' : ' is-dim';
          const draw = reduce ? {} : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.7, delay: 0.55 + i * 0.07, ease: [0.22, 1, 0.36, 1] as const } };
          return (
            <g key={path.id} className={`crl-line is-${path.status}${state}`} data-line={path.id}>
              <motion.path d={path.d} className="crl-glow" filter="url(#crl-glow)" {...draw} />
              <motion.path d={path.d} className="crl-core" {...draw} />
            </g>
          );
        })}
      </svg>
      {!reduce && paths.map((path, i) => (
        <span key={path.id} className={`crl-dot is-${path.status}${hovered === path.id ? ' is-active' : ''}`} aria-hidden="true"
          style={{ offsetPath: `path('${path.d}')`, animationDelay: `${1.2 + i * 0.55}s` } as React.CSSProperties} />
      ))}
    </>
  );
}
