"""Normalize all character pose PNGs to a consistent square canvas, feet at bottom.
   All images end up the same pixel size so setOrigin(0.5, 1.0) never jitters."""
from PIL import Image
import numpy as np
from pathlib import Path

ASSETS = Path(r"C:\Users\ickmk\Frostborn\game\public\assets")
KEYS = [
    "character_survivor_worker_01",
    "character_survivor_walk_left",
    "character_survivor_walk_right",
    "character_survivor_back_idle",
    "character_survivor_back_left",
    "character_survivor_back_right",
]
ALPHA_THRESH = 12
PAD = 14   # transparent padding around content on all sides

boxes = {}
for key in KEYS:
    p = ASSETS / f"{key}.png"
    if not p.exists():
        print(f"SKIP (missing): {key}")
        continue
    arr = np.array(Image.open(p).convert("RGBA"))
    a = arr[:, :, 3]
    rows = np.where(a.max(axis=1) > ALPHA_THRESH)[0]
    cols = np.where(a.max(axis=0) > ALPHA_THRESH)[0]
    if not rows.size or not cols.size:
        print(f"SKIP (blank): {key}")
        continue
    r0, r1 = rows[0], rows[-1]
    c0, c1 = cols[0], cols[-1]
    h, w = r1 - r0 + 1, c1 - c0 + 1
    boxes[key] = (arr, r0, r1, c0, c1, h, w)
    print(f"  {key}: content {w}x{h}")

if not boxes:
    print("No images found.")
    raise SystemExit(1)

max_dim = max(max(v[5], v[6]) for v in boxes.values())
canvas_size = max_dim + PAD * 2
print(f"\nCanvas size: {canvas_size}x{canvas_size}  (max content dim={max_dim})")

for key, (arr, r0, r1, c0, c1, h, w) in boxes.items():
    content = arr[r0:r1+1, c0:c1+1]
    canvas = np.zeros((canvas_size, canvas_size, 4), dtype=np.uint8)
    x_off = (canvas_size - w) // 2
    y_off = canvas_size - PAD - h   # feet at bottom, leaving PAD at bottom edge
    if y_off < 0:
        # Taller than canvas — crop top
        content = content[-y_off:]
        h += y_off; y_off = 0
    canvas[y_off:y_off+h, x_off:x_off+w] = content
    Image.fromarray(canvas).save(ASSETS / f"{key}.png", "PNG")
    print(f"  Saved {key}.png  ({canvas_size}x{canvas_size})")

print(f"\nDone. In-game: setOrigin(0.5, 1.0), setDisplaySize uses canvas {canvas_size}.")
