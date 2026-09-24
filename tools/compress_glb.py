"""无头跑 Blender 压模型:合并成单网格 + 降面 + 贴图转 WebP + 归一化到「米、脚底贴地、水平居中」。

用法:blender --background --python tools/compress_glb.py -- 输入.glb 输出.glb 目标三角面 贴图长边上限 [keep|no-up]

新模型(从 Downloads 拿进来的)不加 keep:会站直、换算成米、脚底贴地、水平居中,
清单里 position/scale 直接照现实尺寸写。已经摆好的模型加 keep:只降面和压贴图,
方向/单位/原点一律不碰,清单数值继续沿用。

两点判断依据:
· 这类 Sketchfab 包的体积大头是内嵌贴图而不是几何,所以 Draco/meshopt 帮不上多少 ——
  真正有效的是贴图降尺寸换 WebP,外加把十几万面片收下来。
· 必须先把整个层级 join 成一个网格:逐个对象搬运会被父节点重复位移,
  而且 modifier_apply 只对 active 对象生效,降面会静默失效。
"""

import json
import math
import mathutils
import os
import sys

import bpy

ARGS = sys.argv[sys.argv.index("--") + 1:]
SRC, DST = ARGS[0], ARGS[1]
TARGET_TRIS = int(ARGS[2])
TEX_CAP = int(ARGS[3])
MODE = ARGS[4] if len(ARGS) > 4 else ""
# 第 5 个参数是模式:
#   keep    只降面 + 压贴图,方向/单位/原点一律不碰 —— 给已经在清单里摆好的模型用
#   no-up   跳过"最薄的一面就是顶"的自动站直 —— 冰箱这类"高度是最长边"的家具会被那条规则放倒
KEEP = MODE == "keep"
SKIP_UPFIX = MODE in ("keep", "no-up")
# 第 6 个参数可选:WebP 质量(默认 70)。机械模型(唱机、相机这类)的细节在 70 下会发糊,
# 给到 88~92 更划算 —— 贴图本身也就 1MB 级,压完仍比源文件小得多。
QUALITY = int(ARGS[5]) if len(ARGS) > 5 else 70


def purge():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    blocks = (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights,
              bpy.data.cameras, bpy.data.armatures)
    for block in blocks:
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def bake(obj):
    """把旋转/缩放写进顶点数据:对象变换归一后,导出器不可能再把它丢掉。"""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def scene_meshes():
    return [o for o in bpy.data.objects if o.type == "MESH" and o.name in bpy.context.scene.objects]


def bounds(obj):
    """直接走顶点(过慢但对 30 万面可接受),避免 evaluated bound_box 读到过期缓存。"""
    matrix = obj.matrix_world
    low = [math.inf] * 3
    high = [-math.inf] * 3
    for vert in obj.data.vertices:
        world = matrix @ vert.co
        for axis in range(3):
            low[axis] = min(low[axis], world[axis])
            high[axis] = max(high[axis], world[axis])
    return low, high


def dims_of(obj):
    low, high = bounds(obj)
    return [high[i] - low[i] for i in range(3)], low, high


purge()
bpy.ops.import_scene.gltf(filepath=SRC)
imported = scene_meshes()
tris_before = sum(len(o.data.polygons) for o in imported)

# ---- 先合并:层级模型逐个搬运会被父节点重复位移 ----
bpy.ops.object.select_all(action="DESELECT")
for obj in imported:
    obj.select_set(True)
bpy.context.view_layer.objects.active = imported[0]
if len(imported) > 1:
    bpy.ops.object.join()

mesh = scene_meshes()[0]
# join 不会解开父链,而 Sketchfab 包的 RootNode 带着很大的偏移 ——
# 不解开的话后面把 location 归零也照样被父变换带走,fitRig 会被撑成一间大厅。
#
# ⚠️ 必须用 CLEAR_KEEP_TRANSFORM 而不是 CLEAR:glTF 导入时那层根节点的旋转
# (Y-up → Z-up)也在父变换里,CLEAR 会连它一起丢掉,几何随之躺倒;
# 后面的 up_fix 再盲目补 +90°,两者一正一负就翻成 180° ——
# 唱机就是这么被压成倒扣的(底朝上,铭牌和 RCA 口露在外面)。保留变换则原地就站得住。
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
# 保留变换会把父链上的缩放也带下来(Sketchfab 的根常常是 ×100),
# 而下面的 unit_scale 是「赋值」不是「相乘」—— 不先烘焙一次,42.7cm 会被再缩 100 倍成 4mm。
bake(mesh)
bpy.context.view_layer.update()
dims, _, _ = dims_of(mesh)
raw_dims = list(dims)

