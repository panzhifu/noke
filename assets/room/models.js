/**
 * 把清单里的 glb 搬进 rig,并挑出「能点的那些网格」(userData 上挂 spot / door / spin / owner)。
 *
 * 加载的节奏由 main.js 分两格管(首屏只要门,屋里的在后台并发补齐),这一层只提供三件事:
 *   load()     单件:下载 → 装配 → 挑可点网格
 *   loadAll()  一批:并发 LOAD_CONCURRENCY 路,每件完成时报一次进度
 *   prewarm()  把材质与贴图提前交给 GPU,免得「进门」那一帧才去编译着色器、上传贴图
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { deg, LOAD_CONCURRENCY, TEXTURE_SLOTS } from './config.js';
import { resolveUrl } from './manifest.js';

// 超过这个面数的网格不再拿真几何求交,改成包围盒代理(见 useBoxPick)。
// 取 1 万而不是更松的阈值:床的褥子 22.1 万、床单 4.8 万、两只枕头各 1.85 万都在这一档,
// 换完之后床上只剩床架 480 + 床垫 260 面走真几何,整张床的拾取开销就压到 0.1 ms 量级。
// 冰箱(5082)、椅子(6464)这些够不着这条线,门 / 家具的拾取精度一点没变。
const HEAVY_PICK_TRIS = 10000;

/**
 * 高面数网格的拾取代理。
 *
 * `Mesh.raycast` 是「先球 / 盒快筛,再逐三角形求交」:射线一旦命中,就要把全部三角形走一遍。
 * 床换成 Draco 全几何(30.7 万面)之后实测 **20.6 ms / 次**,而这个拾取是跟着帧跑的
 * —— 鼠标停在床那一片就一直掉帧(60 Hz 的预算是 16.7 ms)。这里把「射线 vs 几何」
 * 换成「射线 vs 这块网格自己的包围盒」:只剩一次 O(1) 的盒子求交,而命中的 `object`
 * 仍然报真网格,所以指针形状、`data-hover`、点击开哪一格面板全都不变。
 * 代价是盒子角落那点空档也算命中 —— 对「一整张床」这种目标无所谓。
 */
function useBoxPick(mesh) {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const inverse = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const point = new THREE.Vector3();

  mesh.raycast = function (raycaster, intersects) {
    inverse.copy(this.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverse);
    if (localRay.intersectBox(box, point) === null) return;
    point.applyMatrix4(this.matrixWorld);
    const distance = point.distanceTo(raycaster.ray.origin);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({ distance, point: point.clone(), object: this });
  };
}

function trianglesOf(geometry) {
  const index = geometry.getIndex();
  return (index ? index.count : geometry.getAttribute('position').count) / 3;
}

/** 这个网格里所有该按各向异性处理的贴图(和装配时同一份名单)。 */
function texturesOf(node) {
  const out = [];
  node.traverse((child) => {
    if (!child.isMesh) return;
    for (const slot of TEXTURE_SLOTS) {
      const texture = child.material?.[slot];
      if (texture) out.push(texture);
    }
  });
  return out;
}

