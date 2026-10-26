import React from 'react';
import { motion } from 'motion/react';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { Mascot, type MascotMood } from '../../components/mascot/Mascot';
import { MascotPeek } from '../../components/mascot/MascotPeek';
import { tr } from '../../i18n/tr';
import { bubbleSide, clampRect, clearRect, clearSpot, defaultRect, EDGE, footprint, intersects, mascotSizeFor, maximizedRect, MIN_SIZE, type Rect, type Size } from './floatGeometry';

// The floating เลขากระรอก window on computers and iPads (owner's brief "FLOATING TOP MASCOT CHAT UI V2", 2026-10-26):
// the official squirrel perches on the middle of the window's top edge, paws on the edge, with its name on a dark
// capsule under it; a calm header with minimise, maximise and close only; the window moves and resizes, remembers
// where it was put, keeps clear of document previews, and folds into the squirrel when there is no room. Phones keep
// their sheet (AssistantBuddy). Below every dialog (z-index 90), so a dialog always covers it and never the reverse.

const view = (): Size => ({ w: window.innerWidth, h: window.innerHeight });
const storeKey = (accountId?: string) => `krarok.buddy.window.${accountId || 'guest'}`;
const miniKey = (accountId?: string) => `krarok.buddy.mini.${accountId || 'guest'}`;
type Saved = { rect: Rect; max?: boolean; restore?: Rect };
function load<T>(key: string): T | null {
  try { const value = JSON.parse(window.localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value as T : null; } catch { return null; }
}
function save(key: string, value: unknown) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: the window just forgets */ }
}
const validRect = (value: unknown): value is Rect => {
  const r = value as Rect | null;
  return Boolean(r) && [r!.x, r!.y, r!.w, r!.h].every(n => typeof n === 'number' && Number.isFinite(n));
};

/** Document previews and their buttons the chat keeps clear of: every element marked data-krarok-avoid. */
export type Zones = { rects: Rect[]; key: string };
const ids = new WeakMap<Element, number>();
let nextZoneId = 0;
function readZones(exclude: (HTMLElement | null)[]): Zones {
  const rects: Rect[] = [];
  const keys: number[] = [];
  const v = view();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-krarok-avoid]'))) {
    if (exclude.some(own => own?.contains(el))) continue;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left), y = Math.max(0, r.top), right = Math.min(v.w, r.right), bottom = Math.min(v.h, r.bottom);
    if (right - x < 8 || bottom - y < 8) continue;
    if (!ids.has(el)) ids.set(el, ++nextZoneId);
    keys.push(ids.get(el)!);
    rects.push({ x, y, w: right - x, h: bottom - y });
  }
  return { rects, key: keys.sort((a, b) => a - b).join(',') };
}
const sameZones = (a: Zones, b: Zones) => a.key === b.key && a.rects.length === b.rects.length
  && a.rects.every((r, i) => Math.abs(r.x - b.rects[i].x) < 2 && Math.abs(r.y - b.rects[i].y) < 2 && Math.abs(r.w - b.rects[i].w) < 2 && Math.abs(r.h - b.rects[i].h) < 2);

/** The previews on screen, checked a few times a second while the chat is showing (cheap: one query, no layout writes). */
export function useAvoidZones(active: boolean, exclude: React.RefObject<HTMLElement | null>[]): Zones {
  const [zones, setZones] = React.useState<Zones>({ rects: [], key: '' });
  const excludeRef = React.useRef(exclude); excludeRef.current = exclude;
  React.useEffect(() => {
    if (!active) { setZones(z => (z.key || z.rects.length ? { rects: [], key: '' } : z)); return; }
    const check = () => { const next = readZones(excludeRef.current.map(ref => ref.current)); setZones(z => (sameZones(z, next) ? z : next)); };
    check();
    const timer = window.setInterval(check, 300);
    window.addEventListener('resize', check);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', check); };
  }, [active]);
  return zones;
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function resized(start: Rect, edge: Edge | 'move', dx: number, dy: number, v: Size): Rect {
  if (edge === 'move') return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, v);
  let { x, y, w, h } = start;
  if (edge.includes('e')) w = start.w + dx;
  if (edge.includes('s')) h = start.h + dy;
  if (edge.includes('w')) { w = Math.max(MIN_SIZE.w, start.w - dx); x = start.x + start.w - w; }
  if (edge.includes('n')) { h = Math.max(MIN_SIZE.h, start.h - dy); y = start.y + start.h - h; }
  const next = clampRect({ x, y, w: Math.max(MIN_SIZE.w, w), h: Math.max(MIN_SIZE.h, h) }, v);
  // Growing past the screen's edge stops at it instead of pushing the far side away.
  if (edge.includes('w')) next.x = Math.min(next.x, start.x + start.w - next.w);
  if (edge.includes('n')) next.y = Math.min(next.y, start.y + start.h - next.h);
  return clampRect(next, v);
}

