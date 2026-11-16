// Where the floating เลขากระรอก window may sit (owner's brief "FLOATING TOP MASCOT CHAT UI V2", 2026-10-26): inside the
// screen, with room above it for the squirrel perched on its top edge, and, while a document preview is open, clear
// of the document and its buttons. Pure geometry, so it can be tested without a browser.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

/** Space kept between the window (or the squirrel above it) and the edge of the screen. */
export const EDGE = 12;
/** The smallest window the chat still reads well in. */
export const MIN_SIZE: Size = { w: 320, h: 400 };
/** The window when nothing has been saved yet. */
export const DEFAULT_SIZE: Size = { w: 400, h: 620 };
const MAX_W = 1100;

/** The squirrel's artwork size for a window this wide: it shrinks with narrow windows and stays centred. */
export const mascotSizeFor = (width: number) => Math.round(Math.min(136, Math.max(96, width * 0.34)));
/** How far the squirrel rises above the window's top edge (its paws rest on the edge at 64% of the artwork). */
export const overhangFor = (width: number) => Math.round(mascotSizeFor(width) * 0.64);

/** The rectangle the window really takes, the squirrel above it included. */
export const footprint = (rect: Rect): Rect => {
  const up = overhangFor(rect.w);
  return { x: rect.x, y: rect.y - up, w: rect.w, h: rect.h + up };
};

export const intersects = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Inside the screen, no smaller than MIN_SIZE when the screen allows, with the squirrel's room kept at the top. */
export function clampRect(rect: Rect, view: Size): Rect {
  const w = Math.round(Math.min(Math.max(rect.w, Math.min(MIN_SIZE.w, view.w - 2 * EDGE)), view.w - 2 * EDGE, MAX_W));
  const top = EDGE + overhangFor(w);
  const h = Math.round(Math.min(Math.max(rect.h, Math.min(MIN_SIZE.h, view.h - top - EDGE)), view.h - top - EDGE));
  const x = Math.round(Math.min(Math.max(rect.x, EDGE), view.w - w - EDGE));
  const y = Math.round(Math.min(Math.max(rect.y, top), view.h - h - EDGE));
  return { x, y, w, h };
}

/**
 * Docked at the right (owner, 2026-11-16): from the top to the bottom, against the screen's right edge, in one of two ways.
 * - 'side': the page makes room (computers, iPads lying down). From `DOCK.from` the page card (the sidebar then shows its
 *   icons only) keeps at least `DOCK.page` px beside it, as much as a computer's page is laid out for; on iPads lying down
 *   (`TABLET_DOCK.side` up to `DOCK.from`) it keeps `TABLET_DOCK.page` px, so the chat starts narrower there.
 *   Never narrower than `DOCK.min`: its head (squirrel, name, tokens and four buttons) needs that much.
 * - 'over': iPads upright and narrow windows (owner, 2026-11-16: "ปรับใช้ในมุมมอง iPad ด้วยนะ"): a page beside the chat would
 *   be narrower than a phone's, so the sheet lies over the page's right side and the page keeps its own layout.
 */
export const DOCK = { from: 1200, width: 420, min: 340, max: 600, page: 860 };
export const TABLET_DOCK = { side: 1080, over: 744, page: 780, overShare: 0.48 };
export type DockMode = 'side' | 'over';
/** How the chat docks on a screen this size; null where it never docks (phones keep their own sheet). */
export const dockMode = (view: Size): DockMode | null => view.w >= TABLET_DOCK.side ? 'side' : view.w >= TABLET_DOCK.over ? 'over' : null;
export function dockWidth(width: number, view: Size) {
  if (view.w >= DOCK.from) return Math.round(Math.max(DOCK.min, Math.min(width, DOCK.max, view.w - DOCK.page - 2 * EDGE)));
  if (dockMode(view) === 'side') return Math.round(Math.max(DOCK.min, Math.min(width, DOCK.max, view.w - TABLET_DOCK.page - 2 * EDGE)));
  return Math.round(Math.max(DOCK.min, Math.min(width, DOCK.max, view.w * TABLET_DOCK.overShare)));
}
/** Docked: from the very top to the very bottom against the right edge, like the app's side sheets (owner, 2026-11-16:
 *  "ขึ้นมายาวๆแบบนี้เลย"). */
export function dockRect(width: number, view: Size): Rect {
  const w = dockWidth(width, view);
  return { x: view.w - w, y: 0, w, h: view.h };
}

