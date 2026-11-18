# The plan cards' outfits in LINE (owner, 2026-11-18: "อยากให้กระรอกแต่งตัวเป็นคาแรคเตอร์อื่นได้", then "เป็นเสื้อใหญ่ๆ"):
# Pro the boss in a suit, Plus the office worker in a shirt and tie, Free the beginner in a tee and cap. Drawn over the
# official mascot poses (never redrawn): below the face, the fur and the cream belly are recoloured as clothing with
# their own shading kept (arms read as sleeves, paws stay fur), then collars, ties and the cap go on top. The face, ears,
# cheeks, tail, feet and props stay pixel for pixel. Run by render.mjs.
import os
import sys
import numpy as np
from PIL import Image, ImageDraw
LINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../frontend/public/line/')
OUT = sys.argv[1]
S = 4

def top_line(x, base=596, rise=0.95, dip=28, half=150):
    u = base + dip * np.clip(1 - ((x - 505) / half) ** 2, 0, 1)
    return np.where(x < 300, base - (300 - x) * rise, np.where(x > 712, base - (x - 712) * rise, u))
def neck_pts(dip=28, half=150, base=596):
    return [(x, base + dip * max(0.0, 1 - ((x - 505) / half) ** 2)) for x in range(505 - half, 505 + half + 1, 6)]

def outfit_mask(img, extra=None, feet=858, cream_x=(330, 700), paws=()):
    a = np.asarray(img).astype(float); r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    H, W = r.shape; yy, xx = np.mgrid[0:H, 0:W]
    L = 0.299 * r + 0.587 * g + 0.114 * b
    fur = (r > 120) & (r < 222) & (g / np.maximum(r, 1) > 0.5) & (g / np.maximum(r, 1) < 0.72) & (b / np.maximum(r, 1) < 0.45) & (b / np.maximum(r, 1) > 0.2)
    furw = np.clip((L - 84) / 26, 0, 1) * fur                       # soft against the darker tail
    cream = (r > 225) & (g > 210) & (b > 190) & (np.abs(r - b) < 40) & (xx > cream_x[0]) & (xx < cream_x[1])
    region = (yy > top_line(xx)) & (yy < feet)
    if extra is not None: region |= extra
    for cx, cy, rx, ry in paws: region &= ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 > 1
    ratio_b = b / np.maximum(r, 1)
    prop = ((r > 222) & (ratio_b < 0.32)) | (ratio_b < 0.2) | ((r > 225) & (g > 210) & (b > 190) & ((xx <= cream_x[0]) | (xx >= cream_x[1])))
    w = np.clip((L - 84) / 26, 0, 1) * region * (al > 0) * ~prop
    return w, L, cream & region

def recolor(img, w, L, cream, cloth, shirt=None, cream_ref=246.0, fur_ref=136.0):
    a = np.asarray(img).astype(float).copy()
    t = np.clip((L - fur_ref) / (cream_ref - fur_ref), 0, 1)
    f = (L / (fur_ref + t * (cream_ref - fur_ref)))[..., None]       # fur shading kept, belly and its edge flat
    col = np.array(cloth, float)
    new = np.clip(col * f, 0, 255)
    out = a.copy(); out[..., :3] = a[..., :3] * (1 - w[..., None]) + new * w[..., None]
    return Image.fromarray(out.astype(np.uint8), 'RGBA')

def poly_mask(size, pts):
    m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon(pts, fill=255); return np.asarray(m) > 0

def canvas(): return Image.new('RGBA', (1024 * S, 1024 * S), (0, 0, 0, 0))
def P(pts): return [(x * S, y * S) for x, y in pts]
def down(img): return img.resize((1024, 1024), Image.LANCZOS)
def ell(d, cx, cy, rx, fill, ry=None): ry = ry or rx; d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=fill)
def masked(layer, w):
    m = Image.fromarray((np.clip(w, 0, 1) * 255).astype(np.uint8), 'L')
    return Image.composite(down(layer), Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), m)

def tie(d, top, bottom, fill, stripe, cx=505):
    d.polygon(P([(cx - 15, top), (cx + 15, top), (cx + 10, top + 22), (cx - 10, top + 22)]), fill=stripe)
    d.polygon(P([(cx - 10, top + 22), (cx + 10, top + 22), (cx + 21, bottom - 26), (cx, bottom), (cx - 21, bottom - 26)]), fill=fill)
    for k in range(5):
        y = top + 40 + k * 28
        if y + 12 < bottom - 24: d.polygon(P([(cx - 18, y + 12), (cx + 18, y - 4), (cx + 19, y + 5), (cx - 17, y + 21)]), fill=stripe)

def collar(d, fill, line, cx=505, y=596, spread=62, drop=46):
    for side in (-1, 1):
        pts = [(cx + side * 3, y + 6), (cx + side * spread, y - 6), (cx + side * (spread - 14), y + drop)]
        d.polygon(P(pts), fill=fill); d.line(P(pts + [pts[0]]), fill=line, width=3 * S, joint='curve')

