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
 *
 * 旋转交给 OrbitControls（同类开源房间站都是这么做的），角度钳位：
 * 墙是单面片，转到墙背后会直接看穿，所以方位角/俯角不许越界。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ROOT_ID = 'room3d';
const MAX_DPR = 2;
const PARALLAX_YAW = 0.07;
const PARALLAX_PITCH = 0.035;
const PARALLAX_EASE = 0.06;
const TARGET_EASE = 0.07;
// 贴图各向异性上限:斜着看地面时,让贴图不发糊靠的是它,不是分辨率
const ANISOTROPY = 8;
// 拖过这几个像素就不算「点一下」,否则每次转完视角都会误开面板
const DRAG_THRESHOLD = 6;
// 镜头钳位(度):俯角不到 25° 会看到地板背面;方位角限制在两面墙的正面一侧
// 长焦取景:fov 越小,透视变形越弱,3D 越不像"玩具盒子"(参考 p3d 的 fov 25)
const CAMERA_FOV = 29;
// 俯角锁死:true 时拖拽只能水平转,不存在转到露馅的角度;false 才用下面的区间
const POLAR_LOCK = true;
const POLAR_LIMITS = [25, 72];
const AZIMUTH_LIMITS = [-20, 66];
const DISTANCE_RANGE = [0.6, 1.35]; // × 取景距离
// hover 时往材质里加的一点自发光(琥珀色),浅背景上够显眼又不刺眼
const HOVER_EMISSIVE = 0x3a2a10;
const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

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
    keyIntensity: dark ? 1.6 : 2.2,
    hemiIntensity: dark ? 0.4 : 0.85,
    // 参考 p3d 的做法:一支 penumbra=1 的柔边聚光当强调光,不投影,
    // 只负责在画面里打出一块"被照到的地方" —— 没有它整间房是均匀平光。
    accent: dark ? 0xffd9a8 : 0xfff3df,
    accentIntensity: dark ? 22 : 26,
    accentAngle: 0.42,
    accentPenumbra: 1,
    // 补光从天顶另一边来,只为了把背光面从纯黑里捞出来,不该再投一份影子
    fill: dark ? 0xbcd0f0 : 0xdce8ff,
    fillIntensity: dark ? 0.34 : 0.5,
  };
}

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

const deg = (value) => THREE.MathUtils.degToRad(value);

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

  // 补光从主光的对角来,不投影
  const fill = new THREE.DirectionalLight(colors.fill, colors.fillIntensity);
  scene.add(fill);

  // 强调光用聚光:spot.shadow 一律关掉,投影仍由 key 负责 ——
  // 换 spotlight 当主光得重写阴影相机(透视 vs 正交),为这点氛围不值
  const accent = new THREE.SpotLight(colors.accent, colors.accentIntensity, 0, colors.accentAngle, colors.accentPenumbra);
  scene.add(accent, accent.target);

  return { scene, hemi, key, fill, accent };
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
function fitRig(scene, key, fill, accent, rig) {
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
  fill.position.set(center.x - span * 0.8, span * 0.7, center.z - span * 0.6);
  fill.target = target;
  // 强调光从左前上方打下来,照到地毯与书桌那一块
  accent.position.set(center.x - span * 0.45, height_of(span), center.z + span * 0.75);
  accent.target.position.set(center.x, 0, center.z);

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
const CAMERA_PITCH = deg(50);
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
  const distForDepth = (halfDepth * sinPitch + halfHeight) / Math.tan(vFov / 2) + nearShift;
  const distance = Math.max(distForWidth, distForDepth, 1) * CAMERA_FILL;

  camera.aspect = aspect;
  camera.near = Math.max(distance * 0.02, 0.1);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();

  // 雾按这段距离给:近处在画面里几乎看不见衰减,远处地面和墙根化进背景
  const fogNear = Math.max(distance * 0.72, 1);
  const fogFar = Math.max(distance * 1.85, fogNear * 1.4);
  return { distance, center: center.clone(), fogNear, fogFar };
}

