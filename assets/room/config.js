/**
 * 房间这一层的数值常量与角度工具。
 * 集中一份,是为了调手感时只用翻一个文件。
 */

import * as THREE from 'three';

export const ROOT_ID = 'room3d';
export const MAX_DPR = 2;
export const PARALLAX_YAW = 0.07;
export const PARALLAX_PITCH = 0.035;
export const PARALLAX_EASE = 0.06;
export const TARGET_EASE = 0.07;
// 状态切换的插值速度(每秒推进多少比例):开灯/换昼夜是渐亮,不是硬切
export const STATE_EASE = 3.2;
// 贴图各向异性上限:斜着看地面时,让贴图不发糊靠的是它,不是分辨率
export const ANISOTROPY = 8;
// 拖过这几个像素就不算「点一下」,否则每次转完视角都会误开面板
export const DRAG_THRESHOLD = 6;

// 镜头钳位:极角(从 +Y 量起,度)。48 = 从上往下 42° 俯视,88 = 基本与视线齐平 ——
// 再往 90 去镜头就要沉到地板下面去了。
// 方位角只给正前到右侧这么一段(pinchen 给的是整一个象限 0~90°):家具是一排横着摆的,
// 转到 70° 以上就变成冰箱挡桌子、只能看侧面,所以宁可早点收住。
export const CAMERA_FOV = 35;
export const POLAR_LIMITS = [48, 88];
export const AZIMUTH_LIMITS = [0, 62];
export const DISTANCE_RANGE = [0.55, 1.9]; // × 取景距离
// 初始方位角:0 是正对家具那一排。给 30° 是为了让墙角一开始就露出纵深来。
export const CAMERA_AZIMUTH = (30 * Math.PI) / 180;
// 注视点抬高一点:注视点是画框正中,抬上去等于把家具压到画面中下部、
// 把前景那一大片空地挤出去(pinchen 的注视点也高于家具,画面里墙占一半)。
export const TARGET_LIFT = 0.4;

// 墙角(两块景片)。高度取到「俯角 16° 时上边缘出画」为止 —— 留一点余量给拉到最远,
// 这样画面顶部永远是墙而不是虚空;长度按场景跨度放大。
export const WALL_HEIGHT = 5.6;
export const WALL_SPAN = 2.6;
export const WALL_PAD = 0.9;

// 台灯 glb(assets/models/desk_lamp.glb)里灯泡那颗球的**材质名** —— 认它不是为了好看,
// 是「房间灯」那盏 SpotLight 得挂在灯泡上、开灯时的自发光也得落在它身上。
// 这个包 30 个部件 join 成 7 个材质分组,只有灯泡用 Ceramic(其余全是黑金属)。
// 换台灯模型时要跟着换这个名(找不到会在 console 里警告,表现是开灯没有那团暖光)。
export const LAMP_BULB_MATERIAL = 'Ceramic';

// 开关门的速度(每秒推进多少比例),同样是缓出。开到底多少度、绕哪根轴**跟着模型走**,
// 写在清单的 door 里(冰箱门 89.888° 绕 y、唱机防尘盖 85.552° 绕 x)—— 早先这里是一个
// 全局 DOOR_OPEN_DEG 加写死的 rotation.y,第二扇「门」一接上就必有一件是错的。
export const DOOR_EASE = 4.5;

// 转椅:点一下转一整圈。清单里的 `spin` 给的是**要转的那个节点名**(上半身),
// 角度与手感在这里 —— 和门那套一样,几何在清单、手感在 config。
export const SPIN_DEG = 360;
// 用指数逼近(起步快、收尾慢),和冰箱门、光照那套一个味道。
export const SPIN_EASE = 4.2;
// 收尾阈值(弧度):残差小于它就落定为整数圈。0.01 rad ≈ 0.57°,
// 最后跳这一下看不见,但能把「永远差 0.0001° 所以循环停不下来」这件事掐掉。
export const SPIN_SETTLE = 0.01;
// 点得太快时不无限排队:最多排到「当前角度 + MAX_QUEUED_TURNS 圈」
export const SPIN_MAX_QUEUED_TURNS = 3;

// 唱盘转速:33⅓ 转/分(黑胶的标准速度),一圈 1.8 秒。只在房间灯开着时转 ——
// 这个循环是按需渲染的,常转就等于永不停摆,所以「什么时候转」得挂在一个已有开关上
// (见 main.js 的 stepPlatter)。转的是唱机 glb 里的 platter 节点,不是墙上那张黑胶。
export const PLATTER_RPM = 100 / 3;

