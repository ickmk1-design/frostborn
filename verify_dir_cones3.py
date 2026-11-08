"""
Renders 8 direction angle probes with NO character — only:
  - Yellow sphere at world origin (0,0,0): reference point
  - Red cone at 0.4m in the character's forward direction at z=0

ortho_scale=1.0 → 1 world unit fills 384px → 0.4m = 154px offset.
Cone is always visible and unobstructed.

Usage: blender --background --python verify_dir_cones3.py
"""
import bpy, math, sys, pathlib
import mathutils

ROOT    = pathlib.Path(__file__).parent
OUT_DIR = ROOT / "meshyout" / "verify_cones3"
OUT_DIR.mkdir(parents=True, exist_ok=True)

ELEV_RAD    = math.radians(32)
AZIM_RAD    = math.radians(45)
CAM_DIST    = 12.0
ORTHO_SCALE = 1.0   # smaller = more zoomed in, objects are bigger in frame
BASE_ROT_Z  = math.radians(135)
DIR_STEP    = 2 * math.pi / 8
FRAME_SIZE  = 384
CONE_DIST   = 0.4   # world units (< ortho_scale/2 = 0.5, so always in frame)

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

# ── Camera — same geometry as render_sprites.py ───────────────────────────────
cam_data = bpy.data.cameras.new("C"); cam_data.type="ORTHO"; cam_data.ortho_scale=ORTHO_SCALE
cam_obj  = bpy.data.objects.new("C", cam_data)
scene.collection.objects.link(cam_obj); scene.camera = cam_obj
cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cam_z = CAM_DIST * math.sin(ELEV_RAD)
cam_obj.location = (cam_x, cam_y, cam_z)
# Aim at z=0.2 (approximate char center height)
aim = mathutils.Vector((0, 0, 0.2))
cam_obj.rotation_euler = (aim - cam_obj.location).to_track_quat("-Z", "Y").to_euler()

# ── Lighting ──────────────────────────────────────────────────────────────────
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg: bg.inputs["Color"].default_value = (0.1, 0.1, 0.1, 1); bg.inputs["Strength"].default_value = 1.0

ld = bpy.data.lights.new("L","POINT"); ld.energy=500
lo = bpy.data.objects.new("L",ld); scene.collection.objects.link(lo)
lo.location = (cam_x/2, cam_y/2, cam_z/2)

def make_mat(name, r, g, b):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (r,g,b,1)
        bsdf.inputs["Roughness"].default_value = 0.2
        bsdf.inputs["Emission Color"].default_value = (r,g,b,1)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return m

red_mat    = make_mat("Red",    1.0, 0.0, 0.0)
yellow_mat = make_mat("Yellow", 1.0, 1.0, 0.0)

for dir_idx in range(8):
    rot_z = BASE_ROT_Z + DIR_STEP * dir_idx
    fwd_x = math.sin(rot_z)
    fwd_y = -math.cos(rot_z)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(0, 0, 0.04))
    sphere = bpy.context.active_object; sphere.data.materials.append(yellow_mat)

    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.06, radius2=0.0, depth=0.14,
        location=(fwd_x * CONE_DIST, fwd_y * CONE_DIST, 0.07))
    cone = bpy.context.active_object; cone.data.materials.append(red_mat)

    out = OUT_DIR / f"dir{dir_idx}_{LABELS[dir_idx]}.png"
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print(f"  dir{dir_idx} ({LABELS[dir_idx]}) fwd=({fwd_x:+.3f},{fwd_y:+.3f}) → {out.name}")

    bpy.data.objects.remove(cone,   do_unlink=True)
    bpy.data.objects.remove(sphere, do_unlink=True)

print(f"\nDone. 8 renders in {OUT_DIR}")
