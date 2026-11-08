"""Render a single frame of walk_dir0 with exact render_sprites.py camera logic.
Tests rx=0 (should be standing upright in isometric view).
Output: meshyout/hero/single_rx0.png
"""
import bpy, math, pathlib, mathutils

ROOT = pathlib.Path(r"C:\Users\ickmk\Frostborn")
GLB  = ROOT / "meshyout/hero/character_walk.glb"
OUT  = ROOT / "meshyout/hero/single_rx0.png"

ELEV_RAD    = math.radians(32)
AZIM_RAD    = math.radians(45)
CAM_DIST    = 12.0
ORTHO_SCALE = 2.0
BASE_ROT_Z  = math.radians(135)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.film_transparent = True
scene.render.resolution_x = 192
scene.render.resolution_y = 192
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode  = "RGBA"

bpy.ops.import_scene.gltf(filepath=str(GLB))

arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"

# Print import rotation so we know what Blender 5.2 sets
print(f"  Post-import arm rotation: {tuple(round(math.degrees(r),1) for r in arm.rotation_euler)}")
print(f"  Post-import arm scale:    {tuple(round(s,3) for s in arm.scale)}")
print(f"  Post-import arm location: {tuple(round(l,3) for l in arm.location)}")

# Ground and centre using the target standing rotation (rx=+90)
TEST_RX = math.radians(90)
arm.rotation_euler = (TEST_RX, 0.0, 0.0)
bpy.context.view_layer.update()

arm_min_z = min(
    (arm.matrix_world @ v.co).z
    for mo in bpy.data.objects if mo.type == "MESH"
    for v in mo.data.vertices
)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()

all_verts = [
    (arm.matrix_world @ v.co)
    for mo in bpy.data.objects if mo.type == "MESH"
    for v in mo.data.vertices
]
char_center_z = (min(v.z for v in all_verts) + max(v.z for v in all_verts)) / 2
print(f"  char Z range: {min(v.z for v in all_verts):.2f}..{max(v.z for v in all_verts):.2f}  center={char_center_z:.2f}")

# Camera
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

direction = mathutils.Vector((0, 0, char_center_z)) - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Z").to_euler()

# Light
def add_light(name, energy, loc, color=(1,1,1)):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.color = color; ld.size = 5
    lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo)
    lo.location = mathutils.Vector(loc)
    lo.rotation_euler = (mathutils.Vector((0,0,0.5)) - lo.location).to_track_quat("-Z","Z").to_euler()
add_light("Key", 900, (-3,-3,7), (1.0,0.97,0.92))
add_light("Fill",320, (5,-1,4),  (0.85,0.9,1.0))
add_light("Rim", 180, (-1,5,3),  (0.8,0.85,0.95))

scene.frame_set(1)
# Render with rx=+90 + dir0 z-rotation
arm.rotation_euler = (TEST_RX, 0.0, BASE_ROT_Z)
bpy.context.view_layer.update()
out = ROOT / "meshyout/hero/single_rx+90_centered.png"
scene.render.filepath = str(out)
bpy.ops.render.render(write_still=True)
print(f"Saved: {out}")