# ---- 站直:Blender 的 up 是 Z,最薄的那一维应当在 Z 上 ----
up_fix = (not SKIP_UPFIX) and dims.index(min(dims)) != 2
if up_fix:
    # FBX 导进来的对象常常是 QUATERNION 旋转模式,直接写 rotation_euler 不生效
    mesh.rotation_mode = "XYZ"
    mesh.rotation_euler[0] = math.radians(90)
    bpy.context.view_layer.update()
    bake(mesh)
    dims, _, _ = dims_of(mesh)

# ---- 单位:最大边超过 30 就按厘米处理 ----
unit_scale = 1.0 if KEEP else (0.01 if max(dims) > 30 else 1.0)
if unit_scale != 1.0:
    mesh.scale = [unit_scale] * 3
bake(mesh)
dims, _, _ = dims_of(mesh)

# ---- 脚底贴 z=0、水平居中 ----
# 用 origin_set 把原点搬到几何包围盒中心:这类包的原点常常离几何很远,
# 直接改 location 去减中心会算歪,fitRig 会因此把整间房子撑大。
dims, low, high = dims_of(mesh)
if not KEEP:
    shift = mathutils.Vector((-(low[0] + high[0]) / 2, -(low[1] + high[1]) / 2, -low[2]))
    mesh.data.transform(mathutils.Matrix.Translation(shift))
    mesh.data.update()
    dims, low, high = dims_of(mesh)
print("NORMALIZED " + json.dumps({
    "dimsMeters": [round(v, 3) for v in dims],
    "min": [round(v, 3) for v in low],
}))

# ---- 降面到目标 ----
polys = len(mesh.data.polygons)
ratio = min(1.0, TARGET_TRIS / max(polys, 1))
if ratio < 1.0:
    mod = mesh.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh = scene_meshes()[0]
polys_after = len(mesh.data.polygons)

# ---- 贴图:封顶长边(尺寸变了才会被标记为 dirty,导出器才重存) ----
images = []
for mat in bpy.data.materials:
    tree = mat.node_tree
    for node in tree.nodes if tree else []:
        img = getattr(node, "image", None)
        if img is not None and img not in images:
            images.append(img)

textures = []
for img in images:
    width, height = img.size[0], img.size[1]
    before = f"{width}x{height}"
    width, height = img.size[0], img.size[1]
    if max(width, height) > TEX_CAP:
        fit = TEX_CAP / max(width, height)
        img.scale(max(1, int(width * fit)), max(1, int(height * fit)))
    # 不显式改 file_format,导出器会原样搬运磁盘上那份 PNG(1024 的 alpha PNG 最占地方)
    img.file_format = "WEBP"
    try:
        img.save_quality = QUALITY
    except AttributeError:
        pass
    textures.append({"name": img.name[:26], "before": before, "after": f"{img.size[0]}x{img.size[1]}",
                     "as": img.file_format})

bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.export_scene.gltf(
    filepath=DST,
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_animations=False,
    export_skins=False,
    export_morph=False,
    # 只出 webp。add_webp 那套是"追加":原 PNG 仍然打进包里,体积直接翻倍。
    export_image_format="WEBP",
    export_image_quality=QUALITY,
    use_selection=True,
)

print("RESULT " + json.dumps({
    "srcKB": round(os.path.getsize(SRC) / 1024),
    "dstKB": round(os.path.getsize(DST) / 1024),
    "rawDimsBlender": [round(v, 2) for v in raw_dims],
    "dimsMeters": [round(v, 3) for v in dims],
    "upFix": up_fix,
    "unitScale": unit_scale,
    "trisBefore": tris_before,
    "trisAfter": polys_after,
    "decimateRatio": round(ratio, 4),
    "textures": textures,
}, ensure_ascii=False))
