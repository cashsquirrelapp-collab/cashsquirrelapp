import React from 'react';
import { animate, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';

// The phone overview's net-profit card shrinks into a 64px bar as the page scrolls (owner's brief,
// 2026-10-20). One scroll container (#main-content), no nested scrolling; the card is sticky at its
// top and keeps its full height in the layout, so resizing it never moves the scroll position. Every
// size follows the scroll offset through motion values: no React state per pixel.
//
// - Near the top the card is exactly as tall as the distance not yet scrolled, so its bottom edge
//   travels with the content under it; it is fully open at scrollTop 0.
// - Deep in the page a swipe down (after 36px of upward scrolling) opens it part way ("peek"), and a
//   swipe up (24px) closes it again; the thresholds stop short flicks from making it flutter.
// - When scrolling stops half way through the collapse, the page settles to fully open or fully
//   closed, in the direction the finger was going; a move under 40px goes back where it started.
// - A page may put something above the card in the same pinned box (งาน: its title row, `leadRef`).
//   That part scrolls away first; the card starts closing once it has gone.

export const COLLAPSED_HEIGHT = 64;
const PEEK_SHARE = 0.4;
const PEEK_OPEN = 36;
const PEEK_CLOSE = 24;
/** A gesture shorter than this inside the collapse goes back to where it started. */
const SETTLE_MIN = 40;
const EASE = [0.22, 1, 0.36, 1] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export interface CollapsingCard<A extends HTMLElement = HTMLButtonElement> {
  innerRef: React.RefObject<HTMLDivElement | null>;
  amountRef: React.RefObject<A | null>;
  labelRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** What sits above the card in the pinned box, if anything; it scrolls away before the card closes. */
  leadRef: React.RefObject<HTMLDivElement | null>;
  /** The card's full height, 0 until measured. */
  expanded: number;
  /** The height of `leadRef`'s element, 0 without one (also as a motion value, for transforms). */
  lead: number;
  leadValue: MotionValue<number>;
  height: MotionValue<number>;
  /** 0 = open, 1 = collapsed bar. */
  progress: MotionValue<number>;
  amountX: MotionValue<number>;
  amountY: MotionValue<number>;
  amountScale: MotionValue<number>;
  /** Scroll the page back to the top, which opens the card. */
  open: () => void;
}

/** The page's scroll container: #main-content, unless a layer scrolls on its own (the menu). */
export type ScrollerGetter = () => HTMLElement | null;
const mainContent: ScrollerGetter = () => document.getElementById('main-content');

/** The scroll position of the page's scroll container, as a motion value (no React state per pixel). */
export function useScrollTop(getScroller: ScrollerGetter = mainContent): MotionValue<number> {
  const top = useMotionValue(0);
  const getter = React.useRef(getScroller);
  getter.current = getScroller;
  React.useEffect(() => {
    const el = getter.current();
    if (!el) return;
    const onScroll = () => top.set(Math.max(0, el.scrollTop));
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [top]);
  return top;
}

export function useCollapsingCard<A extends HTMLElement = HTMLButtonElement>(getScroller: ScrollerGetter = mainContent): CollapsingCard<A> {
  const reduceMotion = useReducedMotion();
  const scroller = React.useRef(getScroller);
  scroller.current = getScroller;
  const innerRef = React.useRef<HTMLDivElement>(null);
  const amountRef = React.useRef<A>(null);
  const labelRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const leadRef = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = React.useState(0);
  const [lead, setLead] = React.useState(0);
  const expandedMv = useMotionValue(0);
  const leadMv = useMotionValue(0);
  const scrollY = useMotionValue(0);
  const peek = useMotionValue(0);
  const target = React.useRef({ dx: 0, dy: 0, scale: 0.5 });
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const scaleTo = useMotionValue(0.5);

  const height = useTransform([scrollY, peek, expandedMv, leadMv], ([y, k, full, before]: number[]) => {
    if (!full) return COLLAPSED_HEIGHT;
    const range = Math.max(0, full - COLLAPSED_HEIGHT);
    return Math.max(COLLAPSED_HEIGHT, full - Math.max(0, y - before), COLLAPSED_HEIGHT + k * PEEK_SHARE * range);
  });
  const progress = useTransform([height, expandedMv], ([h, full]: number[]) =>
    (full > COLLAPSED_HEIGHT ? clamp01((full - h) / (full - COLLAPSED_HEIGHT)) : 0));
  const amountX = useTransform([progress, dx], ([p, x]: number[]) => p * x);
  const amountY = useTransform([progress, dy], ([p, y]: number[]) => p * y);
  const amountScale = useTransform([progress, scaleTo], ([p, s]: number[]) => 1 - p * (1 - s));

  // Measure the open card and where the figure goes in the bar: right-aligned, centred on the label row.
  React.useLayoutEffect(() => {
    const inner = innerRef.current;
    const measureLead = () => {
      const above = leadRef.current?.offsetHeight ?? 0;
      leadMv.set(above);
      setLead(current => (current === above ? current : above));
    };
    // A header without a box still pins its lead's strip, so the lead is measured either way.
    if (!inner) {
      measureLead();
      const lead = leadRef.current;
      if (!lead) return;
      const observer = new ResizeObserver(measureLead);
      observer.observe(lead);
      return () => observer.disconnect();
    }
    const offsetIn = (el: HTMLElement) => {
      let top = 0; let left = 0; let node: HTMLElement | null = el;
      while (node && node !== inner) { top += node.offsetTop; left += node.offsetLeft; node = node.offsetParent as HTMLElement | null; }
      return { top, left };
    };
    const measure = () => {
      const amount = amountRef.current; const label = labelRef.current;
      const full = inner.offsetHeight;
      if (amount && label) {
        const style = getComputedStyle(inner);
        const padRight = parseFloat(style.paddingRight) || 0;
        const strong = amount.querySelector('strong');
        const fontSize = strong ? parseFloat(getComputedStyle(strong).fontSize) || 42 : 42;
        const a = offsetIn(amount); const l = offsetIn(label);
        // 21px in the bar, smaller if a long figure would run into the label on a narrow phone.
        const text = (label.firstElementChild as HTMLElement | null) ?? label;
        const room = inner.clientWidth - padRight - (offsetIn(text).left + text.offsetWidth + 10);
        const scale = Math.max(0.3, Math.min(1, 21 / fontSize, room / Math.max(1, amount.offsetWidth)));
        target.current = {
          dx: inner.clientWidth - padRight - amount.offsetWidth * scale - a.left,
          dy: l.top + label.offsetHeight / 2 - (amount.offsetHeight * scale) / 2 - a.top,
          scale,
        };
        dx.set(target.current.dx); dy.set(target.current.dy); scaleTo.set(scale);
      }
      expandedMv.set(full);
      setExpanded(current => (current === full ? current : full));
      measureLead();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    if (amountRef.current) observer.observe(amountRef.current);
    if (leadRef.current) observer.observe(leadRef.current);
    return () => observer.disconnect();
  }, [dx, dy, scaleTo, expandedMv, leadMv]);

  React.useEffect(() => {
    const el = scroller.current();
    if (!el || !expanded) return;
    const range = expanded - COLLAPSED_HEIGHT;
    // Enough room below the content for the card to close all the way, however short the page is.
    const fit = () => {
      const root = rootRef.current; if (!root) return;
      const style = getComputedStyle(el);
      const pads = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      // The pinned box is pulled up into the container's padding (negative margin), which takes that
      // much off the scroll range of a short page (งาน with a few jobs, a quiet timeline month): add it
      // back so the card still closes all the way.
      const pinned = innerRef.current?.closest<HTMLElement>('.ksm-summary');
      const pull = pinned ? Math.max(0, -(parseFloat(getComputedStyle(pinned).marginTop) || 0)) : 0;
      root.style.minHeight = `${el.clientHeight - pads + lead + range + pull}px`;
    };
    fit();
    // Settle 160ms after the last scroll event (momentum included), never while a finger is still on
    // the screen. Not scrollend: wheels and trackpads fire it after every small step.
    let touching = false;
    let last = el.scrollTop; let travel = 0; let gestureStart = el.scrollTop; let retryTimer = 0; let peekOpen = false; let settleTimer = 0;
    let peekAnimation: { stop: () => void } | null = null;
    const setPeek = (open: boolean) => {
      if (open === peekOpen) return;
      peekOpen = open;
      peekAnimation?.stop();
      peekAnimation = animate(peek, open ? 1 : 0, { duration: reduceMotion ? 0 : open ? 0.32 : 0.26, ease: EASE });
    };
    const settle = () => {
      const y = el.scrollTop;
      const start = gestureStart;
      gestureStart = y;
      if (y <= 0 || y >= lead + range) return;
      // Stopped while the title above the card is half gone: finish the move, as the card does below.
      if (y < lead) {
        const top = y < lead / 2 ? 0 : lead;
        el.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
        gestureStart = top;
        return;
      }
      const short = Math.abs(y - start) < SETTLE_MIN;
      const toTop = short ? start - lead < range / 2 : travel < 0;
      if (!toTop) setPeek(false);
      const top = toTop ? lead : lead + range;
      el.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
      gestureStart = top;
      // The browser drops a smooth scroll asked for while a touch is still winding down: ask again
      // if the page has not moved at all.
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => { if (!touching && el.scrollTop === y) el.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' }); }, 450);
    };
    const schedule = () => { window.clearTimeout(settleTimer); if (!touching) settleTimer = window.setTimeout(settle, 160); };
    const onTouchStart = () => { touching = true; window.clearTimeout(settleTimer); window.clearTimeout(retryTimer); };
    const onTouchEnd = () => { touching = false; schedule(); };
    const onScroll = () => {
      const y = el.scrollTop;
      const delta = y - last; last = y;
      if (delta !== 0) { if (Math.sign(delta) !== Math.sign(travel)) travel = 0; travel += delta; }
      scrollY.set(Math.max(0, y));
      if (y - lead <= (1 - PEEK_SHARE) * range) { if (peekOpen) { peekAnimation?.stop(); peekOpen = false; peek.set(0); } }
      else if (y - lead > range && travel <= -PEEK_OPEN) setPeek(true);
      else if (travel >= PEEK_CLOSE) setPeek(false);
      schedule();
    };
    // Coming back to the overview: the card matches wherever the page is, never stuck half way.
    scrollY.set(el.scrollTop); peek.set(0);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('resize', fit);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', fit);
      window.clearTimeout(settleTimer);
      window.clearTimeout(retryTimer);
      peekAnimation?.stop();
      if (rootRef.current) rootRef.current.style.minHeight = '';
    };
  }, [expanded, lead, peek, scrollY, reduceMotion]);

  const open = React.useCallback(() => {
    scroller.current()?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion]);

  return { innerRef, amountRef, labelRef, rootRef, leadRef, expanded, lead, leadValue: leadMv, height, progress, amountX, amountY, amountScale, open };
}

/**
 * A header with no box (useCollapsingCard has nothing to close): the page stays tall enough for the
 * title to scroll away completely, and a scroll that stops half way through it finishes the move,
 * so the title is never left half faded under the bar.
 */
export function useLeadSettle(enabled: boolean, lead: number, rootRef: React.RefObject<HTMLElement | null>, getScroller: ScrollerGetter = mainContent) {
  const reduceMotion = useReducedMotion();
  const scroller = React.useRef(getScroller);
  scroller.current = getScroller;
  React.useEffect(() => {
    const el = scroller.current();
    const root = rootRef.current;
    if (!enabled || !el || !lead) return;
    const end = lead + 10; // the pinned box is pulled 10px up into the container's padding
    const fit = () => {
      if (!root) return;
      const style = getComputedStyle(el);
      const pads = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      root.style.minHeight = `${el.clientHeight - pads + end}px`;
    };
    fit();
    let touching = false; let timer = 0;
    const settle = () => {
      const y = el.scrollTop;
      if (y <= 0 || y >= end) return;
      el.scrollTo({ top: y < end / 2 ? 0 : end, behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    const schedule = () => { window.clearTimeout(timer); if (!touching) timer = window.setTimeout(settle, 160); };
    const onTouchStart = () => { touching = true; window.clearTimeout(timer); };
    const onTouchEnd = () => { touching = false; schedule(); };
    el.addEventListener('scroll', schedule, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('resize', fit);
    return () => {
      el.removeEventListener('scroll', schedule);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', fit);
      window.clearTimeout(timer);
      if (root) root.style.minHeight = '';
    };
  }, [enabled, lead, rootRef, reduceMotion]);
}
