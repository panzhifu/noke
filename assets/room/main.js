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
 * 整层是一个阶段状态机(下面的 `phase`),首屏是家具的特写,点一下退后看全景:
 *   boot     屋里的模型在并发下载(全套 11.6 MB),加载盖层占屏、按件数报进度
 *   landing    首屏:定位镜头沿同一条视线凑近的那一格(见 landing.js 的 landingPose)
 *   entering   点了屏幕:镜头沿同一条视线缓退到定位(没有旋转、没有换景)
 *   room     已经退到定位,也就是这一层原本的样子
 *   page     3D 这层起不来(WebGL 拿不到 / 装配炸了),退回纯 DOM 页面
 *
 * 目录里各管一摊，改哪里去哪个文件：
 *   config.js    数值常量与 deg()
 *   palette.js   四个光照状态的颜色/强度表,以及 data-theme + data-lights 的读法
 *   manifest.js  读 #room3d 上的模型清单、把相对路径解析成 URL
 *   scene.js     灯光组、地板、按包围盒挪灯
 *   framing.js   按包围盒算取景距离与雾的近远端、按球坐标摆位姿
 *   landing.js   首屏那一格特写、屋里定位那一格,以及两格之间的补间
 *   models.js    加载 glb(单件 / 并发一批 / 预热),挑出可点的网格
 *   controls.js  OrbitControls 的角度钳位
 *   loop.js      按需渲染的帧循环(限帧、静置停摆、镜头读数)
 *   gate.js      加载盖层与进度
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
  ENTER_MS,
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
} from './config.js';
import { VARIANTS, readVariant, variant, variantKey } from './palette.js';
import { readManifest } from './manifest.js';
import { boundsOf, createFloor, createScene, findLampBulb, fitRig } from './scene.js';
import { deg } from './config.js';
import { CAMERA_PITCH, fitCamera, fitDistance } from './framing.js';
import { createModelLoader } from './models.js';
import { applyPose, createReveal, landingPose, roomPose } from './landing.js';
import { createGate } from './gate.js';
import { createControls } from './controls.js';
import { createLoop } from './loop.js';

