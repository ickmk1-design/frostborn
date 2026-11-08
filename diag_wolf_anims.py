"""Quick diagnostic: list all animation actions in the wolf GLB."""
import bpy, sys, pathlib

ROOT = pathlib.Path(__file__).parent
GLB  = ROOT / "meshyout/wolf/animal.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GLB))

print("\n=== WOLF GLB DIAGNOSTIC ===")
print(f"Objects: {[o.name for o in bpy.data.objects]}")
print(f"Armatures: {[o.name for o in bpy.data.objects if o.type=='ARMATURE']}")
print(f"\nActions ({len(bpy.data.actions)}):")
for a in bpy.data.actions:
    print(f"  '{a.name}'  frames {int(a.frame_range[0])}–{int(a.frame_range[1])}")

arm_list = [o for o in bpy.data.objects if o.type=='ARMATURE']
if arm_list:
    arm = arm_list[0]
    print(f"\nArmature '{arm.name}' bones ({len(arm.data.bones)}):")
    for b in list(arm.data.bones)[:8]:
        print(f"  {b.name}")
    if len(arm.data.bones) > 8:
        print(f"  ... (+{len(arm.data.bones)-8} more)")
print("=== END ===\n")
