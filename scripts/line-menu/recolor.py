"""The LINE chat menus in CI colours, from the menu pictures in use (owner, 2026-11-03: "ฟอนต์อันเดิม ไอคอนอันเดิม
แค่เปลี่ยนแค่สี ฟอนต์ขนาดเท่าเดิม"). Only colours move: every letter, icon and the squirrel keep their shapes and
places, and the squirrel keeps its own colours.

How: per tile, the background is the area of the tile's background colour that is joined to the tile's corners
(so the squirrel, which is a different colour, is never part of it). It is moved to the CI colour with its shading
kept (the old colour difference is carried over). Anti-aliased edges next to it move only as far as they are made of
background. Icons and small accents in the cream and peach tiles move from their old hue to the CI hue.

python3 scripts/line-menu/recolor.py
"""
from pathlib import Path
import colorsys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LINE = ROOT / 'frontend' / 'public' / 'line'
SOURCES = {6: LINE / 'secretary-richmenu.jpg', 5: LINE / 'richmenu-everyone-2026-10-24.jpg'}
OUT = {6: LINE / 'richmenu-ci-6-2026-11-03.jpg', 5: LINE / 'richmenu-ci-5-2026-11-03.jpg'}

def hexrgb(value):
    value = value.lstrip('#')
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)

CI_TOP, CI_MID, CI_DEEP = hexrgb('#E2672F'), hexrgb('#B8481A'), hexrgb('#8F3416')  # the LINE card band
RUST, RUST_DEEP = hexrgb('#A63F1B'), hexrgb('#842F12')
CREAM, PEACH, PEACH_STRONG = hexrgb('#FFF1E8'), hexrgb('#FBE3D5'), hexrgb('#FFDDC9')
CI_HUE = 18 / 360  # CI orange (a touch warmer than #E65F2B's 16 deg, so pale shades read orange, not pink)

def gradient(h, w, start, end):
    """A diagonal blend from the top-left corner to the bottom-right."""
    y, x = np.mgrid[0:h, 0:w]
    t = ((x / max(w - 1, 1)) + (y / max(h - 1, 1))) / 2
    return start + (end - start) * t[..., None]

def connected(core, seeds):
    """The part of `core` joined to the seed points (4-neighbour steps)."""
    region = np.zeros_like(core)
    for y, x in seeds:
        if core[y, x]: region[y, x] = True
    while True:
        grown = region.copy()
        grown[1:, :] |= region[:-1, :]; grown[:-1, :] |= region[1:, :]
        grown[:, 1:] |= region[:, :-1]; grown[:, :-1] |= region[:, 1:]
        grown &= core
        if (grown == region).all(): return region
        region = grown

def dilate(mask, steps):
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]; grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]; grown[:, :-1] |= out[:, 1:]
        out = grown
    return out