/** 状态表压成扁平的数字/色值,插值时就只用遍历这一层。 */
function spec(key) {
  const v = variant(key);
  return {
    background: v.background,
    floor: v.floor,
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

function start(host) {
  const manifest = readManifest(host);
  const gate = createGate();
  // 整层是一个阶段状态机(boot / landing / entering / room / page),文件头那张表是它的说明
  let phase = 'boot';

  /**
   * 3D 这层起不来(WebGL 拿不到、一件家具都没加载上、装配抛了):把页面交还给 DOM。
   * 加载界面不能留在屏上 —— 它是在等一个不会来的阶段。
   * 这是个函数声明而不是 const:最早的失败(WebGL 拿不到)发生在下面那些状态都还在 TDZ 的时候。
   */
  function giveUpToPage() {
    phase = 'page';
    gate.setPhase('page');
    gate.progress(1);
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
  // 屋里那十几件:加载盖层撤掉之前就全部就位,首屏那一格里它们都在
  let furniture = [];
  // 一块地板:按家具包围盒量出来铺,墙没有 —— 屋子是一圈化进雾里的开放地台
  let floor = null;
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
  // 两格位姿:首屏的特写(点一下的起点)与屋里定位(补间的终点)
  let landing = null;
  let room = null;
  let reveal = null;
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
  // 首屏那一格不拾取任何东西(点屏幕任意处都是「进去」),进了屋才是家具
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
    if (!floor) return;
    floor.material.color = new THREE.Color(current.floor);
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
   * 会开关的部件(冰箱门、唱机的防尘盖)。点一下开 / 合,默认关着 ——
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

  const stepReveal = (dt) => {
    if (!reveal) return false;
    const going = reveal.step(dt);
    if (!going) reveal = null;
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
   * 屋里保住用户已经转到的角度(只跟着改半径),首屏重新贴着家具摆一次特写。
   * 补间途中直接跳过:那期间每一帧都由补间写镜头,aspect 在 applyPose 里跟着改。
   */
  const layoutPose = () => {
    if (phase === 'entering') return;
    if (phase === 'room') {
      framing = fitCamera(camera, host, center, size, framingAzimuth());
      applyFog();
      refit();
      return;
    }
    // boot:取景还没算出来,加载盖层占着屏,没什么可摆;landing:重新贴一次特写
    if (!framing) return;
    framing = fitCamera(camera, host, center, size, framingAzimuth());
    room = roomPose(framing);
    landing = landingPose(framing);
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
      // 这几件事都要推:光照渐变、门、转椅、唱盘、退后看全景的补间
      // (别让前一个把后一个短路掉)
      const blending = stepState(dt);
      const swinging = stepDoor(dt);
      const turning = stepSpin(dt);
      const spinning = stepPlatter(dt);
      const entering = stepReveal(dt);
      return blending || swinging || turning || spinning || entering;
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

  /** 补间走完:镜头交还给 OrbitControls,顶栏与面板入口这才算用得上。 */
  const finishReveal = () => {
    phase = 'room';
    gate.setPhase('room');
    host.dataset.phase = 'room';
    reveal = null;
    controls.enabled = true;
    // 能点的家具从这一拍起才接进拾取:特写那一格里点哪儿都是「退后」,不该有悬停手型
    pickList = pickables;
    // placed=false 让 refit 按初始方位角/俯角摆一次,也就是补间终点那一格
    placed = false;
    refit();
    applyFog();
    frame.invalidate();
  };

  const beginReveal = () => {
    if (!landing || !room) return;
    phase = 'entering';
    gate.setPhase('entering');
    host.dataset.phase = 'entering';
    setHovered(null);
    // 视差先归零:镜头自己在退,再让鼠标带着那点俯仰就是两笔晃动叠在一起
    parallax.tx = 0;
    parallax.ty = 0;
    reveal = createReveal({
      from: landing,
      to: room,
      duration: ENTER_MS,
      onDone: finishReveal,
      apply: (pose) => applyPose(camera, host, pose, poseCtx),
    });
    frame.invalidate();
  };

  /**
   * 退后看全景。首屏与定位之间没有别的状态:能点到这里,模型必然已经齐了
   * (phase 还是 boot 时盖层占着屏,点不到;进了屋这里直接返回)。
   */
  const enterRoom = () => {
    if (phase !== 'landing') return;
    if (reduced || !room) {
      finishReveal();
      return;
    }
    beginReveal();
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
    if (!reduced && phase !== 'landing') {
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
    // 补间途中不接受点击:镜头自己在退,拾取到的是每帧在变的东西
    if (traveled > DRAG_THRESHOLD || phase === 'entering') return;
    // 首屏那一格:点屏幕任意处就是「退后看全景」。不拾取任何东西 —— 那一格是特写,
    // 拾取到谁都会让人以为「点它有别的意思」;悬停手型也留给定位那一格
    if (phase === 'landing') {
      enterRoom();
      return;
    }
    const mesh = pickAt(false);
    frame.invalidate();
    if (!mesh) return;
    // 会动的家具优先:冰箱门与唱机盖是开关、转椅是转圈,都不开面板
    if (mesh.userData.door) {
      toggleDoor(mesh.userData.door);
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
   * 拉近的量走 fitDistance(按这件东西的包围盒算,ZOOM_FILL 决定它占画面多大),再夹在
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
  // 键盘那条入口上的「看全景」:和点屏幕走的是同一条路
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
    doors: manifest
      .filter((item) => item.door)
      .map((item) => `${item.name}=${item.door.node}:${item.door.axis}@${item.door.deg}`),
    stateEase: STATE_EASE,
    demandRendering: true,
    // 装配完立刻的累计帧数:证明 boot 阶段没有连画一堆帧(静置后是否真停下,
    // 得在可见窗口的 devtools 里看 dataset.frames 会不会一直涨)
    frameAtBoot: renderer.info.render.frame,
    // 首屏那一格特写离注视点多远(米)= 定位距离 × LANDING_RADIUS:核对构图用
    landingMeters: landing ? Number(landing.position.distanceTo(landing.target).toFixed(2)) : null,
    enterMs: ENTER_MS,
    anisotropy,
    pixelRatio: renderer.getPixelRatio(),
    // 场景包围盒:床或桌子摆歪、单位没换算对,这里一眼就能看出来(米)
    spanMeters: [Number(size.x.toFixed(2)), Number(size.y.toFixed(2)), Number(size.z.toFixed(2))],
    centerMeters: [Number(center.x.toFixed(2)), Number(center.y.toFixed(2)), Number(center.z.toFixed(2))],
  });

  /**
   * 家具齐了之后把屋子一次搭出来:量包围盒 → 建景片 → 按包围盒摆灯 → 挂墙的贴墙 →
   * 台灯与唱盘从模型里认出来 → 算好特写与定位两格镜头 → 预热,然后才进 landing。
   *
   * 首屏与屋里没有两套东西:景片与灯都按这份包围盒量,首屏只是镜头收近了一档
   * (config.js 的 LANDING_RADIUS)。加载盖层一直占着屏,到这里才撤,所以预热的长任务
   * (compile + initTexture)落在盖层后面做,显出来的第一帧不会卡在着色器编译上。
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

    const fitted = boundsOf(furniture);
    center = fitted.center;
    size = fitted.size;

    // 一块地板,尺寸从家具包围盒倒推;铺得比场景大几圈,远端交给雾化进背景
    floor = createFloor(current, Math.max(size.x, size.z), center);
    rig.add(floor);
    // 灯与阴影相机按这份包围盒量:三盏光都是平行的,只有方向要紧(见 fitRig)
    fitRig(lights, lights.focus, size, center);

    // 台灯进清单了(scene.js 里那盏程序化的已经拆了):「房间灯」那盏聚光挂在**灯泡**上,
    // 开灯时的自发光也落在它身上。灯放在灯泡底缘再往下 2cm,不放球心 —— 罩子是扣在灯泡上的,
    // 光得从罩口漏到桌面上来。跟着视差组走(和整间屋子一起被鼠标带着那点俯仰)。
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

    framing = fitCamera(camera, host, center, size, framingAzimuth());
    room = roomPose(framing);
    landing = landingPose(framing);
    syncScene();
    // 首次给渲染器定尺寸(画布默认 300×150,而 CSS 把它拉满全屏):resize 会顺带
    // 按当前阶段把镜头摆到特写那一格
    resize();
    // 预热(编译着色器 + 上传贴图)是同步的长任务,必须在盖层还占着屏的时候做掉
    models.prewarm(renderer, scene, camera);
    renderer.shadowMap.needsUpdate = true;

    phase = 'landing';
    gate.setPhase('landing');
    host.dataset.phase = 'landing';

    host.dataset.stats = JSON.stringify(stats());
    host.dataset.roomReady = '1';
    host.dataset.theme = document.documentElement.dataset.theme || '';
    host.dataset.lights = document.documentElement.dataset.lights || '';
    host.dataset.variant = readVariant();
    document.dispatchEvent(new CustomEvent('noke:room-ready'));
    frame.invalidate();
    return true;
  };

  const boot = async () => {
    models = createModelLoader(rig, anisotropy);

    try {
      // 屋里那十几件并发补齐,进度按件数报给加载盖层
      furniture = (await models.loadAll(manifest.filter(Boolean), {
        onItem: (done, total) => gate.progress(total ? done / total : 1),
      })).filter(Boolean);

      if (!assembleRoom()) {
        giveUpToPage();
        return;
      }
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
