"""Check actual DEFORMED vertex positions at animated frame."""
import bpy, math, pathlib
bpy.ops.wm.read_factory_settings(use_empty=True)
glb = pathlib.Path(r"C:\Users\ickmk\Frostborn\meshyout\hero\character_walk.glb")
bpy.ops.import_scene.gltf(filepath=str(glb))
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "XYZ"
arm.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()
scene = bpy.context.scene

verts_r = [(arm.matrix_world @ v.co) for m in bpy.data.objects if m.type=="MESH" for v in m.data.vertices]
arm.location.z -= min(v.z for v in verts_r)
bpy.context.view_layer.update()

scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()

zs_deformed = []
for obj in bpy.data.objects:
    if obj.type != "MESH": continue
    obj_eval = obj.evaluated_get(depsgraph)
    mesh_eval = obj_eval.to_mesh()
    for v in mesh_eval.vertices:
        world_co = obj_eval.matrix_world @ v.co
        zs_deformed.append(world_co.z)
    obj_eval.to_mesh_clear()

print(f"DEFORMED Z at frame 1: {min(zs_deformed):.3f} to {max(zs_deformed):.3f}")
print(f"(REST Z was: 0.000 to 1.710)")

# Also check root bone world matrix
root = arm.pose.bones[0]
root_world = arm.matrix_world @ root.matrix
print(f"Root bone ({root.name}) world matrix row2 (Z col): {tuple(round(v,3) for v in root_world.col[2][:3])}")
