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
    /// 点了它打开哪一格面板；`None` 表示纯装饰、点不开。
    /// 取值要和 `crate::ui::panel::Spot` 对得上：`"work"` `"about"` `"notes"` `"contact"` `"poster:0"`。
    pub spot: Option<&'static str>,
}

/// 目前有地毯、电动车、书桌、床和一台唱机。
/// 往后的家具按 Blender 里的坐标直接加在后面就行。
pub const MODELS: &[Model] = &[
    Model {
        name: "carpet",
        file: "assets/models/carpet.glb",
        // 绕 Y 轴转 90°:把地毯的长边从「进深方向」摆到「左右方向」。
        rotation: (0.0, 90.0, 0.0),
        position: (0.0, 0.0, 0.0),
        // 原模型是 8.89 × 15.83,那是「一整个大厅的地面」,一辆车摆上去小得看不清。
        // 收到 0.22 —— 3.5 × 2.0 m,一块正常地毯的尺寸。
        // 想要「大房间」的感觉就把它调回 1.0,再相应放大车。
        scale: 0.22,
        spot: None,
    },
    Model {
        name: "scooter",
        file: "assets/models/scooter.glb",
        position: (0.0, 0.0, 0.0),
        // 转 90° 让车横着停,和地毯的长边一个方向
        rotation: (0.0, 90.0, 0.0),
        // 这个模型是「玩具尺寸」:Blender 里只有 3.0 × 7.3 × 4.8 cm(约真实的 1/23,
        // 大概是从 .3ds 导入时单位就错了)。放大回一辆 1.75 m 长的电动自行车。
        scale: 23.8,
        spot: None,
    },
    Model {
        name: "bed",
        file: "assets/models/bed.glb",
        // tools/compress_glb.py 处理过:已站直、按米重缩放、脚底贴 z=0、水平居中 ——
        // 所以 scale 留 1.0,position 就是现实里的摆放位置(米)。
        // 1.34 宽 × 0.95 高 × 2.18 长,长边正好落在进深方向,不用再转。
        position: (-2.05, 0.0, 0.2),
        rotation: (0.0, 0.0, 0.0),
        scale: 1.0,
        spot: Some("about"),
    },
    Model {
        name: "turntable",
        file: "assets/models/turntable.glb",
        // 0.43 宽 × 0.38 高(防尘盖是掀开的)× 0.42 深,脚底贴 z=0。
        // y 给的是桌面高度:书桌 2.045 × 0.35 ≈ 0.72 —— 若唱机陷进桌面或浮着,改这个数。
        position: (-0.62, 0.72, -1.35),
        // 稍微斜一点,别和桌边平行得像个贴图
        rotation: (0.0, -25.0, 0.0),
        scale: 1.0,
        spot: None,
    },
    Model {
        name: "desk",
        file: "assets/models/desk.glb",
        // 桌子模型本身在原点、底面贴 y=0,所以位置只用来挪它。
        // z 朝相机是正,放 -1.4 就是推到地毯后方、背对后墙。
        position: (0.0, 0.0, -1.4),
        // 长边在模型自己的 z 上(6.0),转 90° 让它左右摆,变成一张正常书桌。
        rotation: (0.0, 90.0, 0.0),
        // 导出尺寸 2.22 × 6.00 × 2.05,按米看是「一间屋子」;0.35 → 0.78 深 × 2.10 宽 × 0.72 高。
        scale: 0.35,
        // 点桌子开「作品」那格。
        spot: Some("work"),
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
        let (px, py, pz) = model.position;
        let (rx, ry, rz) = model.rotation;
        out.push_str(&format!(
            concat!(
                r#"{{"name":"{}","file":"{}","#,
                r#""position":[{},{},{}],"rotation":[{},{},{}],"#,
                r#""scale":{},"spot":{}}}"#
            ),
            model.name, model.file, px, py, pz, rx, ry, rz, model.scale, spot
        ));
    }
    out.push(']');
    out
}
