"""Quick rotation test: render hero at X=0, X=90, X=180 to find correct orientation."""
import bpy, math, sys, pathlib

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.render.film_transparent = True
scene.render.resolution_x = 192
scene.render.resolution_y = 192
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

glb = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\hero\character_walk.glb")
bpy.ops.import_scene.gltf(filepath=str(glb))
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"

import mathutils
cam_data = bpy.data.cameras.new("C"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 2.0
cam = bpy.data.objects.new("C", cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (7.2, 7.2, 6.36)
d = mathutils.Vector((0,0,0.85)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z","Z").to_euler()

ld = bpy.data.lights.new("L","AREA"); ld.energy=900; ld.size=5
lo = bpy.data.objects.new("L",ld); scene.collection.objects.link(lo)
lo.location=(-3,-3,7)

scene.frame_set(1)
OUT = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\hero")

for rx_deg in [0, 90, 180, 270]:
    arm.rotation_euler = (math.radians(rx_deg), 0.0, math.radians(135))
    bpy.context.view_layer.update()
    scene.render.filepath = str(OUT / f"test_rx{rx_deg}.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered rx={rx_deg}")
