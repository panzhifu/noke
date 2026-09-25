/**
 * 页面最外层的 DOM:加载界面、门厅那条进度发丝线、进门时那块幕。
 *
 * 这三样都写在 index.html 里(不在 Leptos 的视图里),因为它们要管的是「App 还没挂上」
 * 和「three.js 还没就绪」那两段时间。这一层只做一件事:把 JS 算出来的数字翻译成
 * CSS 自定义属性 + `<html data-phase>`,显示规则全在 styles/main.css / room3d.css 里。
 *
 * 阶段(data-phase):
 *   空      还在下载门 —— 加载界面占屏
 *   porch   门厅:首屏只有那扇门,其余家具在后台补
 *   walking 推门而入的补间中
 *   room    已经站在屋里
 *   page    3D 这层起不来(WebGL / 解码 / 超时),退回纯 DOM 页面
 */

const PHASES = ['porch', 'walking', 'room', 'page'];

/** 写自定义属性:变化不足半个百分点就跳过 —— 下载进度是按 chunk 来的,能刷上百次。 */
function setFraction(el, name, value, now) {
  const next = Math.round(Math.min(Math.max(value, 0), 1) * 200) / 200;
  if (el.dataset[name] === String(next)) return;
  el.dataset[name] = String(next);
  el.style.setProperty(`--${name}`, String(next));
  now?.(next);
}

export function createGate(root = document.documentElement) {
  // 认类名不认 id:这三样在 index.html 里就是靠这几个类和样式绑在一起的,少一份要对齐的名单
  const doc = root.ownerDocument;
  const gate = doc.querySelector('.gate');
  const line = doc.querySelector('.porch-line');
  const curtain = doc.querySelector('.curtain');

  let phase = '';

  return {
    /** 进阶段。只认已知值,而且一旦到了 room 就不再倒退(超时兜底不能把屋门关上)。 */
    setPhase(next) {
      if (!PHASES.includes(next)) return;
      if (phase === 'room' && next !== 'room') return;
      phase = next;
      root.dataset.phase = next;
    },

    /** 门那一只 glb 的字节进度 —— 加载界面里那扇门就是这么一点点开开的。 */
    bootProgress(fraction) {
      if (!gate) return;
      setFraction(gate, 'p', fraction, (value) => {
        gate.setAttribute('aria-valuenow', String(Math.round(value * 100)));
      });
    },

    /** 其余家具的进度(件数)。门厅阶段只体现在那条发丝线上。 */
    roomProgress(fraction) {
      if (line) setFraction(line, 'p', fraction);
    },

    /** 进门那块幕的不透明度:0 透明 → 1 全黑(颜色跟场景背景一致)。 */
    wipe(opacity) {
      if (!curtain) return;
      const next = Math.min(Math.max(opacity, 0), 1);
      if (curtain.dataset.w === String(next)) return;
      curtain.dataset.w = String(next);
      curtain.style.setProperty('--w', String(next));
    },
  };
}
