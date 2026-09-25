/**
 * 门厅(首屏那扇门)的镜头位姿,以及「推门而入」那两段走位。
 *
 * 为什么是两段:门在背墙上,而房间在门的**同一侧** —— 门后只有一段 1.2 m 深、
 * 还被开着的门扇占住的暗腔。所以「一镜到底穿门而入」在这个场景里做不到,能做的读法是
 * 「走到门口 → 眼前一黑(幕)→ 已经在屋里,镜头退到定位」。换景那一瞬间要盖住的是三件事:
 * 家具显形、景片按真包围盒重建、雾从门厅那一档放开到房间那一档。
 *
 * 下面把一档镜头位姿叫「一格」:门厅那一格(门前)、门口那一格(凑到门框前)、
 * 屋里那一格(整间屋子的定位镜头)。
 *
 * 三档位姿都由 framing.js 的 sphericalPose 摆(注视点 + 距离 + 方位角 + 俯角),
 * 两两之间注视点相同,所以补间只插值镜头位置这一个向量就够了。
 */

import * as THREE from 'three';
import {
  CAMERA_AZIMUTH,
  PORCH_AZIMUTH,
  PORCH_FILL,
  PORCH_FOG,
  PORCH_PITCH,
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
 * 门厅那一格:正对门、几乎平视,门完整入画并留出四周的墙与地板(PORCH_FILL)。
 * 距离是从门自己的包围盒量的 —— 换一扇门、改一下清单里的缩放,构图自己跟上。
 */
export function porchPose(camera, host, box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const distance = fitDistance(camera, host, size, PORCH_FILL, size.z);
  const look = new THREE.Vector3(center.x, box.min.y + size.y / 2, center.z);
  const pose = sphericalPose(look, distance, PORCH_AZIMUTH, PORCH_PITCH);
  return {
    ...pose,
    near: Math.max(distance * 0.02, 0.1),
    far: distance * 12,
    fogNear: distance * PORCH_FOG[0],
    fogFar: distance * PORCH_FOG[1],
  };
}

/** 屋里那一格:framing.js 按场景包围盒算出来的定位镜头。 */
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
 *  - from / to   两档位姿(门厅 / 房间定位)
 *  - revealAt    整段里换景的那一点(0~1),幕在这里全黑
 *  - hold        幕全黑停多久(占整段的比例),镜头在这一拍跳到屋里起步的那一格
 *  - apply(pose, curtain)  每帧把位姿刷到相机上、把不透明度刷到幕上
 * 返回 { step } —— step(dt) 还在走为 true(交给 loop.js 的按需渲染,走完自己就停摆)。
 */
export function createWalkIn(ctx) {
  const { from, to, duration, revealAt, hold, onReveal, onDone, apply } = ctx;
  const at = revealAt + hold;

  // 门口那一格:和门厅同一个注视点,只是凑到 THRESHOLD_RADIUS
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
