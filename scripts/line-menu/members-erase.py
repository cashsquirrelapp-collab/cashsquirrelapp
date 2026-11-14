# The members' LINE menu with its new buttons (owner, 2026-11-14: บันทึก · ส่งสลิป · ออกเอกสาร in place of เพิ่มงาน ·
# แนบเอกสาร · กำลังดำเนินงาน): step 1 covers the old words of those three tiles (and the box icon) with each tile's own
# background, worked out from the pixels around them, so the picture, the squirrel and the other tiles stay as they are.
#   python3 scripts/line-menu/members-erase.py <2026-11-03 picture> <out.png>   (render-members.mjs runs it)
import sys
from PIL import Image
import numpy as np
src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB')).astype(float)
def smooth_border(x0, y0, x1, y1):
    for y in (y0, y1): a[y, x0:x1 + 1] = np.median(a[y - 2:y + 3, x0:x1 + 1], axis=0)
    for x in (x0, x1): a[y0:y1 + 1, x] = np.median(a[y0:y1 + 1, x - 2:x + 3], axis=1)
def coons(x0, y0, x1, y1):
    top, bot, lef, rig = a[y0, x0:x1 + 1].copy(), a[y1, x0:x1 + 1].copy(), a[y0:y1 + 1, x0].copy(), a[y0:y1 + 1, x1].copy()
    v = np.linspace(0, 1, y1 - y0 + 1)[:, None, None]; u = np.linspace(0, 1, x1 - x0 + 1)[None, :, None]
    P = (1 - v) * top[None] + v * bot[None] + (1 - u) * lef[:, None] + u * rig[:, None]
    C = (1 - u) * (1 - v) * a[y0, x0] + u * (1 - v) * a[y0, x1] + (1 - u) * v * a[y1, x0] + u * v * a[y1, x1]
    a[y0:y1 + 1, x0:x1 + 1] = P - C
for box in [(92, 98, 660, 360), (128, 1438, 580, 1600), (948, 1436, 1505, 1600), (1085, 1178, 1395, 1428)]:
    smooth_border(*box); coons(*box)
Image.fromarray(np.clip(a, 0, 255).astype('uint8')).save(out)