def background_shift(tile, base, target, tolerance=20, family=()):
    """Move the tile's background (and lighter or darker shades of it listed in `family`) to `target`, keeping each
    pixel's difference from the old background, so shading and soft shapes stay as they were."""
    h, w, _ = tile.shape
    # Distance to the background colour, or to any blend of it with a family shade (the wave's soft edge is one).
    distances = [np.linalg.norm(tile - base, axis=2)]
    for shade in family:
        along = shade - base
        t = np.clip(np.einsum('hwc,c->hw', tile - base, along) / max(float(along @ along), 1.0), 0, 1)
        distances.append(np.linalg.norm(tile - (base + t[..., None] * along), axis=2))
    distance = np.min(distances, axis=0)
    seeds = [(4, 4), (4, w - 5), (h - 5, 4), (h - 5, w - 5), (h // 2, 4), (4, w // 2)]
    region = connected(distance < tolerance, seeds)
    # Edge pixels are a blend of the background and what is next to it (a letter, the squirrel). Find that neighbour's
    # colour by carrying the colours from beyond the edge inwards, then measure how much of the pixel is background
    # and move it by exactly that much, so no lighter or darker rim is left.
    band = dilate(region, 4) & ~region
    known = ~(region | band)
    fg = np.where(known[..., None], tile, 0.0)
    filled = known.copy()
    for _ in range(6):
        total = np.zeros_like(tile); count = np.zeros((h, w))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src_y = slice(max(0, -dy), h - max(0, dy)); dst_y = slice(max(0, dy), h - max(0, -dy))
            src_x = slice(max(0, -dx), w - max(0, dx)); dst_x = slice(max(0, dx), w - max(0, -dx))
            total[dst_y, dst_x] += fg[src_y, src_x] * filled[src_y, src_x][..., None]
            count[dst_y, dst_x] += filled[src_y, src_x]
        fresh = band & ~filled & (count > 0)
        fg[fresh] = total[fresh] / count[fresh][:, None]
        filled |= fresh
    weight = region.astype(float)
    ys, xs = np.nonzero(band & filled)
    away = base - fg[ys, xs]
    share = np.einsum('ij,ij->i', tile[ys, xs] - fg[ys, xs], away) / np.maximum(np.einsum('ij,ij->i', away, away), 1)
    weight[ys, xs] = np.clip(share, 0, 1)
    shifted = tile + (target - base)
    return tile * (1 - weight[..., None]) + shifted * weight[..., None], region

def hue_to_ci(tile, mask, keep_dark=0.42):
    """Icons and accents: the old hue becomes the CI hue and pale greys and tans gain the CI's colour; lightness
    stays, so the drawing stays the same. Dark text (value below `keep_dark`) and near-white paper are left alone."""
    out = tile.copy()
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        r, g, b = tile[y, x] / 255
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if v < keep_dark or s < 0.035: continue
        tinted = min(1.0, max(s * 1.8, 0.42)) if s >= 0.12 else min(1.0, s * 1.8)
        out[y, x] = np.array(colorsys.hsv_to_rgb(CI_HUE, tinted, v)) * 255
    return out

def tiles_for(kind):
    top = {'add': (18, 18, 1432, 1102), 'due': (1468, 18, 2482, 542), 'month': (1468, 578, 2482, 1102)}
    bottom = ({'attach': (18, 1138, 815, 1668), 'progress': (851, 1138, 1649, 1668), 'open': (1685, 1138, 2482, 1668)} if kind == 6
              else {'progress': (18, 1138, 1232, 1668), 'open': (1268, 1138, 2482, 1668)})
    return {**top, **bottom}

def median_colour(tile, box):
    x0, y0, x1, y1 = box
    return np.median(tile[y0:y1, x0:x1].reshape(-1, 3), axis=0)

def recolor(kind):
    image = np.asarray(Image.open(SOURCES[kind]).convert('RGB')).astype(float)
    out = image.copy()
    for name, (x0, y0, x1, y1) in tiles_for(kind).items():
        tile = image[y0:y1, x0:x1]
        h, w, _ = tile.shape
        base = median_colour(tile, (20, h - 60, 80, h - 20)) if name != 'add' else median_colour(tile, (40, 380, 160, 440))
        if name == 'add':
            wave = median_colour(tile, (14, 905, 40, 925))
            new, _ = background_shift(tile, base, gradient(h, w, CI_TOP, CI_MID), tolerance=12, family=(wave,))
        elif name == 'due':
            new, _ = background_shift(tile, base, gradient(h, w, RUST, RUST_DEEP), tolerance=12)
        else:
            target = CREAM if name == 'month' else PEACH_STRONG if name == 'attach' else PEACH
            new, region = background_shift(tile, base, target, tolerance=10)
            # The chart, icons and the green or brown subtitle: CI hue, same lightness. Dark titles stay.
            new = hue_to_ci(new, ~dilate(region, 1))
        out[y0:y1, x0:x1] = new
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT[kind], quality=92, optimize=True)
    print(OUT[kind].name, OUT[kind].stat().st_size)

if __name__ == '__main__':
    for kind in (6, 5): recolor(kind)
