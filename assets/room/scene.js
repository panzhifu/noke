/**
 * 场景本体:三面光、地板、两面墙,以及按包围盒把灯和阴影相机摆到位。
 * 尺度以 Blender 为准（导出时已转成 Y-up，地毯平铺在 XZ 平面），位置/旋转/缩放不做单位换算。
 */

import * as THREE from 'three';

export function createScene(colors) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.background);
  // 雾在取景算出距离后才上，见 main.js 的 applyFog
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
 * 两面墙封出一个角落:后墙在 -z、左墙在 -x(镜头从 +z 那侧看过来,这两面正好在画面里,
 * 且都在东西后面 —— 不会挡视线,只负责给空间一个边界)。
 */
export function createWalls(colors, size, center) {
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

export function createFloor(colors, span, center) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 4, span * 4),
    new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, -0.002, center.z);
  floor.receiveShadow = true;
  return floor;
}

/** 阴影相机、地板、墙、主光位置都得按实际场景尺寸来，不然大地毯会糊或者被裁掉。 */
export function fitRig(scene, key, fill, accent, rig) {
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
  // 强调光从左前上方打下来,照到地毯与书桌那一块。够高才盖得住整个取景跨度
  accent.position.set(center.x - span * 0.45, span * 1.35, center.z + span * 0.75);
  accent.target.position.set(center.x, 0, center.z);

  return { center, size };
}
