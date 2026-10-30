import bpy, math, pathlib, sys
bpy.ops.wm.read_factory_settings(use_empty=True)

char = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "hero"
glb = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout") / char / "character_walk.glb"
bpy.ops.import_scene.gltf(filepath=str(glb))

arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"
print(f"char={char}")
print(f"rot: {tuple(round(math.degrees(r),2) for r in arm.rotation_euler)}")
print(f"loc: {tuple(round(v,3) for v in arm.location)}")
print(f"scale: {tuple(round(v,3) for v in arm.scale)}")
bpy.context.view_layer.update()

verts = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
xs=[v.x for v in verts]; ys=[v.y for v in verts]; zs=[v.z for v in verts]
print(f"X: {min(xs):.3f} to {max(xs):.3f}")
print(f"Y: {min(ys):.3f} to {max(ys):.3f}")
print(f"Z: {min(zs):.3f} to {max(zs):.3f}")

bones = [o for o in bpy.data.objects if o.type=="ARMATURE"][0].pose.bones
for b in list(bones)[:5]:
    hw = arm.matrix_world @ b.head
    print(f"  bone {b.name}: ({hw.x:.2f},{hw.y:.2f},{hw.z:.2f})")
