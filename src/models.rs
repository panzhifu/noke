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
    /// 取值要和 `panel::Spot` 对得上：`"work"` `"about"` `"notes"` `"contact"` `"poster:0"`。
    pub spot: Option<&'static str>,
}

/// 目前只有地毯。
/// 往后的家具按 Blender 里的坐标直接加在后面就行。
pub const MODELS: &[Model] = &[Model {
    name: "carpet",
    file: "assets/models/carpet.glb",
    position: (0.0, 0.0, 0.0),
    // 绕 Y 轴转 90°:把地毯的长边从「进深方向」摆到「左右方向」。
    // Blender 里它是 8.89(x) × 15.83(y),转完在房间坐标里是 15.83(x) × 8.89(z)。
    rotation: (0.0, 90.0, 0.0),
    scale: 1.0,
    spot: None,
}];

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
