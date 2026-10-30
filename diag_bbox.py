import bpy, math, pathlib
bpy.ops.wm.read_factory_settings(use_empty=True)
glb = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\character_idle.glb")
bpy.ops.import_scene.gltf(filepath=str(glb))
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
arm = armatures[0]
arm.rotation_mode = "XYZ"
print(f"import rot: {tuple(round(math.degrees(r),2) for r in arm.rotation_euler)}")
print(f"import loc: {tuple(round(v,3) for v in arm.location)}")
print(f"import scale: {tuple(round(v,3) for v in arm.scale)}")
bpy.context.view_layer.update()
verts = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
xs = [v.x for v in verts]; ys = [v.y for v in verts]; zs = [v.z for v in verts]
print(f"X: {min(xs):.3f} to {max(xs):.3f}")
print(f"Y: {min(ys):.3f} to {max(ys):.3f}")
print(f"Z: {min(zs):.3f} to {max(zs):.3f}")

# Try rotating +90 X
arm.rotation_euler = (math.pi/2, 0, 0)
bpy.context.view_layer.update()
verts2 = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
xs2 = [v.x for v in verts2]; ys2 = [v.y for v in verts2]; zs2 = [v.z for v in verts2]
print(f"After +90X: X {min(xs2):.3f}-{max(xs2):.3f} Y {min(ys2):.3f}-{max(ys2):.3f} Z {min(zs2):.3f}-{max(zs2):.3f}")

# Try rotating -90 X
arm.rotation_euler = (-math.pi/2, 0, 0)
bpy.context.view_layer.update()
verts3 = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
xs3 = [v.x for v in verts3]; ys3 = [v.y for v in verts3]; zs3 = [v.z for v in verts3]
print(f"After -90X: X {min(xs3):.3f}-{max(xs3):.3f} Y {min(ys3):.3f}-{max(ys3):.3f} Z {min(zs3):.3f}-{max(zs3):.3f}")

# Try rotating 0 (default)
arm.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
# Print bone names and positions to understand rig
print("Bones:")
for bone in arm.pose.bones[:5]:
    hw = arm.matrix_world @ bone.head
    print(f"  {bone.name}: head world=({hw.x:.2f},{hw.y:.2f},{hw.z:.2f})")
