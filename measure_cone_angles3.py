"""
Measures screen angles from verify_cones3 renders (clean — no character).
Uses ratio-based color detection to handle lighting variation.
"""
import pathlib, json, math
from PIL import Image
import numpy as np

CONE_DIR = pathlib.Path(__file__).parent / "meshyout" / "verify_cones3"
LABELS   = ["SE","S","SW","W","NW","N","NE","E"]

results = {}

for d in range(8):
    path = CONE_DIR / f"dir{d}_{LABELS[d]}.png"
    img  = Image.open(path).convert("RGBA")
    arr  = np.array(img, dtype=float)
    r, g, b, a = arr[...,0], arr[...,1], arr[...,2], arr[...,3]

    opaque = a > 100
    mx = np.maximum(np.maximum(r, g), b) + 1e-6

    # Cone: coral red — high R, G and B both < 145, R > G+90
    red_mask = opaque & (r > 220) & (g < 145) & (b < 125) & (r - g > 90)
    # Sphere: beige/tan — R and G both high and similar, B lower by 40+
    yel_mask = opaque & (r > 200) & (g > 190) & (r - b > 40) & (g - b > 40) & (np.abs(r - g) < 20)

    if red_mask.sum() == 0 or yel_mask.sum() == 0:
        print(f"dir{d}: red={red_mask.sum()} yellow={yel_mask.sum()} — SKIP")
        results[d] = None; continue

    ys_r, xs_r = np.where(red_mask);  cx_r = xs_r.mean(); cy_r = ys_r.mean()
    ys_y, xs_y = np.where(yel_mask);  cx_y = xs_y.mean(); cy_y = ys_y.mean()

    dx = cx_r - cx_y
    dy = cy_r - cy_y   # positive = cone is below sphere (screen y down)
    angle = math.degrees(math.atan2(dy, dx)) % 360
    results[d] = round(angle, 1)

    print(f"dir{d} ({LABELS[d]:>2}):  cone=({cx_r:.1f},{cy_r:.1f})  "
          f"sphere=({cx_y:.1f},{cy_y:.1f})  "
          f"d=({dx:+.1f},{dy:+.1f})  angle={angle:.1f} deg")

print()
print("Measured DIR_SCREEN_ANGLES:")
vals = [str(results[i]) if results[i] is not None else "null" for i in range(8)]
print(f"  [{', '.join(vals)}]")

out = CONE_DIR / "measured_angles.json"
with open(out, "w") as f:
    json.dump(results, f, indent=2)
print(f"\nWrote {out}")
