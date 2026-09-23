/**
 * 旋转控制。墙是单面片,转到墙背后会直接看穿,所以方位角/俯角都许动不许越界。
 */

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AZIMUTH_LIMITS, POLAR_LIMITS, deg } from './config.js';

export function createControls(camera, element) {
  const controls = new OrbitControls(camera, element);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.5;
  controls.minPolarAngle = deg(POLAR_LIMITS[0]);
  controls.maxPolarAngle = deg(POLAR_LIMITS[1]);
  controls.minAzimuthAngle = deg(AZIMUTH_LIMITS[0]);
  controls.maxAzimuthAngle = deg(AZIMUTH_LIMITS[1]);
  return controls;
}
