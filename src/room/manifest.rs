//! 房间里的模型清单。
//!
//! 加一个模型 = 在这里加一条 + 把 glb 丢进 `assets/models/`。
//!
//! 坐标以 **Blender 为准**（导出时已经转成 Y-up）：x 左右、y 上下、z 前后。
//! 也就是说，模型在 Blender 里摆在哪里，导出后在这里照抄就行，不做单位换算。
//! 旋转写角度（度），three.js 那边自己转弧度。

/// 一件摆在房间里的东西。
pub struct Model {
    /// 节点名，方便在 devtools 里认。
    pub name: &'static str,
    /// 相对站点根目录的 glb 路径。
    pub file: &'static str,
    /// Blender 里的位置。
    pub position: (f32, f32, f32),
    /// Blender 里的欧拉旋转，单位是度。
    pub rotation: (f32, f32, f32),
    pub scale: f32,
    /// 点了它打开哪一格面板；`None` 就是不面板。
    /// 取值要和 `crate::ui::panel::Spot` 对得上：`"work"` `"about"` `"notes"` `"contact"` `"poster:0"`。
    pub spot: Option<&'static str>,
    /// glb 里那个「会动的节点」的名字：点了这类家具是**开关它**，不开面板。
    /// 目前只有冰箱门（`fridge_door`）—— 几何与铰链都是从 `~/blender/fridge.blend`
    /// 自带的开门动画里定的，见 `target/tmp/export_fridge_door.py`。
    pub door: Option<&'static str>,
}

