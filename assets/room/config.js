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

// 台灯的落点。这几个数必须和 src/room/manifest.rs 里书桌那条对得上:
// 书桌在 (0, 0, -1.4)、桌面高 0.716、桌面 x 大约 ±1.05,所以灯摆在右半边靠后的桌面上。
export const DESK_LAMP = { x: 0.62, y: 0.716, z: -1.3, height: 0.5 };

// 冰箱门开到底的角度(度)。这个数是从 ~/blender/fridge.blend 自带的开门动画里
// 反解出来的:第 1 帧(开)与第 120 帧(闭)两个姿态之间的相对旋转就是 89.888°,
// 铰链在前右竖边 —— 解算脚本见 target/tmp/export_fridge_door.py。
// 门在 glb 里是个独立节点,原点就落在铰链上,所以网页这边只要转它自己的 Y。
export const DOOR_OPEN_DEG = 89.888;
// 开关门的速度(每秒推进多少比例),同样是缓出
export const DOOR_EASE = 4.5;

// 转椅:点一下转一整圈。角度由清单里的 `spin` 给(度),这里只管手感。
// 用指数逼近(起步快、收尾慢),和冰箱门、光照那套一个味道。
export const SPIN_EASE = 4.2;
// 收尾阈值(弧度):残差小于它就落定为整数圈。0.01 rad ≈ 0.57°,
// 最后跳这一下看不见,但能把「永远差 0.0001° 所以循环停不下来」这件事掐掉。
export const SPIN_SETTLE = 0.01;
// 点得太快时不无限排队:最多排到「当前角度 + MAX_QUEUED_TURNS 圈」
export const SPIN_MAX_QUEUED_TURNS = 3;

// hover 时往材质里加的一点自发光(琥珀色),浅背景上够显眼又不刺眼
export const HOVER_EMISSIVE = 0x3a2a10;
export const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

export const deg = (value) => THREE.MathUtils.degToRad(value);
