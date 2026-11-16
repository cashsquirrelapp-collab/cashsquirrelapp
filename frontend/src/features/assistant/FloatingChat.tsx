import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Maximize2, Minus, PanelRight, PictureInPicture2, X } from 'lucide-react';
import { Mascot, type MascotMood } from '../../components/mascot/Mascot';
import { MascotPeek } from '../../components/mascot/MascotPeek';
import { tr } from '../../i18n/tr';
import { bubbleSide, clampRect, clearRect, clearSpot, defaultRect, DOCK, dockMode, dockRect, dockWidth, EDGE, footprint, intersects, mascotSizeFor, MIN_SIZE, overhangFor, type Rect, type Size } from './floatGeometry';

// The floating เลขากระรอก window on computers and iPads (owner's brief "FLOATING TOP MASCOT CHAT UI V2", 2026-10-26):
// the official squirrel perches on the middle of the window's top edge, paws on the edge, with its name on a dark
// capsule under it; a calm header with minimise, open the full chat and close only; the window moves and resizes,
// remembers where it was put, keeps clear of document previews, and folds into the squirrel when there is no room.
// Phones keep their sheet (AssistantBuddy). Below every dialog (z-index 90), so a dialog always covers it and never
// the reverse. The expand button opens the full chat page with this conversation (owner, 2026-10-27: "2 หน้านี้มันควร
// เป็นหน้าเดียวกัน"), so the window is never maximised in place any more.

const view = (): Size => ({ w: window.innerWidth, h: window.innerHeight });
const storeKey = (accountId?: string) => `krarok.buddy.window.${accountId || 'guest'}`;
const miniKey = (accountId?: string) => `krarok.buddy.mini.${accountId || 'guest'}`;
// Docked at the right (owner, 2026-11-16: "ลากเมาส์ไปไว้มุมขวาสุดแล้วมันก็จะมีช่องให้ใส่ ... บีบ UI ของฝั่ง preview ... ย่นลงมา
// อีกนิดนึง เวลาพิมพ์อะไรกรอกอะไรมันจะได้แบบดูง่ายมากขึ้น"): whether it is, and how wide.
const dockKey = (accountId?: string) => `krarok.buddy.dock.${accountId || 'guest'}`;
// `w` is the width the user chose; each screen fits it to its own room (dockWidth), so turning an iPad and back keeps it.
type DockSaved = { on: boolean; w: number };
/** How near the screen's right edge the pointer must be, while the window is dragged, for the dock to offer itself. */
const DOCK_REACH = 56;
/** Docked narrower than this, the head has no room for the name beside the squirrel, the tokens and the four buttons, so
 *  the name is read out only (the squirrel's face says who it is); 340-379px sheets are iPads lying down, or chosen. */
const NAMED_FROM = 380;
// `max` and `restore` were written while the window could be maximised in place (until 2026-10-27).
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
  /** Shown in the header's top-left corner, after the grip (the token ring). */
  corner?: React.ReactNode;
  zones: Zones;
  reduce: boolean;
  onMinimize: (auto?: boolean) => void;
  /** Open the full chat page with this conversation. */
  onExpand: () => void;
  /** Not while an answer or a save is on its way: it would be cut off. */
  expandWaits?: boolean;
  onClose: () => void;
  /** The window has room again after it folded by itself. */
  windowRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
};