type WindowProps = {
  accountId?: string;
  /** The window is on screen (false while it is folded into the squirrel: it stays mounted so nothing is lost). */
  shown: boolean;
  mood: MascotMood;
  /** The chat is thinking or writing: the squirrel taps on its hologram screen. */
  busy?: boolean;
  label: string;
  /** Read out with the header, e.g. "กำลังดูหน้างาน"; not shown, the name is on the capsule. */
  note: string;
  zones: Zones;
  reduce: boolean;
  onMinimize: (auto?: boolean) => void;
  onClose: () => void;
  /** The window has room again after it folded by itself. */
  windowRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
};

export function FloatingWindow({ accountId, shown, mood, busy = false, label, note, zones, reduce, onMinimize, onClose, windowRef, children }: WindowProps) {
  const [rect, setRect] = React.useState<Rect>(() => {
    const saved = load<Saved>(storeKey(accountId));
    return saved && validRect(saved.rect) ? clampRect(saved.rect, view()) : defaultRect(view());
  });
  const [max, setMax] = React.useState(() => Boolean(load<Saved>(storeKey(accountId))?.max));
  const restoreRef = React.useRef<Rect | null>((() => { const r = load<Saved>(storeKey(accountId))?.restore; return validRect(r) ? r : null; })());
  const rectRef = React.useRef(rect); rectRef.current = rect;
  const [moving, setMoving] = React.useState<null | Edge | 'move'>(null);
  // Set by the chat itself to keep clear of a preview; dropped the moment the user moves or resizes the window.
  const autoRef = React.useRef<{ before: Rect; key: string } | null>(null);
  // The previews (by their set) the user placed the window over themselves: the chat no longer moves for them.
  const frozenRef = React.useRef<string | null>(null);
  // The previews the user opened the folded chat over: it may still move aside, but it does not fold again.
  const noFoldRef = React.useRef<string | null>(null);

  const persist = React.useCallback((next: Rect, isMax: boolean, restore: Rect | null) => {
    save(storeKey(accountId), { rect: next, max: isMax, ...(restore ? { restore } : {}) });
  }, [accountId]);
  const userPlaced = React.useCallback((next: Rect, isMax = false, restore: Rect | null = null) => {
    autoRef.current = null;
    if (zones.key) frozenRef.current = zones.key;
    setRect(next); setMax(isMax); persist(next, isMax, restore);
  }, [persist, zones.key]);

  // Keep inside the screen when the browser window changes size.
  React.useEffect(() => {
    const onResize = () => setRect(r => clampRect(max ? maximizedRect(view()) : r, view()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [max]);

  // Opening the folded squirrel again over a preview is the user's choice: the chat may move aside but stays open.
  const wasShown = React.useRef(shown);
  React.useEffect(() => {
    if (shown && !wasShown.current && zones.key) noFoldRef.current = zones.key;
    wasShown.current = shown;
  }, [shown, zones.key]);

  // Keep clear of document previews (brief §5): move, then shrink, then fold into the squirrel. When the previews close,
  // go back to where the user had it, unless they moved it meanwhile.
  React.useEffect(() => {
    if (moving) return;
    const auto = autoRef.current;
    if (!zones.key) {
      if (auto) { autoRef.current = null; setRect(clampRect(auto.before, view())); }
      frozenRef.current = null; noFoldRef.current = null;
      return;
    }
    if (!shown || frozenRef.current === zones.key) return;
    const current = max ? maximizedRect(view()) : rectRef.current;
    if (zones.rects.every(block => !intersects(footprint(current), block, 12))) return;
    const spot = clearRect(current, zones.rects, view());
    if (!spot && noFoldRef.current === zones.key) return;
    if (!autoRef.current) autoRef.current = { before: current, key: zones.key };
    else autoRef.current.key = zones.key;
    if (spot) { setMax(false); setRect(spot); }
    else onMinimize(true);
  }, [zones, shown, moving, max, onMinimize]);

  const begin = (edge: Edge | 'move') => (event: React.PointerEvent) => {
    if (event.button !== 0 || max && edge !== 'move') return;
    if (edge === 'move' && (event.target as HTMLElement).closest('button:not(.kfw-grip)')) return;
    event.preventDefault();
    const el = windowRef.current;
    const start = max ? maximizedRect(view()) : rectRef.current;
    const sx = event.clientX, sy = event.clientY;
    let latest = start;
    let started = false;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!started && Math.hypot(dx, dy) < 4) return;
      if (!started) { started = true; setMoving(edge); }
      latest = resized(start, edge, dx, dy, view());
      if (el) Object.assign(el.style, { left: `${latest.x}px`, top: `${latest.y}px`, width: `${latest.w}px`, height: `${latest.h}px` });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!started) return;
      setMoving(null);
      userPlaced(latest);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const toggleMax = () => {
    if (max) { const back = clampRect(restoreRef.current ?? defaultRect(view()), view()); restoreRef.current = null; userPlaced(back); }
    else { restoreRef.current = rectRef.current; userPlaced(maximizedRect(view()), true, rectRef.current); }
  };
  const reset = () => { restoreRef.current = null; autoRef.current = null; save(storeKey(accountId), null); setMax(false); setRect(defaultRect(view())); };
  // The grip also moves (arrows) and resizes (Alt + arrows) the window from the keyboard.
  const onGripKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 64 : 16;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key as 'ArrowLeft'];
    if (!d) { if (event.key === 'Home') { event.preventDefault(); reset(); } return; }
    event.preventDefault();
    const r = rectRef.current;
    userPlaced(event.altKey ? clampRect({ ...r, w: r.w + d[0], h: r.h + d[1] }, view()) : clampRect({ ...r, x: r.x + d[0], y: r.y + d[1] }, view()));
  };

  const box = max ? maximizedRect({ w: window.innerWidth, h: window.innerHeight }) : rect;
  const size = mascotSizeFor(box.w);
  return (
    <motion.div ref={windowRef} className={`kfw${moving ? ' is-moving' : ''}${max ? ' is-max' : ''}${shown ? '' : ' is-folded'}`} role="dialog" aria-modal="false" aria-label={label}
      aria-hidden={!shown || undefined} inert={!shown || undefined}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, ['--kfw-perch' as string]: `${size}px` }}
      initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }} animate={shown ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.92, y: 6 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }} transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
      {/* The squirrel above the window: it moves with the window, always in the middle, and moves it when dragged. */}
      <span className="kfw-perch" onPointerDown={begin('move')} onDoubleClick={reset} title={tr("ลากเพื่อย้าย · ดับเบิลคลิกเพื่อคืนตำแหน่งเดิม")}>
        <MascotPeek size={size} mood={mood} motion={reduce ? 'still' : 'calm'} holo={busy} className="kfw-perch-art" />
      </span>
      <div className="kfw-shell">
        <header className="kfw-head" onPointerDown={begin('move')} onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button')) reset(); }}>
          <button type="button" className="kfw-grip" onKeyDown={onGripKey}
            aria-label={tr("ย้ายหน้าต่าง: ลากหรือใช้ปุ่มลูกศร · Alt + ลูกศรเพื่อปรับขนาด · Home เพื่อคืนตำแหน่งเดิม")} title={tr("ลากเพื่อย้าย · ดับเบิลคลิกเพื่อคืนตำแหน่งเดิม")}>
            <svg viewBox="0 0 10 16" width="8" height="13" aria-hidden="true">{[3, 8, 13].flatMap(y => [2.5, 7.5].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}</svg>
          </button>
          <span className="kfw-name">{tr("เลขากระรอก")}</span>
          <span className="asx-sr">{note}</span>
          <div className="kfw-controls">
            <button type="button" className="kfw-ctrl" onClick={() => onMinimize(false)} aria-label={tr("ย่อหน้าต่าง")} title={tr("ย่อหน้าต่าง")}><Minus size={16} /></button>
            <button type="button" className="kfw-ctrl" onClick={toggleMax} aria-label={max ? tr("คืนขนาด") : tr("ขยายหน้าต่าง")} title={max ? tr("คืนขนาด") : tr("ขยายหน้าต่าง")}>
              {max ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button type="button" className="kfw-ctrl" onClick={onClose} aria-label={tr("ปิด")} title={tr("ปิด")}><X size={16} /></button>
          </div>
        </header>
        {children}
      </div>
      {!max && EDGES.map(edge => <span key={edge} className={`kfw-rz is-${edge}`} onPointerDown={begin(edge)} aria-hidden="true" />)}
    </motion.div>
  );
}