// ---------- 首屏那扇门,与「推门而入」 ----------
//
// 首屏只加载这一只 glb(428 KB)、把它摆在画面正中,剩下 11.6 MB 在后台补齐
// (补齐之前家具一直是 `visible = false`,见 main.js 的阶段状态机)。
//
// 门**不是屋里的家具**:屋里那面背墙就是一块整板。所以这份规格写在这儿,而不是
// `src/room/manifest.rs` 的清单里 —— 字段形状故意和清单条目保持一致,加载走同一条路。
export const ENTRY = {
  name: 'door',
  file: 'assets/models/door.glb',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  // 门扇 + 12 块嵌板 + 三副合页 + 双面把手是 glb 里独立的一个节点,原点在合页轴上,
  // 所以开合 = 绕竖直的 y 转 90°(和清单里冰箱门同一条约定:{节点, 轴, 角度})。
  door: { node: 'door_leaf', axis: 'y', deg: 90 },
};
// 这扇门是本地建模的 `~/blender/门.blend`(不是 Sketchfab 拿的):门扇 0.88 × 2.1 高、
// 门框外沿 1.02 × 2.18、厚 0.077,四个材质全是纯色 baseColorFactor、一张贴图都没有。
// 导出走 `target/tmp/door/export.py 输出 2600`,源文件摆的是开着 90°,按冰箱门那条约定
// 烘成**关着**的;`door_frame`(三根门框)不参与降面 —— 第一版一起降把顶框降歪了 2°。
// 顺手剥了没用的 UV(无贴图还带 TEXCOORD_0,白占一百多 KB)。4.7 MB 的 .blend → 428 KB。

// 「推门而入」分两格镜头:门外没有屋子,穿过门框只会穿进背景色。所以先推到门框跟前
// (画面被门框填满),在最近这一刻用一块幕(跟着补间走的不透明层)盖住换景,再从屋里退到
// 定位镜头。两格镜头的注视点不同(门心 → 屋心),但都走同一个 sphericalPose,所以补间
// 每一段里只插值镜头位置这一个向量。
// 门在画面里占多满:1 = 正好塞满画框。这扇门是本地建模的纯色低面数模型(一张贴图都没有),
// 首屏又几乎占满整屏,所以这个数直接决定「一厘米落到几个像素」—— 留白给太大就等于把
// 细节推到看不清:1.15 是「门完整入画、上下各留一点边」的那一档。
export const LANDING_FILL = 1.15;
// 站位:方位角偏右 11°(与屋里的 30° 同侧,门框厚度与门扇的透视都看得出来)、俯角 6°(≈平视)
export const LANDING_AZIMUTH = (11 * Math.PI) / 180;
export const LANDING_PITCH = (6 * Math.PI) / 180;
// 首屏这一档雾几乎用不上(画面里只有门,而且门在雾的近端之前)。留着是因为走位前段
// 要拿它当起点,换景那一拍再换成屋里按取景算出来的那一档
export const LANDING_FOG = [1.15, 1.9];
// 走到位时离门心多远(米)
export const THRESHOLD_RADIUS = 0.95;
export const THRESHOLD_AZIMUTH = (5 * Math.PI) / 180;
export const THRESHOLD_PITCH = (4 * Math.PI) / 180;
// 幕落在这一头(补间的 0~1):= 走到门框前、换景的那一瞬间
export const ENTER_REVEAL = 0.5;
// 换景之后镜头从「已经站在屋里」起步退到定位镜头:这一段占定位距离的几分之几
export const SETTLE_FROM = 0.82;
export const ENTER_MS = 1900;
// 幕在全黑处停留的这段(占补间的比例):黑一下才换场景,不给眼睛看到换景的那一帧
export const ENTER_HOLD = 0.06;

// 门以外那些 glb 并发补齐的池子大小。取 4:HTTP/1.1 下浏览器每域本来就只有 6 条连接,
// 开满反而互相抢;Draco 解码也有 worker 上限。
export const LOAD_CONCURRENCY = 4;

// 点中一件家具:镜头除了把注视点挪过去,还要按**它自己的尺寸**推近 —— 点床和点鼠标
// 不该拉得一样近。数给的是 fitDistance 的那个 fill:1 = 物品正好塞满画面,1.9 ≈ 占一半高。
// 下限是 DISTANCE_RANGE[0] × 定位距离(也就是滚轮本来能推到的最近处),所以这里不需要
// 临时放宽钳位,也不需要「退出时记得改回来」那份账。
export const ZOOM_FILL = 1.9;
// 拉近与放回的速度(每秒推进多少比例),指数缓出 —— 和开门、转椅一个手感
export const RADIUS_EASE = 3.6;

// 贴图要处理的槽位:斜着看地面时让贴图不发糊靠的是各向异性,不是分辨率
export const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

export const deg = (value) => THREE.MathUtils.degToRad(value);