async function loadModels(rig, manifest, anisotropy) {
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
      node.rotation.set(deg(rx), deg(ry), deg(rz));
      node.scale.setScalar(item.scale ?? 1);

      node.traverse((child) => {
        if (!child.isMesh) return;
        meshes += 1;
        child.castShadow = true;
        child.receiveShadow = true;
        const material = child.material;
        for (const slot of TEXTURE_SLOTS) {
          const texture = material?.[slot];
          if (texture) {
            texture.anisotropy = anisotropy;
            texture.needsUpdate = true;
          }
        }
        if (item.spot) {
          // hover 要改 emissive,材质可能是共享的 —— 先给可点的这份单独一份
          child.material = material.clone();
          child.userData.spot = item.spot;
          child.userData.baseEmissive = child.userData.baseEmissive = child.material.emissive
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
    }
  }

  return { pickables, loaded, meshes };
}

// 聚光的高度:够高才能盖住整个取景跨度
function height_of(span) {
  return span * 1.35;
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

  const anisotropy = Math.min(ANISOTROPY, renderer.capabilities.getMaxAnisotropy() ?? 1);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 2000);
  const { scene, hemi, key, fill, accent } = createScene(colors);
  const rig = new THREE.Group();
  scene.add(rig);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.5;
  // 锁定值 = 取景俯角对应的极角,和 refit 里首次摆位的角度一致,不会自相矛盾
  const fittedPolar = Math.PI / 2 - CAMERA_PITCH;
  controls.minPolarAngle = POLAR_LOCK ? fittedPolar : deg(POLAR_LIMITS[0]);
  controls.maxPolarAngle = POLAR_LOCK ? fittedPolar : deg(POLAR_LIMITS[1]);
  controls.minAzimuthAngle = deg(AZIMUTH_LIMITS[0]);
  controls.maxAzimuthAngle = deg(AZIMUTH_LIMITS[1]);

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
  let loop = 0;
  let hovered = null;
  let focused = null;
  let dragging = null;
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const targetGoal = new THREE.Vector3();

  const label = document.createElement('div');
  label.className = 'obj-label';
  label.hidden = true;
  host.appendChild(label);

  const renderOnce = () => renderer.render(scene, camera);

  // 按需渲染(对应 p3d 那个 frameloop='demand'):静止若干帧就停 rAF,
  // 由 OrbitControls 的 change、指针移动、尺寸/主题变化重新叫醒。
  // 不然为了 0.07 弧度的视差和阻尼,一直在满帧重画五个带贴图的网络模型。
  const QUIET_FRAMES = 6;
  const EPS = 1e-4;
  let quiet = 0;
  let last = '';

  const signature = () =>
    [
      rig.rotation.x.toFixed(5), rig.rotation.y.toFixed(5),
      camera.position.x.toFixed(4), camera.position.y.toFixed(4), camera.position.z.toFixed(4),
      controls.target.x.toFixed(4), controls.target.y.toFixed(4), controls.target.z.toFixed(4),
    ].join(',');

  const settled = () =>
    Math.abs(parallax.tx - parallax.x) < EPS && Math.abs(parallax.ty - parallax.y) < EPS;

  const draw = () => {
    loop = 0;
    if (!reduced && !settled()) {
      // 视差是「自己动」的那部分,所以它才是该被减弱动效关掉的;
      // 阻尼和拖拽属于「跟着手动」,任何时候都得响应。
      parallax.x += (parallax.tx - parallax.x) * PARALLAX_EASE;
      parallax.y += (parallax.ty - parallax.y) * PARALLAX_EASE;
      rig.rotation.y = parallax.x;
      rig.rotation.x = parallax.y;
    }
    controls.target.lerp(targetGoal, TARGET_EASE);
    controls.update();
    renderOnce();
    updateLabel();
    const now = signature();
    quiet = now === last ? quiet + 1 : 0;
    last = now;
    if (quiet < QUIET_FRAMES) {
      loop = requestAnimationFrame(draw);
    } else {
      // 停下来时把累计帧数写出去,好核对「真的停了」
      host.dataset.frames = String(renderer.info.render.frame);
      // 停下时把水平角度也写出去:核对「拖拽确实转了相机」
      host.dataset.view = controls.getAzimuthalAngle().toFixed(3);
    }
  };

  const invalidate = () => {
    quiet = 0;
    if (!loop) loop = requestAnimationFrame(draw);
  };

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

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    framing = fitCamera(camera, host, center, size);
    applyFog();
    refit();
    invalidate();
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
    accent.color = new THREE.Color(colors.accent);
    accent.intensity = colors.accentIntensity;
    accent.angle = colors.accentAngle;
    accent.penumbra = colors.accentPenumbra;
    if (floor) floor.material.color = new THREE.Color(colors.floor);
    if (walls) {
      walls.back.material.color = new THREE.Color(colors.wallBack);
      walls.side.material.color = new THREE.Color(colors.wallSide);
    }
    invalidate();
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
    invalidate();
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
    const point = anchor.clone().applyMatrix4(hovered.matrixWorld).project(camera);
    const box = host.getBoundingClientRect();
    label.style.transform =
      `translate(-50%, -100%) translate(${((point.x + 1) / 2) * box.width}px, ${((1 - point.y) / 2) * box.height}px)`;
    label.textContent = hovered.userData.label || spotLabel(hovered.userData.spot);
    label.hidden = false;
  };

  host.addEventListener('pointermove', (event) => {
    const rect = host.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointer.set(nx * 2 - 1, -(ny * 2 - 1));
    if (dragging) {
      dragging.travel += Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0);
      invalidate();
      return;
    }
    if (!reduced) {
      parallax.tx = (nx - 0.5) * PARALLAX_YAW;
      parallax.ty = -(ny - 0.5) * PARALLAX_PITCH;
    }
    pickAt(true);
  });

  host.addEventListener('pointerleave', () => {
    pointer.set(-10, -10);
    parallax.tx = 0;
    parallax.ty = 0;
    setHovered(null);
  });

  host.addEventListener('pointerdown', (event) => {
    dragging = { travel: 0 };
    invalidate();
    void event;
  });

  host.addEventListener('pointerup', () => {
    if (!dragging) return;
    const traveled = dragging.travel;
    dragging = null;
    // 拖过一段距离就不算「点这一下」
    if (traveled > DRAG_THRESHOLD) return;
    const mesh = pickAt(false);
    invalidate();
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
    invalidate();
  };

  const releaseFocus = () => {
    if (focused === null) return;
    focused = null;
    if (framing) targetGoal.copy(framing.center);
    host.dataset.focused = '';
    invalidate();
  };

  // 面板被关掉(往往是 Esc)时,注视点也该退回场景中心
  document.addEventListener('noke:panel-closed', releaseFocus);

  // 拖拽、滚轮缩放、阻尼滑动都会走这里 —— 按需渲染的唤醒源主要靠它
  controls.addEventListener('change', invalidate);
  host.addEventListener('wheel', invalidate, { passive: true });

  window.addEventListener('resize', resize);

  motionQuery.addEventListener('change', (event) => {
    reduced = event.matches;
    if (reduced) {
      rig.rotation.set(0, 0, 0);
      parallax.tx = 0;
      parallax.ty = 0;
    }
    invalidate();
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

      // hover 标签的锚点:取每个可点物件自己的上沿
      for (const mesh of pickables) {
        const box = new THREE.Box3().setFromObject(mesh);
        mesh.updateWorldMatrix(true, false);
        mesh.userData.anchor = mesh.worldToLocal(box.max.clone());
        mesh.userData.label = spotLabel(mesh.userData.spot);
      }

      resize();
      // 提前编译着色器(对应 drei 的 <Preload all />):否则第一次出现某个材质时掉一帧
      renderer.compile(scene, camera);
      invalidate();
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
        polarLock: POLAR_LOCK,
        fov: CAMERA_FOV,
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
