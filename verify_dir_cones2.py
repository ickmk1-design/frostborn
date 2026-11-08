"""
Renders 8 direction verification frames with:
 - Character at world origin (same camera as render_sprites.py)
 - Red cone at 1.5m in character's forward direction (foot level, z=0)
 - Bright yellow sphere at origin so we can find the reference point precisely

Measuring cone_centroid vs sphere_centroid gives the clean screen angle for each direction.

Usage:
  blender --background --python verify_dir_cones2.py -- --character hero
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
OUT_DIR  = ROOT / "meshyout" / "verify_cones2"
OUT_DIR.mkdir(parents=True, exist_ok=True)

ELEV_RAD    = math.radians(32)
AZIM_RAD    = math.radians(45)
CAM_DIST    = 12.0
ORTHO_SCALE = 1.4
BASE_ROT_Z  = math.radians(135)
DIR_STEP    = 2 * math.pi / 8
FRAME_SIZE  = 384
CONE_DIST   = 1.5   # world units ahead of character — clearly outside body

LABELS = ["SE","S","SW","W","NW","N","NE","E"]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.film_transparent = True
scene.render.resolution_x = FRAME_SIZE
scene.render.resolution_y = FRAME_SIZE
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode  = "RGBA"

# ── Character ─────────────────────────────────────────────────────────────────
bpy.ops.import_scene.gltf(filepath=str(GLB))
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "QUATERNION"
arm.rotation_quaternion = mathutils.Quaternion()
bpy.context.view_layer.update()
arm_min_z = min((arm.matrix_world @ v.co).z
                for m in bpy.data.objects if m.type == "MESH" for v in m.data.vertices)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()
all_verts = [(arm.matrix_world @ v.co)
             for m in bpy.data.objects if m.type == "MESH" for v in m.data.vertices]
char_center_z = (min(v.z for v in all_verts) + max(v.z for v in all_verts)) / 2

# ── Camera ────────────────────────────────────────────────────────────────────
cam_data = bpy.data.cameras.new("IsoCamera")
cam_data.type = "ORTHO"; cam_data.ortho_scale = ORTHO_SCALE
cam_obj = bpy.data.objects.new("IsoCamera", cam_data)
scene.collection.objects.link(cam_obj); scene.camera = cam_obj
cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cam_z = CAM_DIST * math.sin(ELEV_RAD)
cam_obj.location = (cam_x, cam_y, cam_z)
aim = mathutils.Vector((0, 0, char_center_z))
cam_obj.rotation_euler = (aim - cam_obj.location).to_track_quat("-Z", "Y").to_euler()

# ── Lighting ──────────────────────────────────────────────────────────────────
def add_light(name, e, loc, col=(1,1,1)):
    ld = bpy.data.lights.new(name,"AREA"); ld.energy=e; ld.color=col; ld.size=4.0
    lo = bpy.data.objects.new(name,ld); scene.collection.objects.link(lo)
    lo.location = mathutils.Vector(loc)
    lo.rotation_euler = (mathutils.Vector((0,0,0.5))-lo.location).to_track_quat("-Z","Z").to_euler()

add_light("Key", 900,(-3,-3,7),(1.0,0.97,0.92))
add_light("Fill",320,(5,-1,4),(0.85,0.9,1.0))
add_light("Rim", 180,(-1,5,3),(0.8,0.85,0.95))
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg: bg.inputs["Strength"].default_value = 0.05

def make_mat(name, r, g, b):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf: bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0); bsdf.inputs["Roughness"].default_value = 0.3
    return mat

red_mat    = make_mat("Red",    1.0, 0.0, 0.0)
yellow_mat = make_mat("Yellow", 1.0, 1.0, 0.0)

scene.frame_set(1)
root_bone = arm.pose.bones[0]

for dir_idx in range(8):
    rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
    q = mathutils.Quaternion((0,0,1), rot_z)
    arm.rotation_quaternion = q
    bpy.context.view_layer.update()
    rw = arm.matrix_world @ root_bone.head
    arm.location.x -= rw.x; arm.location.y -= rw.y
    bpy.context.view_layer.update()

    fwd_x = math.sin(rot_z)
    fwd_y = -math.cos(rot_z)

    # Red cone at 1.5m along forward, at z=0 (foot level, clearly below body)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.12, radius2=0.0, depth=0.3,
        location=(fwd_x * CONE_DIST, fwd_y * CONE_DIST, 0.15))
    cone = bpy.context.active_object; cone.name = f"Cone{dir_idx}"
    cone.data.materials.append(red_mat)

    # Yellow sphere at world origin (reference marker)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(0, 0, 0.08))
    sphere = bpy.context.active_object; sphere.name = f"Sphere{dir_idx}"
    sphere.data.materials.append(yellow_mat)

    out = OUT_DIR / f"dir{dir_idx}_{LABELS[dir_idx]}.png"
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print(f"  dir{dir_idx} ({LABELS[dir_idx]}) → {out.name}")

    bpy.data.objects.remove(cone, do_unlink=True)
    bpy.data.objects.remove(sphere, do_unlink=True)
    arm.location.x += rw.x; arm.location.y += rw.y

print(f"\nDone. 8 renders in {OUT_DIR}")
