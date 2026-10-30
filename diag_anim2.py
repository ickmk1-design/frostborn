import bpy, math, pathlib, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
glb = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\hero\character_walk.glb")
bpy.ops.import_scene.gltf(filepath=str(glb))
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"
scene = bpy.context.scene

# Simulate exactly what render_sprites.py does
arm.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

verts_rest = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
arm_min_z = min(v.z for v in verts_rest)
arm.location.z -= arm_min_z
bpy.context.view_layer.update()
print(f"After snap: arm.location={tuple(round(v,3) for v in arm.location)}")
print(f"After snap: arm.rotation_euler={tuple(round(math.degrees(r),2) for r in arm.rotation_euler)}")

# Check arm rotation after frame_set (does animation override it?)
arm.rotation_euler = (0.0, 0.0, math.radians(0))
scene.frame_set(1)
bpy.context.view_layer.update()
print(f"After frame_set(1): arm.rotation_euler={tuple(round(math.degrees(r),2) for r in arm.rotation_euler)}")
print(f"After frame_set(1): arm.location={tuple(round(v,3) for v in arm.location)}")
print(f"matrix_world row0={tuple(round(v,3) for v in arm.matrix_world[0])}")
print(f"matrix_world row1={tuple(round(v,3) for v in arm.matrix_world[1])}")
print(f"matrix_world row2={tuple(round(v,3) for v in arm.matrix_world[2])}")

# Actual vertex positions
verts = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
zs = [v.z for v in verts]
print(f"Vertex Z after frame_set: {min(zs):.3f} to {max(zs):.3f}")
