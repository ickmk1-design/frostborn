"""
render_animal.py — Renders ALL animations for wolf/deer in one Blender session.

Key improvements over render_wolf.py:
  - Auto-computes ortho_scale from bounding box across ALL frames × ALL dirs
    so heads/tails are never clipped (10% margin on every side).
  - Optional --elev override (default 36° for quadrupeds vs 32° for humans).
  - Renders all 5 animations (walk run attack hit death) in one pass.

USAGE:
  blender --background --python render_animal.py -- --character wolf
  blender --background --python render_animal.py -- --character deer
  blender --background --python render_animal.py -- --character wolf --elev 36
"""

import bpy, math, sys, pathlib, argparse, mathutils

# ── Args ──────────────────────────────────────────────────────────────────────
argv = sys.argv
script_args = argv[argv.index("--") + 1 :] if "--" in argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--character", default="wolf")
parser.add_argument("--elev",       type=float, default=36.0,  help="Camera elevation in degrees")
parser.add_argument("--azim",       type=float, default=45.0)
parser.add_argument("--dirs",       type=int,   default=8)
parser.add_argument("--frame-size", type=int,   default=192)
parser.add_argument("--fps",        type=int,   default=12)
parser.add_argument("--margin",     type=float, default=0.10,  help="Extra fraction of space around bbox")
parser.add_argument("--no-eevee",   action="store_true",       help="Force Cycles (slower)")
args = parser.parse_args(script_args)

ELEV_RAD    = math.radians(args.elev)
AZIM_RAD    = math.radians(args.azim)
CAM_DIST    = 12.0
BASE_ROT_Z  = math.radians(135)
DIR_STEP    = (2 * math.pi) / 8
MARGIN      = args.margin

ROOT     = pathlib.Path(__file__).parent
CHAR_DIR = ROOT / "meshyout" / args.character
BLEND    = CHAR_DIR / f"{args.character.capitalize()}.blend"
GLB      = CHAR_DIR / "animal.glb"

if BLEND.exists():
    SOURCE    = BLEND; USE_BLEND = True
    print(f"Source: {BLEND.name} (blend)")
elif GLB.exists():
    SOURCE    = GLB;   USE_BLEND = False
    print(f"Source: {GLB.name} (GLB)")
else:
    print(f"ERROR: No source file for {args.character}"); sys.exit(1)

ANIM_ALIASES = {
    "walk":   ["Walk", "Walking", "WalkCycle", "Wolf_Walk", "Deer_Walk"],
    "run":    ["Gallop", "Run", "Running", "Trot", "Wolf_Run", "Deer_Run"],
    "attack": ["Attack", "Attack_Headbutt", "Attack_Kick", "Bite", "Snap", "Attacking", "Wolf_Attack", "Deer_Attack"],
    "hit":    ["Idle_HitReact_Left", "Idle_HitReact_Right", "HitReact", "Hit",
               "Damage", "GetHit", "Hurt", "Wolf_Hit", "Deer_Hit"],
    "death":  ["Death", "Die", "Dead", "Fall", "Wolf_Death", "Deer_Death"],
}

# ── Load scene ────────────────────────────────────────────────────────────────
if USE_BLEND:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    for obj in list(bpy.data.objects):
        if obj.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for light in list(bpy.data.lights):
        bpy.data.lights.remove(light)
    scene = bpy.context.scene
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))

# ── Render settings ───────────────────────────────────────────────────────────
if args.no_eevee:
    scene.render.engine     = "CYCLES"
    scene.cycles.samples    = 32
else:
    scene.render.engine     = "BLENDER_EEVEE"
    # Equivalent quality to Cycles/32 on simple low-poly models
    scene.eevee.taa_render_samples = 16

scene.render.film_transparent               = True
scene.render.resolution_x                  = args.frame_size
scene.render.resolution_y                  = args.frame_size
scene.render.image_settings.file_format    = "PNG"
scene.render.image_settings.color_mode     = "RGBA"
scene.render.image_settings.compression    = 9
scene.render.fps                           = args.fps

