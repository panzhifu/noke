/**
 * 取景:按场景包围盒算出镜头该离多远,顺带定雾的近端与远端。
 * 换地毯尺寸或往后添家具,构图都自己跟上。
 */

import * as THREE from 'three';
import { TARGET_LIFT } from './config.js';

// 俯角 16°:比平视高一些,能看见桌面和地板,家具不会挤成一条线 ——
// pinchen 那间房也是这个角度(它的眼位在 17,9,18 看向 0,2,0,算下来约 16°)。
export const CAMERA_PITCH = (16 * Math.PI) / 180;
export const CAMERA_FILL = 0.8;

/**
 * 按「注视点 + 距离 + 方位角 + 俯角」摆出一个镜头位姿。
 * 门厅(门前)、门口、房间定位三档用的是同一套写法,补间时只需插值这两个向量。
 */
export function sphericalPose(target, radius, azimuth, pitch) {
  const spherical = new THREE.Spherical(radius, Math.PI / 2 - pitch, azimuth);
  spherical.makeSafe();
  return {
    target: target.clone(),
    position: target.clone().add(new THREE.Vector3().setFromSpherical(spherical)),
  };
}

/**
 * 按「东西多大 + 想让它占画面几分之几」算镜头该离多远。
 * 垂直与水平各张一次取远的那个:竖屏时限制来自宽度、横屏来自高度,只按一条算另一边会被切。
 * 距离是从**包围盒中心**量的,所以要扣掉沿视线那层的半厚度(`depth`)—— 一块 2 mm 的面板
 * 和一栋 20 m 的楼同一条式子,近的那一面不能算在镜头预算里。
 * 门厅量门、点家具拉近,用的是同一条式子。
 */
export function fitDistance(camera, host, size, fill, depth = 0) {
  const aspect = Math.max(host.clientWidth / Math.max(host.clientHeight, 1), 0.2);
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const forHeight = size.y / 2 / Math.tan(vFov / 2);
  const forWidth = size.x / 2 / Math.tan(hFov / 2);
  return Math.max(forHeight, forWidth, 0.1) * fill + depth;
}

/**
 * 把包围盒投到相机自己的三个轴上,再按各自的角度算距离。
 *
 * 早先这里只按 size.x 算宽度,那是假设镜头正对场景(方位角 0);一旦转到 30°,
 * 场景在画面上的投影宽度会涨到接近对角线,近的那件家具就被切在画框外了。
 * 所以按实际方位角投影 —— |轴·半尺寸| 之和才是画面上的半宽/半高/半深。
 */
export function fitCamera(camera, host, center, size, azimuth) {
  const aspect = Math.max(host.clientWidth / Math.max(host.clientHeight, 1), 0.2);
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const polar = Math.PI / 2 - CAMERA_PITCH;
  const sinPolar = Math.sin(polar);
  const cosPolar = Math.cos(polar);

  // 相机相对注视点的方向(球坐标, up = +Y):u 从注视点指向相机
  const u = {
    x: sinPolar * Math.sin(azimuth),
    y: cosPolar,
    z: sinPolar * Math.cos(azimuth),
  };
  // 相机的右向量与上向量
  const right = { x: Math.cos(azimuth), y: 0, z: -Math.sin(azimuth) };
  const up = {
    x: right.y * u.z - right.z * u.y,
    y: right.z * u.x - right.x * u.z,
    z: right.x * u.y - right.y * u.x,
  };

  const half = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
  const project = (axis) =>
    Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;

  // 沿视线方向的半深:近的那条边离相机最近、张角最大,算距离前得先扣掉它
  const nearShift = project(u);
  const distForWidth = project(right) / Math.tan(hFov / 2) + nearShift;
  const distForDepth = project(up) / Math.tan(vFov / 2) + nearShift;
  const distance = Math.max(distForWidth, distForDepth, 1) * CAMERA_FILL;

  camera.aspect = aspect;
  camera.near = Math.max(distance * 0.02, 0.1);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();

  // 雾按这段距离给。俯视时画面里最远的是墙角,近处要留到注视点之后才开始衰减,
  // 否则家具会先被雾抹成背景色,墙也糊成一片。
  const fogNear = Math.max(distance * 1.05, 1);
  const fogFar = Math.max(distance * 2.4, fogNear * 1.4);
  const look = center.clone();
  look.y += TARGET_LIFT;
  return { distance, center: look, fogNear, fogFar };
}
