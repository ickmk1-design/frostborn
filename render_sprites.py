"""
Frostborn — Blender headless sprite renderer
Renders walk/idle animations in 8 isometric directions, transparent PNGs.

USAGE (run twice):
  blender --background --python render_sprites.py -- --anim walk
  blender --background --python render_sprites.py -- --anim idle

Outputs: meshyout/frames/<anim>/dir<D>_f<FFF>.png

CALIBRATION:
  Run with --dirs 1 first, check frame meshyout/frames/walk/dir0_f000.png.
  If the character faces the wrong direction, adjust BASE_ROT_Z below.
  The character should face screen-lower-right in dir0 (toward the camera).
"""

import bpy, math, sys, pathlib, argparse

# ── Parse args (Blender passes script args after "--") ────────────────────────
argv = sys.argv
script_args = argv[argv.index("--") + 1:] if "--" in argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--anim", choices=["walk", "idle", "chop", "carry_walk", "cheer"], required=True)
parser.add_argument("--dirs", type=int, default=8, help="How many directions (use 1 for calibration)")
parser.add_argument("--frame-size", type=int, default=192, help="Pixels per frame (square)")
parser.add_argument("--fps", type=int, default=12)
parser.add_argument("--character", default="worker", help="Character subfolder under meshyout (worker|hero|worker_new)")
args = parser.parse_args(script_args)

ROOT     = pathlib.Path(__file__).parent
CHAR_DIR = ROOT / "meshyout" if args.character == "worker" else ROOT / "meshyout" / args.character
GLB_MAP = {
    "walk":       CHAR_DIR / "character_walk.glb",
    "idle":       CHAR_DIR / "character_idle.glb",
    "chop":       CHAR_DIR / "character_chop.glb",
    "carry_walk": CHAR_DIR / "character_carry_walk.glb",
    "cheer":      CHAR_DIR / "character_cheer.glb",
}
OUT_DIR = CHAR_DIR / "frames" / args.anim
OUT_DIR.mkdir(parents=True, exist_ok=True)

GLB = GLB_MAP[args.anim]
if not GLB.exists():
    print(f"ERROR: {GLB} not found. Run meshy_pipeline.py first.")
    sys.exit(1)

# ── CALIBRATION — adjust if character faces wrong way ─────────────────────────
# Direction 0 should show the character's FRONT facing screen-lower-right.
# In Meshy's output the character faces +Z (glTF convention).
# After import into Blender (Y-up→Z-up conversion), the facing is typically +Y.
# Rotate so dir0 shows front facing the iso camera.
BASE_ROT_Z = math.radians(135)   # ← tweak if dir0 looks backward

# 8 directions: 0=SE (front), 1=S, 2=SW, 3=W, 4=NW(back), 5=N, 6=NE, 7=E
DIR_STEP   = (2 * math.pi) / 8   # 45° each step

# ── Isometric camera parameters (match game: TILE_W=80, TILE_H=40) ────────────
# elevation = arctan(TILE_H / TILE_W) = arctan(0.5) ≈ 26.565°
# Camera placed at azimuth 45° (NE), looking SW-down toward origin.
ELEV_RAD   = math.radians(32)         # slightly above 2:1 iso (26.5°) for better character visibility
AZIM_RAD   = math.radians(45)        # NE quadrant
CAM_DIST   = 12.0                    # world units (irrelevant for ortho, but must be > scene)
ORTHO_SCALE = 2.0                    # world units that fill the frame height

# ── Scene setup ───────────────────────────────────────────────────────────────
print("Clearing scene …")
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.film_transparent = True
scene.render.resolution_x = args.frame_size
scene.render.resolution_y = args.frame_size
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode  = "RGBA"
scene.render.image_settings.compression = 9
scene.render.fps = args.fps

# ── Import GLB ────────────────────────────────────────────────────────────────
print(f"Importing {GLB.name} …")
bpy.ops.import_scene.gltf(filepath=str(GLB))

# Find armature root
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if not armatures:
    print("ERROR: No armature found in GLB. Check Meshy output.")
    sys.exit(1)
arm = armatures[0]
arm.rotation_mode = "XYZ"
print(f"  Armature: {arm.name}  scale={tuple(round(v,3) for v in arm.scale)}")

# Blender's glTF importer bakes Y-up→Z-up into vertex data on import,
# so no extra X correction is needed here. Compute bounds at rest pose.
arm.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

