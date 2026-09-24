/**
 * 把清单里的 glb 搬进 rig,并挑出「能点的那些网格」。
 * hover 要改 emissive,所以可点的这份单独拷一份材质。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { deg, TEXTURE_SLOTS } from './config.js';
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
 * 仍然报真网格,所以 hover 高亮、指针形状、点击开哪一格面板全都不变。
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

export async function loadModels(rig, manifest, anisotropy) {
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

      // 会动的部件(冰箱门):按名字从 glb 里挑出来,点击时转它
      let door = null;
      if (item.door) {
        door = node.getObjectByName(item.door) || null;
        if (!door) console.warn(`[room3d] 清单里写了 door=${item.door},但 glb 里没有这个节点`);
      }
      // 转椅:清单里给 `spin`(度)就表示「点一下转一圈」。转的是**模型根节点** ——
      // 它的原点得落在底盘轴心上,否则转起来会绕着一根偏心的轴公转(见 tools/compress_glb.py)。
      const spin = typeof item.spin === 'number' && item.spin !== 0 ? item.spin : 0;
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
          // hover 要改 emissive,材质可能是共享的 —— 先给可点的这份单独一份
          child.material = material.clone();
          if (item.spot) child.userData.spot = item.spot;
          if (door) child.userData.door = door;
          // 转的是根节点(原点在底盘轴心上),所以这里存的是节点本身 + 一圈多少度
          if (spin) {
            child.userData.spin = node;
            child.userData.spinDeg = spin;
          }
          child.userData.baseEmissive = child.userData.baseEmissive = child.material.emissive
            ? child.material.emissive.getHex()
            : 0x000000;
          child.userData.baseEmissiveIntensity = child.material.emissiveIntensity ?? 1;
          // 面数太高的走包围盒代理:不然每帧一次射线就要遍历几十万三角形
          if (trianglesOf(child.geometry) >= HEAVY_PICK_TRIS) useBoxPick(child);
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
