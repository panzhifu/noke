/**
 * 房间的 3D 层。
 *
 * 分工和 CSS 版一样：这里只负责把房间搭出来、让它们能被点到；
 * 「点到之后打开哪一格面板」交给 Leptos —— 通过 noke:pick 事件往外抛。
 *
 * 模型清单写在 #room3d 的 data-models 上（Rust 侧生成），跟 content.rs 一个路子：
 * 加模型 = 清单加一行 + 丢一个 glb 进 assets/models/。
 *
 * 尺度以 Blender 为准：导出时已转成 Y-up，地毯平铺在 XZ 平面，
 * 所以位置 / 旋转 / 缩放直接照 Blender 里的数值填，不做单位换算。
 *
 * 空间感靠这几件事凑出来，没有一样需要后处理 pass：
 * 两面墙把角落封住、雾让地面远处化进背景、一盏反向补光压住死黑、
 * 暗角与颗粒在 hud.css 里用 CSS 叠一层、hover 有 emissive 高亮 + monospace 标签。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT_ID = 'room3d';
const MAX_DPR = 2;
const PARALLAX_YAW = 0.07;
const PARALLAX_PITCH = 0.035;
const EASE = 0.06;
const ORBIT_EASE = 0.09;
// 拖拽能转的范围：超过这个角度墙面就露背了，所以钳住
const ORBIT_YAW_LIMIT = 0.42;
const ORBIT_PITCH_LIMIT = 0.1;
const DRAG_YAW_PER_PX = 0.0024;
const DRAG_PITCH_PER_PX = 0.0016;
// 按这个像素数区分「点一下」和「拖了一下」
const DRAG_THRESHOLD = 6;
const FOCUS_DISTANCE = 0.82;
// hover 时往材质里加的一点自发光(琥珀色),浅背景上够显眼又不刺眼
const HOVER_EMISSIVE = 0x3a2a10;

// 标签文字的唯一来源是 panel.rs 的 spot_label;这里只做 spot 字符串 → 中文的映射
const SPOT_LABELS = {
  work: '作品',
  about: '关于',
  notes: '手记',
  contact: '联系',
};

function spotLabel(spot) {
  if (!spot) return '';
  if (spot.startsWith('poster:')) return `海报 ${spot.slice(7)}`;
  return SPOT_LABELS[spot] || spot;
}

/** 跟着站点的 data-theme 走，免得 3D 层和 DOM 层风格打架。 */
function palette() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    background: dark ? 0x0b0c0f : 0xf7f5f0,
    // 地板得跟暖米色的地毯拉开:太接近的话两者糊成一片,地毯看着像浮在雾里
    floor: dark ? 0x15161b : 0xc9c4b8,
    wallBack: dark ? 0x13151a : 0xe7e1d4,
    wallSide: dark ? 0x0e1015 : 0xddd6c6,
    hemiSky: dark ? 0x3a4152 : 0xe4ebf5,
    hemiGround: dark ? 0x1a1b21 : 0xd6ccb9,
    key: dark ? 0xfff1da : 0xfff8ee,
    keyIntensity: dark ? 1.5 : 2.1,
    hemiIntensity: dark ? 0.6 : 1.2,
    // 补光从天顶另一边来,只为了把背光面从纯黑里捞出来,不该再投一份影子
    fill: dark ? 0xbcd0f0 : 0xdce8ff,
    fillIntensity: dark ? 0.34 : 0.5,
  };
}

function readManifest(host) {
  const raw = host.dataset.models;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[room3d] 模型清单解析失败', error);
    return [];
  }
}

/** file 是相对页面写的，交给 baseURI 解析，GitHub Pages 子路径才不会错。 */
function resolveUrl(file) {
  return new URL(file, document.baseURI).href;
}

function createScene(colors) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.background);
  // 雾在取景算出距离后才上，见 applyFog
  scene.fog = new THREE.Fog(new THREE.Color(colors.background), 10, 40);

  const hemi = new THREE.HemisphereLight(colors.hemiSky, colors.hemiGround, colors.hemiIntensity);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(colors.key, colors.keyIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(colors.fill, colors.fillIntensity);
  scene.add(fill);

  return { scene, hemi, key, fill };
}

/**
 * 两面墙封出一个角落:后墙在 -z、左墙在 -x(镜头从 +z 俯视,这两面正好在画面里,
 * 且都在东西后面 —— 不会挡视线,只负责给空间一个边界)。
 */