arm_min_z = min((arm.matrix_world @ v.co).z
                for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH"
                for v in mesh_obj.data.vertices)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()

all_verts = [(arm.matrix_world @ v.co)
             for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH"
             for v in mesh_obj.data.vertices]
char_min_z = min(v.z for v in all_verts)
char_max_z = max(v.z for v in all_verts)
char_center_z = (char_min_z + char_max_z) / 2
print(f"  Z {char_min_z:.2f}..{char_max_z:.2f} center={char_center_z:.2f}")

# ── Camera ────────────────────────────────────────────────────────────────────
cam_data = bpy.data.cameras.new("IsoCamera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = ORTHO_SCALE
cam_obj  = bpy.data.objects.new("IsoCamera", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

import mathutils
cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cam_z = CAM_DIST * math.sin(ELEV_RAD)
cam_obj.location = (cam_x, cam_y, cam_z)

# Point camera at character center of mass (not ground level)
aim_z = char_center_z
direction = mathutils.Vector((0, 0, aim_z)) - cam_obj.location
rot_quat  = direction.to_track_quat("-Z", "Z")
cam_obj.rotation_euler = rot_quat.to_euler()
print(f"  Camera at ({cam_x:.2f},{cam_y:.2f},{cam_z:.2f}) aiming at Z={aim_z:.2f}")

# ── Lighting (soft, matches reference character style) ────────────────────────
def add_area_light(name, energy, location, color=(1, 1, 1), size=4.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.color  = color
    ld.size   = size
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = mathutils.Vector(location)
    # Point toward origin
    dir_to_origin = mathutils.Vector((0, 0, 0.5)) - lo.location
    lo.rotation_euler = dir_to_origin.to_track_quat("-Z", "Z").to_euler()
    return lo

# Key: warm light from upper-front (same direction as game camera but higher)
add_area_light("Key",  900, (-3, -3, 7),   color=(1.0, 0.97, 0.92), size=5)
# Fill: cool light from right side, weaker
add_area_light("Fill", 320, ( 5, -1, 4),   color=(0.85, 0.9, 1.0),  size=6)
# Rim: subtle back light to separate character from background
add_area_light("Rim",  180, (-1,  5, 3),   color=(0.8, 0.85, 0.95), size=4)

# World background: transparent (already set via film_transparent)
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs["Strength"].default_value = 0.05  # near-black ambient

# ── Animation range ───────────────────────────────────────────────────────────
# Get frame range from the first action on the armature
action = arm.animation_data.action if arm.animation_data else None
if not action:
    # Try NLA tracks
    if arm.animation_data and arm.animation_data.nla_tracks:
        track = arm.animation_data.nla_tracks[0]
        if track.strips:
            action = track.strips[0].action

if action:
    f_start = int(action.frame_range[0])
    f_end   = int(action.frame_range[1])
else:
    f_start, f_end = 1, 12
    print("  WARNING: No animation action found, using frames 1-12")

print(f"  Animation frames: {f_start}–{f_end}")
scene.frame_start = f_start
scene.frame_end   = f_end

# ── Render loop ───────────────────────────────────────────────────────────────
print(f"\nRendering {args.dirs} directions × {f_end - f_start + 1} frames "
      f"at {args.frame_size}×{args.frame_size}px …")

root_bone = arm.pose.bones[0]  # Hips — used to cancel root motion

for dir_idx in range(args.dirs):
    rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
    arm.rotation_euler = (0.0, 0.0, rot_z)
    arm.rotation_mode  = "XYZ"

    for frame in range(f_start, f_end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()

        # Cancel root motion: keep character centred at world XY origin
        rw = arm.matrix_world @ root_bone.head
        arm.location.x -= rw.x
        arm.location.y -= rw.y
        bpy.context.view_layer.update()

        rel_frame = frame - f_start
        out_path  = OUT_DIR / f"dir{dir_idx:02d}_f{rel_frame:03d}.png"
        scene.render.filepath = str(out_path)
        bpy.ops.render.render(write_still=True)
        print(f"  dir{dir_idx:02d} f{rel_frame:03d} → {out_path.name}")

        # Restore position for next frame's relative offset calculation
        arm.location.x += rw.x
        arm.location.y += rw.y

print(f"\nDone. {args.dirs * (f_end - f_start + 1)} frames written to {OUT_DIR}")
print("Next: py pack_sprites.py")
