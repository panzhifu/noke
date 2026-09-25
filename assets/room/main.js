/**
 * 房间的 3D 层 —— 入口与编排。
 *
 * 分工和 CSS 版一样：这里只负责把房间搭出来、让它们能被点到；
 * 「点到之后打开哪一格面板」交给 Leptos —— 通过 noke:pick 事件往外抛。
 *
 * 空间感靠这几件事凑出来，没有一样需要后处理 pass：
 * 墙角把画面收成一个角、雾让地面与墙的远处化进背景、一盏反向补光压住死黑、
 * 暗角与颗粒在 hud.css 里用 CSS 叠一层、能点的家具 hover 时亮一下(emissive)+ 指针变手型。
 *
 * 光照有四个状态(日/夜 × 灯关/灯开),它们的差别全在 palette.js 那张表里:
 * 这一层只负责把当前这组颜色与强度逐帧推向目标态 —— 所以「开灯」是渐亮,不是硬切。
 *
 * 目录里各管一摊，改哪里去哪个文件：
 *   config.js    数值常量与 deg()
 *   palette.js   四个光照状态的颜色/强度表,以及 data-theme + data-lights 的读法
 *   manifest.js  读 #room3d 上的模型清单、把相对路径解析成 URL
 *   scene.js     灯光组、墙地、台灯、按包围盒挪灯
 *   framing.js   按包围盒算取景距离与雾的近远端
 *   models.js    加载 glb,挑出可点的网格
 *   controls.js  OrbitControls 的角度钳位
 *   loop.js      按需渲染的帧循环(限帧、静置停摆、镜头读数)
 *   main.js      这一份:把上面这些接到一起,管渲染器、事件、光照状态、拾取与启动
 */

import * as THREE from 'three';
import {
  ANISOTROPY,
  AZIMUTH_LIMITS,
  CAMERA_AZIMUTH,
  CAMERA_FOV,
  DISTANCE_RANGE,
  DOOR_EASE,
  DOOR_RECESS_DARK,
  DRAG_THRESHOLD,
  HOVER_EMISSIVE,
  LAMP_BULB_MATERIAL,
  MAX_DPR,
  PARALLAX_PITCH,
  PARALLAX_YAW,
  POLAR_LIMITS,
  ROOT_ID,
  SPIN_DEG,
  SPIN_EASE,
  SPIN_MAX_QUEUED_TURNS,
  SPIN_SETTLE,
  STATE_EASE,
  PLATTER_RPM,
} from './config.js';
import { VARIANTS, readVariant, variant, variantKey } from './palette.js';
import { readManifest } from './manifest.js';
import { createFloor, createScene, createWalls, findLampBulb, fitRig } from './scene.js';
import { deg } from './config.js';
import { CAMERA_PITCH, fitCamera } from './framing.js';
import { loadModels } from './models.js';
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

