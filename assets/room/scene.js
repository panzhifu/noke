/**
 * 场景本体:灯光组、地板、墙角,以及一盏真的摆在书桌上的台灯。
 *
 * 灯光组的形状照 pinchen.me 来:半球(天/地) + 主光(投影) + 补光 + 反弹光 + 一盏暖聚光。
 * 那边是「烘焙贴图为主 + 一盏聚光当房间灯」,这边全靠实时灯,所以四态之间的差别
 * 全压在这组灯的颜色与强度上(见 palette.js 的表,由 main.js 逐帧插值)。
 *
 * 尺度以 Blender 为准（导出时已转成 Y-up），位置/旋转/缩放不做单位换算。
 */

import * as THREE from 'three';
import { DESK_LAMP, WALL_HEIGHT, WALL_PAD, WALL_SPAN, deg } from './config.js';

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

  return { scene, hemi, key, fill, bounce, lamp };
}

/**
 * 书桌右半边的一盏台灯。不是 glb —— 是拿基本体拼的,因为「房间灯」需要一个看得见的灯罩,
 * 而这一盏的位置必须和清单里的书桌对上(见 config.js 的 DESK_LAMP)。
 *
 * 返回灯罩的材质,开灯时 main.js 会把它的 emissive 一起插值成暖色。
 */
export function createDeskLamp() {
  const group = new THREE.Group();
  group.name = 'desk_lamp';
  group.position.set(DESK_LAMP.x, DESK_LAMP.y, DESK_LAMP.z);

  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5, metalness: 0.6 });
  // 灯罩内侧看得见,所以双面;自发光由状态驱动,平时给一点暗色免得它白得发亮
  const shade = new THREE.MeshStandardMaterial({
    color: 0xd9d2c4,
    roughness: 0.75,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x2a2418),
    emissiveIntensity: 1,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.012, 24), metal);
  base.position.y = 0.006;

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 12), metal);
  stem.position.y = 0.17;

  // 灯罩朝桌面中心那侧歪一点,光才是打在桌面上而不是打直下
  const arm = new THREE.Group();
  arm.position.y = 0.34;
  arm.rotation.z = deg(-22);

  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.13, 0.16, 24, 1, true), shade);
  cone.position.y = 0.08;

  arm.add(cone);
  group.add(base, stem, arm);

  for (const mesh of [base, stem, cone]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  return { group, shade };
}

/**
 * 墙角:两片大板封出 -z 与 -x 那个角。镜头从 +z 侧看过来,这两面正好是背景。
 * 高度给到远处,让上边缘尽量出画;侧边则故意留在画里 —— pinchen 的舞台就是这样,
 * 墙不是封闭房间,是两块景片,边缘露着背景才像「摆出来的一角」。
 */
export function createWalls(variant, size, center) {
  const group = new THREE.Group();
  group.name = 'walls';
  const height = WALL_HEIGHT;
  const width = Math.max(Math.max(size.x, size.z) * WALL_SPAN, 8);
  const backZ = center.z - size.z / 2 - WALL_PAD;
  const sideX = center.x - size.x / 2 - WALL_PAD;

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: variant.wallBack, roughness: 0.95, metalness: 0 }),
  );
  back.position.set(center.x, height / 2, backZ);
  back.receiveShadow = true;

  const side = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: variant.wallSide, roughness: 0.95, metalness: 0 }),
  );
  side.rotation.y = Math.PI / 2;
  side.position.set(sideX, height / 2, center.z);
  side.receiveShadow = true;

  group.add(back, side);
  return { group, back, side, height };
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
 */
export function fitRig(scene, lights, rig) {
  const bounds = new THREE.Box3().setFromObject(rig);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1);

  const cam = lights.key.shadow.camera;
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

  // 主光从左前上方来:这个方向下,两面墙的正面都接得到光,影子甩向角落
  lights.key.target = target;
  lights.key.position.set(center.x + span * 0.55, span * 1.15, center.z + span * 0.75);
  lights.fill.target = target;
  lights.fill.position.set(center.x - span * 0.85, span * 0.75, center.z - span * 0.55);
  lights.bounce.target = target;
  lights.bounce.position.set(center.x - span * 0.3, -span * 0.6, center.z + span * 0.4);

  return { center, size };
}
