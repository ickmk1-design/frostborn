"""
Renders 8 direction verification frames: each shows the character at that direction
with a bright red cone placed 0.5m in front of their forward vector.
The cone MUST appear in front of the face in every image.

Output: meshyout/verify_cones/dir<N>.png (8 images)
        meshyout/verify_cones/contact_sheet.png (combined 4x2 grid)

Usage:
  blender --background --python verify_dir_cones.py -- --character hero
  blender --background --python verify_dir_cones.py -- --character worker_new
"""

import bpy, math, sys, pathlib, argparse
import mathutils

argv = sys.argv
script_args = argv[argv.index("--") + 1:] if "--" in argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--character", default="hero")
args = parser.parse_args(script_args)

ROOT     = pathlib.Path(__file__).parent
CHAR_DIR = ROOT / "meshyout" / args.character
GLB      = CHAR_DIR / "character_walk.glb"
OUT_DIR  = ROOT / "meshyout" / "verify_cones"
OUT_DIR.mkdir(parents=True, exist_ok=True)

if not GLB.exists():
    print(f"ERROR: {GLB} not found")
    sys.exit(1)

# ── render_sprites.py camera params (must match exactly) ─────────────────────
ELEV_RAD    = math.radians(32)
AZIM_RAD    = math.radians(45)
CAM_DIST    = 12.0
ORTHO_SCALE = 1.4
BASE_ROT_Z  = math.radians(135)
DIR_STEP    = 2 * math.pi / 8
FRAME_SIZE  = 384   # 2× for readability

LABELS = ["SE","S","SW","W","NW","N","NE","E"]

# ── Scene ─────────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.film_transparent = True
scene.render.resolution_x = FRAME_SIZE
scene.render.resolution_y = FRAME_SIZE
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode  = "RGBA"

# ── Import character ──────────────────────────────────────────────────────────
bpy.ops.import_scene.gltf(filepath=str(GLB))
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
arm = armatures[0]
arm.rotation_mode = "QUATERNION"
arm.rotation_quaternion = mathutils.Quaternion()

bpy.context.view_layer.update()
arm_min_z = min((arm.matrix_world @ v.co).z
                for m in bpy.data.objects if m.type == "MESH"
                for v in m.data.vertices)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()

all_verts  = [(arm.matrix_world @ v.co)
              for m in bpy.data.objects if m.type == "MESH"
              for v in m.data.vertices]
char_min_z = min(v.z for v in all_verts)
char_max_z = max(v.z for v in all_verts)
char_center_z = (char_min_z + char_max_z) / 2

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

aim_pt    = mathutils.Vector((0, 0, char_center_z))
direction = aim_pt - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

# ── Lighting ──────────────────────────────────────────────────────────────────
def add_light(name, energy, location, color=(1,1,1)):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy=energy; ld.color=color; ld.size=4.0
    lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo)
    lo.location = mathutils.Vector(location)
    lo.rotation_euler = (mathutils.Vector((0,0,0.5))-lo.location).to_track_quat("-Z","Z").to_euler()
    return lo

add_light("Key",  900, (-3,-3,7), color=(1.0, 0.97, 0.92))
add_light("Fill", 320, ( 5,-1,4), color=(0.85, 0.9, 1.0))
add_light("Rim",  180, (-1, 5,3), color=(0.8, 0.85, 0.95))

world = bpy.data.worlds.new("World"); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg: bg.inputs["Strength"].default_value = 0.05

# ── Red material for cone ─────────────────────────────────────────────────────
red_mat = bpy.data.materials.new("RedCone")
red_mat.use_nodes = True
bsdf = red_mat.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (1.0, 0.0, 0.0, 1.0)
    bsdf.inputs["Metallic"].default_value   = 0.0
    bsdf.inputs["Roughness"].default_value  = 0.4

# Use first animation frame
scene.frame_set(1)
root_bone = arm.pose.bones[0]

rendered_paths = []

for dir_idx in range(8):
    rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
    q_dir = mathutils.Quaternion((0, 0, 1), rot_z)
    arm.rotation_quaternion = q_dir
    bpy.context.view_layer.update()

    # Cancel root motion
    rw = arm.matrix_world @ root_bone.head
    arm.location.x -= rw.x
    arm.location.y -= rw.y
    bpy.context.view_layer.update()

    # Character's forward vector in world space: Rz(rot_z) @ (0,-1,0)
    # = (sin(rot_z), -cos(rot_z), 0)
    fwd_x = math.sin(rot_z)
    fwd_y = -math.cos(rot_z)

    # Place cone 0.5m in front of character, at chest height
    chest_z = char_center_z + 0.05
    cone_x = fwd_x * 0.5
    cone_y = fwd_y * 0.5

    bpy.ops.mesh.primitive_cone_add(
        vertices=16, radius1=0.08, radius2=0.0, depth=0.22,
        location=(cone_x, cone_y, chest_z)
    )
    cone_obj = bpy.context.active_object
    cone_obj.name = f"Cone_dir{dir_idx}"

    # Orient cone to point along forward direction
    fwd_vec = mathutils.Vector((fwd_x, fwd_y, 0))
    cone_rot = fwd_vec.to_track_quat("Z", "Y")
    cone_obj.rotation_euler = cone_rot.to_euler()
    cone_obj.data.materials.append(red_mat)

    out_path = OUT_DIR / f"dir{dir_idx}_{LABELS[dir_idx]}.png"
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    rendered_paths.append(str(out_path))
    print(f"  dir{dir_idx} ({LABELS[dir_idx]}) → {out_path.name}")

    # Remove cone for next iteration
    bpy.data.objects.remove(cone_obj, do_unlink=True)

    # Restore position
    arm.location.x += rw.x
    arm.location.y += rw.y

print(f"\nDone. 8 renders in {OUT_DIR}")
print("Next: python make_contact_sheet.py")
