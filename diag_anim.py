import bpy, math, pathlib
bpy.ops.wm.read_factory_settings(use_empty=True)
glb = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\hero\character_walk.glb")
bpy.ops.import_scene.gltf(filepath=str(glb))
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"
scene = bpy.context.scene

# Rest pose (no frame)
bpy.context.view_layer.update()
verts = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
zs = [v.z for v in verts]
print(f"REST Z: {min(zs):.3f} to {max(zs):.3f}")

# Frame 1 (animated)
scene.frame_set(1)
bpy.context.view_layer.update()
verts2 = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
zs2 = [v.z for v in verts2]
xs2 = [v.x for v in verts2]; ys2 = [v.y for v in verts2]
print(f"FRAME1 X: {min(xs2):.3f} to {max(xs2):.3f}")
print(f"FRAME1 Y: {min(ys2):.3f} to {max(ys2):.3f}")
print(f"FRAME1 Z: {min(zs2):.3f} to {max(zs2):.3f}")

for b in arm.pose.bones[:5]:
    hw = arm.matrix_world @ b.head
    print(f"  {b.name}: world ({hw.x:.2f},{hw.y:.2f},{hw.z:.2f})")
