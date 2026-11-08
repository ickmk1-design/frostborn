"""Test different camera orientations to find which shows character upright."""
import bpy, math, pathlib, mathutils

ROOT = pathlib.Path(r"C:\Users\ickmk\Frostborn")
GLB  = ROOT / "meshyout/hero/character_walk.glb"
OUT  = ROOT / "meshyout/hero"

ELEV_RAD = math.radians(32); AZIM_RAD = math.radians(45)
CAM_DIST = 12.0; ORTHO_SCALE = 1.4; BASE_ROT_Z = math.radians(135)

def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"; scene.cycles.samples = 16
    scene.render.film_transparent = True
    scene.render.resolution_x = 192; scene.render.resolution_y = 192
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "meshyout/hero/character_walk.glb"))
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    arm.rotation_mode = "QUATERNION"
    arm.rotation_quaternion = mathutils.Quaternion()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ae = arm.evaluated_get(dg)
    arm_min_z = min((ae.matrix_world @ v.co).z for mo in bpy.data.objects if mo.type == "MESH" for v in mo.data.vertices)
    arm.location.z -= arm_min_z
    bpy.context.view_layer.update()
    dg2 = bpy.context.evaluated_depsgraph_get(); ae2 = arm.evaluated_get(dg2)
    char_max_z = max((ae2.matrix_world @ v.co).z for mo in bpy.data.objects if mo.type == "MESH" for v in mo.data.vertices)
    char_center_z = char_max_z / 2
    scene.frame_set(1)
    arm.rotation_quaternion = mathutils.Quaternion((0, 0, 1), BASE_ROT_Z)
    bpy.context.view_layer.update()
    cam_x = CAM_DIST * math.cos(ELEV_RAD) * math.cos(AZIM_RAD)
    cam_y = CAM_DIST * math.cos(ELEV_RAD) * math.sin(AZIM_RAD)
    cam_z = CAM_DIST * math.sin(ELEV_RAD)
    cam_data = bpy.data.cameras.new("C"); cam_data.type = "ORTHO"; cam_data.ortho_scale = ORTHO_SCALE
    cam_obj = bpy.data.objects.new("C", cam_data)
    scene.collection.objects.link(cam_obj); scene.camera = cam_obj
    cam_obj.location = (cam_x, cam_y, cam_z)
    for nm, en, loc in [("Key",900,(-3,-3,7)),("Fill",320,(5,-1,4)),("Rim",180,(-1,5,3))]:
        ld = bpy.data.lights.new(nm,"AREA"); ld.energy=en; ld.size=5
        lo = bpy.data.objects.new(nm,ld); scene.collection.objects.link(lo); lo.location = mathutils.Vector(loc)
    return cam_obj, (cam_x, cam_y, cam_z), char_center_z

cam_obj, (cx,cy,cz), aim_z = setup_scene()
direction = mathutils.Vector((0, 0, aim_z)) - cam_obj.location

# Test A: current (to_track_quat "-Z", "Z")
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Z").to_euler()
cam_mat = cam_obj.rotation_euler.to_matrix()
cam_up = cam_mat.col[1]
print(f"A '-Z','Z': cam+Y = {tuple(round(v,3) for v in cam_up)} worldZ={cam_up.z:.3f}")
bpy.context.scene.render.filepath = str(OUT / "cam_test_A.png")
bpy.ops.render.render(write_still=True)

# Test B: to_track_quat "-Z", "Y"
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
cam_mat = cam_obj.rotation_euler.to_matrix()
cam_up = cam_mat.col[1]
print(f"B '-Z','Y': cam+Y = {tuple(round(v,3) for v in cam_up)} worldZ={cam_up.z:.3f}")
bpy.context.scene.render.filepath = str(OUT / "cam_test_B.png")
bpy.ops.render.render(write_still=True)

# Test C: to_track_quat "-Z", "-Y"
cam_obj.rotation_euler = direction.to_track_quat("-Z", "-Y").to_euler()
cam_mat = cam_obj.rotation_euler.to_matrix()
cam_up = cam_mat.col[1]
print(f"C '-Z','-Y': cam+Y = {tuple(round(v,3) for v in cam_up)} worldZ={cam_up.z:.3f}")
bpy.context.scene.render.filepath = str(OUT / "cam_test_C.png")
bpy.ops.render.render(write_still=True)

# Test D: manual rotation matrix (world_Z × forward for right, forward × right for up)
cam_fwd = direction.normalized()
world_Z = mathutils.Vector((0, 0, 1))
cam_right = world_Z.cross(cam_fwd).normalized()   # SE direction
cam_up_vec = cam_fwd.cross(cam_right).normalized() # should be NW-up
print(f"D manual: cam+Y = {tuple(round(v,3) for v in cam_up_vec)} worldZ={cam_up_vec.z:.3f}")
rot_mat = mathutils.Matrix((cam_right, cam_up_vec, -cam_fwd)).transposed()
cam_obj.rotation_euler = rot_mat.to_euler()
bpy.context.scene.render.filepath = str(OUT / "cam_test_D.png")
bpy.ops.render.render(write_still=True)

print("Done")
