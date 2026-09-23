/**
 * 按需渲染的帧循环(对应 p3d 那个 frameloop='demand')。
 *
 * 静止若干帧就停 rAF,由 OrbitControls 的 change、指针移动、尺寸/主题变化重新叫醒 ——
 * 不然为了 0.07 弧度的视差和阻尼,一直在满帧重画几个带贴图的网络模型。
 *
 * 顺带两件事:高刷屏上按整数分频限帧(见 MIN_FRAME_GAP),以及把镜头读数写到
 * data-view 上,好在 devtools 里一眼核对「这是平视还是俯瞰」。
 */

import * as THREE from 'three';
import { PARALLAX_EASE, TARGET_EASE } from './config.js';

const QUIET_FRAMES = 6;
const EPS = 1e-4;
// 高刷屏上 rAF 会按刷新率要帧(这块屏是 144Hz),而这间房在核显上跑不满那个数 ——
// 帧距忽长忽短,看着就是卡。留一个最小间隔:只会按整数分频(144→72、120→60),
// 60Hz 屏上每帧间隔本来就大于它,等于不生效。
const MIN_FRAME_GAP = 1000 / 72;

const num = (value) => Number(value.toFixed(2));

/**
 * ctx: { host, renderer, scene, camera, controls, rig, parallax, targetGoal,
 *        isReduced, pick }
 *  - isReduced():这一帧该不该做视差(减弱动效偏好,由 main.js 持有)
 *  - pick():成帧之后做一次 hover 拾取,一帧最多一次
 * 返回 { invalidate, requestPick }
 */
export function createLoop(ctx) {
  const { host, renderer, scene, camera, controls, rig, parallax, targetGoal, isReduced, pick } = ctx;

  let raf = 0;
  let drawing = false;
  let quiet = 0;
  let last = '';
  let pickPending = false;
  let lastDrawn = 0;

  const signature = () =>
    [
      rig.rotation.x.toFixed(5), rig.rotation.y.toFixed(5),
      camera.position.x.toFixed(4), camera.position.y.toFixed(4), camera.position.z.toFixed(4),
      controls.target.x.toFixed(4), controls.target.y.toFixed(4), controls.target.z.toFixed(4),
    ].join(',');

  const settled = () =>
    Math.abs(parallax.tx - parallax.x) < EPS && Math.abs(parallax.ty - parallax.y) < EPS;

  /**
   * 核对用的镜头读数:极角(度)与俯角(=90-极角)、相机与注视点的高度、到注视点的距离,
   * 加上上一帧真实的绘制量 —— 阴影 pass 有没有在跑,看 calls/tris 就知道。
   */
  const readout = () => {
    const polar = THREE.MathUtils.radToDeg(controls.getPolarAngle());
    const offset = camera.position.clone().sub(controls.target);
    return {
      az: num(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())),
      polar: num(polar),
      pitch: num(90 - polar),
      camY: num(camera.position.y),
      targetY: num(controls.target.y),
      dist: num(offset.length()),
      fov: camera.fov,
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
    };
  };

  const draw = () => {
    raf = 0;
    // 一帧里 controls.update() 会同步派发 change → 又回调 invalidate():
    // 此刻 raf 刚清 0,守卫挡不住,同一帧会被排两次画面。
    drawing = true;
    try {
      if (!isReduced() && !settled()) {
        // 视差是「自己动」的那部分,所以它才是该被减弱动效关掉的;
        // 阻尼和拖拽属于「跟着手动」,任何时候都得响应。
        parallax.x += (parallax.tx - parallax.x) * PARALLAX_EASE;
        parallax.y += (parallax.ty - parallax.y) * PARALLAX_EASE;
        rig.rotation.y = parallax.x;
        rig.rotation.x = parallax.y;
        // 几何真的转了,阴影才得跟着重算
        renderer.shadowMap.needsUpdate = true;
      }
      controls.target.lerp(targetGoal, TARGET_EASE);
      controls.update();
      const now = performance.now();
      if (now - lastDrawn < MIN_FRAME_GAP) {
        // 高刷屏上这一拍只推进控制与视差,不画。quiet 也不动 —— 它数的是画面。
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDrawn = now;
      renderer.render(scene, camera);
      if (pickPending) {
        // 拾取按帧算,不按 pointermove 算:鼠标回报率高的时候后者能到 1kHz,
        // 每次移动都对七个网格做射线检测,卡顿就是这么来的。
        pickPending = false;
        pick();
      }
      const sig = signature();
      quiet = sig === last ? quiet + 1 : 0;
      last = sig;
      if (quiet < QUIET_FRAMES) {
        raf = requestAnimationFrame(draw);
      } else {
        // 停下来时把累计帧数写出去,好核对「真的停了」
        host.dataset.frames = String(renderer.info.render.frame);
        // 停下时把镜头读数写出去:核对「拖拽确实转了相机、俯角没跑上去」
        host.dataset.view = JSON.stringify(readout());
      }
    } finally {
      drawing = false;
    }
  };

  const invalidate = () => {
    quiet = 0;
    if (!raf && !drawing) raf = requestAnimationFrame(draw);
  };

  const requestPick = () => {
    pickPending = true;
    // 循环要是停着的,得叫醒它,否则拾取要等到下一次指针事件才生效
    invalidate();
  };

  return { invalidate, requestPick };
}