type MiniProps = {
  accountId?: string;
  mood: MascotMood;
  zones: Zones;
  label: string;
  onRestore: () => void;
  /** What the squirrel says (the status card's words), already typed out by the caller. */
  bubble?: React.ReactNode;
  bubbleKey?: string;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
};

const MINI = 76;
/** The folded chat: the squirrel alone, which can be dragged anywhere and tapped to open the window again. */
export function MiniMascot({ accountId, mood, zones, label, onRestore, bubble, bubbleKey, buttonRef }: MiniProps) {
  const [spot, setSpot] = React.useState<Rect>(() => {
    const saved = load<Rect>(miniKey(accountId));
    if (validRect(saved)) return { ...saved, w: MINI, h: MINI };
    // The corner where the "ถามเลขากระรอก" pill is, out of the page's way, until the user puts it elsewhere.
    const v = view();
    return { x: v.w - MINI - 28, y: v.h - MINI - 28, w: MINI, h: MINI };
  });
  const [dragging, setDragging] = React.useState(false);
  const bubbleRef = React.useRef<HTMLSpanElement>(null);
  const [bubbleSize, setBubbleSize] = React.useState<Size>({ w: 240, h: 56 });
  React.useLayoutEffect(() => {
    const el = bubbleRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setBubbleSize(s => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
  }, [bubbleKey]);
  // Off any preview, even when it was put there before the preview opened.
  const placed = clearSpot(spot, zones.rects, view());
  const side = bubble ? bubbleSide(placed, bubbleSize, zones.rects, view()) : 'none';

  const begin = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const sx = event.clientX, sy = event.clientY, start = placed;
    let started = false;
    let latest = start;
    const el = event.currentTarget as HTMLElement;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!started && Math.hypot(dx, dy) < 4) return;
      if (!started) { started = true; setDragging(true); }
      const v = view();
      latest = { ...start, x: Math.min(Math.max(start.x + dx, EDGE), v.w - MINI - EDGE), y: Math.min(Math.max(start.y + dy, EDGE), v.h - MINI - EDGE) };
      el.parentElement!.style.left = `${latest.x}px`; el.parentElement!.style.top = `${latest.y}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      if (!started) return;
      // A drag is not a tap: the click that follows is swallowed.
      el.dataset.dragged = '1'; window.setTimeout(() => { delete el.dataset.dragged; }, 0);
      setDragging(false); setSpot(latest); save(miniKey(accountId), latest);
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  };
  const onKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 64 : 16;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key as 'ArrowLeft'];
    if (!d) return;
    event.preventDefault();
    const v = view();
    const next = { ...placed, x: Math.min(Math.max(placed.x + d[0], EDGE), v.w - MINI - EDGE), y: Math.min(Math.max(placed.y + d[1], EDGE), v.h - MINI - EDGE) };
    setSpot(next); save(miniKey(accountId), next);
  };
  return (
    <div className={`kfw-mini${dragging ? ' is-moving' : ''}`} style={{ left: placed.x, top: placed.y, width: MINI, height: MINI }}>
      <button ref={buttonRef} type="button" className="kfw-mini-btn" onPointerDown={begin} onKeyDown={onKey}
        onClick={event => { if ((event.currentTarget as HTMLElement).dataset.dragged) return; onRestore(); }}
        aria-label={label} title={tr("แตะเพื่อเปิดแชต · ลากเพื่อย้าย")}>
        <Mascot mood={mood} size={MINI} animated={false} />
      </button>
      {bubble && (
        <span ref={bubbleRef} key={bubbleKey} className={`kfw-mini-say lg-glass is-menu is-${side}`} role="status" onClick={onRestore}>
          {bubble}
        </span>
      )}
    </div>
  );
}
