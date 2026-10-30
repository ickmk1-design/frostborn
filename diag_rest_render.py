"""Render hero at REST POSE (no animation) to check base orientation."""
import bpy, math, pathlib, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.render.film_transparent = True
scene.render.resolution_x = 192; scene.render.resolution_y = 192
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

glb = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\hero\character_walk.glb")
bpy.ops.import_scene.gltf(filepath=str(glb))
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"
arm.rotation_euler = (0.0, 0.0, math.radians(135))

# Snap to Z=0
bpy.context.view_layer.update()
verts = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
arm.location.z -= min(v.z for v in verts)

# DISABLE animation
if arm.animation_data:
    arm.animation_data.action = None

# Camera
cam_data = bpy.data.cameras.new("C"); cam_data.type="ORTHO"; cam_data.ortho_scale=2.0
cam = bpy.data.objects.new("C", cam_data); scene.collection.objects.link(cam); scene.camera=cam
cam.location = (7.2, 7.2, 6.36)
d = mathutils.Vector((0,0,0.85)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z","Z").to_euler()

ld = bpy.data.lights.new("L","AREA"); ld.energy=900; ld.size=5
lo = bpy.data.objects.new("L",ld); scene.collection.objects.link(lo)
lo.location = mathutils.Vector((-3,-3,7))
dir2o = mathutils.Vector((0,0,0.5)) - lo.location
lo.rotation_euler = dir2o.to_track_quat("-Z","Z").to_euler()

scene.render.filepath = str(pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\hero\rest_pose.png"))
bpy.ops.render.render(write_still=True)
print("REST POSE rendered")
