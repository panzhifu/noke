/**
 * 场景本体:灯光组、地板,外加「房间灯那盏聚光该挂在哪儿」—— 台灯进清单之后,
 * 灯头的位置是从模型里认出来的,不是这里写死的。
 *
 * 灯光组的形状照 pinchen.me 来:半球(天/地) + 主光(投影) + 补光 + 反弹光 + 一盏暖聚光。
 * 那边是「烘焙贴图为主 + 一盏聚光当房间灯」,这边全靠实时灯,所以四态之间的差别
 * 全压在这组灯的颜色与强度上(见 palette.js 的表,由 main.js 逐帧插值)。
 *
 * 尺度以 Blender 为准（导出时已转成 Y-up），位置/旋转/缩放不做单位换算。
 */

import * as THREE from 'three';
import { LAMP_BULB_MATERIAL } from './config.js';

export function createScene(variant) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(variant.background);
  // 雾在取景算出距离后才上，见 main.js 的 applyFog
  scene.fog = new THREE.Fog(new THREE.Color(variant.background), 10, 40);

  const hemi = new THREE.HemisphereLight(variant.hemiSky, variant.hemiGround, variant.hemiIntensity);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(variant.key, variant.keyIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  // 补光从主光的对角来,不投影
  const fill = new THREE.DirectionalLight(variant.fill, variant.fillIntensity);
  scene.add(fill);

  // 反弹光从地面往上打:夜里只开台灯时,靠它把天花板方向的那点余晖补出来,
  // 否则背光面会黑成一块。它是这组灯里唯一从下往上的。
  const bounce = new THREE.DirectionalLight(variant.bounce, variant.bounceIntensity);
  scene.add(bounce);

  // 房间灯:台灯罩子里那盏。开灯态才亮(off 态 lampIntensity 是 0),
  // penumbra 给到 0.85 是为了让它只留下一团没有硬边的暖光 —— 和 pinchen 的 shelf_bar_light 一个做法。
  const lamp = new THREE.SpotLight(variant.lamp, variant.lampIntensity, 0, Math.PI / 2.7, 0.85, 2);
  lamp.name = 'room_lamp';
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.near = 0.1;
  lamp.shadow.camera.far = 12;
  lamp.shadow.bias = -2e-4;
  lamp.shadow.normalBias = 0.008;
  scene.add(lamp, lamp.target);

  // 主光 / 补光 / 反弹光共用这一个瞄准点。它在 createScene 里建好、之后只挪位置不重建 ——
  // 首屏与屋里各量一次(见 fitRig),每次都 new 一个 target 就会往场景里漏一个孤儿节点。
  const focus = new THREE.Object3D();
  scene.add(focus);

  return { scene, hemi, key, fill, bounce, lamp, focus };
}

/**
 * 台灯不拼了 —— 它进清单了(`assets/models/desk_lamp.glb`,见 src/room/manifest.rs)。
 * 这里只留一件事:从加载完的家具里把**灯泡**那块几何挑出来。
 *
 * 按材质名认:这个包 30 个部件 join 成 7 个材质分组,灯泡那颗球是唯一用 LAMP_BULB_MATERIAL
 * 的。灯头朝哪边、灯泡离桌面几厘米,都是导出与摆放定死的事,网页这边再手算一遍就是
 * 一份会跟着模型过期的坐标。
 */
export function findLampBulb(rig) {
  let bulb = null;
  rig.traverse((node) => {
    if (!bulb && node.isMesh && node.material?.name === LAMP_BULB_MATERIAL) bulb = node;
  });
  return bulb;
}

/**
 * 地板。铺得比场景大一圈:镜头怎么转都看不见边,远端交给雾化进背景。
 */
export function createFloor(variant, span, center) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 4, span * 4),
    new THREE.MeshStandardMaterial({ color: variant.floor, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, -0.002, center.z);
  floor.receiveShadow = true;
  return floor;
}

/**
 * 阴影相机、主光与补光的位置都按实际场景尺寸来,不然大件家具会糊或者被裁掉。
 * 反弹光从地面朝上打,所以它的位置在场景下方。
 *
 * 尺寸与中心由调用方给(main.js 的 assembleRoom 按家具包围盒量出来),
 * 所以整层只量这一次灯。
 */
export function fitRig(lights, focus, size, center) {
  const span = Math.max(size.x, size.z, 1);

  const cam = lights.key.shadow.camera;
  cam.left = -span * 0.85;
  cam.right = span * 0.85;
  cam.top = span * 0.85;
  cam.bottom = -span * 0.85;
  cam.near = Math.max(span * 0.05, 0.5);
  cam.far = span * 6;
  cam.updateProjectionMatrix();

  focus.position.set(center.x, 0, center.z);

  // 主光从左前上方来:这个方向下,两面墙的正面都接得到光,影子甩向角落
  lights.key.target = focus;
  lights.key.position.set(center.x + span * 0.55, span * 1.15, center.z + span * 0.75);
  lights.fill.target = focus;
  lights.fill.position.set(center.x - span * 0.85, span * 0.75, center.z - span * 0.55);
  lights.bounce.target = focus;
  lights.bounce.position.set(center.x - span * 0.3, -span * 0.6, center.z + span * 0.4);
}

/**
 * 一堆节点的合并包围盒(量家具用)。
 *
 * `Box3.setFromObject` 不看 `visible`,量包围盒与可见与否无关 —— 调用方想量什么都行。
 */
export function boundsOf(nodes) {
  const bounds = new THREE.Box3();
  const one = new THREE.Box3();
  for (const node of nodes) {
    if (one.setFromObject(node).isEmpty()) continue;
    bounds.union(one);
  }
  if (bounds.isEmpty()) bounds.makeSafe();
  return {
    size: bounds.getSize(new THREE.Vector3()),
    center: bounds.getCenter(new THREE.Vector3()),
  };
}

