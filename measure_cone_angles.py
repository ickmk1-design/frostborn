"""
Measures the screen angle of each direction by finding:
  1. The centroid of the red cone pixels in each render
  2. The centroid of the character (all opaque non-red pixels)
  3. angle = atan2(cone_cy - char_cy, cone_cx - char_cx)
     (screen convention: right=0°, down=90°)

Writes measured_dir_angles.json with the results.
"""
import pathlib, json, math
try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("pip install Pillow numpy"); raise

CONE_DIR = pathlib.Path(__file__).parent / "meshyout" / "verify_cones"
LABELS   = ["SE","S","SW","W","NW","N","NE","E"]

results = {}

for d in range(8):
    path = CONE_DIR / f"dir{d}_{LABELS[d]}.png"
    img  = Image.open(path).convert("RGBA")
    arr  = np.array(img)  # shape (H, W, 4)

    r, g, b, a = arr[...,0], arr[...,1], arr[...,2], arr[...,3]

    # Red cone: high R, low G, low B, opaque
    red_mask  = (r > 160) & (g < 80) & (b < 80) & (a > 128)
    # Character body: opaque AND not red
    char_mask = (a > 128) & ~red_mask

    if red_mask.sum() == 0:
        print(f"dir{d}: NO red pixels found — cone hidden (facing away from camera)")
        results[d] = None
        continue

    ys, xs = np.where(red_mask)
    cone_cx = xs.mean();  cone_cy = ys.mean()

    # Reference = IMAGE CENTER: the ortho camera aims at world origin (0,0,chest_z)
    # which projects to the exact center of the render frame.
    H, W = arr.shape[:2]
    ref_cx = W / 2.0
    ref_cy = H / 2.0

    dx = cone_cx - ref_cx
    dy = cone_cy - ref_cy   # positive = cone is BELOW center (screen y down)
    angle = math.degrees(math.atan2(dy, dx)) % 360

    print(f"dir{d} ({LABELS[d]:>2}): cone=({cone_cx:.0f},{cone_cy:.0f})  "
          f"center=({ref_cx:.0f},{ref_cy:.0f})  "
          f"delta=({dx:+.0f},{dy:+.0f})  angle={angle:.1f}°")
    results[d] = round(angle, 1)

print()
print("Measured DIR_SCREEN_ANGLES for GameScene.ts:")
vals = []
for i in range(8):
    vals.append(str(results[i]) if results[i] is not None else "null")
print(f"  [{', '.join(vals)}]")

out = CONE_DIR / "measured_dir_angles.json"
with open(out, "w") as f:
    json.dump({"measured_from": "cone centroid vs character centroid in verify_cones renders",
               "screen_convention": "right=0deg, down=90deg",
               "angles": results}, f, indent=2)
print(f"\nWrote {out}")