/** Bottom right, where the "ถามเลขากระรอก" pill is, sized for the screen. */
export function defaultRect(view: Size): Rect {
  const w = Math.min(DEFAULT_SIZE.w, view.w - 2 * EDGE - 24);
  const h = Math.min(DEFAULT_SIZE.h, view.h - EDGE - overhangFor(w) - 24 - EDGE);
  return clampRect({ x: view.w - w - 24, y: view.h - h - 24, w, h }, view);
}

const clear = (rect: Rect, obstacles: Rect[], gap: number) => obstacles.every(block => !intersects(footprint(rect), block, gap));
const distance = (a: Rect, b: Rect) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A place for the window that covers none of the obstacles (document previews and their buttons), nearest to where it
 * is: first at its own size, then smaller, down to MIN_SIZE. null when no such place exists, and the chat should fold
 * into the squirrel instead.
 */
export function clearRect(rect: Rect, obstacles: Rect[], view: Size, gap = 12): Rect | null {
  const blocks = obstacles.filter(block => block.w > 0 && block.h > 0);
  if (clear(clampRect(rect, view), blocks, gap)) return clampRect(rect, view);
  const sizes: Size[] = [];
  for (let k = 1; k >= 0; k -= 0.125) {
    const size = { w: Math.round(MIN_SIZE.w + (rect.w - MIN_SIZE.w) * k), h: Math.round(MIN_SIZE.h + (rect.h - MIN_SIZE.h) * k) };
    if (!sizes.some(item => item.w === size.w && item.h === size.h)) sizes.push(size);
  }
  for (const size of sizes) {
    const up = overhangFor(size.w);
    const xs = [EDGE, view.w - size.w - EDGE, rect.x, ...blocks.flatMap(block => [block.x - size.w - gap - 1, block.x + block.w + gap + 1])];
    const ys = [EDGE + up, view.h - size.h - EDGE, rect.y, ...blocks.flatMap(block => [block.y - size.h - gap - 1, block.y + block.h + gap + up + 1])];
    const spots = xs.flatMap(x => ys.map(y => clampRect({ x, y, ...size }, view)))
      .filter(spot => spot.w === size.w && spot.h === size.h && clear(spot, blocks, gap))
      .sort((a, b) => distance(a, rect) - distance(b, rect));
    if (spots.length) return spots[0];
  }
  return null;
}

/** Where a point-like thing (the folded squirrel) can sit clear of the obstacles, nearest to where it was. */
export function clearSpot(spot: Rect, obstacles: Rect[], view: Size, gap = 12): Rect {
  const fits = (r: Rect) => r.x >= EDGE && r.y >= EDGE && r.x + r.w <= view.w - EDGE && r.y + r.h <= view.h - EDGE;
  const start = { ...spot, x: Math.min(Math.max(spot.x, EDGE), view.w - spot.w - EDGE), y: Math.min(Math.max(spot.y, EDGE), view.h - spot.h - EDGE) };
  if (obstacles.every(block => !intersects(start, block, gap))) return start;
  const xs = [EDGE, view.w - spot.w - EDGE, ...obstacles.flatMap(block => [block.x - spot.w - gap - 1, block.x + block.w + gap + 1])];
  const ys = [EDGE, view.h - spot.h - EDGE, start.y, ...obstacles.flatMap(block => [block.y - spot.h - gap - 1, block.y + block.h + gap + 1])];
  const options = xs.flatMap(x => ys.map(y => ({ ...spot, x, y }))).filter(r => fits(r) && obstacles.every(block => !intersects(r, block, gap)))
    .sort((a, b) => distance(a, start) - distance(b, start));
  return options[0] ?? start;
}

/** Which side of the folded squirrel its words go: the side with room that covers no obstacle, left first. */
export function bubbleSide(anchor: Rect, bubble: Size, obstacles: Rect[], view: Size): 'left' | 'right' | 'above' | 'none' {
  const gap = 10;
  const cy = anchor.y + anchor.h / 2 - bubble.h / 2;
  const options: [('left' | 'right' | 'above'), Rect][] = [
    ['left', { x: anchor.x - gap - bubble.w, y: cy, ...bubble }],
    ['right', { x: anchor.x + anchor.w + gap, y: cy, ...bubble }],
    ['above', { x: anchor.x + anchor.w / 2 - bubble.w / 2, y: anchor.y - gap - bubble.h, ...bubble }],
  ];
  const fits = (r: Rect) => r.x >= EDGE && r.y >= EDGE && r.x + r.w <= view.w - EDGE && r.y + r.h <= view.h - EDGE;
  return options.find(([, r]) => fits(r) && obstacles.every(block => !intersects(r, block, 4)))?.[0] ?? 'none';
}