export function createModelLoader(rig, anisotropy) {
  const loader = new GLTFLoader();
  // 皱褶全靠几何的家具(床:30.7 万面)几何单独就要 8.3 MB,Draco 压完 0.81 MB。
  // 解码器(wasm + wrapper + js 兜底)跟着站点一起发布,不从 CDN 拉 —— 见
  // assets/vendor/addons/libs/draco/gltf/。没有 Draco 的模型走这条路照常加载,
  // 解码器只在真碰到 Draco 网格时才去取。
  const draco = new DRACOLoader();
  draco.setDecoderPath(resolveUrl('assets/vendor/addons/libs/draco/gltf/'));
  loader.setDRACOLoader(draco);

  const pickables = [];
  const loaded = [];
  const textures = [];
  let meshes = 0;

  /**
   * 下载并装配一件。`onBytes` 透传给 GLTFLoader 的 onProgress(静态托管带 Content-Length,
   * 所以 loaded/total 是真字节数)。失败只警告、返回 null:少一件家具不该拖垮整间屋子。
   *
   * `hidden` 必须在 `rig.add` **之前**定下来 —— rig 每帧都在画,晚一步这件家具就在
   * 首屏那一格里显形了一帧(那一格里只该有门)。
   */
  async function load(item, { onBytes, hidden = false } = {}) {
    if (!item || !item.file) return null;
    let gltf;
    try {
      gltf = await loader.loadAsync(resolveUrl(item.file), onBytes);
    } catch (error) {
      console.warn(`[room3d] 加载失败: ${item.file}`, error);
      return null;
    }

    const node = gltf.scene;
    node.name = item.name || item.file;

    const [px, py, pz] = item.position || [0, 0, 0];
    const [rx, ry, rz] = item.rotation || [0, 0, 0];
    node.position.set(px, py, pz);
    // 清单里按 Blender 的习惯写角度,这里转成弧度
    node.rotation.set(deg(rx), deg(ry), deg(rz));
    node.scale.setScalar(item.scale ?? 1);
    // 嵌在墙上的家具(门):fitRig 量包围盒时会先把这类节点摘出去 ——
    // 墙的位置就是从那个盒子推出来的,算进去等于把墙自己推远(见 scene.js 的 fitRig)
    node.userData.wall = Boolean(item.wall);

    // 会开关的部件(首屏那扇门 / 冰箱门):规格给的是 {node, axis, deg},按名字从 glb 里
    // 挑出那个节点。轴与角度**跟着模型走** —— 冰箱门是竖直铰链(绕 Y)、上一台唱机的防尘盖
    // 是水平铰链(绕 X),写死一套就必有一件是错的。节点原点在导出时就摆在铰链上。
    let door = null;
    if (item.door) {
      const part = node.getObjectByName(item.door.node);
      if (!part) {
        console.warn(`[room3d] 清单里写了 door=${item.door.node},但 glb 里没有这个节点`);
      } else {
        door = { node: part, axis: item.door.axis, deg: item.door.deg };
      }
    }
    // 转椅:清单里给 `spin`(节点名)就表示「点一下转一圈」,转的是那个节点自己的 Y ——
    // 和 door 一样按名字从 glb 里挑。节点原点得落在旋转轴(底盘立柱)上,否则偏心公转。
    let spin = null;
    if (item.spin) {
      spin = node.getObjectByName(item.spin) || null;
      if (!spin) console.warn(`[room3d] 清单里写了 spin=${item.spin},但 glb 里没有这个节点`);
    }
    // 可点 = 能开面板(spot) 或 能开关(door) 或 能转(spin)
    const interactive = Boolean(item.spot || door || spin);

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
      if (interactive) {
        if (item.spot) child.userData.spot = item.spot;
        if (door) child.userData.door = door;
        // 存的就是那个上半身节点(它的原点在底盘轴心上);转多少度交给 config 的 SPIN_DEG
        if (spin) child.userData.spin = spin;
        // 首屏只许点门:main.js 的 pickList 按「这块网格是谁家的」筛
        child.userData.owner = node.name;
        // 面数太高的走包围盒代理:不然每帧一次射线就要遍历几十万三角形
        if (trianglesOf(child.geometry) >= HEAVY_PICK_TRIS) useBoxPick(child);
        pickables.push(child);
      }
    });

    textures.push(...texturesOf(node));
    node.visible = !hidden;
    rig.add(node);
    loaded.push(node.name);
    return node;
  }

  /**
   * 一批并发下载,返回装好的那些节点(失败的不算)。
   * 进度有两条:单件内部的字节数走 onBytes,件与件之间走 onItem —— 两条一起才拼得出总进度。
   */
  async function loadAll(items, { concurrency = LOAD_CONCURRENCY, hidden = false, onItem } = {}) {
    const queue = items.slice();
    const total = queue.length;
    const nodes = [];
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        const node = await load(item, { hidden });
        if (node) nodes.push(node);
        done += 1;
        onItem?.(done, total);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(Math.max(concurrency, 1), total) }, worker)
    );
    return nodes;
  }

  /**
   * 预热:着色器交给 compile,贴图交给 initTexture。
   * `compile` 走的是 traverse(不是 traverseVisible),所以家具还藏着也能先把材质编好;
   * 贴图不是 —— 它要真被画到才会上传,所以这里点名逐个传。
   * 挑在首屏那段时间里做,换景那一帧才不会在一次编译 + 一堆上传上被顶住。
   */
  function prewarm(renderer, scene, camera) {
    for (const texture of textures) {
      try {
        renderer.initTexture(texture);
      } catch (error) {
        console.warn('[room3d] 贴图预热失败', error);
      }
    }
    renderer.compile(scene, camera);
  }

  return {
    load,
    loadAll,
    prewarm,
    dispose() {
      draco.dispose();
    },
    stats: () => ({ loaded, meshes, pickables }),
  };
}
