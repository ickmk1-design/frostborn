"""Diagnostic: list animations, objects, armatures in a .blend file."""
import bpy, sys, pathlib

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
blend_path = args[0] if args else None

if not blend_path:
    print("Usage: blender --background --python diag_blend_anims.py -- path/to/file.blend")
    sys.exit(1)

print(f"\n=== BLEND DIAGNOSTIC: {blend_path} ===")
bpy.ops.wm.open_mainfile(filepath=blend_path)

print(f"Objects ({len(bpy.data.objects)}):")
for o in bpy.data.objects:
    print(f"  [{o.type}] {o.name}")

arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
print(f"\nArmatures: {[a.name for a in arms]}")
if arms:
    arm = arms[0]
    print(f"  Root bones: {[b.name for b in arm.data.bones if b.parent is None]}")

print(f"\nActions ({len(bpy.data.actions)}):")
for a in bpy.data.actions:
    print(f"  '{a.name}'  frames {int(a.frame_range[0])}–{int(a.frame_range[1])}")

# Check NLA tracks
for arm in arms:
    if arm.animation_data and arm.animation_data.nla_tracks:
        print(f"\nNLA tracks on '{arm.name}':")
        for track in arm.animation_data.nla_tracks:
            for strip in track.strips:
                print(f"  track='{track.name}' strip='{strip.name}' action='{strip.action.name if strip.action else None}'  frames {int(strip.frame_start)}–{int(strip.frame_end)}")

print("=== END ===\n")