function start(host) {
  const manifest = readManifest(host);

  let renderer;
  try {
    // powerPreference: 双显卡的笔记本上让浏览器优先挑独显那张
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    // WebGL 拿不到(老浏览器、软渲染被禁、隐私模式……):整层跳过。
    // 页面上的 DOM 入口照常能用,不会因为房间起不来就白屏。
    console.warn('[room3d] WebGL 不可用,房间这层跳过', error);
    document.dispatchEvent(new CustomEvent('noke:room-ready'));
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

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let pickables = [];
  let floor = null;
  let walls = null;
  let lampBulb = null;
  let door = null;
  let spin = null;
  // 唱机自己的唱盘(唱机 glb 里的 platter 节点)—— 房间灯开着时它转。
  // 挂在唱盘上而不是挂在黑胶上:黑胶已经上墙当封面了,机器自己的盘转起来才像在台子上放着。
  let platter = null;
  const platterOmega = (PLATTER_RPM * Math.PI * 2) / 60;
  let center = new THREE.Vector3();
  let size = new THREE.Vector3(1, 1, 1);
  let framing = null;
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
    if (floor) floor.material.color = new THREE.Color(current.floor);
    if (walls) {
      walls.back.material.color = new THREE.Color(current.wallBack);
      walls.side.material.color = new THREE.Color(current.wallSide);
      // 暗腔也跟着状态走(它不受光,明暗全靠这个系数)
      if (walls.recess) {
        walls.recess.material.color = new THREE.Color(current.wallBack).multiplyScalar(DOOR_RECESS_DARK);
      }
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
   */
  const stepPlatter = (dt) => {
    if (!platter || document.documentElement.dataset.lights !== 'on') return false;
    platter.rotation.y += platterOmega * dt;
    // 折回一圈之内(一圈正好是 2π,视觉无跳变),连开几天也不掉精度
    if (platter.rotation.y > Math.PI * 2) platter.rotation.y -= Math.PI * 2;
    return true;
  };

  const applyFog = () => {
    if (!framing) return;
    scene.fog.near = framing.fogNear;
    scene.fog.far = framing.fogFar;
  };

  /**
   * 取景。第一次按固定俯角与方位角摆好;之后(窗口变化或添了家具)只改半径、
   * 保住用户已经转到的角度,不然每次 resize 都会被拽回正前方。
   */
  const refit = () => {
    if (!framing) return;
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

  const setHovered = (mesh) => {
    if (mesh === hovered) return;
    if (hovered) {
      hovered.material.emissive?.setHex(hovered.userData.baseEmissive);
      hovered.material.emissiveIntensity = hovered.userData.baseEmissiveIntensity;
    }
    hovered = mesh;
    if (hovered) {
      hovered.material.emissive?.setHex(HOVER_EMISSIVE);
      hovered.material.emissiveIntensity = 1;
    }
    host.dataset.hover = hovered
      ? hovered.userData.spot || (hovered.userData.door ? 'door' : hovered.userData.spin ? 'spin' : '')
      : '';
    host.style.cursor = hovered ? 'pointer' : '';
    frame.invalidate();
  };

  const pickAt = (updateHover) => {
    if (!pickables.length) return null;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
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
    isReduced: () => reduced,
    step: (dt) => {
      // 这几件事都要推:光照渐变、冰箱门、转椅、唱片(别让前一个把后一个短路掉)
      const blending = stepState(dt);
      const swinging = stepDoor(dt);
      const turning = stepSpin(dt);
      const spinning = stepPlatter(dt);
      return blending || swinging || turning || spinning;
    },
    pick: () => pickAt(true),
  });

  /**
   * 取景始终按初始方位角(30°)算,不跟用户转到的角度走。
   * 因为包围盒是 4.76 宽 × 3.4 深,投影宽度恰好在 30°~40° 最大 ——
   * 拿这个「最坏角度」定距离,整段方位角范围内都不会有东西被切出画框,
   * 而且 resize 时也不会因为用户转了角度就把构图改掉。
   */
  const framingAzimuth = () => CAMERA_AZIMUTH;

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    framing = fitCamera(camera, host, center, size, framingAzimuth());
    // fitRig 会按场景尺寸挪主光与投影相机,取景一变阴影就是另一张图了
    renderer.shadowMap.needsUpdate = true;
    applyFog();
    refit();
    frame.invalidate();
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
    // 拖过一段距离就不算「点这一下」
    if (traveled > DRAG_THRESHOLD) return;
    const mesh = pickAt(false);
    frame.invalidate();
    if (!mesh) return;
    // 会动的家具优先:冰箱门是开关、转椅是转圈,都不开面板
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

  /** 点中之后把注视点挪到那个物件上:镜头位置由 OrbitControls 管,不去抢。 */
  const focusOn = (mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const middle = box.getCenter(new THREE.Vector3());
    targetGoal.copy(middle);
    targetGoal.y -= box.getSize(new THREE.Vector3()).y * 0.15;
    focused = mesh.userData.spot;
    host.dataset.focused = focused || '';
    frame.invalidate();
  };

  const releaseFocus = () => {
    if (focused === null) return;
    focused = null;
    if (framing) targetGoal.copy(framing.center);
    host.dataset.focused = '';
    frame.invalidate();
  };

  // 面板被关掉(往往是 Esc)时,注视点也该退回场景中心
  document.addEventListener('noke:panel-closed', releaseFocus);

  // 拖拽、滚轮缩放、阻尼滑动都会走这里 —— 按需渲染的唤醒源主要靠它
  controls.addEventListener('change', frame.invalidate);
  host.addEventListener('wheel', frame.invalidate, { passive: true });

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

  const boot = async () => {
    let result;
    try {
      result = await loadModels(rig, manifest, anisotropy);
      pickables = result.pickables;

      if (!rig.children.length) {
        console.warn('[room3d] 一个模型都没加载上');
        document.dispatchEvent(new CustomEvent('noke:room-ready'));
        return;
      }

      const fitted = fitRig(scene, lights, rig);
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

      // 门嵌在背墙上:先量门自己的包围盒 → 墙照着它开洞 → 再把门贴到墙面上。
      // 顺序不能倒:墙的位置是从 size/center 推的,而门不参与那次测量(见 scene.js 的 fitRig),
      // 所以贴墙这一步必须等 createWalls 把 backZ 定下来。
      const doorNode = rig.getObjectByName('door') || null;
      let doorway = null;
      if (doorNode) {
        rig.updateMatrixWorld(true);
        doorway = new THREE.Box3().setFromObject(doorNode);
      }

      // 地板与墙都挂进视差组,不能直接挂场景:鼠标带动的那点俯仰是绕原点转整组的,
      // 只离地 2mm 的地毯一旦和地板不同组,转过一侧就会被地板盖掉一条 ——
      // 「转动视角时地毯缺一块」就是这么来的。一起转就没有相对位移。
      floor = createFloor(current, Math.max(size.x, size.z), center);
      rig.add(floor);
      walls = createWalls(current, size, center, doorway);
      rig.add(walls.group);
      // 挂在背墙上的家具(门、墙上当封面的那张黑胶)统一贴到墙面上。
      // 离墙 3mm:它们自己的网格和墙是两套网格,共面的那条边会打架(z-fighting)。
      // 清单里写的那个 z 只是给 devtools 看着方便,真正贴上去靠这一行。
      for (const node of rig.children) {
        if (node.userData.wall) node.position.z = walls.backZ + 0.003;
      }
      if (!doorNode) {
        console.warn('[room3d] 清单里没有名为 door 的家具,背墙就是一块整板');
      }

      syncScene();
      resize();
      // 提前编译着色器(对应 drei 的 <Preload all />):否则第一次出现某个材质时掉一帧
      renderer.compile(scene, camera);
      frame.invalidate();
      host.dataset.roomReady = '1';
      host.dataset.theme = document.documentElement.dataset.theme || '';
      host.dataset.lights = document.documentElement.dataset.lights || '';
      host.dataset.variant = readVariant();
      host.dataset.stats = JSON.stringify({
        models: result.loaded,
        meshes: result.meshes,
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
        doors: manifest
          .filter((item) => item.door)
          .map((item) => `${item.name}=${item.door.node}:${item.door.axis}@${item.door.deg}`),
        stateEase: STATE_EASE,
        demandRendering: true,
        // 装配完立刻的累计帧数:证明 boot 阶段没有连画一堆帧(静置后是否真停下,
        // 得在可见窗口的 devtools 里看 dataset.frames 会不会一直涨)
        frameAtBoot: renderer.info.render.frame,
        anisotropy,
        pixelRatio: renderer.getPixelRatio(),
        // 场景包围盒:床或桌子摆歪、单位没换算对,这里一眼就能看出来(米)
        spanMeters: [Number(size.x.toFixed(2)), Number(size.y.toFixed(2)), Number(size.z.toFixed(2))],
        centerMeters: [Number(center.x.toFixed(2)), Number(center.y.toFixed(2)), Number(center.z.toFixed(2))],
      });
      document.dispatchEvent(new CustomEvent('noke:room-ready'));
    } catch (error) {
      // 装配炸了要能看见:否则只剩一个「什么都没发生」的空场景
      console.warn('[room3d] 装配失败', error);
      host.dataset.bootError = `${error && error.message ? error.message : error}`;
      document.dispatchEvent(new CustomEvent('noke:room-ready'));
    }
  };

  boot();
}

function findHost() {
  const host = document.getElementById(ROOT_ID);
  if (host && !host.dataset.roomReady) start(host);
}

// Leptos 是客户端渲染，DOM 出现的时间不确定：事件 + 立即试一次，两头都覆盖。
document.addEventListener('noke:room-mounted', findHost);
findHost();
