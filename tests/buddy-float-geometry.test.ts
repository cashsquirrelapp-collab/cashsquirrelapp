import test from 'node:test';
import assert from 'node:assert/strict';
import { bubbleSide, clampRect, clearRect, clearSpot, defaultRect, EDGE, footprint, intersects, mascotSizeFor, maximizedRect, MIN_SIZE, overhangFor } from '../frontend/src/features/assistant/floatGeometry.js';

// The floating เลขากระรอก window (owner's brief "FLOATING TOP MASCOT CHAT UI V2", 2026-10-26): where it may sit.
const view = { w: 1280, h: 820 };
const inside = (r: { x: number; y: number; w: number; h: number }) => r.x >= EDGE && r.x + r.w <= view.w - EDGE && r.y - overhangFor(r.w) >= EDGE && r.y + r.h <= view.h - EDGE;

test('the squirrel scales with the window and rises 64% of its size above the edge', () => {
  assert.equal(mascotSizeFor(400), 136);
  assert.equal(mascotSizeFor(320), 109);
  assert.equal(mascotSizeFor(200), 96);
  assert.equal(overhangFor(400), 87);
  assert.deepEqual(footprint({ x: 10, y: 200, w: 400, h: 500 }), { x: 10, y: 113, w: 400, h: 587 });
});

test('the window stays inside the screen with room for the squirrel, and never below its smallest size', () => {
  for (const rect of [{ x: -500, y: -500, w: 400, h: 600 }, { x: 5000, y: 5000, w: 400, h: 600 }, { x: 100, y: 100, w: 100, h: 100 }, { x: 0, y: 0, w: 4000, h: 4000 }]) {
    const r = clampRect(rect, view);
    assert.ok(inside(r), JSON.stringify(r));
    assert.ok(r.w >= MIN_SIZE.w && r.h >= MIN_SIZE.h);
    assert.ok(r.w <= 1100);
  }
  // A small screen still fits the window, smaller than usual.
  const tiny = clampRect({ x: 0, y: 0, w: 400, h: 620 }, { w: 300, h: 420 });
  assert.ok(tiny.w <= 300 - 2 * EDGE && tiny.y + tiny.h <= 420 - EDGE);
});

test('it starts at the bottom right, where the pill is, and maximises large and centred', () => {
  const d = defaultRect(view);
  assert.deepEqual(d, { x: 856, y: 176, w: 400, h: 620 });
  const m = maximizedRect(view);
  assert.equal(m.w, 1100); assert.equal(Math.round(m.x + m.w / 2), 640);
  assert.ok(inside(m));
});

test('a preview: the window moves beside it at its own size, the squirrel included, nearest to where it was', () => {
  const rect = defaultRect(view);
  const preview = { x: 640, y: 0, w: 640, h: 820 };
  const spot = clearRect(rect, [preview], view)!;
  assert.equal(spot.w, rect.w); assert.equal(spot.h, rect.h);
  assert.equal(intersects(footprint(spot), preview, 12), false);
  assert.ok(spot.x + spot.w <= 640 - 12);
  assert.ok(inside(spot));
  // Already clear: it stays exactly where it is.
  assert.deepEqual(clearRect(rect, [{ x: 0, y: 0, w: 300, h: 300 }], view), rect);
});

test('not enough room at its size: it shrinks, and with no room at all the chat folds into the squirrel', () => {
  const rect = defaultRect(view);
  const wide = { x: 380, y: 0, w: 900, h: 820 }; // 380px free on the left: too narrow for 400, enough for a smaller window
  const spot = clearRect(rect, [wide], view)!;
  assert.ok(spot.w < rect.w && spot.w >= MIN_SIZE.w);
  assert.equal(intersects(footprint(spot), wide, 12), false);
  assert.equal(clearRect(rect, [{ x: 100, y: 0, w: 1180, h: 820 }], view), null);
});

test('the folded squirrel finds a free corner, and its words go to a side with room that covers no preview', () => {
  const spot = clearSpot({ x: 1176, y: 716, w: 76, h: 76 }, [{ x: 600, y: 300, w: 680, h: 520 }], view);
  assert.equal(intersects(spot, { x: 600, y: 300, w: 680, h: 520 }, 12), false);
  assert.ok(spot.x >= EDGE && spot.y >= EDGE && spot.x + spot.w <= view.w - EDGE && spot.y + spot.h <= view.h - EDGE);
  const anchor = { x: 1176, y: 716, w: 76, h: 76 };
  assert.equal(bubbleSide(anchor, { w: 240, h: 56 }, [], view), 'left');
  assert.equal(bubbleSide({ x: 20, y: 400, w: 76, h: 76 }, { w: 240, h: 56 }, [], view), 'right');
  assert.equal(bubbleSide({ x: 600, y: 716, w: 76, h: 76 }, { w: 240, h: 56 }, [{ x: 300, y: 712, w: 290, h: 100 }, { x: 686, y: 712, w: 300, h: 100 }], view), 'above');
  assert.equal(bubbleSide(anchor, { w: 240, h: 56 }, [{ x: 0, y: 0, w: 1280, h: 712 }, { x: 900, y: 700, w: 270, h: 120 }], view), 'none');
});
