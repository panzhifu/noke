/**
 * 把清单里的 glb 搬进 rig,并挑出「能点的那些网格」。
 * hover 要改 emissive,所以可点的这份单独拷一份材质。
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { deg, TEXTURE_SLOTS } from './config.js';
import { resolveUrl } from './manifest.js';

export async function loadModels(rig, manifest, anisotropy) {
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
