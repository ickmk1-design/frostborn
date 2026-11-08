"""Render hero from straight front (orthographic, Y-axis camera) at Rx=0,90,180,-90."""
import bpy, math, pathlib, mathutils

ROOT = pathlib.Path(r"C:\Users\ickmk\Frostborn")
GLB  = ROOT / "meshyout/hero/character_walk.glb"
OUT  = ROOT / "meshyout/hero"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.render.film_transparent = True
scene.render.resolution_x = 192
scene.render.resolution_y = 192
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

bpy.ops.import_scene.gltf(filepath=str(GLB))
scene.frame_set(1)

arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"

# Camera looking straight at +Y face (from -Y direction, looking +Y)
cam_data = bpy.data.cameras.new("C"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 2.5
cam = bpy.data.objects.new("C", cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0, -10, 0.85)
cam.rotation_euler = (math.radians(90), 0, 0)

ld = bpy.data.lights.new("L", "AREA"); ld.energy = 1200; ld.size = 8
lo = bpy.data.objects.new("L", ld); scene.collection.objects.link(lo)
lo.location = (0, -5, 3)

for rx in [0, 90, -90, 180]:
    arm.rotation_euler = (math.radians(rx), 0, 0)
    bpy.context.view_layer.update()
    scene.render.filepath = str(OUT / f"front_rx{rx:+d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered front_rx{rx:+d}.png")