export function FloatingWindow({ accountId, shown, mood, busy = false, label, note, corner, zones, reduce, onMinimize, onExpand, expandWaits = false, onClose, windowRef, children }: WindowProps) {
  const [rect, setRect] = React.useState<Rect>(() => {
    const saved = load<Saved>(storeKey(accountId));
    // A window left maximised before 2026-10-27 opens at the size it had before that.
    const placed = saved?.max && validRect(saved.restore) ? saved.restore : saved?.rect;
    return validRect(placed) ? clampRect(placed, view()) : defaultRect(view());
  });
  const rectRef = React.useRef(rect); rectRef.current = rect;
  const [moving, setMoving] = React.useState<null | Edge | 'move'>(null);
  const [dock, setDock] = React.useState<DockSaved>(() => {
    const saved = load<DockSaved>(dockKey(accountId));
    return saved && typeof saved.w === 'number' && Number.isFinite(saved.w) ? { on: saved.on === true, w: saved.w } : { on: false, w: DOCK.width };
  });
  // The screen's size: whether and how the chat docks follows it (an iPad turned upright docks over the page instead).
  const [screen, setScreen] = React.useState<Size>(view);
  const mode = dockMode(screen);
  const docked = dock.on && mode !== null;
  const side = docked && mode === 'side';
  const dockW = dockWidth(dock.w, screen);
  const dockRef = React.useRef(dock); dockRef.current = dock;
  const dockedRef = React.useRef(docked); dockedRef.current = docked;
  // The outline at the right while the window is dragged near the edge: let go and it docks there.
  const [offer, setOffer] = React.useState(false);
  const offerRef = React.useRef(false);
  const showOffer = (next: boolean) => { if (offerRef.current !== next) { offerRef.current = next; setOffer(next); } };
  // Docking and undocking glide; a drag never does.
  const [snapping, setSnapping] = React.useState(false);
  const snap = () => { setSnapping(true); window.setTimeout(() => setSnapping(false), 360); };
  const keepDock = (next: DockSaved) => { setDock(next); save(dockKey(accountId), next); };
  // Set by the chat itself to keep clear of a preview; dropped the moment the user moves or resizes the window.
  const autoRef = React.useRef<{ before: Rect; key: string } | null>(null);
  // The previews (by their set) the user placed the window over themselves: the chat no longer moves for them.
  const frozenRef = React.useRef<string | null>(null);
  // The previews the user opened the folded chat over: it may still move aside, but it does not fold again.
  const noFoldRef = React.useRef<string | null>(null);

  const userPlaced = React.useCallback((next: Rect) => {
    autoRef.current = null;
    if (zones.key) frozenRef.current = zones.key;
    setRect(next); save(storeKey(accountId), { rect: next } satisfies Saved);
  }, [accountId, zones.key]);

  // Keep inside the screen when the browser window changes size.
  React.useEffect(() => {
    const onResize = () => { setRect(r => clampRect(r, view())); setScreen(view()); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The page makes room for the chat docked beside it: the page card ends a gap before it (index.css, html.has-kfw-dock).
  // Docked over the page (iPads upright), the page keeps its width.
  React.useEffect(() => {
    const root = document.documentElement;
    if (side && shown) { root.classList.add('has-kfw-dock'); root.style.setProperty('--kfw-dock', `${dockW}px`); }
    else root.classList.remove('has-kfw-dock');
    return () => root.classList.remove('has-kfw-dock');
  }, [side, shown, dockW]);

  // Opening the folded squirrel again over a preview is the user's choice: the chat may move aside but stays open.
  const wasShown = React.useRef(shown);
  React.useEffect(() => {
    if (shown && !wasShown.current && zones.key) noFoldRef.current = zones.key;
    wasShown.current = shown;
  }, [shown, zones.key]);

  // Keep clear of document previews (brief §5): move, then shrink, then fold into the squirrel. When the previews close,
  // go back to where the user had it, unless they moved it meanwhile.
  React.useEffect(() => {
    // Docked, the chat stays where the user put it: beside the page, previews never reach it; over the page (iPads
    // upright), covering its right side was the user's choice, and the button floats it again.
    if (moving || docked) return;
    const auto = autoRef.current;
    if (!zones.key) {
      if (auto) { autoRef.current = null; setRect(clampRect(auto.before, view())); }
      frozenRef.current = null; noFoldRef.current = null;
      return;
    }
    if (!shown || frozenRef.current === zones.key) return;
    const current = rectRef.current;
    if (zones.rects.every(block => !intersects(footprint(current), block, 12))) return;
    const spot = clearRect(current, zones.rects, view());
    if (!spot && noFoldRef.current === zones.key) return;
    if (!autoRef.current) autoRef.current = { before: current, key: zones.key };
    else autoRef.current.key = zones.key;
    if (spot) setRect(spot);
    else onMinimize(true);
  }, [zones, shown, moving, docked, onMinimize]);

  const begin = (edge: Edge | 'move') => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (edge === 'move' && (event.target as HTMLElement).closest('button:not(.kfw-grip)')) return;
    event.preventDefault();
    const el = windowRef.current;
    const wasDocked = dockedRef.current;
    const besidePage = wasDocked && dockMode(view()) === 'side';
    let start = rectRef.current;
    let sx = event.clientX, sy = event.clientY;
    let latest = start;
    let started = false;
    const startWidth = dockWidth(dockRef.current.w, view());
    let width = startWidth;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!started && Math.hypot(dx, dy) < 4) return;
      if (!started) {
        started = true; setMoving(edge);
        // Dragged away from the right edge, the docked chat floats again at its own size, under the pointer.
        if (wasDocked && edge === 'move') {
          start = clampRect({ ...start, x: e.clientX - start.w / 2, y: e.clientY - 26 }, view());
          sx = e.clientX; sy = e.clientY;
          keepDock({ ...dockRef.current, on: false });
          setRect(start);
        }
      }
      if (wasDocked && edge === 'w') {
        // Docked, only its left edge moves: the chat wider or narrower, the page beside it the other way.
        width = dockWidth(startWidth - (e.clientX - event.clientX), view());
        const box = dockRect(width, view());
        if (el) { Object.assign(el.style, { left: `${box.x}px`, width: `${box.w}px` }); el.classList.toggle('is-narrow', box.w < NAMED_FROM); }
        if (besidePage) document.documentElement.style.setProperty('--kfw-dock', `${width}px`);
        return;
      }
      latest = resized(start, edge, e.clientX - sx, e.clientY - sy, view());
      if (el) Object.assign(el.style, { left: `${latest.x}px`, top: `${latest.y}px`, width: `${latest.w}px`, height: `${latest.h}px` });
      if (edge === 'move') showOffer(dockMode(view()) !== null && e.clientX >= view().w - DOCK_REACH);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!started) return;
      setMoving(null);
      if (wasDocked && edge === 'w') { keepDock({ on: true, w: width }); return; }
      if (offerRef.current) {
        // Let go over the outline: docked at the right, the page makes room; where it floated is kept for later.
        showOffer(false);
        snap();
        keepDock({ ...dockRef.current, on: true });
        return;
      }
      userPlaced(latest);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const reset = () => { autoRef.current = null; save(storeKey(accountId), null); setRect(defaultRect(view())); };
  // The grip also moves (arrows) and resizes (Alt + arrows) the window from the keyboard.
  const onGripKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 64 : 16;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key as 'ArrowLeft'];
    if (!d) { if (event.key === 'Home') { event.preventDefault(); reset(); } return; }
    event.preventDefault();
    const r = rectRef.current;
    userPlaced(event.altKey ? clampRect({ ...r, w: r.w + d[0], h: r.h + d[1] }, view()) : clampRect({ ...r, x: r.x + d[0], y: r.y + d[1] }, view()));
  };

  const box = docked ? dockRect(dock.w, screen) : rect;
  const size = mascotSizeFor(box.w);
  const toggleDock = () => { snap(); keepDock({ ...dock, on: !dock.on }); };
  const outline = dockRect(dock.w, screen);
  // Beside the page the page makes room; over it (iPads upright) the sheet just runs top to bottom at the right.
  const dockLabel = mode === 'over' ? tr("ชิดขวาเต็มความสูง") : tr("ชิดขวา หน้าแอปหดให้");
  const dockTitle = mode === 'over' ? tr("ชิดขวาเต็มความสูง (หรือลากไปชนขอบขวา)") : tr("ชิดขวา หน้าแอปหดให้ (หรือลากไปชนขอบขวา)");
  return (
    <motion.div ref={windowRef} className={`kfw${moving ? ' is-moving' : ''}${shown ? '' : ' is-folded'}${docked ? ' is-docked' : ''}${docked && !side ? ' is-over' : ''}${docked && dockW < NAMED_FROM ? ' is-narrow' : ''}${snapping ? ' is-snapping' : ''}`} role="dialog" aria-modal="false" aria-label={label}
      aria-hidden={!shown || undefined} inert={!shown || undefined}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, ['--kfw-perch' as string]: `${size}px` }}
      initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }} animate={shown ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.92, y: 6 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }} transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
      {/* The squirrel above the window: it moves with the window, always in the middle, and moves it when dragged. Docked
          at the right the sheet reaches the top of the screen, so the squirrel sits in the header instead. */}
      {!docked && (
        <span className="kfw-perch" onPointerDown={begin('move')} onDoubleClick={reset} title={tr("ลากเพื่อย้าย · ดับเบิลคลิกเพื่อคืนตำแหน่งเดิม")}>
          {/* In its headset (owner, 2026-10-29: "เวลาที่น้องเกาะแชทแบบนี้ก็ให้น้องใส่หูฟังเหมือนกัน"). */}
          <MascotPeek size={size} gear="headset" mood={mood} motion={reduce ? 'still' : 'calm'} holo={busy} thoughtDots={false} className="kfw-perch-art" />
        </span>
      )}
      <div className="kfw-shell">
        <header className="kfw-head" onPointerDown={begin('move')} onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button')) reset(); }}>
          {/* Docked, the window has no place of its own to move to (its head still drags it away), so the grip goes and
              leaves its room to the buttons on a narrow sheet (iPads lying down). */}
          {!docked && (
            <button type="button" className="kfw-grip" onKeyDown={onGripKey}
              aria-label={tr("ย้ายหน้าต่าง: ลากหรือใช้ปุ่มลูกศร · Alt + ลูกศรเพื่อปรับขนาด · Home เพื่อคืนตำแหน่งเดิม")} title={tr("ลากเพื่อย้าย · ดับเบิลคลิกเพื่อคืนตำแหน่งเดิม")}>
              <svg viewBox="0 0 10 16" width="8" height="13" aria-hidden="true">{[3, 8, 13].flatMap(y => [2.5, 7.5].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}</svg>
            </button>
          )}
          {docked && <span className="kfw-dock-face" aria-hidden="true"><Mascot gear="headset" mood={mood} animated={false} size={30} viewBox="12 8 76 76" /></span>}
          {corner}
          <span className="kfw-name">{tr("เลขากระรอก")}</span>
          <span className="asx-sr">{note}</span>
          <div className="kfw-controls">
            {mode !== null && (
              <button type="button" className="kfw-ctrl" onClick={toggleDock} aria-pressed={docked} data-testid="kfw-dock"
                aria-label={docked ? tr("แยกเป็นหน้าต่างลอย") : dockLabel} title={docked ? tr("แยกเป็นหน้าต่างลอย") : dockTitle}>
                {docked ? <PictureInPicture2 size={15} /> : <PanelRight size={15} />}
              </button>
            )}
            <button type="button" className="kfw-ctrl" onClick={() => onMinimize(false)} aria-label={tr("ย่อหน้าต่าง")} title={tr("ย่อหน้าต่าง")}><Minus size={16} /></button>
            <button type="button" className="kfw-ctrl" onClick={() => { if (!expandWaits) onExpand(); }} aria-disabled={expandWaits || undefined}
              aria-label={tr("เปิดแชตเต็ม")} title={expandWaits ? tr("เปิดแชตเต็มได้เมื่อเลขากระรอกทำรายการนี้เสร็จ") : tr("เปิดแชตเต็ม")}>
              <Maximize2 size={14} />
            </button>
            <button type="button" className="kfw-ctrl" onClick={onClose} aria-label={tr("ปิด")} title={tr("ปิด")}><X size={16} /></button>
          </div>
        </header>
        {children}
      </div>
      {(docked ? (['w'] as Edge[]) : EDGES).map(edge => <span key={edge} className={`kfw-rz is-${edge}`} onPointerDown={begin(edge)} aria-hidden="true" />)}
      {offer && createPortal(
        <div className="kfw-dock-offer" style={{ left: outline.x, top: outline.y, width: outline.w, height: outline.h }} aria-hidden="true" data-testid="kfw-dock-offer">
          <span><PanelRight size={18} />{tr("วางที่นี่ เพื่อชิดขวา")}</span>
        </div>, document.body)}
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
        <Mascot gear="headset" mood={mood} size={MINI} animated={false} thoughtDots={false} />
      </button>
      {bubble && (
        <span ref={bubbleRef} key={bubbleKey} className={`kfw-mini-say lg-glass is-menu is-${side}`} role="status" onClick={onRestore}>
          {bubble}
        </span>
      )}
    </div>
  );
}
