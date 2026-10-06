import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { Invoice } from '../../../../shared/types';
import { A4_HEIGHT_PX, A4_WIDTH_PX, DocumentPreview, paginateItems } from './DocumentA4';

// "Pull the paper out of its pocket": the document is shown large and at a constant size, half of
// it peeking out of a soft pocket at the bottom. Wheel, trackpad, mouse drag, touch swipe or the
// keyboard slide the paper up (translateY only, never a zoom) until the whole sheet is visible,
// and back down again. When the paper can't move further in the scroll direction, the scroll goes
// to the page as usual, so the page never gets stuck.

const PAGE_GAP = 16; // DocumentPreview's gap between pages, before scaling
const POCKET = 64; // height of the pocket band at the bottom of the viewport
const TOP = 20; // breathing room above the paper
const PEEK_SHARE = 0.52; // share of the first page visible when peeking
const SNAP_AT = 0.55;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function DocumentReveal({ invoice, className = '' }: { invoice: Invoice; className?: string }) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [progress, setProgress] = React.useState(0); // 0 = peek, 1 = fully revealed
  const [animate, setAnimate] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);
  const [touched, setTouched] = React.useState(false); // hide the hint after the first interaction
  const progressRef = React.useRef(0);
  progressRef.current = progress;

  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A different document always starts peeking.
  React.useEffect(() => { setAnimate(false); setProgress(0); }, [invoice.id]);

  // Large, readable paper: up to 650px wide, never scaled while moving.
  const paperW = box.w ? Math.max(260, Math.min(650, box.w - (box.w < 640 ? 24 : 64))) : 560;
  const scale = paperW / A4_WIDTH_PX;
  const pages = React.useMemo(() => paginateItems(invoice).length, [invoice]);
  const pageH = A4_HEIGHT_PX * scale;
  const paperH = (pages * A4_HEIGHT_PX + (pages - 1) * PAGE_GAP) * scale;

  // Where the paper's top edge sits in each state, from the real sizes.
  const V = box.h || 600;
  const yPeek = Math.min(Math.max(TOP, V - POCKET - pageH * PEEK_SHARE), TOP + 48);
  const fits = TOP + paperH + 12 <= V - POCKET;
  const yFull = fits ? TOP : V - POCKET - paperH - 12;
  // A sheet that already fits whole is simply shown: nothing to pull out.
  const canReveal = !fits && yPeek - yFull > 8;
  const travel = canReveal ? yPeek - yFull : 0;
  const y = canReveal ? yPeek - travel * progress : TOP;

  const setTo = (next: number, smooth: boolean) => {
    setAnimate(smooth && !prefersReducedMotion());
    setProgress(Math.min(1, Math.max(0, next)));
  };
  const snap = (velocity = 0) => {
    const p = progressRef.current;
    const target = velocity > 0.4 ? 1 : velocity < -0.4 ? 0 : p >= SNAP_AT ? 1 : 0;
    setTo(target, true);
  };

  // Wheel / trackpad: needs a non-passive listener to keep the page still while the paper moves.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el || !canReveal) return;
    let idle: number | undefined;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * V : e.deltaY;
      const p = progressRef.current;
      if ((delta > 0 && p >= 1) || (delta < 0 && p <= 0)) return; // nothing left to move: let the page scroll
      e.preventDefault();
      setTouched(true);
      const next = Math.min(1, Math.max(0, p + Math.max(-120, Math.min(120, delta)) / travel));
      progressRef.current = next;
      setAnimate(false);
      setProgress(next);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => snap(), 160);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); window.clearTimeout(idle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReveal, travel, V]);

  // Touch: take over a vertical swipe only when the paper can move that way; otherwise it scrolls the page.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el || !canReveal) return;
    let start: { y: number; x: number; p: number; t: number } | null = null;
    let owned: boolean | null = null;
    let last = { y: 0, t: 0 };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { start = null; return; }
      const t = e.touches[0];
      start = { y: t.clientY, x: t.clientX, p: progressRef.current, t: performance.now() };
      last = { y: t.clientY, t: performance.now() };
      owned = null;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dy = t.clientY - start.y;
      if (owned === null) {
        if (Math.abs(dy) < 6 && Math.abs(t.clientX - start.x) < 6) return;
        const up = dy < 0;
        owned = Math.abs(dy) >= Math.abs(t.clientX - start.x) && (up ? start.p < 1 : start.p > 0);
        if (owned) { setTouched(true); setDragging(true); }
      }
      if (!owned) return;
      e.preventDefault();
      last = { y: t.clientY, t: performance.now() };
      setTo(start.p - dy / travel, false);
    };
    const onEnd = (e: TouchEvent) => {
      if (start && owned) {
        const t = e.changedTouches[0];
        const dt = Math.max(1, performance.now() - last.t);
        snap(-(t.clientY - last.y) / dt);
      }
      start = null; owned = null; setDragging(false);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReveal, travel]);

  // Mouse / pen drag.
  const drag = React.useRef<{ y: number; p: number; lastY: number; lastT: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canReveal || e.pointerType === 'touch' || e.button !== 0) return;
    drag.current = { y: e.clientY, p: progressRef.current, lastY: e.clientY, lastT: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setTouched(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.lastY = e.clientY; d.lastT = performance.now();
    setTo(d.p - (e.clientY - d.y) / travel, false);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    const dt = Math.max(1, performance.now() - d.lastT);
    snap(dt < 80 ? -(e.clientY - d.lastY) / dt : 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!canReveal) return;
    if (['ArrowDown', 'PageDown', 'End'].includes(e.key) && progress < 1) { e.preventDefault(); setTouched(true); setTo(1, true); }
    if (['ArrowUp', 'PageUp', 'Home'].includes(e.key) && progress > 0) { e.preventDefault(); setTouched(true); setTo(0, true); }
  };

  const full = progress >= 1;
  const duration = Math.round(280 + Math.min(170, travel / 4));
  return (
    <div className={`relative min-h-0 ${className}`} style={{ maxHeight: Math.ceil(TOP + paperH + 12 + (canReveal ? POCKET : 8)) }}>
      <div
        ref={viewportRef}
        tabIndex={0}
        role="region"
        aria-label={`เอกสาร ${invoice.documentNo}${canReveal ? (full ? ' แสดงทั้งใบ' : ' แสดงครึ่งบน กดลูกศรลงเพื่อดูทั้งใบ') : ''}`}
        data-testid="document-reveal"
        data-reveal={full ? 'full' : progress <= 0 ? 'peek' : 'moving'}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative h-full overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#E65F2B]/40 ${canReveal ? (dragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none') : ''}`}
        style={{ maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 14px)' }}
      >
        {/* The paper */}
        <div
          key={invoice.id}
          className="doc-reveal-enter absolute left-1/2 top-0 will-change-transform"
          style={{
            width: paperW,
            transform: `translate3d(-50%, ${y}px, 0)`,
            transition: animate ? `transform ${duration}ms ${EASE}, box-shadow ${duration}ms ${EASE}` : 'none',
            boxShadow: `0 ${18 - progress * 8}px ${48 - progress * 16}px rgba(20,18,16,${0.22 - progress * 0.08}), 0 1px 3px rgba(20,18,16,0.12)`,
          }}
        >
          <DocumentPreview invoice={invoice} scale={scale} />
        </div>

        {/* The pocket: a soft band the paper slides into, slightly wider than the paper */}
        {canReveal && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: POCKET }}>
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-t-[22px] bg-gradient-to-b from-[#EEE9E3] to-[#F4F1EC] shadow-[inset_0_12px_16px_-12px_rgba(20,18,16,0.28),0_-1px_0_rgba(255,255,255,0.7)] dark:from-[#26272B] dark:to-[#1D1E21] dark:shadow-[inset_0_12px_16px_-12px_rgba(0,0,0,0.85),0_-1px_0_rgba(255,255,255,0.07)]"
            style={{ width: Math.min(box.w || paperW + 48, paperW + 56) }} />
        </div>}
      </div>

      {/* Hint + accessible toggle, inside the pocket */}
      {canReveal && (
        <button
          type="button"
          onClick={() => { setTouched(true); setTo(full ? 0 : 1, true); }}
          aria-label={full ? 'เก็บเอกสารกลับ' : 'ดูเอกสารทั้งหมด'}
          className="absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center justify-center gap-0.5 px-6 text-xs text-brand-muted transition-colors hover:text-brand-text cursor-pointer"
          style={{ height: POCKET }}
        >
          <span className={`transition-opacity duration-500 ${touched ? 'h-0 opacity-0' : 'opacity-100'}`}>เลื่อนเพื่อดูเอกสารทั้งหมด</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${full ? 'rotate-180' : 'doc-reveal-nudge'}`} />
        </button>
      )}
      <style>{`
        @keyframes docRevealEnter { from { opacity: 0; margin-top: 10px; } to { opacity: 1; margin-top: 0; } }
        .doc-reveal-enter { animation: docRevealEnter 220ms ${EASE} both; }
        @keyframes docRevealNudge { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
        .doc-reveal-nudge { animation: docRevealNudge 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .doc-reveal-enter, .doc-reveal-nudge { animation: none; } }
      `}</style>
    </div>
  );
}
