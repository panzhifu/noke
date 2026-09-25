/**
 * 场景本体:灯光组、地板、墙角,外加「房间灯那盏聚光该挂在哪儿」—— 台灯进清单之后,
 * 灯头的位置是从模型里认出来的,不是这里写死的。
 *
 * 灯光组的形状照 pinchen.me 来:半球(天/地) + 主光(投影) + 补光 + 反弹光 + 一盏暖聚光。
 * 那边是「烘焙贴图为主 + 一盏聚光当房间灯」,这边全靠实时灯,所以四态之间的差别
 * 全压在这组灯的颜色与强度上(见 palette.js 的表,由 main.js 逐帧插值)。
 *
 * 尺度以 Blender 为准（导出时已转成 Y-up），位置/旋转/缩放不做单位换算。
 */

import * as THREE from 'three';
import { DOOR_RECESS_DARK, DOOR_RECESS_DEPTH, LAMP_BULB_MATERIAL, WALL_HEIGHT, WALL_PAD, WALL_SPAN } from './config.js';

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
  // 门厅和屋里是两次测量(见 fitRig),每次都 new 一个 target 就会往场景里漏一个孤儿节点。
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
 * 墙角:两片大板封出 -z 与 -x 那个角。镜头从 +z 侧看过来,这两面正好是背景。
 * 高度给到远处,让上边缘尽量出画;侧边则故意留在画里 —— pinchen 的舞台就是这样,
 * 墙不是封闭房间,是两块景片,边缘露着背景才像「摆出来的一角」。
 *
 * 给了 `doorway`(门在世界系里的包围盒)就把背墙换成「带一个矩形洞的板」,并在洞后面接一段
 * **暗腔**:一个只画内壁的盒子(BackSide),正面那层朝后所以不画,从洞口看进去就是
 * 「里面没开灯的另一个空间」。洞的尺寸直接取自门自己的包围盒 —— 门框多大洞就多大,
 * 再抄一份数字到墙这边就一定会对不上。
 */
export function createWalls(variant, size, center, doorway = null) {
  const group = new THREE.Group();
  group.name = 'walls';
  const height = WALL_HEIGHT;
  const width = Math.max(Math.max(size.x, size.z) * WALL_SPAN, 8);
  const backZ = center.z - size.z / 2 - WALL_PAD;
  const sideX = center.x - size.x / 2 - WALL_PAD;

  // 背墙:ShapeGeometry 出来的面和 PlaneGeometry 一样在 XY 平面上、法线朝 +Z,
  // 差别是它可以带 holes(洞)。
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  let hole = null;
  if (doorway) {
    // 洞比门框每边小 8mm:让门框**压住**洞口那一圈,而不是留一条能看穿的黑缝。
    // 底边不贴着 y=0 而是抬 2mm —— 洞的下边和轮廓重合时 earcut 会切出退化三角形。
    const inset = 0.008;
    hole = {
      x0: doorway.min.x - center.x + inset,
      x1: doorway.max.x - center.x - inset,
      y0: 0.002,
      y1: Math.min(doorway.max.y, height) - inset,
    };
    const path = new THREE.Path();
    path.moveTo(hole.x0, hole.y0);
    path.lineTo(hole.x1, hole.y0);
    path.lineTo(hole.x1, hole.y1);
    path.lineTo(hole.x0, hole.y1);
    path.closePath();
    shape.holes.push(path);
  }
  const back = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: variant.wallBack, roughness: 0.95, metalness: 0 }),
  );
  back.position.set(center.x, 0, backZ);
  back.receiveShadow = true;

  const side = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: variant.wallSide, roughness: 0.95, metalness: 0 }),
  );
  side.rotation.y = Math.PI / 2;
  side.position.set(sideX, height / 2, center.z);
  side.receiveShadow = true;

  group.add(back, side);

  let recess = null;
  if (hole) {
    const w = hole.x1 - hole.x0;
    const h = hole.y1 - hole.y0;
    // 深度要容得下**往后开**的那扇门(门扇 0.88 长),不然开一半就穿到腔外面
    const depth = DOOR_RECESS_DEPTH;
    recess = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, depth),
      // **不受光**(Basic):墙后那一截没有灯,要是还跟着半球光与主光走,它就被这间屋子的
      // 光照成一块水泥灰的盒子(第一版就是这样,看着像墙里砌了个柜子)。按墙面色压暗之后
      // 固定成暗色,深浅两套主题各自给一档,开门看见的就是「里面没开灯」。
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(variant.wallBack).multiplyScalar(DOOR_RECESS_DARK),
        side: THREE.BackSide,
        // 雾也要关掉:腔底离镜头十来米,早就过了雾的近端,不关的话它被抹成三四成的背景色,
        // 材质给多黑都没用(实测 0.02 与 0.004 出来都是 sRGB 95 上下那一坨灰)。
        fog: false,
      }),
    );
    recess.position.set(center.x + (hole.x0 + hole.x1) / 2, (hole.y0 + hole.y1) / 2, backZ - depth / 2);
    group.add(recess);
  }
  return { group, back, side, recess, height, backZ };
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
 * `nodes` 就是要量出来的那一堆家具:调用方负责把不该参与取景的摘出去
 * (嵌在墙上的门 —— 墙的位置就是从这个盒子推的,算进去等于把墙自己推远;
 *  程序化的地板与景片同理,门厅那两块地板有十几米)。
 */
export function fitRig(lights, focus, nodes) {
  const bounds = new THREE.Box3();
  const one = new THREE.Box3();
  for (const node of nodes) {
    if (one.setFromObject(node).isEmpty()) continue;
    bounds.union(one);
  }
  if (bounds.isEmpty()) bounds.makeSafe();
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

  focus.position.set(center.x, 0, center.z);

  // 主光从左前上方来:这个方向下,两面墙的正面都接得到光,影子甩向角落。
  // 三盏光都是平行的,所以只有**方向**要紧、距离无所谓 —— 按 span 放大只是让它们
  // 各自离得开:门厅那次测量 span 只有 1,方向却和整间屋子一模一样。
  lights.key.target = focus;
  lights.key.position.set(center.x + span * 0.55, span * 1.15, center.z + span * 0.75);
  lights.fill.target = focus;
  lights.fill.position.set(center.x - span * 0.85, span * 0.75, center.z - span * 0.55);
  lights.bounce.target = focus;
  lights.bounce.position.set(center.x - span * 0.3, -span * 0.6, center.z + span * 0.4);

  return { center, size };
}

/**
 * 一套「景片」:地板 + 墙角(带门洞与暗腔)。
 *
 * 屋里那套的尺寸是从家具包围盒推出来的,而门厅阶段家具还没到 —— 所以这套要建两遍:
 * 先按门自己的包围盒铺一小段(首屏只有门前那一格),家具齐了再按真值建屋里那套。
 * 两套都挂在视差组里,同一时刻只有一套 visible:它们各自的网格不会打架,
 * 换的那一刀由进门补间里的幕盖住(见 porch.js)。
 */
export function buildStage(variant, size, center, floorSpan, doorway = null) {
  const group = new THREE.Group();
  group.name = 'stage';
  const floor = createFloor(variant, floorSpan, center);
  const walls = createWalls(variant, size, center, doorway);
  group.add(floor, walls.group);
  return { group, floor, walls };
}