def pro():
    img = Image.open(LINE + 'mascot-v6-guide.png').convert('RGBA')
    sleeve = poly_mask(img.size, [(684, 600), (700, 470), (800, 470), (812, 600)])      # the raised arm, up to the paw
    w, L, cream = outfit_mask(img, sleeve, paws=[(470, 815, 46, 40)])
    out = recolor(img, w, L, cream, cloth=(66, 46, 38), shirt=(66, 46, 38))
    v = canvas(); d = ImageDraw.Draw(v)                                                  # shirt front in the V
    d.polygon(P([(440, 590), (570, 590), (505, 748)]), fill=(255, 252, 247, 255))
    for side in (-1, 1):
        d.polygon(P([(505 + side * 65, 590), (505 + side * 96, 596), (505 + side * 70, 660), (505 + side * 8, 756), (505, 748)]), fill=(92, 66, 54, 255))
    collar(d, (255, 255, 255, 255), (214, 204, 192, 255), spread=58, drop=42)
    tie(d, 600, 736, (244, 182, 63, 255), (201, 138, 11, 255))
    for y in (772, 806): ell(d, 505, y, 7, (38, 26, 21, 255))
    d.polygon(P([(380, 664), (424, 656), (420, 676), (384, 682)]), fill=(244, 182, 63, 255))
    out.alpha_composite(masked(v, (w > 0.5) | (np.asarray(img)[..., 3] > 200) & (np.mgrid[0:1024, 0:1024][0] > 585) & (np.mgrid[0:1024, 0:1024][0] < 860)))
    return out

def plus():
    img = Image.open(LINE + 'mascot-v6-report.png').convert('RGBA')
    sleeve = poly_mask(img.size, [(760, 600), (790, 476), (884, 470), (884, 520), (830, 600)])
    w, L, cream = outfit_mask(img, sleeve, paws=[(470, 815, 46, 40)])
    out = recolor(img, w, L, cream, cloth=(250, 244, 236), shirt=(255, 252, 248))
    v = canvas(); d = ImageDraw.Draw(v)
    d.line(P(neck_pts()), fill=(214, 202, 190, 255), width=4 * S, joint='curve')
    d.line(P([(505, 640), (505, 850)]), fill=(214, 202, 190, 255), width=3 * S)
    for y in (760, 800): ell(d, 505, y, 6, (214, 202, 190, 255))
    d.rounded_rectangle(P([(560, 660), (612, 708)]), radius=5 * S, outline=(206, 192, 178, 255), width=3 * S)
    d.line(P([(574, 646), (574, 690)]), fill=(194, 74, 22, 255), width=6 * S)
    collar(d, (255, 255, 255, 255), (200, 186, 172, 255))
    tie(d, 600, 744, (230, 95, 43, 255), (194, 74, 22, 255))
    d.line(P([(462, 600), (416, 640)]), fill=(230, 95, 43, 255), width=6 * S)            # lanyard and staff badge
    d.rounded_rectangle(P([(380, 636), (440, 702)]), radius=7 * S, fill=(255, 255, 255, 255), outline=(194, 74, 22, 255), width=3 * S)
    d.rectangle(P([(381, 637), (439, 654)]), fill=(230, 95, 43, 255))
    ell(d, 398, 674, 9, (232, 220, 208, 255)); d.line(P([(414, 668), (430, 668)]), fill=(196, 184, 172, 255), width=3 * S); d.line(P([(414, 682), (428, 682)]), fill=(196, 184, 172, 255), width=3 * S)
    out.alpha_composite(down(v))
    return out

def free():
    img = Image.open(LINE + 'mascot-v6-review.png').convert('RGBA')
    w, L, cream = outfit_mask(img, cream_x=(372, 676), paws=[(622, 668, 54, 38), (858, 684, 42, 42)])
    O, OD, RIB = (230, 95, 43), (194, 74, 22), (255, 241, 232)
    out = recolor(img, w, L, cream, cloth=O, shirt=O)
    v = canvas(); d = ImageDraw.Draw(v)
    d.line(P(neck_pts()), fill=RIB + (255,), width=12 * S, joint='curve')
    d.rounded_rectangle(P([(400, 690), (452, 740)]), radius=6 * S, fill=OD + (255,))
    d.line(P([(400, 703), (452, 703)]), fill=RIB + (255,), width=3 * S)
    out.alpha_composite(masked(v, w))
    cap = canvas(); d = ImageDraw.Draw(cap)
    d.ellipse([548 * S, 186 * S, 676 * S, 222 * S], fill=OD + (255,))
    d.pieslice([404 * S, 92 * S, 610 * S, 312 * S], 180, 360, fill=O + (255,))
    d.chord([404 * S, 92 * S, 610 * S, 312 * S], 180, 360, outline=OD + (255,), width=4 * S)
    d.rectangle(P([(406, 192), (608, 204)]), fill=OD + (255,))
    d.arc([452 * S, 96 * S, 560 * S, 300 * S], 180, 360, fill=OD + (255,), width=3 * S)
    ell(d, 507, 94, 10, OD + (255,))
    d.ellipse([440 * S, 130 * S, 484 * S, 166 * S], fill=RIB + (255,)); ell(d, 462, 148, 9, O + (255,))
    out.alpha_composite(down(cap))
    return out

for name, fn in (('pro', pro), ('plus', plus), ('free', free)):
    fn().save(f'{OUT}/outfit-{name}.png'); print(name, 'saved')