/// 目前有地毯、书桌、床、唱机和一台冰箱。
/// 往后的家具按 Blender 里的坐标直接加在后面就行。
pub const MODELS: &[Model] = &[
    Model {
        name: "carpet",
        file: "assets/models/carpet.glb",
        // 绕 Y 轴转 90°:把地毯的长边从「进深方向」摆到「左右方向」。
        rotation: (0.0, 90.0, 0.0),
        // 铺在书桌底下,和桌子同一个中心(x/z 都是桌子的位置)。
        // y 抬 4mm 是地毯的绒高:让它和地板之间永远有一层厚度,不会在地板平面上打架。
        position: (0.0, 0.004, -1.4),
        // 原模型是 8.89 × 15.83,那是「一整个大厅的地面」。原来按 0.22 铺(3.48 × 1.96 m),
        // 比桌子(2.10 × 0.78)大出一圈,左边缘还会伸到床腿底下 —— 收到 0.16 正好是一块桌下毯:
        // 2.53 × 1.42 m,左右各比桌子宽出 0.22,前后各多出 0.32。
        // 想铺回大房间的那一块,把 scale 调回 0.22 并把 position 挪回 (0, 0.004, 0)。
        scale: 0.16,
        // 纯装饰:点不开。它和地板一起挂在视差组里(见 assets/room/main.js),
        // 所以鼠标带动的倾斜不会让它沉到地板下面去。
        spot: None,
        door: None,
    },
    Model {
        name: "bed",
        file: "assets/models/bed.glb",
        // 归一化过(厘米→米、脚底贴 z=0、水平居中),所以 scale 留 1.0,
        // position 就是现实里的摆放位置(米)。
        // 1.34 宽 × 0.95 高 × 2.18 长,长边正好落在进深方向,不用再转。
        //
        // 这张床的「乱」全在几何上:褥子 + 枕头 + 床单 30.7 万面(旧版被降到 2.5 万,皱褶就糊了)。
        // 几何靠 **Draco** 压(8.3 MB → 0.81 MB),贴图 1024² WebP 95 —— 一共 2.07 MB,
        // 见 target/tmp/bed/export_bed.py。运行时解码器在 assets/vendor/addons/libs/draco/gltf/。
        position: (-2.05, 0.0, 0.2),
        rotation: (0.0, 0.0, 0.0),
        scale: 1.0,
        spot: Some("about"),
        door: None,
    },
    Model {
        name: "fridge",
        file: "assets/models/fridge.glb",
        // 0.57 深 × 0.68 宽 × 1.34 高(关着门量),脚底贴 y=0 —— 见 target/tmp/export_fridge_door.py。
        // 门在模型自己的 +x 面上,转 -90° 让门朝镜头这一侧(开的时候是往观众这边甩)。
        position: (1.62, 0.0, 0.0),
        rotation: (0.0, -90.0, 0.0),
        scale: 1.0,
        // 冰箱不开面板:点它是开关门(见下面的 door 字段)。
        spot: None,
        door: Some("fridge_door"),
    },
    Model {
        name: "turntable",
        file: "assets/models/turntable.glb",
        // Yamaha TT-300,0.43 × 0.42 × 0.38(防尘盖掀开),脚底贴 y=0。
        // 压缩管线:`tools/compress_glb.py 源.glb 输出.glb 25000 1024 "" 90` ——
        // 面数几乎不降(2.5 万)、贴图保持 1024 且质量给到 90,所以细节是清楚的。
        // 之前那版是同一台机子、但被压到 1.2 万面 + 质量 70,而且根节点的旋转丢了,
        // 整台是**倒扣**的(看到的是底面铭牌,所以显得糊)。
        // y 给的是桌面高度:书桌 2.045 × 0.35 ≈ 0.72 —— 若唱机陷进桌面或浮着,改这个数。
        position: (-0.62, 0.72, -1.35),
        // 稍微斜一点,别和桌边平行得像个贴图
        rotation: (0.0, -25.0, 0.0),
        scale: 1.0,
        spot: None,
        door: None,
    },
    Model {
        name: "desk",
        file: "assets/models/desk.glb",
        // 桌子模型本身在原点、底面贴 y=0,所以位置只用来挪它。
        // z 朝相机是正,放 -1.4 就是推到房间后方,地毯铺的就是这个位置。
        position: (0.0, 0.0, -1.4),
        // 长边在模型自己的 z 上(6.0),转 90° 让它左右摆,变成一张正常书桌。
        rotation: (0.0, 90.0, 0.0),
        // 导出尺寸 2.22 × 6.00 × 2.05,按米看是「一间屋子」;0.35 → 0.78 深 × 2.10 宽 × 0.72 高。
        scale: 0.35,
        // 点桌子开「作品」那格。
        spot: Some("work"),
        door: None,
    },
    Model {
        name: "chair",
        file: "assets/models/office_chair.glb",
        // 办公椅。tools/compress_glb.py 用 no-up 压过(它的「最薄一面」是进深不是高度,
        // 自动站直会把它放倒):站直、厘米→米、脚底贴 y=0、水平居中,所以 scale 留 1.0。
        // 压出来后 0.97 宽 × 1.26 高 × 0.93 深。
        position: (0.0, 0.0, -0.72),
        // 模型自带的朝向是 +Z(正对镜头),转 180° 才是面朝书桌 —— 这一步是渲图确认的,
        // 不是从包围盒推的(两个方向都是 0.97 × 0.93,包围盒看不出正反)。
        rotation: (0.0, 180.0, 0.0),
        scale: 1.0,
        // 纯装饰:点椅子不面板,而且它不进 pickables,不会挡在前面截走书的点击。
        spot: None,
        door: None,
    },
];

/// 手写 JSON —— 字段就这么几个，不值得为它拉 serde 进来。
pub fn manifest_json() -> String {
    let mut out = String::from("[");
    for (index, model) in MODELS.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        let spot = match model.spot {
            Some(spot) => format!("\"{spot}\""),
            None => "null".to_string(),
        };
        let door = match model.door {
            Some(door) => format!("\"{door}\""),
            None => "null".to_string(),
        };
        let (px, py, pz) = model.position;
        let (rx, ry, rz) = model.rotation;
        out.push_str(&format!(
            concat!(
                r#"{{"name":"{}","file":"{}","#,
                r#""position":[{},{},{}],"rotation":[{},{},{}],"#,
                r#""scale":{},"spot":{},"door":{}}}"#
            ),
            model.name, model.file, px, py, pz, rx, ry, rz, model.scale, spot, door
        ));
    }
    out.push(']');
    out
}
