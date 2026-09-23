/**
 * 房间这一层的数值常量与角度工具。
 * 集中一份,是为了调手感时只用翻一个文件。
 */

import * as THREE from 'three';

export const ROOT_ID = 'room3d';
export const MAX_DPR = 2;
export const PARALLAX_YAW = 0.07;
export const PARALLAX_PITCH = 0.035;
export const PARALLAX_EASE = 0.06;
export const TARGET_EASE = 0.07;
// 贴图各向异性上限:斜着看地面时,让贴图不发糊靠的是它,不是分辨率
export const ANISOTROPY = 8;
// 拖过这几个像素就不算「点一下」,否则每次转完视角都会误开面板
export const DRAG_THRESHOLD = 6;
// 镜头钳位:极角(从 +Y 量起,度)。60 = 从上往下 30° 俯角,88 = 基本与视线齐平 ——
// 再往 90 去镜头就要沉到地毯下面去了;方位角限制在两面墙的正面一侧。
// 长焦取景:fov 越小,透视变形越弱,3D 越不像"玩具盒子"(参考 p3d 的 fov 25)
export const CAMERA_FOV = 29;
export const POLAR_LIMITS = [60, 88];
export const AZIMUTH_LIMITS = [-20, 66];
export const DISTANCE_RANGE = [0.6, 1.35]; // × 取景距离
// hover 时往材质里加的一点自发光(琥珀色),浅背景上够显眼又不刺眼
export const HOVER_EMISSIVE = 0x3a2a10;
export const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

export const deg = (value) => THREE.MathUtils.degToRad(value);
