"""
Frostborn — Animal sprite renderer (wolf, deer, bear, …)
Opens a native .blend file (preferred) or falls back to animal.glb.

Blend file location:  meshyout/<character>/<Character>.blend   e.g. meshyout/wolf/Wolf.blend
GLB fallback:         meshyout/<character>/animal.glb

USAGE:
  blender --background --python render_wolf.py -- --character wolf --anim walk
  blender --background --python render_wolf.py -- --character wolf --anim run
  blender --background --python render_wolf.py -- --character wolf --anim attack
  blender --background --python render_wolf.py -- --character wolf --anim hit
  blender --background --python render_wolf.py -- --character wolf --anim death
  blender --background --python render_wolf.py -- --character deer --anim walk
  ...

Anim aliases (first match against action names wins):
  walk:   Walk, Walking, WalkCycle
  run:    Gallop, Run, Running, Trot
  attack: Attack, Bite, Snap, Attacking
  hit:    Idle_HitReact_Left, Idle_HitReact_Right, HitReact, Hit, Damage, Hurt
  death:  Death, Die, Dead, Fall
  idle:   Idle, Idle_2, IdleA
"""

import bpy, math, sys, pathlib, argparse, mathutils

# ── Args ──────────────────────────────────────────────────────────────────────
argv = sys.argv
script_args = argv[argv.index("--") + 1:] if "--" in argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--character", default="wolf")
parser.add_argument("--anim", choices=["walk","run","attack","hit","death","idle"], required=True)
parser.add_argument("--dirs",       type=int, default=8)
parser.add_argument("--frame-size", type=int, default=192)
parser.add_argument("--fps",        type=int, default=12)
args = parser.parse_args(script_args)

ROOT     = pathlib.Path(__file__).parent
CHAR_DIR = ROOT / "meshyout" / args.character

# ── Source file: .blend preferred, GLB fallback ───────────────────────────────
BLEND = CHAR_DIR / f"{args.character.capitalize()}.blend"
GLB   = CHAR_DIR / "animal.glb"

if BLEND.exists():
    SOURCE     = BLEND
    USE_BLEND  = True
    print(f"Source: {BLEND.name} (native blend)")
elif GLB.exists():
    SOURCE    = GLB
    USE_BLEND = False
    print(f"Source: {GLB.name} (GLB fallback)")
else:
    print(f"ERROR: Neither {BLEND} nor {GLB} found.")
    sys.exit(1)

OUT_DIR = CHAR_DIR / "frames" / args.anim
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Anim aliases ─────────────────────────────────────────────────────────────
ANIM_ALIASES = {
    "walk":   ["Walk", "Walking", "WalkCycle", "Wolf_Walk", "Deer_Walk"],
    "run":    ["Gallop", "Run", "Running", "Trot", "Wolf_Run", "Deer_Run"],
    "attack": ["Attack", "Attack_Headbutt", "Attack_Kick", "Bite", "Snap", "Attacking", "Wolf_Attack", "Deer_Attack"],
    "hit":    ["Idle_HitReact_Left", "Idle_HitReact_Right", "HitReact", "Hit",
               "Damage", "GetHit", "Hurt", "Wolf_Hit", "Deer_Hit"],
    "death":  ["Death", "Die", "Dead", "Fall", "Wolf_Death", "Deer_Death"],
    "idle":   ["Idle", "Idle_2", "IdleA", "Wolf_Idle", "Deer_Idle"],
}

# ── Camera / lighting constants (identical to render_sprites.py) ──────────────
ELEV_RAD    = math.radians(32)
AZIM_RAD    = math.radians(45)
CAM_DIST    = 12.0
ORTHO_SCALE = 1.9    # slightly wider than humans to frame 4-legged animals
BASE_ROT_Z  = math.radians(135)
DIR_STEP    = (2 * math.pi) / 8


# ── Load scene ────────────────────────────────────────────────────────────────
if USE_BLEND:
    print(f"Opening {BLEND.name} …")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))

    # Remove all cameras and lights the blend brought in — we add our own
    for obj in list(bpy.data.objects):
        if obj.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(obj, do_unlink=True)
    for light in list(bpy.data.lights):
        bpy.data.lights.remove(light)

    scene = bpy.context.scene
else:
    print(f"Importing {GLB.name} …")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))

