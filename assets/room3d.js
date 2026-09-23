/**
 * 房间的 3D 层。
 *
 * 分工和 CSS 版一样：这里只负责把模型摆出来、让它们能被点到；
 * 「点到之后打开哪一格面板」交给 Leptos —— 通过 noke:pick 事件往外抛。
 *
 * 模型清单写在 #room3d 的 data-models 上（Rust 侧生成），跟 content.rs 一个路子：
 * 加模型 = 清单加一行 + 丢一个 glb 进 assets/models/。
 *
 * 尺度以 Blender 为准：导出时已转成 Y-up，地毯平铺在 XZ 平面，
 * 所以位置 / 旋转 / 缩放直接照 Blender 里的数值填，不做单位换算。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT_ID = 'room3d';
const MAX_DPR = 2;
const PARALLAX_YAW = 0.085;
const PARALLAX_PITCH = 0.042;
const EASE = 0.06;

/** 跟着站点的 data-theme 走，免得 3D 层和 DOM 层风格打架。 */
function palette() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    background: dark ? 0x0b0c0f : 0xf7f5f0,
    // 地板得跟暖米色的地毯拉开:太接近的话两者糊成一片,地毯看着像浮在雾里
    floor: dark ? 0x15161b : 0xc9c4b8,
    hemiSky: dark ? 0x3a4152 : 0xe4ebf5,
    hemiGround: dark ? 0x1a1b21 : 0xd6ccb9,
    key: dark ? 0xfff1da : 0xfff8ee,
    keyIntensity: dark ? 1.5 : 2.1,
    hemiIntensity: dark ? 0.6 : 1.2,
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

  const hemi = new THREE.HemisphereLight(colors.hemiSky, colors.hemiGround, colors.hemiIntensity);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(colors.key, colors.keyIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  return { scene, hemi, key };
}

/** 阴影相机、地板、主光位置都得按实际场景尺寸来，不然大地毯会糊或者被裁掉。 */
function fitRig(scene, key, rig) {
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
  camera.position.set(
    center.x,
    center.y + distance * sinPitch,
    center.z + distance * cosPitch,
  );
  camera.lookAt(center.x, center.y, center.z);
  camera.near = Math.max(distance * 0.02, 0.1);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();
}

async function loadModels(rig, manifest) {
  const loader = new GLTFLoader();
  const pickables = [];
  const loaded = [];

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
        child.castShadow = true;
        child.receiveShadow = true;
        if (item.spot) {
          child.userData.spot = item.spot;
          pickables.push(child);
        }
      });

      rig.add(node);
      loaded.push(node.name);
    } catch (error) {
      console.warn(`[room3d] 加载失败: ${item.file}`, error);
    }
  }

  return { pickables, loaded };
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
  const { scene, hemi, key } = createScene(colors);
  const rig = new THREE.Group();
  scene.add(rig);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let pickables = [];
  let floor = null;
  let center = new THREE.Vector3();
  let size = new THREE.Vector3(1, 1, 1);
  let reduced = motionQuery.matches;
  let loop = 0;
  let parallax = { x: 0, y: 0, tx: 0, ty: 0 };

  const renderOnce = () => renderer.render(scene, camera);

  const draw = () => {
    loop = 0;
    if (!reduced) {
      parallax.x += (parallax.tx - parallax.x) * EASE;
      parallax.y += (parallax.ty - parallax.y) * EASE;
      rig.rotation.y = parallax.x;
      rig.rotation.x = parallax.y;
    }
    renderOnce();
    if (!reduced) loop = requestAnimationFrame(draw);
  };

  const schedule = () => {
    if (reduced) {
      // 关掉动效时不做持续渲染，只在尺寸/主题变化后补一帧
      parallax.x = 0;
      parallax.y = 0;
      rig.rotation.set(0, 0, 0);
      renderOnce();
      return;
    }
    if (!loop) loop = requestAnimationFrame(draw);
  };

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    fitCamera(camera, host, center, size);
    schedule();
  };

  const applyTheme = () => {
    colors = palette();
    scene.background = new THREE.Color(colors.background);
    hemi.color = new THREE.Color(colors.hemiSky);
    hemi.groundColor = new THREE.Color(colors.hemiGround);
    hemi.intensity = colors.hemiIntensity;
    key.color = new THREE.Color(colors.key);
    key.intensity = colors.keyIntensity;
    if (floor) floor.material.color = new THREE.Color(colors.floor);
    schedule();
  };

  host.addEventListener('pointermove', (event) => {
    const rect = host.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointer.set(nx * 2 - 1, -(ny * 2 - 1));
    if (reduced) return;
    parallax.tx = (nx - 0.5) * PARALLAX_YAW;
    parallax.ty = -(ny - 0.5) * PARALLAX_PITCH;
  });

  host.addEventListener('pointerleave', () => {
    pointer.set(-10, -10);
    parallax.tx = 0;
    parallax.ty = 0;
  });

  host.addEventListener('click', () => {
    if (!pickables.length) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    const spot = hit && hit.object.userData.spot;
    if (spot) {
      document.dispatchEvent(new CustomEvent('noke:pick', { detail: spot }));
    }
  });

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
    const result = await loadModels(rig, manifest);
    pickables = result.pickables;

    if (!rig.children.length) {
      console.warn('[room3d] 一个模型都没加载上');
      document.dispatchEvent(new CustomEvent('noke:room-ready'));
      return;
    }

    const fitted = fitRig(scene, key, rig);
    center = fitted.center;
    size = fitted.size;
    // 地板比场景再放大一圈,镜头怎么转都看不见边
    floor = createFloor(colors, Math.max(size.x, size.z), center);
    scene.add(floor);

    resize();
    host.dataset.roomReady = '1';
    host.dataset.theme = document.documentElement.dataset.theme || '';
    document.dispatchEvent(new CustomEvent('noke:room-ready'));
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
