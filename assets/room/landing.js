/**
 * 首屏那扇门的镜头位姿,以及「推门而入」那两段走位。
 *
 * 门浮在背景色正中,门外并没有屋子 —— 所以「一镜到底穿门而入」在这里没有意义,能用的是两个
 * 镜头:先推到门框跟前(画面被门框与甩开的门扇填满),在最近这一刻让幕黑下去换场景,再从屋里
 * 退到定位镜头。幕要盖住的是同一帧里发生的三件事:门退场、家具显形、雾从首屏这一格换成按
 * 取景算出来的那一格。
 *
 * 三格镜头位姿分别叫:首屏(门前)、门框前、屋里定位。距离都由 framing.js 的 fitDistance
 * 从包围盒算,方位由 sphericalPose 摆(注视点 + 距离 + 方位角 + 俯角)。相邻两格注视点相同,
 * 所以补间只插值「镜头位置」这一个向量就够了。
 */

import * as THREE from 'three';
import {
  CAMERA_AZIMUTH,
  LANDING_AZIMUTH,
  LANDING_FILL,
  LANDING_FOG,
  LANDING_PITCH,
  SETTLE_FROM,
  THRESHOLD_AZIMUTH,
  THRESHOLD_PITCH,
  THRESHOLD_RADIUS,
} from './config.js';
import { CAMERA_PITCH, fitDistance, sphericalPose } from './framing.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

// 幕拉开与收拢各占整段补间的多长(0~1 的比例)
const CURTAIN_IN = 0.14;
const CURTAIN_OUT = 0.22;

/**
 * 把位姿落到相机 / 注视点 / 雾上。透视相机换了距离得重设 near/far 与 aspect。
 *
 * `ctx.targetGoal` 一定要一起写:loop.js 每帧都把 controls.target 往它那里插值,
 * 不跟着挪的话刚摆好的注视点会在几百帧里被拽到别处去,而循环也因为签名一直变、
 * 永远静不下来(按需渲染本该停摆)。
 */
export function applyPose(camera, host, pose, ctx) {
  const { controls, fog, targetGoal } = ctx || {};
  camera.aspect = Math.max(host.clientWidth / Math.max(host.clientHeight, 1), 0.2);
  camera.position.copy(pose.position);
  camera.near = pose.near;
  camera.far = pose.far;
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(pose.target);
    // 朝向是 OrbitControls.update() 里 lookAt 出来的。不补这一下,从摆好位姿到下一帧画之前
    // 这段窗口里做射线拾取,会朝错误的方向打出去(页面在后台时 rAF 停着,这段窗口能很长)
    controls.update();
  }
  if (targetGoal) targetGoal.copy(pose.target);
  if (fog) {
    fog.near = pose.fogNear;
    fog.far = pose.fogFar;
  }
}

/**
 * 首屏那一格:正对门、几乎平视,门完整入画、四周留出背景(LANDING_FILL)。
 * 距离是从门自己的包围盒量的 —— 换一扇门、改一下缩放,构图跟着走。
 */
export function landingPose(camera, host, box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const distance = fitDistance(camera, host, size, LANDING_FILL, size.z);
  const look = new THREE.Vector3(center.x, box.min.y + size.y / 2, center.z);
  const pose = sphericalPose(look, distance, LANDING_AZIMUTH, LANDING_PITCH);
  return {
    ...pose,
    near: Math.max(distance * 0.02, 0.1),
    far: distance * 12,
    fogNear: distance * LANDING_FOG[0],
    fogFar: distance * LANDING_FOG[1],
  };
}

/** 屋里那一格:framing.js 按家具包围盒算出来的定位镜头。 */
export function roomPose(framing) {
  const pose = sphericalPose(framing.center, framing.distance, CAMERA_AZIMUTH, CAMERA_PITCH);
  return {
    ...pose,
    near: Math.max(framing.distance * 0.02, 0.1),
    far: framing.distance * 12,
    fogNear: framing.fogNear,
    fogFar: framing.fogFar,
  };
}

/**
 * 走位补间。
 * ctx: { from, to, duration, revealAt, hold, onReveal, onDone, apply }
 *  - from / to   两格位姿(首屏 / 屋里定位)
 *  - revealAt    整段里换景的那一点(0~1),幕在这里全黑
 *  - hold        幕全黑停多久(占整段的比例);这期间镜头摆到屋里起步的那一格
 *  - apply(pose, curtain)  每帧把位姿刷到相机上、把不透明度刷到幕上
 * 返回 { step } —— step(dt) 还在走为 true(交给 loop.js 的按需渲染,走完自己就停摆)。
 */
export function createWalkIn(ctx) {
  const { from, to, duration, revealAt, hold, onReveal, onDone, apply } = ctx;
  const at = revealAt + hold;

  // 门框前那一格:与首屏同一个注视点,只是凑到离门心 THRESHOLD_RADIUS
  const threshold = sphericalPose(from.target, THRESHOLD_RADIUS, THRESHOLD_AZIMUTH, THRESHOLD_PITCH);
  // 幕后面那一拍:屋里定位镜头的同一条视线上往里收一点,所以切过去之后镜头还在往前后拉,
  // 不会「啪」地定死
  const offset = to.position.clone().sub(to.target);
  const settle = {
    ...to,
    position: to.target.clone().add(offset.multiplyScalar(SETTLE_FROM)),
  };

  let t = 0;
  let revealed = false;

  const curtainAt = (u) => {
    if (u < revealAt - CURTAIN_IN) return 0;
    if (u < revealAt) return (u - (revealAt - CURTAIN_IN)) / CURTAIN_IN;
    if (u < at) return 1;
    if (u < at + CURTAIN_OUT) return 1 - (u - at) / CURTAIN_OUT;
    return 0;
  };

  const poseAt = (u) => {
    if (u <= revealAt) {
      const k = easeInOut(u / revealAt);
      return { ...from, position: from.position.clone().lerp(threshold.position, k) };
    }
    if (u <= at) return settle;
    const k = easeOut((u - at) / (1 - at));
    return { ...to, position: settle.position.clone().lerp(to.position, k) };
  };

  const step = (dt) => {
    t = Math.min(1, t + (dt * 1000) / duration);
    if (!revealed && t >= revealAt) {
      revealed = true;
      onReveal();
    }
    apply(poseAt(t), curtainAt(t));
    if (t >= 1) {
      onDone();
      return false;
    }
    return true;
  };

  return { step };
}