# ── Render settings ───────────────────────────────────────────────────────────
scene.render.engine               = "CYCLES"
scene.cycles.samples              = 32
scene.render.film_transparent     = True
scene.render.resolution_x         = args.frame_size
scene.render.resolution_y         = args.frame_size
scene.render.image_settings.file_format  = "PNG"
scene.render.image_settings.color_mode   = "RGBA"
scene.render.image_settings.compression  = 9
scene.render.fps                  = args.fps

# World: near-black ambient so materials show their own diffuse cleanly
if not scene.world:
    scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs["Color"].default_value    = (0.03, 0.04, 0.07, 1)
    bg.inputs["Strength"].default_value = 0.05

# ── Armature ──────────────────────────────────────────────────────────────────
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if not armatures:
    print("ERROR: No armature found.")
    sys.exit(1)
arm = armatures[0]
arm.rotation_mode = "QUATERNION"
print(f"Armature: {arm.name}")

# Ground: shift Z so feet are at world Z=0
bpy.context.view_layer.update()
arm_min_z = min(
    (arm.matrix_world @ v.co).z
    for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH"
    for v in mesh_obj.data.vertices
)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()

all_verts    = [(arm.matrix_world @ v.co) for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH" for v in mesh_obj.data.vertices]
char_min_z   = min(v.z for v in all_verts)
char_max_z   = max(v.z for v in all_verts)
char_center_z = (char_min_z + char_max_z) / 2
print(f"Z range {char_min_z:.2f}..{char_max_z:.2f}, center={char_center_z:.2f}")

# ── Camera ────────────────────────────────────────────────────────────────────
cam_data = bpy.data.cameras.new("IsoCamera")
cam_data.type        = "ORTHO"
cam_data.ortho_scale = ORTHO_SCALE
cam_obj  = bpy.data.objects.new("IsoCamera", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cam_z = CAM_DIST * math.sin(ELEV_RAD)
cam_obj.location = (cam_x, cam_y, cam_z)
direction = mathutils.Vector((0, 0, char_center_z)) - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
print(f"Camera at ({cam_x:.2f},{cam_y:.2f},{cam_z:.2f}) aiming Z={char_center_z:.2f}")

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

# ── Find animation action ─────────────────────────────────────────────────────
aliases = ANIM_ALIASES[args.anim]
all_actions = list(bpy.data.actions)
print(f"Available actions: {[a.name for a in all_actions]}")

target_action = None
for alias in aliases:
    for action in all_actions:
        if action.name == alias or alias.lower() in action.name.lower():
            target_action = action
            break
    if target_action:
        break

if not target_action and all_actions:
    target_action = all_actions[0]
    print(f"WARNING: No alias match for '{args.anim}', falling back to '{target_action.name}'")

if not target_action:
    print("ERROR: No actions found in source file.")
    sys.exit(1)

print(f"Using action: '{target_action.name}'  frames {int(target_action.frame_range[0])}–{int(target_action.frame_range[1])}")

# Deactivate any NLA so our action assignment is authoritative
if arm.animation_data:
    arm.animation_data.use_nla = False
else:
    arm.animation_data_create()
arm.animation_data.action = target_action

f_start = int(target_action.frame_range[0])
f_end   = int(target_action.frame_range[1])
scene.frame_start = f_start
scene.frame_end   = f_end

# ── Render loop ───────────────────────────────────────────────────────────────
root_bone = arm.pose.bones[0]
print(f"\nRendering {args.dirs} dirs × {f_end - f_start + 1} frames at {args.frame_size}×{args.frame_size}px …")

for dir_idx in range(args.dirs):
    rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
    q_dir = mathutils.Quaternion((0, 0, 1), rot_z)

    for frame in range(f_start, f_end + 1):
        scene.frame_set(frame)
        arm.rotation_quaternion = q_dir
        bpy.context.view_layer.update()

        # Cancel root motion — keep character centred at XY origin
        rw = arm.matrix_world @ root_bone.head
        arm.location.x -= rw.x; arm.location.y -= rw.y
        bpy.context.view_layer.update()

        rel_frame = frame - f_start
        out_path  = OUT_DIR / f"dir{dir_idx:02d}_f{rel_frame:03d}.png"
        scene.render.filepath = str(out_path)
        bpy.ops.render.render(write_still=True)
        print(f"  dir{dir_idx:02d} f{rel_frame:03d} → {out_path.name}")

        arm.location.x += rw.x; arm.location.y += rw.y

print(f"\nDone. {args.dirs * (f_end - f_start + 1)} frames → {OUT_DIR}")
print("Next: py optimize_wolf.py --character wolf")
