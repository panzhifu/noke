/**
 * 跟着站点 data-theme 走的色板。
 * 3D 层和 DOM 层的颜色只有这一份来源,主题切换时由 main.js 灌回场景。
 */

export function palette() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    background: dark ? 0x0b0c0f : 0xf7f5f0,
    // 地板得跟暖米色的地毯拉开:太接近的话两者糊成一片,地毯看着像浮在雾里
    floor: dark ? 0x15161b : 0xc9c4b8,
    wallBack: dark ? 0x13151a : 0xe7e1d4,
    wallSide: dark ? 0x0e1015 : 0xddd6c6,
    hemiSky: dark ? 0x3a4152 : 0xe4ebf5,
    hemiGround: dark ? 0x1a1b21 : 0xd6ccb9,
    key: dark ? 0xfff1da : 0xfff8ee,
    keyIntensity: dark ? 1.6 : 2.2,
    hemiIntensity: dark ? 0.4 : 0.85,
    // 参考 p3d 的做法:一支 penumbra=1 的柔边聚光当强调光,不投影,
    // 只负责在画面里打出一块"被照到的地方" —— 没有它整间房是均匀平光。
    accent: dark ? 0xffd9a8 : 0xfff3df,
    accentIntensity: dark ? 22 : 26,
    accentAngle: 0.42,
    accentPenumbra: 1,
    // 补光从天顶另一边来,只为了把背光面从纯黑里捞出来,不该再投一份影子
    fill: dark ? 0xbcd0f0 : 0xdce8ff,
    fillIntensity: dark ? 0.34 : 0.5,
  };
}
