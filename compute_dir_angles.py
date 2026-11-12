"""
Computes the screen-space angle (right=0°, down=90°) that each direction index
renders the character's forward vector at, given the render_sprites.py camera setup.

No Blender required — pure Python geometry.

Derivation:
  Character local forward = -Y (Blender GLB default after identity import).
  For dir_idx: rot_z = BASE_ROT_Z + DIR_STEP * dir_idx  (pure Rz rotation)
  World forward = Rz(rot_z) @ (0,-1,0) = (sin(rot_z), -cos(rot_z), 0)

  Camera basis from to_track_quat("-Z", "Y"):
    F          = normalize(cam_pos → origin) = -cam_pos/|cam_pos|
    right      = normalize(F × world_Y)
    up         = normalize((-F) × right)   [camera +Y, right-handed]

  Screen projection (screen Y positive = down in HTML canvas):
    sx = dot(world_forward, right)
    sy = -dot(world_forward, up)   [negate: Blender Y-up → screen Y-down]
    angle = atan2(sy, sx)  [right=0°, down=90°]
"""

import math, json

# ── render_sprites.py parameters ─────────────────────────────────────────────
ELEV_RAD   = math.radians(36)
AZIM_RAD   = math.radians(45)
BASE_ROT_Z = math.radians(135)
DIR_STEP   = 2 * math.pi / 8

# ── Camera geometry ───────────────────────────────────────────────────────────
def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def dot(a, b):
    return sum(x*y for x,y in zip(a,b))
def norm(v):
    m = math.sqrt(sum(x*x for x in v))
    return tuple(x/m for x in v)

# Unit-distance camera position
cx = math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cy = math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cz = math.sin(ELEV_RAD)

# Camera -Z (forward into scene)
F = (-cx, -cy, -cz)  # already unit length (cos²+sin²=1)

world_Y = (0.0, 1.0, 0.0)
camera_right = norm(cross(F, world_Y))
camera_up    = norm(cross(tuple(-x for x in F), camera_right))

print(f"Camera right : ({camera_right[0]:+.4f}, {camera_right[1]:+.4f}, {camera_right[2]:+.4f})")
print(f"Camera up    : ({camera_up[0]:+.4f}, {camera_up[1]:+.4f}, {camera_up[2]:+.4f})")
print()

# ── Per-direction screen angles ───────────────────────────────────────────────
result = {}
print(f"{'dir':>4}  {'label':>5}  {'rot_z':>7}  {'world_fwd':>22}  {'screen_angle':>13}")
print("-" * 70)
labels = ["SE","S","SW","W","NW","N","NE","E"]

for d in range(8):
    rot_z = BASE_ROT_Z + DIR_STEP * d
    wfx = math.sin(rot_z)
    wfy = -math.cos(rot_z)
    # wfz = 0 (horizontal plane only)
    wf  = (wfx, wfy, 0.0)

    sx = dot(wf, camera_right)
    sy = -dot(wf, camera_up)   # negate for screen Y-down

    angle = math.degrees(math.atan2(sy, sx)) % 360
    result[d] = round(angle, 1)
    print(f"  {d:>2}  {labels[d]:>5}  {math.degrees(rot_z):>6.1f}°  "
          f"({wfx:+.4f},{wfy:+.4f},0)  {angle:>8.1f}°")

print()
print("DIR_SCREEN_ANGLES for GameScene.ts (index 0..7):")
vals = ", ".join(f"{result[i]}" for i in range(8))
print(f"  [{vals}]")

out = "dir_angles.json"
with open(out, "w") as f:
    json.dump({"note": "screen angle (right=0, down=90) each dir index faces; from render_sprites.py geometry",
               "elev_deg": 32, "azim_deg": 45, "base_rot_z_deg": 135,
               "angles": result}, f, indent=2)
print(f"\nWrote {out}")
