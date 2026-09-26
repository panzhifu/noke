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

// ---------- 首屏那一格特写,与「退后看全景」 ----------
//
// 首屏不是一间空房间:加载盖层撤掉的时候,家具、景片、灯光与雾全都就位了(boot 一次性
// 等齐,见 main.js),首屏只是**沿屋里定位那条视线凑近**的同一格镜头。点屏幕任意一下,
// 镜头再沿同一条视线退回定位 —— 两格之间没有旋转、没有换景,补间只插「镜头位置」
// 这一个向量(见 landing.js)。
//
// 曾经这里是「一间空房间」:写死一份 STAGE_SIZE / STAGE_CENTER 把景片先摆出来、家具
// 藏到点进去才显形。撤掉它有两个原因:夜里(默认主题)空房间的墙和地板跟背景一样黑
// (palette.js 的 off-night:墙 0x13151a、地 0x15161b、背景 0x0b0c0f),首屏读不出来;
// 而且那份尺寸是跟着家具养的第二份事实。现在景片与灯都按家具包围盒量(main.js 的
// assembleRoom),首屏没有任何只属于它的东西 —— 只是定位镜头收近了一档。
//
// 特写占定位距离的几分之几:0.55 ≈ 凑到桌椅跟前 —— 再近,椅背就把显示器挡住了;
// 再远,「点一下退后看全景」的那一下落差读不出来(宽视口下定位距离本身就有六七米)。
export const LANDING_RADIUS = 0.55;
// 退后看全景用这么久
export const ENTER_MS = 1400;

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
