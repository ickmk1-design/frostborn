"""Print the armature's rotation immediately after GLB import, before any modification."""
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

print(f"POST-IMPORT arm.rotation_euler (deg): {tuple(round(math.degrees(r),2) for r in arm.rotation_euler)}")
print(f"POST-IMPORT arm.scale: {tuple(round(s,4) for s in arm.scale)}")
print(f"POST-IMPORT arm.location: {tuple(round(l,4) for l in arm.location)}")

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for m in meshes:
    print(f"  Mesh '{m.name}': loc={tuple(round(v,3) for v in m.location)} scale={tuple(round(v,3) for v in m.scale)} rot={tuple(round(math.degrees(r),1) for r in m.rotation_euler)}")

# Render with NO rotation applied (pure import state)
cam_data = bpy.data.cameras.new("C"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 2.5
cam = bpy.data.objects.new("C", cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (7.2, 7.2, 6.36)
d = mathutils.Vector((0, 0, 0.85)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Z").to_euler()

ld = bpy.data.lights.new("L", "AREA"); ld.energy = 900; ld.size = 5
lo = bpy.data.objects.new("L", ld); scene.collection.objects.link(lo)
lo.location = (-3, -3, 7)

# Render A: identity (no modification)
arm.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
scene.render.filepath = str(OUT / "diag_rx0_rz0.png")
bpy.ops.render.render(write_still=True)
print("Rendered: diag_rx0_rz0.png (identity)")

# Render B: Rz(135) only
arm.rotation_euler = (0, 0, math.radians(135))
bpy.context.view_layer.update()
scene.render.filepath = str(OUT / "diag_rx0_rz135.png")
bpy.ops.render.render(write_still=True)
print("Rendered: diag_rx0_rz135.png (Rz=135)")

# Render C: Rx(90) + Rz(135)
arm.rotation_euler = (math.radians(90), 0, math.radians(135))
bpy.context.view_layer.update()
scene.render.filepath = str(OUT / "diag_rx90_rz135.png")
bpy.ops.render.render(write_still=True)
print("Rendered: diag_rx90_rz135.png (Rx=90 Rz=135)")

# Render D: Rx(180) + Rz(135)
arm.rotation_euler = (math.radians(180), 0, math.radians(135))
bpy.context.view_layer.update()
scene.render.filepath = str(OUT / "diag_rx180_rz135.png")
bpy.ops.render.render(write_still=True)
print("Rendered: diag_rx180_rz135.png (Rx=180 Rz=135)")
