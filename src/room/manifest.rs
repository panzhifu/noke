//! 房间里的模型清单。
//!
//! 加一个模型 = 在这里加一条 + 把 glb 丢进 `assets/models/`。
//!
//! 坐标以 **Blender 为准**（导出时已经转成 Y-up）：x 左右、y 上下、z 前后。
//! 也就是说，模型在 Blender 里摆在哪里，导出后在这里照抄就行，不做单位换算。
//! 旋转写角度（度），three.js 那边自己转弧度。

/// 一个能开关的部件：glb 里的节点名 + 绕哪根轴转 + 开到底多少度。
///
/// 轴和角度都必须**跟着模型走**：冰箱门是竖直铰链（绕 Y、89.888°，从 `~/blender/fridge.blend`
/// 自带的开门动画里反解出来，见 `target/tmp/export_fridge_door.py`），唱机防尘盖是水平铰链
/// （绕 X、85.552°，那台没有动画、合页是底座的后上棱，量法见 `target/tmp/turntable/split_cover.py`）。
/// 早先这两个数是一个全局的 `DOOR_OPEN_DEG` + 写死转 `rotation.y`，第二扇「门」一接上就错。
#[derive(Clone, Copy)]
pub struct Door {
    pub node: &'static str,
    /// `'x'` | `'y'` | `'z'`
    pub axis: char,
    pub deg: f32,
}

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
    /// glb 里那个「会开关的部件」：点了这类家具是**开关它**，不开面板。
    pub door: Option<Door>,
    /// 转椅要转的那个 glb 节点名（电竞椅是 `chair_upper`）；`None` = 不转。
    /// 和 `door` 一样是「glb 里的节点名」：一圈多少度与缓出手感在 `assets/room/config.js`。
    ///
    /// 这个节点的原点必须落在旋转轴（底盘立柱）上，否则转起来是绕着一根偏心的轴公转。
    /// 底座（五个轮子 + 气压杆）留在**另一个节点**里不跟着转 —— 真转椅转的是座椅 + 椅背 + 扶手，
    /// 整椅一起转的话轮子会在地上画圈。两者都是导出时按蒙皮权重切开的，见
    /// `target/tmp/gaming_chair/split_spin.py`（`seatBase` 那一支归上半身，其余归底座）。
    pub spin: Option<&'static str>,
}

