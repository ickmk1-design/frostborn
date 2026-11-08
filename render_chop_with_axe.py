"""
Frostborn — Render chop animation with axe attached to right hand bone.
Overwrites meshyout/<char>/frames/chop/ with axe-equipped frames.

USAGE:
  blender --background --python render_chop_with_axe.py -- --character hero
  blender --background --python render_chop_with_axe.py -- --character worker_new
"""

import bpy, math, sys, pathlib, mathutils, argparse

argv = sys.argv
script_args = argv[argv.index("--") + 1:] if "--" in argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--character", choices=["hero", "worker_new"], required=True)
parser.add_argument("--frame-size", type=int, default=192)
parser.add_argument("--fps", type=int, default=12)
args = parser.parse_args(script_args)

ROOT     = pathlib.Path(__file__).parent
CHAR_DIR = ROOT / "meshyout" / args.character
AXE_GLB  = ROOT / "meshyout" / "axe" / "axe.glb"
CHOP_GLB = CHAR_DIR / "character_chop.glb"
OUT_DIR  = CHAR_DIR / "frames" / "chop"
OUT_DIR.mkdir(parents=True, exist_ok=True)

N_DIRS     = 8
BASE_ROT_Z = math.radians(135)
DIR_STEP   = (2 * math.pi) / 8

ELEV_RAD    = math.radians(32)
AZIM_RAD    = math.radians(45)
CAM_DIST    = 12.0
ORTHO_SCALE = 2.0

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

# ── Import character chop GLB ─────────────────────────────────────────────────
if not CHOP_GLB.exists():
    print(f"ERROR: {CHOP_GLB} not found.")
    sys.exit(1)
print(f"Importing {CHOP_GLB.name} …")
bpy.ops.import_scene.gltf(filepath=str(CHOP_GLB))

armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if not armatures:
    print("ERROR: No armature found.")
    sys.exit(1)
arm = armatures[0]
arm.rotation_mode = "QUATERNION"

# Snap to Z=0 at rest pose — use identity quaternion (character already upright in Blender 5.2)
arm.rotation_quaternion = mathutils.Quaternion()
bpy.context.view_layer.update()
arm_min_z = min((arm.matrix_world @ v.co).z
                for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH"
                for v in mesh_obj.data.vertices)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()

all_verts = [(arm.matrix_world @ v.co)
             for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH"
             for v in mesh_obj.data.vertices]
char_center_z = (min(v.z for v in all_verts) + max(v.z for v in all_verts)) / 2
print(f"  char_center_z={char_center_z:.2f}")

# ── Import axe GLB ────────────────────────────────────────────────────────────
if not AXE_GLB.exists():
    print(f"ERROR: {AXE_GLB} not found.")
    sys.exit(1)
print(f"Importing {AXE_GLB.name} …")

# Remember existing objects before axe import
existing_objs = set(bpy.data.objects.keys())
bpy.ops.import_scene.gltf(filepath=str(AXE_GLB))

axe_objs = [o for o in bpy.data.objects if o.name not in existing_objs and o.type == "MESH"]
if not axe_objs:
    # Also accept EMPTY or other types
    axe_objs = [o for o in bpy.data.objects if o.name not in existing_objs]
print(f"  Axe objects: {[o.name for o in axe_objs]}")

# ── Find right hand bone ──────────────────────────────────────────────────────
# Meshy rigs use standard bone names; try common variants
RIGHT_HAND_CANDIDATES = [
    "RightHand", "hand_r", "Hand_R", "mixamorig:RightHand",
    "RightHandIndex1", "right_hand", "R_Hand",
]
right_hand_bone = None
for bname in RIGHT_HAND_CANDIDATES:
    if bname in arm.pose.bones:
        right_hand_bone = bname
        break

if right_hand_bone is None:
    # Print all bone names so we can see what's available, then pick last wrist/hand
    bone_names = [b.name for b in arm.pose.bones]
    print(f"  All bones: {bone_names}")
    # Heuristic: find bone with 'hand' or 'wrist' in name, right side
    for bname in bone_names:
        lower = bname.lower()
        if ("hand" in lower or "wrist" in lower) and ("r" in lower or "right" in lower):
            right_hand_bone = bname
            break
    if right_hand_bone is None:
        # fallback: last bone
        right_hand_bone = bone_names[-1]
        print(f"  WARNING: Could not find right hand bone, using {right_hand_bone}")
    else:
        print(f"  Found right hand bone (heuristic): {right_hand_bone}")
else:
    print(f"  Right hand bone: {right_hand_bone}")

# ── Parent axe to right hand bone ────────────────────────────────────────────
# We need to:
# 1. Set the armature as parent of the axe objects with BONE parenting
# For each axe mesh: set parent = arm, parent_type = BONE, parent_bone = right_hand_bone

bpy.ops.object.select_all(action='DESELECT')

