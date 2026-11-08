"""Full debug: iso render with debug prints at every step."""
import bpy, math, pathlib, mathutils

ROOT = pathlib.Path(r"C:\Users\ickmk\Frostborn")
GLB  = ROOT / "meshyout/hero/character_walk.glb"
OUT  = ROOT / "meshyout/hero"

ELEV_RAD = math.radians(32)
AZIM_RAD = math.radians(45)
CAM_DIST = 12.0
ORTHO_SCALE = 1.4
BASE_ROT_Z = math.radians(135)

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
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.rotation_mode = "QUATERNION"

print(f"\n=== POST-IMPORT ===")
print(f"arm.rotation_mode: {arm.rotation_mode}")
print(f"arm.rotation_quaternion: {tuple(round(v,4) for v in arm.rotation_quaternion)}")
print(f"arm.scale: {tuple(round(v,4) for v in arm.scale)}")
print(f"arm.location: {tuple(round(v,4) for v in arm.location)}")
arm.rotation_quaternion = mathutils.Quaternion()  # identity
bpy.context.view_layer.update()

print(f"\n=== AFTER SETTING IDENTITY QUAT + UPDATE ===")
dg = bpy.context.evaluated_depsgraph_get()
ae = arm.evaluated_get(dg)
print(f"arm.rotation_quaternion (orig): {tuple(round(v,4) for v in arm.rotation_quaternion)}")
print(f"arm.rotation_quaternion (eval): {tuple(round(v,4) for v in ae.rotation_quaternion)}")
print(f"arm.matrix_world[2] (orig): {tuple(round(v,4) for v in arm.matrix_world[2])}")
print(f"arm.matrix_world[2] (eval): {tuple(round(v,4) for v in ae.matrix_world[2])}")

# Compute arm_min_z using evaluated arm matrix (use ae.matrix_world!)
arm_min_z = min((ae.matrix_world @ v.co).z
                for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH"
                for v in mesh_obj.data.vertices)
print(f"\n=== GROUNDING ===")
print(f"arm_min_z (from eval matrix): {arm_min_z:.4f}")
arm.location.z -= arm_min_z
bpy.context.view_layer.update()

dg2 = bpy.context.evaluated_depsgraph_get()
ae2 = arm.evaluated_get(dg2)
all_verts = [(ae2.matrix_world @ v.co) for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH" for v in mesh_obj.data.vertices]
char_min_z = min(v.z for v in all_verts)
char_max_z = max(v.z for v in all_verts)
char_center_z = (char_min_z + char_max_z) / 2
print(f"After grounding: arm.location.z={arm.location.z:.4f}")
print(f"After grounding: char Z {char_min_z:.4f}..{char_max_z:.4f} center={char_center_z:.4f}")
print(f"After grounding: eval matrix_world[2]={tuple(round(v,4) for v in ae2.matrix_world[2])}")

# Camera
cam_data = bpy.data.cameras.new("IsoCamera"); cam_data.type = "ORTHO"; cam_data.ortho_scale = ORTHO_SCALE
cam_obj = bpy.data.objects.new("IsoCamera", cam_data)
scene.collection.objects.link(cam_obj); scene.camera = cam_obj
cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
cam_z = CAM_DIST * math.sin(ELEV_RAD)
cam_obj.location = (cam_x, cam_y, cam_z)
direction = mathutils.Vector((0, 0, char_center_z)) - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Z").to_euler()
print(f"\nCamera: pos=({cam_x:.2f},{cam_y:.2f},{cam_z:.2f}) aim_z={char_center_z:.4f}")
print(f"Camera rotation_euler (deg): {tuple(round(math.degrees(r),2) for r in cam_obj.rotation_euler)}")

# Light
def add_light(name, energy, loc):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.size = 5
    lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo)
    lo.location = mathutils.Vector(loc)
    lo.rotation_euler = (mathutils.Vector((0,0,0.5)) - lo.location).to_track_quat("-Z","Z").to_euler()
add_light("Key", 900, (-3,-3,7))
add_light("Fill", 320, (5,-1,4))
add_light("Rim", 180, (-1,5,3))

# Set frame and rotation
scene.frame_set(1)
rot_z = BASE_ROT_Z
_q_dir = mathutils.Quaternion((0, 0, 1), rot_z)
arm.rotation_quaternion = _q_dir
bpy.context.view_layer.update()

dg3 = bpy.context.evaluated_depsgraph_get()
ae3 = arm.evaluated_get(dg3)
print(f"\n=== BEFORE RENDER (frame=1, rot_z={math.degrees(rot_z):.1f}°) ===")
print(f"arm.location: {tuple(round(v,4) for v in arm.location)}")
print(f"arm.rotation_quaternion (orig): {tuple(round(v,4) for v in arm.rotation_quaternion)}")
print(f"arm.rotation_quaternion (eval): {tuple(round(v,4) for v in ae3.rotation_quaternion)}")
print(f"arm.matrix_world[2] (orig): {tuple(round(v,4) for v in arm.matrix_world[2])}")
print(f"arm.matrix_world[2] (eval): {tuple(round(v,4) for v in ae3.matrix_world[2])}")

# World Z of character extremes (using eval matrix)
all_verts_r = [(ae3.matrix_world @ v.co) for mesh_obj in bpy.data.objects if mesh_obj.type == "MESH" for v in mesh_obj.data.vertices]
print(f"char world Z range (eval): {min(v.z for v in all_verts_r):.4f}..{max(v.z for v in all_verts_r):.4f}")

# bones
root_bone = arm.pose.bones[0]
print(f"\nroot_bone: '{root_bone.name}' head={tuple(round(v,3) for v in root_bone.head)}")
rw = arm.matrix_world @ root_bone.head
print(f"root_bone world pos: {tuple(round(v,3) for v in rw)}")

scene.render.filepath = str(OUT / "diag_full_debug.png")
bpy.ops.render.render(write_still=True)
print(f"\nSaved: diag_full_debug.png")