/// 目前有地毯、书桌、桌上的显示器 + 键盘 + 鼠标 + 一盏剪式臂台灯、唱机(唱机上躺一张黑胶)、
/// 一台玻璃侧透的机箱、床、一台冰箱、一把电竞椅。
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
        spin: None,
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
        spin: None,
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
        door: Some(Door {
            node: "fridge_door",
            axis: 'y',
            deg: 89.888,
        }),
        spin: None,
    },
    Model {
        name: "turntable",
        file: "assets/models/turntable.glb",
        // Yamaha TT-300,0.43 × 0.42 × 0.38(防尘盖掀开),脚底贴 y=0。
        // 面数几乎不降(2.5 万)、贴图保持 1024 且质量给到 90,所以细节是清楚的。
        // 之前那版是同一台机子、但被压到 1.2 万面 + 质量 70,而且根节点的旋转丢了,
        // 整台是**倒扣**的(看到的是底面铭牌,所以显得糊)。
        //
        // 现在它分两个节点:`turntable_body`(机身,2.36 万面)+ `turntable_cover`(防尘盖,1374 面),
        // 导出走 `target/tmp/turntable/split_cover.py 源 输出 25000 1024 90`。源包本来就把盖子
        // 单独给了一个 `#RPL0002_Cover` 节点,所以是「按节点切」而不是像电竞椅那样按蒙皮权重切。
        // y 给的是桌面高度:书桌 2.045 × 0.35 ≈ 0.72 —— 若唱机陷进桌面或浮着,改这个数。
        position: (-0.62, 0.72, -1.35),
        // 稍微斜一点,别和桌边平行得像个贴图
        rotation: (0.0, -25.0, 0.0),
        scale: 1.0,
        spot: None,
        // 点唱机 = 掀开 / 盖上防尘盖。绕 x(水平铰链),开度 -85.552°。
        // 符号是负的:glb 里烘的是**关着**的姿态(和冰箱门那条约定一样)—— 这台源模型摆的
        // 是掀开的,导出时先绕合页转 +85.552° 落回闭合,网页再转相反数掀回去。
        // 合页取底座的后上棱 (0.1607, 0.0872)。这个包没有自带开合动画(冰箱那台有),只能量:
        // 一开始拿「盖子最低那圈顶点」当合页,那是垂在机身后壁外侧的裙边,低了 5 cm,
        // 合下来整片扎进唱盘。
        door: Some(Door {
            node: "turntable_cover",
            axis: 'x',
            deg: -85.552,
        }),
        spin: None,
    },
    Model {
        name: "vinyl",
        file: "assets/models/vinyl.glb",
        // 一张 12 寸黑胶(AC/DC《Highway to Hell》,Atlantic 厂牌),躺在唱机上。
        //
        // 源文件里这张盘是**斜 43°** 摆的 —— 三个轴都不薄,所以「最薄一面当顶」那条启发式
        // 对它没用(第一版直接把一根面内轴当法线,盘子是立起来的)。所以先走
        // `target/tmp/vinyl/level.py`:按顶点协方差取**最小**特征向量当法线、转到水平,
        // 再进压缩管线 `compress_glb.py leveled.glb 输出 1000 1024 "" 95` ——
        // 768 面一点不降,三张 1024² 转 WebP 95。799 KB → 186 KB。
        //
        // 落点是量的:唱盘圆心在唱机自己的 (-0.057, +0.040)、盘面高约 0.058
        // (顶视/侧视各叠一层坐标网格量的,见 `target/tmp/pc/grid.py`),
        // 再按唱机那条 -25° 转回世界坐标。盘面高度是图上读的,±3 mm ——
        // 唱片要是吃进垫子里或者浮着,改这里的 y。
        position: (-0.689, 0.778, -1.338),
        // 155° = 跟着唱机一起斜 -25°,再翻 180° 把标签上的字转到朝镜头(烘完字的上沿在 -Z)。
        rotation: (0.0, 155.0, 0.0),
        scale: 1.0,
        // 纯装饰:唱机本身就不开面板,唱片跟着它。
        spot: None,
        door: None,
        spin: None,
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
        spin: None,
    },
    Model {
        name: "computer",
        file: "assets/models/computer.glb",
        // 一台带底座的显示器,屏幕上贴的是桌面截图 —— 细节全在那张贴图上,所以贴图
        // 一个像素没缩(512×256)、WebP 质量给到 95,几何 1444 面原样不降。
        //
        // 它是 3ds Max 导出的,单位既不是米也不是厘米:`compress_glb.py` 那条
        // 「最大边 > 30 就按厘米处理」只除了 100,归一化完包围盒还是
        // 116.9 宽 × 97.4 高 × 39.0 深,所以要再乘 0.00513 才落到现实尺寸 ——
        // 0.60 宽 × 0.50 高(含底座) × 0.20 深,相当于一台 27 寸。
        // 摆在书桌正中间、电竞椅正前方,和唱机(左)/ 台灯(右)各占一段桌面。
        position: (0.0, 0.716, -1.52),
        // 屏幕朝模型自己的 +Z(实拍核对过:相机在 +Z 那侧看到的就是屏幕),
        // 也就是正朝镜头,和书桌那一排家具同一条朝向,不用转。
        rotation: (0.0, 0.0, 0.0),
        scale: 0.00513,
        // 点它开「作品」那格 —— 和书桌是同一个入口,但屏幕才是这屋里最像「工作」的东西。
        spot: Some("work"),
        door: None,
        spin: None,
    },
    Model {
        name: "keyboard",
        file: "assets/models/keyboard.glb",
        // 一块 60% 机械键盘(绿 + 米白键帽)。13,694 面、6 张贴图全是 1024² ——
        // 键帽上的字是几何 + 贴图一起撑起来的,降面就糊,所以一点不降、一点不缩:
        // `compress_glb.py 源 输出 14000 1024 "" 95 0.00031328`。3.43 MB → 855 KB。
        //
        // 第 7 个参数是单位:这个包一个单位只有 0.31 mm(整包最大边 957.6),
        // 「>30 当厘米」除完 100 还是 9.58 m。换成米就是 0.30 宽 × 0.107 深 × 0.031 高
        // —— 一块标准 60% 的尺寸。
        position: (0.0, 0.716, -1.3),
        // 空格那一排在模型自己的 +Z(顶视图量的:数字行在 -Z 那侧),也就是朝椅子,
        // 所以不用转。摆在显示器(z 占 -1.62~-1.42)前面,两者留出 0.07 的空隙。
        rotation: (0.0, 0.0, 0.0),
        scale: 1.0,
        // 书桌、显示器、键盘开的是同一格「作品」—— 这一片就是工作台。
        spot: Some("work"),
        door: None,
        spin: None,
    },
    Model {
        name: "computer_mouse",
        file: "assets/models/computer_mouse.glb",
        // 一只有线鼠标(Sketchfab)。源包 25,548 面 / 4.66 MB,压成 8,000 面 / 485 KB:
        // `compress_glb.py 源 输出 8000 1024 "" 95 0.06`。
        //
        // 第 7 个参数 `0.06` 是单位:这个包一个单位 = 6 cm(整包最大边 2.0),那条
        // 「>30 当厘米」的启发式对它没用(2.0 会被当成 2 米)。除完就是 0.12 长 × 0.067 宽
        // × 0.039 高 —— 一只标准鼠标。
        //
        // 注意这个包**没有颜色贴图**:三张材质只有一个灰色 baseColorFactor + AO 图,
        // 所以它是「灰塑料 + 环境光遮蔽」读出来的,别等它出花纹。
        position: (0.28, 0.716, -1.24),
        // 线头那一端(模型自己的 -X)是前面,转 -100° 让鼻尖朝显示器(-Z)、再朝右偏 10°,
        // 和键盘(长边在 X)摆成一小撇右手位。
        rotation: (0.0, -100.0, 0.0),
        scale: 1.0,
        // 纯装饰:开「作品」交给书桌、显示器和键盘。
        spot: None,
        door: None,
        spin: None,
    },
    Model {
        name: "desk_lamp",
        file: "assets/models/desk_lamp.glb",
        // 一盏剪式臂台灯(Sketchfab,30 个部件 join 成 7 个材质分组)。8,379 面 / 无贴图,
        // `compress_glb.py 源 输出 8000 1024 no-up 95 0.2` → 404 KB。
        //
        // 两个参数都是必需的:
        // · `no-up` —— 它站得笔直,但**最薄的一面是左右方向的深**(0.93 对 2.59 高),
        //   「最薄一面当顶」那条启发式会把它放倒(第一版就被放倒过一次)。
        // · `0.2` —— 这个包一个单位 = 20 cm,既不是米也不是厘米(最大边 2.59 会被当成 2.59 米)。
        //   除完是 0.372 臂展 × 0.187 深 × 0.519 高,罩口约 0.13 —— 一盏真实的桌灯。
        //
        // 灯头在模型自己的 +X 那侧、底座偏 -X 约 4cm(包围盒是按中心归的,所以底座不在原点上)。
        position: (0.62, 0.716, -1.3),
        // 转 180° 让灯头朝书桌中心(-X)探过去,光才打在桌面上而不是打在墙上。
        rotation: (0.0, 180.0, 0.0),
        scale: 1.0,
        // 纯装饰。「房间灯」那盏 SpotLight 与灯罩自发光都跟着这个模型走,见 assets/room/main.js。
        spot: None,
        door: None,
        spin: None,
    },
    Model {
        name: "pc_tower",
        file: "assets/models/pc_tower.glb",
        // 一台玻璃侧透的机箱:主板、RTX 2080 Ti、一体式水冷,211,569 面全在几何上
        // (电容、针脚这些元件一降面就成一团)。所以和床同一套路子:
        // `compress_glb.py 源 输出 0 1024 no-up 95 0.0254 draco` —— 0 = 一点都不降,
        // 字节交给 Draco(几何 1.28 MB),贴图 24 张 1024² WebP 95(1.01 MB),合计 2.36 MB。
        //
        // `0.0254` 是**英寸**包:Sketchfab 这批包是 Maya/英寸导出的,整包最大边只有
        // 19.59,那条「>30 就当厘米」的启发式会把它当成 19.59 米。按英寸换成
        // 0.452 宽(前后) × 0.498 高 × 0.267 厚 —— 一个正常中塔。
        // `no-up`:它本来就站得笔直,而「最薄一面当顶」会把它放倒(最薄的是 0.267 那一侧)。
        position: (0.45, 0.0, -1.22),
        // 塞在书桌下面右那一格。玻璃面本来正对 +Z(镜头这一侧),所以不转 —— 从桌前
        // 看进去就是一整面机箱内部。
        //
        // 桌下的空间是量出来的(脚本 target/tmp/pc/desk_legs.py,按清单变换算世界坐标):
        // 两块侧板腿在 x = ±0.97~1.00,桌面下沿 y = 0.650,中间还有一根 y 0.434~0.469 的
        // 横档(在 x≈0 / z≈-1.4 那一带)。机箱 0.452 宽 × 0.267 厚 × 0.498 高,不转的话
        // x 占 0.224~0.676(离右腿还差 0.29、离中间那根小立柱 0.17)、z 占 -1.355~-1.085(侧板内缘到 -1.07)、
        // 顶到 0.498(比桌面下沿矮 0.15),横档在另一头,三样都不碰。
        //
        // 桌下会不会被桌面挡住?默认机位俯角 16°:从机箱**顶的后缘**(y=0.498 / z=-1.355)
        // 沿视线往镜头方向抬,抬到桌面高度 0.7158 时 z 已经是 -0.595 —— 早就出了桌前沿
        // (-1.012),所以视线从桌面下方穿过,整块玻璃面看得见。
        rotation: (0.0, 0.0, 0.0),
        scale: 1.0,
        // 纯装饰。它一个 glb 里是 85 个材质分组(join 完是 85 个 primitive),
        // 挂 spot 就是 85 次真实几何求交(每块都不到 1 万面,吃不到包围盒代理那一档),
        // 每帧一次射线就要走完 21 万面 —— 床那个 20.6 ms 的坑就是这么来的。
        // 而且 hover 只会点亮命中的那一个分组,机箱会缺一块亮一块。开「作品」交给书桌和显示器。
        spot: None,
        door: None,
        spin: None,
    },
    Model {
        name: "gaming_chair",
        file: "assets/models/gaming_chair.glb",
        // 电竞椅(Sketchfab,作者 Man1ac,CC-BY-4.0 —— 署名在「关于」那格,src/content.rs)。
        // 蒙皮模型,压缩走 target/tmp/gaming_chair/split_spin.py(原型分支):骨头的 custom_shape
        // 清掉、armature 烘掉再 join,然后按蒙皮权重切成 `chair_base` + `chair_upper` 两个节点,
        // 归一化按**底盘轴心**(骨架 wheelBase_10 那根骨头)居中 —— 按包围盒居中会偏心 3cm,
        // 上半身转起来底座画圈。压出来 0.78 宽 × 1.26 高 × 0.73 深。
        position: (0.0, 0.0, -0.72),
        // 正前方从骨架算出 110.2°(椅背骨头 → 座椅骨头的水平连线取反),转 69.83° 面朝书桌 ——
        // 与办公椅并排出图核对过。Blender ↔ three 的旋转是反号。
        rotation: (0.0, 69.83, 0.0),
        scale: 1.0,
        // 转椅:点一下只有上半身转一圈(座椅 + 椅背 + 扶手),轮子留在地上不动。
        spot: None,
        door: None,
        spin: Some("chair_upper"),
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
            Some(door) => format!(
                r#"{{"node":"{}","axis":"{}","deg":{}}}"#,
                door.node, door.axis, door.deg
            ),
            None => "null".to_string(),
        };
        let spin = match model.spin {
            Some(spin) => format!("\"{spin}\""),
            None => "null".to_string(),
        };
        let (px, py, pz) = model.position;
        let (rx, ry, rz) = model.rotation;
        out.push_str(&format!(
            concat!(
                r#"{{"name":"{}","file":"{}","#,
                r#""position":[{},{},{}],"rotation":[{},{},{}],"#,
                r#""scale":{},"spot":{},"door":{},"spin":{}}}"#
            ),
            model.name, model.file, px, py, pz, rx, ry, rz, model.scale, spot, door, spin
        ));
    }
    out.push(']');
    out
}