# Scale axe to reasonable size relative to character (~0.225 world units)
# Character is ~1.7 units tall; axe handle ~0.3 units; 1.5x for visibility
AXE_SCALE = 0.225

for axe_obj in axe_objs:
    # Clear any existing parent from the axe import
    axe_obj.parent = None
    axe_obj.matrix_world = mathutils.Matrix.Identity(4)

    # Scale
    axe_obj.scale = (AXE_SCALE, AXE_SCALE, AXE_SCALE)
    bpy.ops.object.select_all(action='DESELECT')
    axe_obj.select_set(True)
    bpy.context.view_layer.objects.active = axe_obj
    bpy.ops.object.transform_apply(scale=True)

    # Position at origin of hand bone in rest pose
    bone = arm.pose.bones[right_hand_bone]
    bone_head_world = arm.matrix_world @ bone.head

    # Set parent to armature bone
    axe_obj.parent = arm
    axe_obj.parent_type = 'BONE'
    axe_obj.parent_bone = right_hand_bone

    # Clear parent inverse so axe sits at bone origin
    # The bone's tail is the grip point; adjust offset so axe head points forward
    # Offset slightly: move axe so handle aligns with palm
    axe_obj.matrix_parent_inverse = mathutils.Matrix.Identity(4)

    # Small rotation to orient axe blade forward (away from palm)
    # Meshy axe likely has blade along +Y; hand bone may point in various dirs
    # Try: rotate 90° around X to point blade "up" relative to hand
    axe_obj.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.view_layer.update()

    print(f"  Axe '{axe_obj.name}' parented to bone '{right_hand_bone}'")

# ── Camera ────────────────────────────────────────────────────────────────────
cam_data = bpy.data.cameras.new("IsoCamera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = ORTHO_SCALE
cam_obj = bpy.data.objects.new("IsoCamera", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cam_z = CAM_DIST * math.sin(ELEV_RAD)
cam_obj.location = (cam_x, cam_y, cam_z)

aim_z = char_center_z
direction = mathutils.Vector((0, 0, aim_z)) - cam_obj.location
rot_quat  = direction.to_track_quat("-Z", "Y")
cam_obj.rotation_euler = rot_quat.to_euler()
print(f"  Camera at ({cam_x:.2f},{cam_y:.2f},{cam_z:.2f}) aiming Z={aim_z:.2f}")

# ── Lighting ──────────────────────────────────────────────────────────────────
def add_area_light(name, energy, location, color=(1, 1, 1), size=4.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.color  = color
    ld.size   = size
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = mathutils.Vector(location)
    dir_to_origin = mathutils.Vector((0, 0, 0.5)) - lo.location
    lo.rotation_euler = dir_to_origin.to_track_quat("-Z", "Z").to_euler()
    return lo

add_area_light("Key",  900, (-3, -3, 7),   color=(1.0, 0.97, 0.92), size=5)
add_area_light("Fill", 320, ( 5, -1, 4),   color=(0.85, 0.9, 1.0),  size=6)
add_area_light("Rim",  180, (-1,  5, 3),   color=(0.8, 0.85, 0.95), size=4)

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs["Strength"].default_value = 0.05

# ── Animation range ───────────────────────────────────────────────────────────
action = arm.animation_data.action if arm.animation_data else None
if not action and arm.animation_data and arm.animation_data.nla_tracks:
    track = arm.animation_data.nla_tracks[0]
    if track.strips:
        action = track.strips[0].action

if action:
    f_start = int(action.frame_range[0])
    f_end   = int(action.frame_range[1])
else:
    f_start, f_end = 1, 24
    print("  WARNING: No action found, using 1-24")

print(f"  Chop frames: {f_start}–{f_end}")
scene.frame_start = f_start
scene.frame_end   = f_end

# ── Render loop ───────────────────────────────────────────────────────────────
root_bone = arm.pose.bones[0]

print(f"\nRendering {N_DIRS} dirs × {f_end - f_start + 1} frames …")

for dir_idx in range(N_DIRS):
    rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
    _q_dir = mathutils.Quaternion((0, 0, 1), rot_z)

    for frame in range(f_start, f_end + 1):
        scene.frame_set(frame)
        arm.rotation_quaternion = _q_dir
        bpy.context.view_layer.update()

        rw = arm.matrix_world @ root_bone.head
        arm.location.x -= rw.x
        arm.location.y -= rw.y
        bpy.context.view_layer.update()

        rel_frame = frame - f_start
        out_path  = OUT_DIR / f"dir{dir_idx:02d}_f{rel_frame:03d}.png"
        scene.render.filepath = str(out_path)
        bpy.ops.render.render(write_still=True)
        print(f"  dir{dir_idx:02d} f{rel_frame:03d} → {out_path.name}")

        arm.location.x += rw.x
        arm.location.y += rw.y

print(f"\nDone. {N_DIRS * (f_end - f_start + 1)} frames written to {OUT_DIR}")
print("Next: py pack_sprites.py --character all")