# World ambient
if not scene.world:
    scene.world = bpy.data.worlds.new("World")
try:
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value    = (0.03, 0.04, 0.07, 1)
        bg.inputs["Strength"].default_value = 0.05
except Exception:
    pass

# ── Armature ──────────────────────────────────────────────────────────────────
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if not armatures:
    print("ERROR: No armature found."); sys.exit(1)
arm = armatures[0]
arm.rotation_mode = "QUATERNION"
print(f"Armature: {arm.name}")

# Ground: shift Z so feet are at Z=0
bpy.context.view_layer.update()
arm_min_z = min(
    (arm.matrix_world @ v.co).z
    for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH"
    for v in mesh_obj.data.vertices
)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()

mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]

# ── Camera basis vectors (for bbox projection) ────────────────────────────────
cam_x_unit = math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cam_y_unit = math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cam_z_unit = math.sin(ELEV_RAD)
cam_pos_unit = mathutils.Vector((cam_x_unit, cam_y_unit, cam_z_unit))

F = -cam_pos_unit                          # forward = -Z
world_Y = mathutils.Vector((0, 1, 0))
cam_right_v = F.cross(world_Y).normalized()
cam_up_v    = (-F).cross(cam_right_v).normalized()

print(f"Elevation {args.elev}°  Azimuth {args.azim}°")
print(f"Camera right : {tuple(round(v,4) for v in cam_right_v)}")
print(f"Camera up    : {tuple(round(v,4) for v in cam_up_v)}")

# ── Find available animations ─────────────────────────────────────────────────
all_actions = list(bpy.data.actions)
print(f"Available actions: {[a.name for a in all_actions]}")

target_actions = {}
for anim_key, aliases in ANIM_ALIASES.items():
    for alias in aliases:
        for action in all_actions:
            if action.name == alias or alias.lower() in action.name.lower():
                target_actions[anim_key] = action
                break
        if anim_key in target_actions:
            break
    if anim_key not in target_actions and all_actions and anim_key == "walk":
        target_actions[anim_key] = all_actions[0]  # fallback for walk only

print(f"Animations found: {list(target_actions.keys())}")

if not target_actions:
    print("ERROR: No animations found."); sys.exit(1)

# Deactivate NLA
if arm.animation_data:
    arm.animation_data.use_nla = False
else:
    arm.animation_data_create()

root_bone = arm.pose.bones[0]

# ── BOUNDING BOX PRE-PASS (no rendering) ─────────────────────────────────────
print("\n=== Bounding-box pre-pass ===")
all_u = []
all_v_coords = []  # renamed from 'all_v' to avoid shadowing

for anim_key, action in target_actions.items():
    arm.animation_data.action = action
    f_start = int(action.frame_range[0])
    f_end   = int(action.frame_range[1])
    for dir_idx in range(args.dirs):
        rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
        q_dir = mathutils.Quaternion((0, 0, 1), rot_z)
        for frame in range(f_start, f_end + 1):
            scene.frame_set(frame)
            arm.rotation_quaternion = q_dir
            rw = arm.matrix_world @ root_bone.head
            arm.location.x -= rw.x; arm.location.y -= rw.y
            bpy.context.view_layer.update()
            for mesh_obj in mesh_objs:
                for vert in mesh_obj.data.vertices:
                    wco = arm.matrix_world @ vert.co
                    # Project relative to origin (we'll adjust camera target later)
                    u_val = cam_right_v.dot(wco)
                    v_val = cam_up_v.dot(wco)
                    all_u.append(u_val)
                    all_v_coords.append(v_val)
            arm.location.x += rw.x; arm.location.y += rw.y