function createWalls(colors, size, center) {
  const group = new THREE.Group();
  const height = Math.max(size.y * 2.2, Math.max(size.x, size.z) * 0.8, 2);
  const width = Math.max(size.x, size.z) * 5;

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: colors.wallBack, roughness: 0.95, metalness: 0 }),
  );
  back.position.set(center.x, height / 2 - 0.01, center.z - size.z / 2 - Math.max(size.z * 0.15, 0.4));
  back.receiveShadow = true;

  const side = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: colors.wallSide, roughness: 0.95, metalness: 0 }),
  );
  side.rotation.y = Math.PI / 2;
  side.position.set(center.x - size.x / 2 - Math.max(size.x * 0.15, 0.4), height / 2 - 0.01, center.z);
  side.receiveShadow = true;

  group.add(back, side);
  return { group, back, side, height };
}

/** 阴影相机、地板、墙、主光位置都得按实际场景尺寸来，不然大地毯会糊或者被裁掉。 */
function fitRig(scene, key, fill, rig) {
  const bounds = new THREE.Box3().setFromObject(rig);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1);

  const cam = key.shadow.camera;
  cam.left = -span * 0.85;
  cam.right = span * 0.85;
  cam.top = span * 0.85;
  cam.bottom = -span * 0.85;
  cam.near = Math.max(span * 0.05, 0.5);
  cam.far = span * 6;
  cam.updateProjectionMatrix();

  const target = new THREE.Object3D();
  target.position.set(center.x, 0, center.z);
  scene.add(target);
  key.target = target;
  key.position.set(center.x + span * 0.5, span * 1.1, center.z + span * 0.7);
  // 补光从主光的对角来,不投影
  fill.position.set(center.x - span * 0.8, span * 0.7, center.z - span * 0.6);
  fill.target = target;

  return { center, size };
}

function createFloor(colors, span, center) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 4, span * 4),
    new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, -0.002, center.z);
  floor.receiveShadow = true;
  return floor;
}

/** 俯角固定,距离按场景包围盒算 —— 换地毯尺寸或往后添家具,构图都自己跟上。 */
const CAMERA_PITCH = THREE.MathUtils.degToRad(50);
const CAMERA_FILL = 1.05;

function fitCamera(camera, host, center, size) {
  const aspect = Math.max(host.clientWidth / Math.max(host.clientHeight, 1), 0.2);
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const sinPitch = Math.sin(CAMERA_PITCH);
  const cosPitch = Math.cos(CAMERA_PITCH);
  const halfWidth = size.x / 2;
  const halfDepth = size.z / 2;
  const halfHeight = size.y / 2;

  // 斜着俯视一块水平面时,离相机最近的那条边才是瓶颈 ——
  // 只按中心算距离,近边会溢出画面(角点离相机更近,张角反而更大)。
  const nearShift = halfDepth * cosPitch;
  const distForWidth = halfWidth / Math.tan(hFov / 2) + nearShift;
  const distForDepth =
    (halfDepth * sinPitch + halfHeight) / Math.tan(vFov / 2) + nearShift;
  const distance = Math.max(distForWidth, distForDepth, 1) * CAMERA_FILL;

  camera.aspect = aspect;
  const position = new THREE.Vector3(
    center.x,
    center.y + distance * sinPitch,
    center.z + distance * cosPitch,
  );
  camera.lookAt(center.x, center.y, center.z);
  camera.near = Math.max(distance * 0.02, 0.1);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();

  // 雾按这段距离给:近处在画面里几乎看不见衰减,远处地面和墙根化进背景
  const fogNear = Math.max(distance * 0.72, 1);
  const fogFar = Math.max(distance * 1.85, fogNear * 1.4);
  return { distance, position, center, fogNear, fogFar };
}

async function loadModels(rig, manifest) {
  const loader = new GLTFLoader();
  const pickables = [];
  const loaded = [];
  let meshes = 0;

  for (const item of manifest) {
    if (!item || !item.file) continue;
    try {
      const gltf = await loader.loadAsync(resolveUrl(item.file));
      const node = gltf.scene;
      node.name = item.name || item.file;

      const [px, py, pz] = item.position || [0, 0, 0];
      const [rx, ry, rz] = item.rotation || [0, 0, 0];
      node.position.set(px, py, pz);
      // 清单里按 Blender 的习惯写角度,这里转成弧度
      node.rotation.set(
        THREE.MathUtils.degToRad(rx),
        THREE.MathUtils.degToRad(ry),
        THREE.MathUtils.degToRad(rz),
      );
      node.scale.setScalar(item.scale ?? 1);

      node.traverse((child) => {
        if (!child.isMesh) return;
        meshes += 1;
        child.castShadow = true;
        child.receiveShadow = true;
        if (item.spot) {
          // hover 要改 emissive,材质可能是共享的 —— 先给可点的这份单独一份
          child.material = child.material.clone();
          child.userData.spot = item.spot;
          child.userData.baseEmissive = child.material.emissive
            ? child.material.emissive.getHex()
            : 0x000000;
          child.userData.baseEmissiveIntensity = child.material.emissiveIntensity ?? 1;
          pickables.push(child);
        }
      });

      rig.add(node);
      loaded.push(node.name);
    } catch (error) {
      console.warn(`[room3d] 加载失败: ${item.file}`, error);
      loaded.push(`失败:${item.name}`);
    }
  }

  return { pickables, loaded, meshes };
}

