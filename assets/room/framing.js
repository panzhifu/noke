/**
 * 取景:按场景包围盒算出镜头该离多远,顺带定雾的近端与远端。
 * 换地毯尺寸或往后添家具,构图都自己跟上。
 */

// 平视:镜头比水平线只低几度(距离 7 m 上下时,大约就是一个人站着看房间的高度)
export const CAMERA_PITCH = (8 * Math.PI) / 180;
export const CAMERA_FILL = 1.05;

export function fitCamera(camera, host, center, size) {
  const aspect = Math.max(host.clientWidth / Math.max(host.clientHeight, 1), 0.2);
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const sinPitch = Math.sin(CAMERA_PITCH);
  const cosPitch = Math.cos(CAMERA_PITCH);
  const halfWidth = size.x / 2;
  const halfDepth = size.z / 2;
  const halfHeight = size.y / 2;

  // 斜着俯视一块水平面时,离相机最近的那条边才是瓶颈 ——
  // 只按中心算距离,近边会溢出画面(角点离相机更近,张角反而更大)。
  const nearShift = halfDepth * cosPitch;
  const distForWidth = halfWidth / Math.tan(hFov / 2) + nearShift;
  const distForDepth = (halfDepth * sinPitch + halfHeight) / Math.tan(vFov / 2) + nearShift;
  const distance = Math.max(distForWidth, distForDepth, 1) * CAMERA_FILL;

  camera.aspect = aspect;
  camera.near = Math.max(distance * 0.02, 0.1);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();

  // 雾按这段距离给。平视时镜头几乎与地面平行,画面里最远的就是那面后墙
  // (约 distance + 进深):近处要留到注视点之后才开始衰减,否则墙会被雾
  // 抹成背景色,房间看着就是浮在黑夜里的一堆家具。
  const fogNear = Math.max(distance * 1.05, 1);
  const fogFar = Math.max(distance * 2.4, fogNear * 1.4);
  return { distance, center: center.clone(), fogNear, fogFar };
}