min_u = min(all_u); max_u = max(all_u)
min_v = min(all_v_coords); max_v = max(all_v_coords)
center_u = (min_u + max_u) / 2
center_v = (min_v + max_v) / 2
extent_u = (max_u - min_u)
extent_v = (max_v - min_v)
max_extent = max(extent_u, extent_v)
ortho_scale = max_extent * (1 + MARGIN)

print(f"Screen-space U: {min_u:.3f} … {max_u:.3f}  extent={extent_u:.3f}")
print(f"Screen-space V: {min_v:.3f} … {max_v:.3f}  extent={extent_v:.3f}")
print(f"Ortho scale: {ortho_scale:.4f}  (max_extent={max_extent:.3f} × {1+MARGIN})")

# ── Camera (now we know ortho_scale) ─────────────────────────────────────────
cam_data = bpy.data.cameras.new("IsoCamera")
cam_data.type        = "ORTHO"
cam_data.ortho_scale = ortho_scale
cam_obj  = bpy.data.objects.new("IsoCamera", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# Camera position: orbit at ELEV/AZIM angles, aim at bbox center in world space
# The camera target in world space: bbox center projected back from screen to world
# Center U/V correspond to world offset along cam_right and cam_up:
cam_target_world = cam_right_v * center_u + cam_up_v * center_v
cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD) + cam_target_world.x
cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD) + cam_target_world.y
cam_z = CAM_DIST * math.sin(ELEV_RAD)                        + cam_target_world.z
cam_obj.location = (cam_x, cam_y, cam_z)
direction = mathutils.Vector(cam_target_world) - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
print(f"Camera at ({cam_x:.3f},{cam_y:.3f},{cam_z:.3f})  target {tuple(round(x,3) for x in cam_target_world)}")

# ── Lighting ──────────────────────────────────────────────────────────────────
def add_area_light(name, energy, location, color=(1,1,1), size=4.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy; ld.color = color; ld.size = size
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = mathutils.Vector(location)
    lo.rotation_euler = (mathutils.Vector((0,0,0.5)) - lo.location).to_track_quat("-Z","Z").to_euler()

add_area_light("Key",  900, (-3,-3,7),  color=(1.0,0.97,0.92), size=5)
add_area_light("Fill", 320, ( 5,-1,4),  color=(0.85,0.9,1.0),  size=6)
add_area_light("Rim",  180, (-1, 5,3),  color=(0.8,0.85,0.95), size=4)

# ── RENDER PASS ───────────────────────────────────────────────────────────────
total_frames = 0
for anim_key, action in target_actions.items():
    arm.animation_data.action = action
    f_start = int(action.frame_range[0])
    f_end   = int(action.frame_range[1])
    out_dir = CHAR_DIR / "frames" / anim_key
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.frame_start = f_start
    scene.frame_end   = f_end
    n = f_end - f_start + 1
    print(f"\n--- {anim_key}: '{action.name}'  frames {f_start}–{f_end} ({n} frames × {args.dirs} dirs) ---")
    for dir_idx in range(args.dirs):
        rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
        q_dir = mathutils.Quaternion((0, 0, 1), rot_z)
        for frame in range(f_start, f_end + 1):
            scene.frame_set(frame)
            arm.rotation_quaternion = q_dir
            rw = arm.matrix_world @ root_bone.head
            arm.location.x -= rw.x; arm.location.y -= rw.y
            bpy.context.view_layer.update()
            rel = frame - f_start
            out_path = out_dir / f"dir{dir_idx:02d}_f{rel:03d}.png"
            scene.render.filepath = str(out_path)
            bpy.ops.render.render(write_still=True)
            arm.location.x += rw.x; arm.location.y += rw.y
            total_frames += 1
    print(f"  {anim_key}: {args.dirs * n} frames → {out_dir}")

print(f"\n=== Done. {total_frames} total frames. ===")
print(f"Ortho scale used: {ortho_scale:.4f}")
print(f"Elevation: {args.elev}°")
print(f"Next: py optimize_wolf.py --character {args.character}")