function start(host) {
  const manifest = readManifest(host);
  let colors = palette();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
  const { scene, hemi, key, fill } = createScene(colors);
  const rig = new THREE.Group();
  scene.add(rig);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let pickables = [];
  let floor = null;
  let walls = null;
  let center = new THREE.Vector3();
  let size = new THREE.Vector3(1, 1, 1);
  let framing = null;
  let reduced = motionQuery.matches;
  let loop = 0;
  let hovered = null;
  let focusSpot = null;
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const orbit = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
  const zoom = { value: 1, target: 1 };

  const label = document.createElement('div');
  label.className = 'obj-label';
  label.hidden = true;
  host.appendChild(label);

  const draw = () => {
    loop = 0;
    parallax.x += (parallax.tx - parallax.x) * EASE;
    parallax.y += (parallax.ty - parallax.y) * EASE;
    orbit.yaw += (orbit.targetYaw - orbit.yaw) * ORBIT_EASE;
    orbit.pitch += (orbit.targetPitch - orbit.pitch) * ORBIT_EASE;
    zoom.value += (zoom.target - zoom.value) * EASE;
    applyRigRotation();
    applyCamera();
    renderOnce();
    updateLabel();
    if (!reduced) loop = requestAnimationFrame(draw);
  };

  // 静止态(关掉动效、或没在拖)时也要有个姿势,所以旋转/相机单独抽出来算
  const applyRigRotation = () => {
    if (reduced) {
      parallax.x = 0;
      parallax.y = 0;
      rig.rotation.set(0, 0, 0);
      return;
    }
    rig.rotation.y = orbit.yaw + parallax.x;
    rig.rotation.x = orbit.pitch + parallax.y;
  };

  const applyCamera = () => {
    if (!framing) return;
    const { position, center: look } = framing;
    const k = zoom.value;
    camera.position.set(
      look.x + (position.x - look.x) * k,
      look.y + (position.y - look.y) * k,
      look.z + (position.z - look.z) * k,
    );
    camera.lookAt(look.x, look.y, look.z);
  };

  const renderOnce = () => renderer.render(scene, camera);

  const settle = () => {
    if (reduced) {
      // 关掉动效时不做持续渲染,只在尺寸/主题/交互后补一帧
      applyRigRotation();
      applyCamera();
      renderOnce();
      updateLabel();
      return;
    }
    if (!loop) loop = requestAnimationFrame(draw);
  };

  const schedule = settle;

  const applyFog = () => {
    if (!framing) return;
    scene.fog.near = framing.fogNear;
    scene.fog.far = framing.fogFar;
  };

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    framing = fitCamera(camera, host, center, size);
    applyFog();
    schedule();
  };

  const applyTheme = () => {
    colors = palette();
    scene.background = new THREE.Color(colors.background);
    scene.fog.color = new THREE.Color(colors.background);
    hemi.color = new THREE.Color(colors.hemiSky);
    hemi.groundColor = new THREE.Color(colors.hemiGround);
    hemi.intensity = colors.hemiIntensity;
    key.color = new THREE.Color(colors.key);
    key.intensity = colors.keyIntensity;
    fill.color = new THREE.Color(colors.fill);
    fill.intensity = colors.fillIntensity;
    if (floor) floor.material.color = new THREE.Color(colors.floor);
    if (walls) {
      walls.back.material.color = new THREE.Color(colors.wallBack);
      walls.side.material.color = new THREE.Color(colors.wallSide);
    }
    schedule();
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
    schedule();
  };

  const pickAt = (updateHover) => {
    if (!pickables.length) return null;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    const mesh = hit ? hit.object : null;
    if (updateHover) setHovered(mesh);
    return mesh;
  };

  /** 标签贴在物件上方的锚点,每帧投影 —— 镜头转起来它也跟着走。 */
  const updateLabel = () => {
    if (!hovered) {
      label.hidden = true;
      return;
    }
    const anchor = hovered.userData.anchor || new THREE.Vector3();
    const point = anchor.clone().applyMatrix4(hovered.matrixWorld);
    point.project(camera);
    const box = host.getBoundingClientRect();
    label.style.transform = `translate(-50%, -100%) translate(${((point.x + 1) / 2) * box.width}px, ${((1 - point.y) / 2) * box.height}px)`;
    label.textContent = hovered.userData.label || spotLabel(hovered.userData.spot);
    label.hidden = false;
  };

  host.addEventListener('pointermove', (event) => {
    const rect = host.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointer.set(nx * 2 - 1, -(ny * 2 - 1));

    if (dragging) {
      const dx = event.clientX - dragging.x;
      const dy = event.clientY - dragging.y;
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      dragging.travel += Math.abs(dx) + Math.abs(dy);
      if (!reduced) {
        orbit.targetYaw = clamp(orbit.targetYaw + dx * DRAG_YAW_PER_PX, -ORBIT_YAW_LIMIT, ORBIT_YAW_LIMIT);
        orbit.targetPitch = clamp(orbit.targetPitch + dy * DRAG_PITCH_PER_PX, -ORBIT_PITCH_LIMIT, ORBIT_PITCH_LIMIT);
      }
      return;
    }

    if (reduced) return;
    parallax.tx = (nx - 0.5) * PARALLAX_YAW;
    parallax.ty = -(ny - 0.5) * PARALLAX_PITCH;
    pickAt(true);
  });

  host.addEventListener('pointerleave', () => {
    pointer.set(-10, -10);
    parallax.tx = 0;
    parallax.ty = 0;
    setHovered(null);
  });

  let dragging = null;
  host.addEventListener('pointerdown', (event) => {
    dragging = { x: event.clientX, y: event.clientY, travel: 0 };
    host.setPointerCapture?.(event.pointerId);
    if (!reduced) host.style.cursor = 'grabbing';
  });

  const endDrag = (event) => {
    if (!dragging) return;
    const traveled = dragging.travel;
    dragging = null;
    host.releasePointerCapture?.(event?.pointerId);
    host.style.cursor = hovered ? 'pointer' : '';
    // 拖过一段距离就不算「点这一下」,否则每次转完视角都会误开面板
    if (traveled > DRAG_THRESHOLD) return;
    const mesh = pickAt(false);
    if (mesh?.userData.spot) {
      focusOn(mesh);
      document.dispatchEvent(new CustomEvent('noke:pick', { detail: mesh.userData.spot }));
    }
  };

  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', () => {
    dragging = null;
    host.style.cursor = hovered ? 'pointer' : '';
  });

  /** 点中之后把 rig 转向那个物件、镜头推近一点;标签文字也换成物件名。 */
  const focusOn = (mesh) => {
    if (reduced) return;
    mesh.updateWorldMatrix(true, false);
    const world = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const angle = Math.atan2(world.x - center.x, world.z - center.z);
    orbit.targetYaw = clamp(-angle, -ORBIT_YAW_LIMIT, ORBIT_YAW_LIMIT);
    zoom.target = FOCUS_DISTANCE;
    focusSpot = mesh.userData.spot;
    host.dataset.focused = focusSpot || '';
  };

  const releaseFocus = () => {
    if (focusSpot === null) return;
    focusSpot = null;
    zoom.target = 1;
    orbit.targetYaw = 0;
    orbit.targetPitch = 0;
    host.dataset.focused = '';
    schedule();
  };

  // 面板被关掉(往往是 Esc)时,镜头也该退回原位
  document.addEventListener('noke:panel-closed', releaseFocus);

  window.addEventListener('resize', resize);

  motionQuery.addEventListener('change', (event) => {
    reduced = event.matches;
    if (reduced && loop) {
      cancelAnimationFrame(loop);
      loop = 0;
    }
    schedule();
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
      result = await loadModels(rig, manifest);
    pickables = result.pickables;

    if (!rig.children.length) {
      console.warn('[room3d] 一个模型都没加载上');
      document.dispatchEvent(new CustomEvent('noke:room-ready'));
      return;
    }

    const fitted = fitRig(scene, key, fill, rig);
    center = fitted.center;
    size = fitted.size;
    // 地板比场景再放大一圈,镜头怎么转都看不见边
    floor = createFloor(colors, Math.max(size.x, size.z), center);
    scene.add(floor);
    walls = createWalls(colors, size, center);
    scene.add(walls.group);

    // hover 标签的锚点:取每个可点物件自己的上沿
    for (const mesh of pickables) {
      const box = new THREE.Box3().setFromObject(mesh);
      // Box3 的 max 是属性不是方法(r186 里没有 getMax)
      const top = box.max.clone();
      mesh.updateWorldMatrix(true, false);
      const local = mesh.worldToLocal(top.clone());
      mesh.userData.anchor = local;
      mesh.userData.label = spotLabel(mesh.userData.spot);
    }

    resize();
    host.dataset.roomReady = '1';
    host.dataset.theme = document.documentElement.dataset.theme || '';
    host.dataset.stats = JSON.stringify({
      models: result.loaded,
      meshes: result.meshes,
      pickable: pickables.length,
      lights: 3,
      walls: 2,
      fog: true,
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

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function findHost() {
  const host = document.getElementById(ROOT_ID);
  if (host && !host.dataset.roomReady) start(host);
}

// Leptos 是客户端渲染，DOM 出现的时间不确定：事件 + 立即试一次，两头都覆盖。
document.addEventListener('noke:room-mounted', findHost);
findHost();
