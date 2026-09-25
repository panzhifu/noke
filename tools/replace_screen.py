#!/usr/bin/env python3
"""把一张桌面截图烘进 assets/models/computer.glb 的屏幕贴图。

用法:
    python3 tools/replace_screen.py ~/桌面截图.png            # 直接改 assets/models/computer.glb
    python3 tools/replace_screen.py 截图.png 副本.glb               # 先出个副本看看

只做两件事:
  1. 截图按屏幕那面的物理比例(1.615,量自 glb 里 material 3 那个面的包围盒)
     **居中裁**、缩到 1024 宽、转 WebP —— 居中裁是为了上下两条栏都留着(菜单栏与任务栏
     正是「这是桌面」的记号),不是随便切一刀。
  2. 重写 GLB:换掉 images[0] 指的那个 bufferView 的字节,其余 bufferView 原样搬过去,
     顺带按 4 字节对齐重排一遍(bin 段因此不会有留下没人引用的旧图)。

清单里的 `computer` 那条不用动:位置、缩放、`spot: "work"` 全都不变。
"""

import io
import json
import struct
import sys

from PIL import Image

SRC = "assets/models/computer.glb"
# 屏幕那个面(material 3,8 个三角形)在模型自己的单位下量的宽高比
ASPECT = 109.134 / 67.559
# 贴图宽度:原图是 512×256,而这块屏在默认机位上约占 120 px 高、拉最近约 400 px,
# 1024 足够,桌面截图里的图标文字也不会糊
WIDTH = 1024
QUALITY = 92


def to_screen_image(path):
    """读图 → 居中裁成 ASPECT → 缩到 WIDTH → WebP 字节。"""
    image = Image.open(path).convert("RGB")
    width, height = image.size
    have = width / height
    if have > ASPECT:
        cut = int(round(height * ASPECT))
        left = (width - cut) // 2
        box = (left, 0, left + cut, height)
    else:
        cut = int(round(width / ASPECT))
        top = (height - cut) // 2
        box = (0, top, width, top + cut)
    image = image.crop(box).resize((WIDTH, int(round(WIDTH / ASPECT))), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=QUALITY, method=6)
    return buffer.getvalue(), image.size


def rebuild(glb, image_index, payload):
    """换掉 images[image_index] 那份字节,其余照搬,重新对齐写出。"""
    json_len, _ = struct.unpack("<II", glb[12:20])
    manifest = json.loads(glb[20 : 20 + json_len])
    bin_at = 20 + json_len
    bin_len, _ = struct.unpack("<II", glb[bin_at : bin_at + 8])
    blob = glb[bin_at + 8 : bin_at + 8 + bin_len]

    views = []
    for view in manifest["bufferViews"]:
        start = view.get("byteOffset", 0)
        views.append(bytes(blob[start : start + view["byteLength"]]))

    target = manifest["images"][image_index]["bufferView"]
    views[target] = payload

    out = bytearray()
    placed = []
    for data in views:
        out += b"\0" * (-len(out) % 4)
        placed.append((len(out), len(data)))
        out += data

    for view, (offset, length) in zip(manifest["bufferViews"], placed):
        view["byteOffset"] = offset
        view["byteLength"] = length
    manifest["buffers"][0]["byteLength"] = len(out)

    head = json.dumps(manifest, separators=(",", ":"), ensure_ascii=False).encode()
    head += b" " * (-len(head) % 4)
    total = 12 + 8 + len(head) + 8 + len(out)
    return (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(head), 0x4E4F534A)
        + head
        + struct.pack("<II", len(out), 0x004E4942)
        + bytes(out)
    )


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src_image = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else SRC
    payload, size = to_screen_image(src_image)
    glb = open(SRC, "rb").read()
    written = rebuild(glb, 0, payload)
    open(dst, "wb").write(written)
    print(
        f"{src_image} -> {size[0]}x{size[1]} webp {len(payload) // 1024} KB;"
        f" {dst} {len(glb) // 1024} KB -> {len(written) // 1024} KB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
