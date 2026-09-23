/**
 * 房间的 3D 层 —— 入口与编排。
 *
 * 分工和 CSS 版一样：这里只负责把房间搭出来、让它们能被点到；
 * 「点到之后打开哪一格面板」交给 Leptos —— 通过 noke:pick 事件往外抛。
 *
 * 空间感靠这几件事凑出来，没有一样需要后处理 pass：
 * 两面墙把角落封住、雾让地面远处化进背景、一盏反向补光压住死黑、
 * 暗角与颗粒在 hud.css 里用 CSS 叠一层、能点的家具 hover 时亮一下(emissive)+ 指针变手型。
 *
 * 目录里各管一摊，改哪里去哪个文件：
 *   config.js    数值常量与 deg()
 *   palette.js   跟着 data-theme 走的色板
 *   manifest.js  读 #room3d 上的模型清单、把相对路径解析成 URL
 *   scene.js     场景、三面光、地板与两面墙、按包围盒挪灯
 *   framing.js   按包围盒算取景距离与雾的近远端
 *   models.js    加载 glb,挑出可点的网格
 *   controls.js  OrbitControls 的角度钳位
 *   loop.js      按需渲染的帧循环(限帧、静置停摆、镜头读数)
 *   main.js      这一份:把上面这些接到一起,管渲染器、事件、主题、拾取与启动
 */

import * as THREE from 'three';
import {
  ANISOTROPY,
  AZIMUTH_LIMITS,
  CAMERA_FOV,
  DISTANCE_RANGE,
  DRAG_THRESHOLD,
  HOVER_EMISSIVE,
  MAX_DPR,
  PARALLAX_PITCH,
  PARALLAX_YAW,
  POLAR_LIMITS,
  ROOT_ID,
} from './config.js';
import { palette } from './palette.js';
import { readManifest } from './manifest.js';
import { createFloor, createScene, createWalls, fitRig } from './scene.js';
import { CAMERA_PITCH, fitCamera } from './framing.js';
import { loadModels } from './models.js';
import { createControls } from './controls.js';
import { createLoop } from './loop.js';

function start(host) {
  const manifest = readManifest(host);
  let colors = palette();

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
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const anisotropy = Math.min(ANISOTROPY, renderer.capabilities.getMaxAnisotropy() ?? 1);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 2000);
  const { scene, hemi, key, fill, accent } = createScene(colors);
  const rig = new THREE.Group();
  scene.add(rig);
  const controls = createControls(camera, renderer.domElement);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let pickables = [];
  let floor = null;
  let walls = null;
  let center = new THREE.Vector3();
  let size = new THREE.Vector3(1, 1, 1);
  let framing = null;
  let placed = false;
  let reduced = motionQuery.matches;
  let hovered = null;
  let focused = null;
  let dragging = null;
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const targetGoal = new THREE.Vector3();

  const applyFog = () => {
    if (!framing) return;
    scene.fog.near = framing.fogNear;
    scene.fog.far = framing.fogFar;
  };

  /**
   * 取景。第一次按固定俯角摆好;之后(窗口变化或添了家具)只改半径、
   * 保住用户已经转到的水平角度,不然每次 resize 都会被拽回正前方。
   */
  const refit = () => {
    if (!framing) return;
    const look = framing.center;
    const spherical = new THREE.Spherical();
    if (placed) {
      spherical.setFromVector3(camera.position.clone().sub(controls.target));
    } else {
      spherical.phi = Math.PI / 2 - CAMERA_PITCH;
      spherical.theta = 0;
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
    host.dataset.hover = hovered ? hovered.userData.spot || '' : '';
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
    pick: () => pickAt(true),
  });

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    framing = fitCamera(camera, host, center, size);
    // fitRig 会按场景尺寸挪主光与投影相机,取景一变阴影就是另一张图了
    renderer.shadowMap.needsUpdate = true;
    applyFog();
    refit();
    frame.invalidate();
  };

  const applyTheme = () => {
    colors = palette();
    renderer.shadowMap.needsUpdate = true;
    scene.background = new THREE.Color(colors.background);
    scene.fog.color = new THREE.Color(colors.background);
    hemi.color = new THREE.Color(colors.hemiSky);
    hemi.groundColor = new THREE.Color(colors.hemiGround);
    hemi.intensity = colors.hemiIntensity;
    key.color = new THREE.Color(colors.key);
    key.intensity = colors.keyIntensity;
    fill.color = new THREE.Color(colors.fill);
    fill.intensity = colors.fillIntensity;
    accent.color = new THREE.Color(colors.accent);
    accent.intensity = colors.accentIntensity;
    accent.angle = colors.accentAngle;
    accent.penumbra = colors.accentPenumbra;
    if (floor) floor.material.color = new THREE.Color(colors.floor);
    if (walls) {
      walls.back.material.color = new THREE.Color(colors.wallBack);
      walls.side.material.color = new THREE.Color(colors.wallSide);
    }
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
    if (!mesh?.userData.spot) return;
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

  const observer = new MutationObserver(() => {
    if (document.documentElement.dataset.theme !== host.dataset.theme) {
      host.dataset.theme = document.documentElement.dataset.theme || '';
      applyTheme();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

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

      const fitted = fitRig(scene, key, fill, accent, rig);
      center = fitted.center;
      size = fitted.size;
      // 地板比场景再放大一圈,镜头怎么转都看不见边
      floor = createFloor(colors, Math.max(size.x, size.z), center);
      scene.add(floor);
      walls = createWalls(colors, size, center);
      scene.add(walls.group);

      resize();
      // 提前编译着色器(对应 drei 的 <Preload all />):否则第一次出现某个材质时掉一帧
      renderer.compile(scene, camera);
      frame.invalidate();
      host.dataset.roomReady = '1';
      host.dataset.theme = document.documentElement.dataset.theme || '';
      host.dataset.stats = JSON.stringify({
        models: result.loaded,
        meshes: result.meshes,
        pickable: pickables.length,
        lights: 4,
        walls: 2,
        fog: true,
        controls: 'orbit',
        fov: CAMERA_FOV,
        polarLimits: POLAR_LIMITS,
        azimuthLimits: AZIMUTH_LIMITS,
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
