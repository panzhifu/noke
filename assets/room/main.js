/**
 * 房间的 3D 层 —— 入口与编排。
 *
 * 分工和 CSS 版一样：这里只负责把房间搭出来、让它们能被点到；
 * 「点到之后打开哪一格面板」交给 Leptos —— 通过 noke:pick 事件往外抛。
 *
 * 空间感靠这几件事凑出来，没有一样需要后处理 pass：
 * 墙角把画面收成一个角、雾让地面与墙的远处化进背景、一盏反向补光压住死黑、
 * 暗角与颗粒在 hud.css 里用 CSS 叠一层、能点的家具 hover 时只换个手型指针。
 *
 * 光照有四个状态(日/夜 × 灯关/灯开),它们的差别全在 palette.js 那张表里:
 * 这一层只负责把当前这组颜色与强度逐帧推向目标态 —— 所以「开灯」是渐亮,不是硬切。
 *
 * 点中一件会开面板的家具顺带拉近:focusOn 把注视点挪过去,再写一个目标半径给 loop.js
 * 逐帧推过去(半径按这件东西自己的包围盒算,见 framing.js 的 fitDistance)。收面板时放回、
 * 滚轮一动就作废。
 *
 * 整层是一个阶段状态机(下面的 `phase`),首屏不是「屋子正在加载」而是「一扇门」:
 *   boot     只有门在下载(428 KB),屏幕上是一扇正在开的门图标 + 进度
 *   landing  首屏:画面正中一扇关着的门,背后只有背景色;屋里的 11.6 MB 在后台并发补,先藏着
 *   walking  点了门:推到门框前 → 幕 → 换景 → 退到定位镜头(见 landing.js)
 *   room     已经站在屋里,也就是这一层原本的样子
 *   page     3D 这层起不来(WebGL 拿不到 / 装配炸了),退回纯 DOM 页面
 *
 * 目录里各管一摊，改哪里去哪个文件：
 *   config.js    数值常量与 deg()
 *   palette.js   四个光照状态的颜色/强度表,以及 data-theme + data-lights 的读法
 *   manifest.js  读 #room3d 上的模型清单、把相对路径解析成 URL
 *   scene.js     灯光组、景片(地板 + 两面墙)、按包围盒挪灯
 *   framing.js   按包围盒算取景距离与雾的近远端、按球坐标摆位姿
 *   landing.js   首屏那一格、门框前那一格,以及两段之间的补间与幕
 *   models.js    加载 glb(单件 / 并发一批 / 预热),挑出可点的网格
 *   controls.js  OrbitControls 的角度钳位
 *   loop.js      按需渲染的帧循环(限帧、静置停摆、镜头读数)
 *   gate.js      加载界面、首屏那条进度线、进门时那块幕
 *   main.js      这一份:把上面这些接到一起,管渲染器、阶段、事件、光照状态与拾取
 */

import * as THREE from 'three';
import {
  ANISOTROPY,
  AZIMUTH_LIMITS,
  CAMERA_AZIMUTH,
  CAMERA_FOV,
  DISTANCE_RANGE,
  DOOR_EASE,
  DRAG_THRESHOLD,
  ENTER_HOLD,
  ENTER_MS,
  ENTER_REVEAL,
  ENTRY,
  LAMP_BULB_MATERIAL,
  MAX_DPR,
  PARALLAX_PITCH,
  PARALLAX_YAW,
  PLATTER_RPM,
  POLAR_LIMITS,
  ROOT_ID,
  SPIN_DEG,
  SPIN_EASE,
  SPIN_MAX_QUEUED_TURNS,
  SPIN_SETTLE,
  STATE_EASE,
  ZOOM_FILL,
  WALL_PAD,
} from './config.js';
import { VARIANTS, readVariant, variant, variantKey } from './palette.js';
import { readManifest } from './manifest.js';
import { buildStage, createScene, findLampBulb, fitRig } from './scene.js';
import { deg } from './config.js';
import { CAMERA_PITCH, fitCamera, fitDistance } from './framing.js';
import { createModelLoader } from './models.js';
import { applyPose, createWalkIn, landingPose, roomPose } from './landing.js';
import { createGate } from './gate.js';
import { createControls } from './controls.js';
import { createLoop } from './loop.js';

/** 状态表压成扁平的数字/色值,插值时就只用遍历这一层。 */
function spec(key) {
  const v = variant(key);
  return {
    background: v.background,
    floor: v.floor,
    wallBack: v.wallBack,
    wallSide: v.wallSide,
    hemiSky: v.hemiSky,
    hemiGround: v.hemiGround,
    hemiIntensity: v.hemiIntensity,
    key: v.key,
    keyIntensity: v.keyIntensity,
    fill: v.fill,
    fillIntensity: v.fillIntensity,
    bounce: v.bounce,
    bounceIntensity: v.bounceIntensity,
    lamp: v.lamp,
    lampIntensity: v.lampIntensity,
    lampEmissive: v.lampEmissive,
    exposure: v.exposure,
  };
}

