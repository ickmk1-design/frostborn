"""
Measures cone screen angles from verify_cones2 renders.
Uses yellow sphere centroid as origin, red cone centroid as direction.
"""
import pathlib, json, math
from PIL import Image
import numpy as np

CONE_DIR = pathlib.Path(__file__).parent / "meshyout" / "verify_cones2"
LABELS   = ["SE","S","SW","W","NW","N","NE","E"]

results = {}

for d in range(8):
    path = CONE_DIR / f"dir{d}_{LABELS[d]}.png"
    img  = Image.open(path).convert("RGBA")
    arr  = np.array(img)
    r, g, b, a = arr[...,0], arr[...,1], arr[...,2], arr[...,3]

    # Red cone: high R, low G, low B
    red_mask    = (r > 150) & (g < 80)  & (b < 80)  & (a > 128)
    # Yellow sphere: high R, high G, low B
    yellow_mask = (r > 180) & (g > 180) & (b < 80)  & (a > 128)

    if red_mask.sum() == 0:
        print(f"dir{d}: no red pixels"); results[d] = None; continue
    if yellow_mask.sum() == 0:
        print(f"dir{d}: no yellow pixels — using image center");
        H, W = arr.shape[:2]; ref_cx, ref_cy = W/2.0, H/2.0
    else:
        ys, xs = np.where(yellow_mask)
        ref_cx = xs.mean(); ref_cy = ys.mean()

    ys, xs = np.where(red_mask)
    cone_cx = xs.mean(); cone_cy = ys.mean()

    dx = cone_cx - ref_cx
    dy = cone_cy - ref_cy
    angle = math.degrees(math.atan2(dy, dx)) % 360
    results[d] = round(angle, 1)
    print(f"dir{d} ({LABELS[d]:>2}):  cone=({cone_cx:.1f},{cone_cy:.1f})  "
          f"ref=({ref_cx:.1f},{ref_cy:.1f})  d=({dx:+.1f},{dy:+.1f})  "
          f"angle={angle:.1f}°")

print()
print("Measured DIR_SCREEN_ANGLES for velToDir:")
vals = [str(results[i]) if results[i] is not None else "null" for i in range(8)]
print(f"  [{', '.join(vals)}]")

out = CONE_DIR / "measured_angles.json"
with open(out, "w") as f:
    json.dump(results, f, indent=2)
print(f"\nWrote {out}")
