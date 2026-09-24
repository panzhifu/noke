/**
 * 房间的光照状态表。
 *
 * 四个状态 =「时间(日/夜)」×「房间灯(关/开)」:日/夜跟着站点的 data-theme(= 深浅色),
 * 房间灯是一枚独立开关(data-lights)。两个属性都挂在 <html> 上,这一层只管读。
 *
 * 这张表的结构参考 pinchen.me 的做法:每态给一组灯色 + 强度,切换时由 main.js
 * 逐帧插值过去(颜色和数字都能插),所以「开灯」是一个渐亮的过程而不是硬切。
 *
 * 数值是照着它的配比换算过来的 —— 那边是烘焙贴图 + 一盏暖聚光,这边全靠实时灯,
 * 所以「夜 + 灯开」那条的 lamp 给得很重、环境压得很低,只留灯下一圈暖光。
 */

/** 状态键:day/night 对应 data-theme 的 light/dark,lamp 对应 data-lights。 */
export const VARIANTS = {
  // 白天,房间灯没开:天光为主,暖白、亮、影子硬
  'off-day': {
    background: 0xf7f5f0,
    floor: 0xc9c4b8,
    wallBack: 0xe7e1d4,
    wallSide: 0xddd6c6,
    hemiSky: 0xe4ebf5,
    hemiGround: 0xd6ccb9,
    hemiIntensity: 0.9,
    key: 0xfff8ee,
    keyIntensity: 2.3,
    fill: 0xdce8ff,
    fillIntensity: 0.5,
    bounce: 0xd6ccb9,
    bounceIntensity: 0.25,
    lamp: 0xffd9a8,
    lampIntensity: 0,
    lampEmissive: 0x2a2418,
    exposure: 1.0,
  },
  // 白天 + 开灯:整体不变,只是灯罩亮起来、灯下多一圈暖光
  'on-day': {
    background: 0xf7f5f0,
    floor: 0xc9c4b8,
    wallBack: 0xe7e1d4,
    wallSide: 0xddd6c6,
    hemiSky: 0xe4ebf5,
    hemiGround: 0xd6ccb9,
    hemiIntensity: 0.85,
    key: 0xfff4e2,
    keyIntensity: 2.1,
    fill: 0xdce8ff,
    fillIntensity: 0.45,
    bounce: 0xd8ccb4,
    bounceIntensity: 0.35,
    lamp: 0xffd9a8,
    lampIntensity: 1.2,
    lampEmissive: 0xffe6bf,
    exposure: 0.95,
  },
  // 夜里关灯:冷月光,低照度,只够看轮廓
  'off-night': {
    background: 0x0b0c0f,
    floor: 0x15161b,
    wallBack: 0x13151a,
    wallSide: 0x0e1015,
    hemiSky: 0x55627a,
    hemiGround: 0x181a20,
    hemiIntensity: 0.5,
    key: 0xb9c9e4,
    keyIntensity: 1.15,
    fill: 0x8fa6c8,
    fillIntensity: 0.42,
    bounce: 0x2a2f3a,
    bounceIntensity: 0.35,
    lamp: 0xffd9a8,
    lampIntensity: 0,
    lampEmissive: 0x1a1a1e,
    exposure: 0.88,
  },
  // 夜里开灯:环境压到最低,暖聚光在灯下和桌面留一圈,这是四个里最像 pinchen 的一态
  'on-night': {
    background: 0x08090c,
    floor: 0x101116,
    wallBack: 0x0d0f13,
    wallSide: 0x090b0f,
    hemiSky: 0x454d5e,
    hemiGround: 0x13151a,
    hemiIntensity: 0.58,
    key: 0xa9bad6,
    keyIntensity: 0.62,
    fill: 0x7f93b4,
    fillIntensity: 0.34,
    bounce: 0x4a4029,
    bounceIntensity: 1.05,
    lamp: 0xffcf92,
    lampIntensity: 1.35,
    lampEmissive: 0xffdcae,
    exposure: 0.8,
  },
};

/** data-theme + data-lights -> 状态键。 */
export function variantKey(theme, lights) {
  const time = theme === 'dark' ? 'night' : 'day';
  const lamp = lights === 'on' ? 'on' : 'off';
  return `${lamp}-${time}`;
}

/** 读当前状态。默认跟站点首帧一致:浅色 = 白天、灯关着。 */
export function readVariant(root = document.documentElement) {
  return variantKey(root.dataset.theme, root.dataset.lights);
}

export function variant(key) {
  return VARIANTS[key] || VARIANTS['off-day'];
}