const INTENSITY_KEYS = [
  'hemiIntensity',
  'keyIntensity',
  'fillIntensity',
  'bounceIntensity',
  'lampIntensity',
  'exposure',
];
const COLOR_KEYS = [
  'background',
  'floor',
  'wallBack',
  'wallSide',
  'hemiSky',
  'hemiGround',
  'key',
  'fill',
  'bounce',
  'lamp',
  'lampEmissive',
];

function lerpSpec(from, to, alpha) {
  const out = {};
  for (const key of INTENSITY_KEYS) out[key] = from[key] + (to[key] - from[key]) * alpha;
  for (const key of COLOR_KEYS) {
    out[key] = new THREE.Color(from[key]).lerp(new THREE.Color(to[key]), alpha).getHex();
  }
  return out;
}

/** 不急着做的事交给空闲期;没有 requestIdleCallback 的浏览器退回一个 timeout。 */
function idle(task) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: 2000 });
  } else {
    setTimeout(task, 0);
  }
}

function start(host) {
  const manifest = readManifest(host);
  const gate = createGate();
  // 整层是一个阶段状态机(boot / landing / walking / room / page),文件头那张表是它的说明
  let phase = 'boot';

  /**
   * 3D 这层起不来(WebGL 拿不到、一件家具都没加载上、装配抛了):把页面交还给 DOM。
   * 加载界面不能留在屏上 —— 它是在等一个不会来的阶段。
   * 这是个函数声明而不是 const:最早的失败(WebGL 拿不到)发生在下面那些状态都还在 TDZ 的时候。
   */
  function giveUpToPage() {
    phase = 'page';
    gate.setPhase('page');
    gate.roomProgress(1);
    host.dataset.phase = 'page';
    host.dataset.roomReady = '1';
    document.dispatchEvent(new CustomEvent('noke:room-ready'));
  }

  let renderer;
  try {
    // powerPreference: 双显卡的笔记本上让浏览器优先挑独显那张
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    // WebGL 拿不到(老浏览器、软渲染被禁、隐私模式……):整层跳过。
    // 页面上的 DOM 入口照常能用,不会因为房间起不来就白屏。
    console.warn('[room3d] WebGL 不可用,房间这层跳过', error);
    giveUpToPage();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.shadowMap.enabled = true;
  // r186 起 PCFSoftShadowMap 被移除了,PCFShadowMap 是现在的默认与推荐值
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // 默认每帧重画一遍阴影贴图,而转动时最贵的就是这一笔:方向光的投影相机不跟着镜头动,
  // 场景里唯一会挪的东西只有视差那 0.07 弧度。改成按需更新 —— 只有几何真的动了才补一张。
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const anisotropy = Math.min(ANISOTROPY, renderer.capabilities.getMaxAnisotropy() ?? 1);

  let current = spec(readVariant());
  renderer.toneMappingExposure = current.exposure;

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 2000);
  const lights = createScene(current);
  const { scene } = lights;
  const rig = new THREE.Group();
  scene.add(rig);
  const controls = createControls(camera, renderer.domElement);
  // 首屏那一格镜头是摆好的,不许拖:能拖就等于承认这里已经是一间屋子了
  controls.enabled = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- 阶段手里的那些东西 ----------
  let models = null;
  // 屋里那 11 件:边下边藏起来(visible=false),首屏那一格里只该有门
  let furniture = [];
  // 首屏那件东西(门)与屋里的景片:进屋就是这两者的可见性对调一次,换的那一帧由幕盖住
  let landingDoor = null;
  let landingBox = null;
  let roomStage = null;
  let stages = [];
  let platter = null;
  // 唱盘那一圈角速度(弧度/秒)
  const platterOmega = (PLATTER_RPM * Math.PI * 2) / 60;
  let lampBulb = null;
  let door = null;
  let spin = null;
  let pickables = [];
  let loadedNames = [];
  let meshCount = 0;
  let center = new THREE.Vector3();
  let size = new THREE.Vector3(1, 1, 1);
  let framing = null;
  // 两格位姿:首屏(点门的起点)与屋里定位(补间的终点)
  let landing = null;
  let room = null;
  let walk = null;
  // 家具齐了 + 预热完了才算「能进」;在那之前点了门只是先把门打开
  let roomReady = false;
  let pendingEnter = false;
  let placed = false;
  let reduced = motionQuery.matches;
  let hovered = null;
  let focused = null;
  let dragging = null;
  let from = current;
  let goal = current;
  let blend = 1;
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const targetGoal = new THREE.Vector3();
  // 点中一件家具拉近、收面板放回定位镜头,用的都是这一个「目标半径」,由 loop.js 逐帧推过去
  const radiusGoal = { value: null };
  // applyPose 一次要写三样:相机、OrbitControls 的注视点、还有 loop.js 每帧去追的那个目标
  const poseCtx = { controls, fog: scene.fog, targetGoal };
  // 首屏那一格只有门能点,进了屋才是全部
  let pickList = [];

  /** 把 current 这组值灌进场景。颜色全部新建对象,免得几处共用一个 Color 互相改。 */
  const syncScene = () => {
    renderer.toneMappingExposure = current.exposure;
    scene.background = new THREE.Color(current.background);
    scene.fog.color = new THREE.Color(current.background);
    lights.hemi.color = new THREE.Color(current.hemiSky);
    lights.hemi.groundColor = new THREE.Color(current.hemiGround);
    lights.hemi.intensity = current.hemiIntensity;
    lights.key.color = new THREE.Color(current.key);
    lights.key.intensity = current.keyIntensity;
    lights.fill.color = new THREE.Color(current.fill);
    lights.fill.intensity = current.fillIntensity;
    lights.bounce.color = new THREE.Color(current.bounce);
    lights.bounce.intensity = current.bounceIntensity;
    lights.lamp.color = new THREE.Color(current.lamp);
    lights.lamp.intensity = current.lampIntensity;
    if (lampBulb) lampBulb.emissive = new THREE.Color(current.lampEmissive);
    for (const stage of stages) {
      stage.floor.material.color = new THREE.Color(current.floor);
      stage.walls.back.material.color = new THREE.Color(current.wallBack);
      stage.walls.side.material.color = new THREE.Color(current.wallSide);
    }
  };

  /**
   * 状态变了:记下起点与目标,剩下的交给帧循环去插值。
   * 起点取「当前插到哪儿了」而不是上一个完整状态,所以在渐变中途再切一次也不会跳。
   */
  const applyState = (key, animate = true) => {
    goal = spec(key);
    if (!animate || reduced) {
      from = goal;
      blend = 1;
      current = goal;
      syncScene();
    } else {
      from = current;
      blend = 0;
    }
    renderer.shadowMap.needsUpdate = true;
    frame.invalidate();
  };

  /** 每帧推一点(返回 true = 还在动,循环不许停,否则渐变会卡在半路)。 */
  const stepState = (dt) => {
    if (blend >= 1) return false;
    blend = Math.min(1, blend + dt * STATE_EASE);
    // easeOutCubic:起步快、收尾慢
    const eased = 1 - (1 - blend) ** 3;
    current = blend >= 1 ? goal : lerpSpec(from, goal, eased);
    syncScene();
    return blend < 1;
  };

  /**
   * 会开关的部件(背墙上那扇门、冰箱门、唱机的防尘盖)。点一下开 / 合,默认关着 ——
   * 绕清单给的那根轴转清单给的那个角度:那个节点的原点就在铰链上(导出时定的),
   * 所以这里只管 `rotation[axis]`。
   * 轴与角度必须跟着模型走:冰箱门是竖直铰链(绕 y、89.888°),防尘盖是水平铰链
   * (绕 x、85.552°)—— 早先这里写死 `rotation.y` + 一个全局 `DOOR_OPEN_DEG`,
   * 第二扇「门」一接上就必有一件是错的。
   */
  const toggleDoor = (spec) => {
    if (!spec) return;
    const open = deg(spec.deg);
    if (!door || door.node !== spec.node) {
      door = { node: spec.node, axis: spec.axis, angle: 0, target: open, open: true };
    } else {
      door.open = !door.open;
      door.target = door.open ? open : 0;
    }
    // 状态用显式的 open 标志,不看 target 的正负:防尘盖的「掀开」是**负**角度
    // (glb 里烘的是关着的姿态),按符号判断会把两件事报反。
    host.dataset.door = door.open ? 'open' : 'closed';
    frame.invalidate();
  };

  const stepDoor = (dt) => {
    if (!door) return false;
    const delta = door.target - door.angle;
    if (Math.abs(delta) < 1e-3) {
      if (door.angle !== door.target) {
        door.angle = door.target;
        door.node.rotation[door.axis] = door.angle;
        renderer.shadowMap.needsUpdate = true;
      }
      return false;
    }
    // 指数逼近:起步快、收尾慢,和光照那套一个手感
    door.angle += delta * Math.min(1, dt * DOOR_EASE);
    door.node.rotation[door.axis] = door.angle;
    // 门在动,阴影贴图得跟着重画
    renderer.shadowMap.needsUpdate = true;
    return true;
  };

  /**
   * 转椅。点一下加一圈(度数在 config 的 SPIN_DEG),缓出停下。
   * 转的是清单里 `spin` 那个节点(上半身)自己的 rotation.y —— 累加在它此刻的角度上(`base`),
   * 所以家具在清单里怎么摆朝向都不影响转。节点原点在底盘立柱上,转出来是原地打转不是公转;
   * 底座是另一个节点,不动 —— 轮子留在地上,只有座椅 + 椅背 + 扶手转。
   * 连点不丢:目标角往后加,最多排到 SPIN_MAX_QUEUED_TURNS 圈。
   */
  const toggleSpin = (node) => {
    if (!node) return;
    const turn = deg(SPIN_DEG);
    if (!spin || spin.node !== node) {
      spin = { node, base: node.rotation.y, angle: 0, target: 0, turns: 0, animating: false };
    }
    spin.target = Math.min(spin.target + turn, spin.angle + turn * SPIN_MAX_QUEUED_TURNS);
    spin.animating = true;
    host.dataset.spin = 'spinning';
    frame.invalidate();
  };

  const stepSpin = (dt) => {
    if (!spin || !spin.animating) return false;
    const delta = spin.target - spin.angle;
    // 落定的判据是「还在动没动」,不是「角度是否恰好相等」:帧率一低,指数逼近一步就
    // 直接落到目标角(dt*EASE ≥ 1 时 Math.min 会取 1),angle === target 会让这段收尾
    // 永远进不来 —— data-spin 就卡在 spinning 了(软渲染下实测过)。
    if (Math.abs(delta) < SPIN_SETTLE) {
      spin.animating = false;
      // 把累计角度折回「一圈之内」,免得转几个月之后浮点精度变差
      const full = Math.PI * 2;
      const laps = Math.round(spin.target / full);
      spin.turns += laps;
      spin.angle = spin.target - laps * full;
      spin.target = spin.angle;
      spin.node.rotation.y = spin.base + spin.angle;
      host.dataset.spin = 'idle';
      host.dataset.turns = String(spin.turns);
      renderer.shadowMap.needsUpdate = true;
      return true;
    }
    spin.angle += delta * Math.min(1, dt * SPIN_EASE);
    spin.node.rotation.y = spin.base + spin.angle;
    // 转椅的几何真的在动,阴影贴图得跟着重画(和冰箱门一样是按需更新)
    renderer.shadowMap.needsUpdate = true;
    return true;
  };

  /**
   * 唱盘:房间灯开着就转(33⅓ 转/分),灯一关就停。
   * 「什么时候转」交给房间灯那枚开关,是因为这个循环是**按需渲染**的 —— 唱盘常转就等于
   * 帧循环永不停摆;挂在灯上,关灯静置照样停摆,省电那条还剩一半。
   * 阴影贴图不跟着重画:盘是圆的,转起来投影没变(盘面上那圈标签跟着转,但它是平的)。
   * 还要求已经在屋里:首屏那一段时间唱机还藏着,让它继续报「还在动」就是白白吊着帧循环。
   */
  const stepPlatter = (dt) => {
    if (!platter || phase !== 'room') return false;
    if (document.documentElement.dataset.lights !== 'on') return false;
    platter.rotation.y += platterOmega * dt;
    // 折回一圈之内(一圈正好是 2π,视觉无跳变),连开几天也不掉精度
    if (platter.rotation.y > Math.PI * 2) platter.rotation.y -= Math.PI * 2;
    return true;
  };

  const stepWalk = (dt) => {
    if (!walk) return false;
    const going = walk.step(dt);
    if (!going) walk = null;
    return going;
  };

  const applyFog = () => {
    if (!framing) return;
    scene.fog.near = framing.fogNear;
    scene.fog.far = framing.fogFar;
  };

  /**
   * 取景始终按初始方位角(30°)算,不跟用户转到的角度走。
   * 因为包围盒是 4.76 宽 × 3.4 深,投影宽度恰好在 30°~40° 最大 ——
   * 拿这个「最坏角度」定距离,整段方位角范围内都不会有东西被切出画框,
   * 而且 resize 时也不会因为用户转了角度就把构图改掉。
   */
  const framingAzimuth = () => CAMERA_AZIMUTH;

  /**
   * 屋里那一格。第一次按固定俯角与方位角摆好;之后(窗口变化或添了家具)只改半径、
   * 保住用户已经转到的角度,不然每次 resize 都会被拽回正前方。
   */
  const refit = () => {
    if (!framing) return;
    // 定位距离随窗口变了,按旧值算出来的拉近目标已经没有意义
    radiusGoal.value = null;
    const look = framing.center;
    const spherical = new THREE.Spherical();
    if (placed) {
      spherical.setFromVector3(camera.position.clone().sub(controls.target));
    } else {
      spherical.phi = Math.PI / 2 - CAMERA_PITCH;
      spherical.theta = CAMERA_AZIMUTH;
      placed = true;
    }
    spherical.radius = framing.distance;
    spherical.makeSafe();
    camera.position.copy(look.clone().add(new THREE.Vector3().setFromSpherical(spherical)));
    controls.target.copy(look);
    controls.minDistance = framing.distance * DISTANCE_RANGE[0];
    controls.maxDistance = framing.distance * DISTANCE_RANGE[1];
    if (!focused) targetGoal.copy(look);
    controls.update();
  };

  /**
   * 按当前阶段重新摆镜头。resize 只该改「装得下」,不该改构图:
   * 屋里保住用户已经转到的角度(只跟着改半径),首屏重新贴着门摆一次。
   * 走位途中直接跳过:那期间每一帧都由补间写镜头,aspect 在 applyPose 里跟着改。
   */
  const layoutPose = () => {
    if (phase === 'walking') return;
    if (phase === 'room') {
      framing = fitCamera(camera, host, center, size, framingAzimuth());
      applyFog();
      refit();
      return;
    }
    if (!landingBox) return;
    // 屋里的定位镜头跟着窗口重算一份:可能已经装配完了,只是人还没进门
    if (framing) {
      framing = fitCamera(camera, host, center, size, framingAzimuth());
      room = roomPose(framing);
    }
    landing = landingPose(camera, host, landingBox);
    applyPose(camera, host, landing, poseCtx);
  };

  const setHovered = (mesh) => {
    if (mesh === hovered) return;
    hovered = mesh;
    // 能点的家具只换个手型指针 + 写一个 data-hover 供核对,不去动材质 —— 画面没变,
    // 也就用不着为悬停多画一帧
    host.dataset.hover = hovered
      ? hovered.userData.spot || (hovered.userData.door ? 'door' : hovered.userData.spin ? 'spin' : '')
      : '';
    host.style.cursor = hovered ? 'pointer' : '';
  };

  const pickAt = (updateHover) => {
    if (!pickList.length) return null;
    // 射线用的是世界矩阵,而矩阵本来只在画那一帧被刷新 —— 点击这一下不能指望刚排上的帧
    // 已经画过(窗口不可见时 rAF 压根不跑)。一次遍历,换「点哪儿就是哪儿」。
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickList, false)[0];
    const mesh = hit ? hit.object : null;
    if (updateHover) setHovered(mesh);
    return mesh;
  };

  const frame = createLoop({
    host,
    renderer,
    scene,
    camera,
    controls,
    rig,
    parallax,
    targetGoal,
    radiusGoal,
    isReduced: () => reduced,
    step: (dt) => {
      // 这几件事都要推:光照渐变、门、转椅、唱盘、进门的走位
      // (别让前一个把后一个短路掉)
      const blending = stepState(dt);
      const swinging = stepDoor(dt);
      const turning = stepSpin(dt);
      const spinning = stepPlatter(dt);
      const walking = stepWalk(dt);
      return blending || swinging || turning || spinning || walking;
    },
    pick: () => pickAt(true),
  });

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    layoutPose();
    frame.invalidate();
  };

  /**
   * 换景:首屏那扇门退场,屋里的景片与家具一起显形,台灯那盏聚光归位。
   * 整个过程只在补间里幕全黑的那一帧发生一次,所以谁都看不见这里换了什么。
   */
  const revealRoom = () => {
    if (landingDoor) landingDoor.visible = false;
    for (const node of furniture) node.visible = true;
    if (roomStage) roomStage.group.visible = true;
    lights.lamp.visible = true;
    pickList = pickables;
    renderer.shadowMap.needsUpdate = true;
  };

  /** 走完最后一拍:镜头交还给 OrbitControls,顶栏与面板入口这才算用得上。 */
  const finishWalk = () => {
    phase = 'room';
    gate.setPhase('room');
    host.dataset.phase = 'room';
    gate.wipe(0);
    walk = null;
    controls.enabled = true;
    // placed=false 让 refit 按初始方位角/俯角摆一次,也就是补间终点那一格
    placed = false;
    refit();
    applyFog();
    frame.invalidate();
  };

  const beginWalk = () => {
    if (!landing || !room) return;
    phase = 'walking';
    gate.setPhase('walking');
    host.dataset.phase = 'walking';
    setHovered(null);
    // 视差先归零:整间屋子正在自己动,再让鼠标带着那点俯仰就是两笔晃动叠在一起
    parallax.tx = 0;
    parallax.ty = 0;
    walk = createWalkIn({
      from: landing,
      to: room,
      duration: ENTER_MS,
      revealAt: ENTER_REVEAL,
      hold: ENTER_HOLD,
      onReveal: revealRoom,
      onDone: finishWalk,
      apply: (pose, curtain) => {
        applyPose(camera, host, pose, poseCtx);
        gate.wipe(curtain);
      },
    });
    frame.invalidate();
  };

  /**
   * 推门而入。家具没齐就先只把门打开(点击那里门已经转起来了),
   * 后台补齐 + 预热一完成就自己接上走位。
   */
  const enterRoom = () => {
    if (phase !== 'landing') return;
    if (!roomReady) {
      pendingEnter = true;
      return;
    }
    if (reduced) {
      revealRoom();
      finishWalk();
      return;
    }
    beginWalk();
  };

  host.addEventListener('pointermove', (event) => {
    const rect = host.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointer.set(nx * 2 - 1, -(ny * 2 - 1));
    if (dragging) {
      dragging.travel += Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0);
      frame.invalidate();
      return;
    }
    if (!reduced) {
      parallax.tx = (nx - 0.5) * PARALLAX_YAW;
      parallax.ty = -(ny - 0.5) * PARALLAX_PITCH;
    }
    // 拾取交给下一帧(见 loop.js),这里只记下指针动了
    frame.requestPick();
  });

  host.addEventListener('pointerleave', () => {
    pointer.set(-10, -10);
    parallax.tx = 0;
    parallax.ty = 0;
    setHovered(null);
  });

  host.addEventListener('pointerdown', (event) => {
    dragging = { travel: 0 };
    frame.invalidate();
    void event;
  });

  host.addEventListener('pointerup', () => {
    if (!dragging) return;
    const traveled = dragging.travel;
    dragging = null;
    // 走位途中不接受点击:镜头自己在动,拾取到的是每帧换掉的东西
    if (traveled > DRAG_THRESHOLD || phase === 'walking') return;
    const mesh = pickAt(false);
    frame.invalidate();
    if (!mesh) return;
    // 会动的家具优先:门是开关、转椅是转圈,都不开面板
    if (mesh.userData.door) {
      toggleDoor(mesh.userData.door);
      // 首屏那扇门顺带是入口:开它的同时推门进去
      if (mesh.userData.owner === ENTRY.name) enterRoom();
      return;
    }
    if (mesh.userData.spin) {
      toggleSpin(mesh.userData.spin);
      return;
    }
    if (!mesh.userData.spot) return;
    focusOn(mesh);
    document.dispatchEvent(new CustomEvent('noke:pick', { detail: mesh.userData.spot }));
  });

  /**
   * 点中一件家具:注视点挪过去 + 按这件东西自己的个头拉近。
   * 拉近的量走 fitDistance(和量门用的是同一条式子,ZOOM_FILL 决定它占画面多大),再夹在
   * 「滚轮本来就推得到的最近处」与定位距离之间 —— 于是点床只是凑近一点,点键盘才会真的贴脸,
   * 而且不用临时去放宽 OrbitControls 的钳位(放开了就得记得改回来,那笔账最容易漏)。
   * 镜头位置本身还是 OrbitControls 在管,这里只给目标,不去抢。
   */
  const focusOn = (mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const middle = box.getCenter(new THREE.Vector3());
    const size3 = box.getSize(new THREE.Vector3());
    targetGoal.copy(middle);
    targetGoal.y -= size3.y * 0.15;
    if (framing) {
      const near = fitDistance(camera, host, size3, ZOOM_FILL);
      radiusGoal.value = Math.min(
        Math.max(near, framing.distance * DISTANCE_RANGE[0]),
        framing.distance
      );
    }
    focused = mesh.userData.spot;
    host.dataset.focused = focused || '';
    frame.invalidate();
  };

  const releaseFocus = () => {
    if (focused === null) return;
    focused = null;
    if (framing) {
      targetGoal.copy(framing.center);
      radiusGoal.value = framing.distance;
    }
    host.dataset.focused = '';
    frame.invalidate();
  };

  // 面板被关掉(往往是 Esc)时,注视点也该退回场景中心
  document.addEventListener('noke:panel-closed', releaseFocus);
  // 键盘那条入口上的「推门而入」:和点门走的是同一条路
  document.addEventListener('noke:enter', enterRoom);

  // 拖拽、滚轮缩放、阻尼滑动都会走这里 —— 按需渲染的唤醒源主要靠它
  controls.addEventListener('change', frame.invalidate);
  // 滚轮一动就是用户自己在缩放:那次「拉近」的意图就此作废,否则两边抢同一个半径
  host.addEventListener(
    'wheel',
    () => {
      radiusGoal.value = null;
      frame.invalidate();
    },
    { passive: true }
  );

  window.addEventListener('resize', resize);

  motionQuery.addEventListener('change', (event) => {
    reduced = event.matches;
    if (reduced) {
      rig.rotation.set(0, 0, 0);
      parallax.tx = 0;
      parallax.ty = 0;
    }
    frame.invalidate();
  });

  // data-theme(昼夜)与 data-lights(房间灯)任一变化都走这里
  const observer = new MutationObserver(() => {
    const theme = document.documentElement.dataset.theme;
    const lightsOn = document.documentElement.dataset.lights;
    if (theme === host.dataset.theme && lightsOn === host.dataset.lights) return;
    host.dataset.theme = theme || '';
    host.dataset.lights = lightsOn || '';
    host.dataset.variant = variantKey(theme, lightsOn);
    applyState(host.dataset.variant, true);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-lights'],
  });

  const stats = () => ({
    phase,
    models: loadedNames,
    meshes: meshCount,
    pickable: pickables.length,
    lights: 5,
    walls: 2,
    fog: true,
    controls: 'orbit',
    fov: CAMERA_FOV,
    pitchDeg: Number(((CAMERA_PITCH * 180) / Math.PI).toFixed(1)),
    azimuthDeg: Number(((CAMERA_AZIMUTH * 180) / Math.PI).toFixed(1)),
    polarLimits: POLAR_LIMITS,
    azimuthLimits: AZIMUTH_LIMITS,
    distanceRange: DISTANCE_RANGE,
    variants: Object.keys(VARIANTS),
    // 清单里那些「能开关的部件」:名字 = 节点:轴@角度 —— 用来核对轴与角度真的跟着模型走
    // (以前这里是一个全局 doorOpenDeg,第二扇门一接上就露馅)
    // 首屏那扇门也算一扇,所以它排在最前面
    doors: [`${ENTRY.name}=${ENTRY.door.node}:${ENTRY.door.axis}@${ENTRY.door.deg}`].concat(
      manifest
        .filter((item) => item.door)
        .map((item) => `${item.name}=${item.door.node}:${item.door.axis}@${item.door.deg}`)
    ),
    stateEase: STATE_EASE,
    demandRendering: true,
    // 装配完立刻的累计帧数:证明 boot 阶段没有连画一堆帧(静置后是否真停下,
    // 得在可见窗口的 devtools 里看 dataset.frames 会不会一直涨)
    frameAtBoot: renderer.info.render.frame,
    // 首屏那一格离门多远(米):核对构图 —— 门要完整入画又不能太小
    landingMeters: landing ? Number(landing.position.distanceTo(landing.target).toFixed(2)) : null,
    enterMs: ENTER_MS,
    revealAt: ENTER_REVEAL,
    anisotropy,
    pixelRatio: renderer.getPixelRatio(),
    // 场景包围盒:床或桌子摆歪、单位没换算对,这里一眼就能看出来(米)
    spanMeters: [Number(size.x.toFixed(2)), Number(size.y.toFixed(2)), Number(size.z.toFixed(2))],
    centerMeters: [Number(center.x.toFixed(2)), Number(center.y.toFixed(2)), Number(center.z.toFixed(2))],
  });

  /**
   * 首屏那一格:只有门,摆在画面正中,背后就是背景色。
   *
   * 三步:把门的包围盒中心挪到世界原点(它因此正好在画框中心,视差那点俯仰也是绕它转的)、
   * 按门自己的尺寸摆镜头、**给渲染器定尺寸**。最后这条别省:画布默认 300×150,而 CSS 把
   * 画布拉满全屏 —— 不 setSize 出来的就是一屏糊的东西。
   */
  const buildLanding = (doorNode) => {
    rig.updateMatrixWorld(true);
    const middle = new THREE.Box3().setFromObject(doorNode).getCenter(new THREE.Vector3());
    doorNode.position.sub(middle);
    rig.updateMatrixWorld(true);
    landingBox = new THREE.Box3().setFromObject(doorNode);
    landingDoor = doorNode;
    // 台灯那盏聚光照的是书桌,而书桌还没来;首屏也没有地面能接住这圈光
    lights.lamp.visible = false;
    // 灯与阴影相机先按门这一小段量一次:三盏光都是平行的,只有方向要紧(见 fitRig)
    fitRig(lights, lights.focus, [doorNode]);
    syncScene();
    resize();
    renderer.compile(scene, camera);
    pickList = models.stats().pickables.filter((mesh) => mesh.userData.owner === ENTRY.name);

    phase = 'landing';
    gate.setPhase('landing');
    gate.bootProgress(1);
    host.dataset.phase = 'landing';
    frame.invalidate();
  };

  /**
   * 家具齐了之后把屋里那一格搭出来:量包围盒 → 建景片 → 挂墙的贴墙 → 台灯与唱盘从模型里
   * 认出来 → 算好定位镜头。
   * 首屏还占着画面,所以整个过程不碰镜头,只把 `room` 那一格算出来等着。
   */
  const assembleRoom = () => {
    const assembled = models.stats();
    loadedNames = assembled.loaded;
    meshCount = assembled.meshes;
    pickables = assembled.pickables;
    if (!pickables.length && !loadedNames.length) {
      console.warn('[room3d] 一个模型都没加载上');
      return false;
    }

    // 嵌在墙上的那几件(墙上当封面的黑胶)不参与取景:墙的位置就是从这个盒子推出来的,
    // 算进去等于把墙自己推远,而且这个反馈没有不动点(见 manifest.rs 的 wall 字段)
    const measured = furniture.filter((node) => !node.userData.wall);
    const fitted = fitRig(lights, lights.focus, measured);
    center = fitted.center;
    size = fitted.size;

    // 台灯进清单了(scene.js 里那盏程序化的已经拆了):「房间灯」那盏聚光挂在**灯泡**上,
    // 开灯时的自发光也落在它身上。灯放在灯泡底缘再往下 2cm,不放球心 —— 罩子是扣在灯泡上的,
    // 光得从罩口漏到桌面上来。跟着视差组走(和整间屋子一起被鼠标带着那点俯仰),和拆之前一样。
    const bulb = findLampBulb(rig);
    if (bulb) {
      lampBulb = bulb.material;
      rig.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(bulb);
      const at = rig.worldToLocal(
        new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y - 0.02, (box.min.z + box.max.z) / 2),
      );
      rig.add(lights.lamp, lights.lamp.target);
      lights.lamp.position.copy(at);
      lights.lamp.target.position.set(at.x, at.y - 1, at.z);
    } else {
      console.warn(`[room3d] 清单里认不出台灯的灯泡(材质名 ${LAMP_BULB_MATERIAL}),开灯时没有那团暖光`);
    }

    // 唱盘:唱机 glb 里单独分出来的 platter 节点,房间灯开着时它转(见 stepPlatter)
    platter = rig.getObjectByName('platter') || null;
    if (!platter) console.warn('[room3d] 唱机里没有 platter 节点,唱盘不会转');

    // 屋里的景片:地板 + 两面墙,尺寸全从家具包围盒倒推。建好先藏着,等换景那一帧开出来。
    roomStage = buildStage(current, size, center, Math.max(size.x, size.z));
    rig.add(roomStage.group);
    roomStage.group.visible = false;
    stages = [roomStage];
    // 挂在背墙上的家具(墙上当封面的那张黑胶)统一贴到墙面上。
    // 离墙 3mm:它们自己的网格和墙是两套网格,共面的那条边会打架(z-fighting)。
    // 清单里写的那个 z 只是给 devtools 看着方便,真正贴上去靠这一行。
    for (const node of rig.children) {
      if (node.userData.wall) node.position.z = roomStage.walls.backZ + 0.003;
    }

    framing = fitCamera(camera, host, center, size, framingAzimuth());
    room = roomPose(framing);
    syncScene();
    renderer.shadowMap.needsUpdate = true;
    frame.invalidate();

    host.dataset.stats = JSON.stringify(stats());
    host.dataset.roomReady = '1';
    host.dataset.theme = document.documentElement.dataset.theme || '';
    host.dataset.lights = document.documentElement.dataset.lights || '';
    host.dataset.variant = readVariant();
    document.dispatchEvent(new CustomEvent('noke:room-ready'));
    return true;
  };

  const boot = async () => {
    models = createModelLoader(rig, anisotropy);

    try {
      // ---- ① 门先到:428 KB,屋里的 11.6 MB 排在它后面 ----
      const doorNode = await models.load(ENTRY, {
        onBytes: (event) => {
          // 没有 Content-Length(流式 / 缓存命中)就报不出比例,交给 bootProgress(1) 收尾
          if (event && event.lengthComputable && event.total) {
            gate.bootProgress(event.loaded / event.total);
          }
        },
      });
      if (doorNode) buildLanding(doorNode);

      // ---- ② 屋里那 11 件在后台并发补齐;门没到就不藏,直接是屋里 ----
      furniture = (await models.loadAll(manifest.filter(Boolean), {
        hidden: Boolean(doorNode),
        onItem: (done, total) => gate.roomProgress(total ? done / total : 1),
      })).filter(Boolean);

      if (!assembleRoom()) {
        giveUpToPage();
        return;
      }

      if (!doorNode) {
        revealRoom();
        finishWalk();
        return;
      }
      // 预热(编译着色器 + 上传贴图)是个长任务,而且必须等全部字节到齐之后做;
      // 做完才放行 enterRoom —— 早就点过门的话这里自己接上。
      idle(() => {
        models.prewarm(renderer, scene, camera);
        roomReady = true;
        if (pendingEnter) enterRoom();
      });
    } catch (error) {
      // 装配炸了要能看见:否则只剩一个「什么都没发生」的空场景
      console.warn('[room3d] 装配失败', error);
      host.dataset.bootError = `${error && error.message ? error.message : error}`;
      giveUpToPage();
    } finally {
      models.dispose();
    }
  };

  boot();
}

function findHost() {
  const host = document.getElementById(ROOT_ID);
  if (host && !host.dataset.roomReady && !host.dataset.phase) start(host);
}

// Leptos 是客户端渲染，DOM 出现的时间不确定：事件 + 立即试一次，两头都覆盖。
document.addEventListener('noke:room-mounted', findHost);
findHost();
