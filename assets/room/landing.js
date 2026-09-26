/**
 * 首屏那一格特写的镜头位姿、屋里定位那一格,以及两格之间的补间。
 *
 * 首屏不是另一套场景:加载盖层撤掉时家具、景片、灯光与雾全都就位了(main.js 的
 * assembleRoom 一次性等齐),首屏只是**沿定位那条视线凑近**的同一格镜头。点屏幕任意
 * 一下 → 镜头沿同一条视线退回定位。两格方位角与俯角相同(framing.js 的 CAMERA_AZIMUTH
 * 与 CAMERA_PITCH),补间插值的只有镜头位置、投影面与雾这三个量。
 */

import { CAMERA_AZIMUTH, LANDING_RADIUS } from './config.js';
import { CAMERA_PITCH, sphericalPose } from './framing.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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

/** 补上投影面与雾的两端,让一个位姿能直接刷到相机上。 */
function withProjection(pose, distance, fogNear, fogFar) {
  return {
    ...pose,
    near: Math.max(distance * 0.02, 0.1),
    far: distance * 12,
    fogNear,
    fogFar,
  };
}

/**
 * 首屏那一格:定位镜头沿同一条视线收近 LANDING_RADIUS 那么多。
 * 注视点、方位角、俯角与雾的比例全取自定位那一格(fitCamera 按家具包围盒算的),
 * 所以这里没有任何只属于首屏的数 —— 添了家具、改了构图,特写自己跟上。
 * (fitCamera 返回的 center 已经抬过 TARGET_LIFT,这里不再加一遍。)
 */
export function landingPose(framing) {
  const radius = framing.distance * LANDING_RADIUS;
  const pose = sphericalPose(framing.center, radius, CAMERA_AZIMUTH, CAMERA_PITCH);
  return withProjection(pose, radius, framing.fogNear * LANDING_RADIUS, framing.fogFar * LANDING_RADIUS);
}

/** 屋里那一格:framing.js 按家具包围盒算出来的定位镜头。 */
export function roomPose(framing) {
  const pose = sphericalPose(framing.center, framing.distance, CAMERA_AZIMUTH, CAMERA_PITCH);
  return withProjection(pose, framing.distance, framing.fogNear, framing.fogFar);
}

/**
 * 「退后看全景」的补间。
 * ctx: { from, to, duration, onDone, apply }
 *  - apply(pose)  每帧把插值出来的位姿刷到相机上
 * 返回 { step } —— step(dt) 还在走为 true(交给 loop.js 的按需渲染,走完自己就停摆)。
 */
export function createReveal(ctx) {
  const { from, to, duration, onDone, apply } = ctx;
  let t = 0;

  const step = (dt) => {
    t = Math.min(1, t + (dt * 1000) / duration);
    const k = easeInOut(t);
    apply({
      position: from.position.clone().lerp(to.position, k),
      target: from.target.clone().lerp(to.target, k),
      near: from.near + (to.near - from.near) * k,
      far: from.far + (to.far - from.far) * k,
      fogNear: from.fogNear + (to.fogNear - from.fogNear) * k,
      fogFar: from.fogFar + (to.fogFar - from.fogFar) * k,
    });
    if (t >= 1) {
      onDone();
      return false;
    }
    return true;
  };

  return { step };
}
