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
  DOOR_OPEN_DEG,
  DRAG_THRESHOLD,
  HOVER_EMISSIVE,
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
} from './config.js';
import { VARIANTS, readVariant, variant, variantKey } from './palette.js';
import { readManifest } from './manifest.js';
import { createDeskLamp, createFloor, createScene, createWalls, fitRig } from './scene.js';
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
  let lampShade = null;
  let door = null;
  let spin = null;
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
    if (lampShade) lampShade.emissive = new THREE.Color(current.lampEmissive);
    if (floor) floor.material.color = new THREE.Color(current.floor);
    if (walls) {
      walls.back.material.color = new THREE.Color(current.wallBack);
      walls.side.material.color = new THREE.Color(current.wallSide);
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
   * 冰箱门。点一下开关,默认关着 —— 开是把门绕它自己的竖直铰链转 DOOR_OPEN_DEG:
   * 门的那个节点原点就在铰链上(导出时定的),所以这里只管 rotation.y。
   */
  const toggleDoor = (node) => {
    if (!node) return;
    if (!door || door.node !== node) {
      door = { node, angle: 0, target: deg(DOOR_OPEN_DEG) };
    } else {
      door.target = door.target > deg(DOOR_OPEN_DEG) * 0.5 ? 0 : deg(DOOR_OPEN_DEG);
    }
    host.dataset.door = door.target > 0 ? 'open' : 'closed';
    frame.invalidate();
  };

  const stepDoor = (dt) => {
    if (!door) return false;
    const delta = door.target - door.angle;
    if (Math.abs(delta) < 1e-3) {
      if (door.angle !== door.target) {
        door.angle = door.target;
        door.node.rotation.y = door.angle;
        renderer.shadowMap.needsUpdate = true;
      }
      return false;
    }
    // 指数逼近:起步快、收尾慢,和光照那套一个手感
    door.angle += delta * Math.min(1, dt * DOOR_EASE);
    door.node.rotation.y = door.angle;
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
      // 三件事都要推:光照渐变、冰箱门、转椅(别让前一个把后一个短路掉)
      const blending = stepState(dt);
      const swinging = stepDoor(dt);
      const turning = stepSpin(dt);
      return blending || swinging || turning;
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

      // 台灯:自己拼的一盏,摆在书桌上当「房间灯」的灯源
      const lamp = createDeskLamp();
      lampShade = lamp.shade;
      rig.add(lamp.group);
      // 灯本体挂在灯罩那个支臂下,灯就跟着灯罩的倾角走 —— 不用手算世界坐标
      lamp.group.children[2].add(lights.lamp, lights.lamp.target);
      lights.lamp.position.set(0, 0.08, 0);
      lights.lamp.target.position.set(0, -1, 0);

      // 地板与墙都挂进视差组,不能直接挂场景:鼠标带动的那点俯仰是绕原点转整组的,
      // 只离地 2mm 的地毯一旦和地板不同组,转过一侧就会被地板盖掉一条 ——
      // 「转动视角时地毯缺一块」就是这么来的。一起转就没有相对位移。
      floor = createFloor(current, Math.max(size.x, size.z), center);
      rig.add(floor);
      walls = createWalls(current, size, center);
      rig.add(walls.group);

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
        doorOpenDeg: DOOR_OPEN_DEG,
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
