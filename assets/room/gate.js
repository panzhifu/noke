/**
 * 页面最外层的 DOM:加载盖层。
 *
 * 它写在 index.html 里(不在 Leptos 的视图里),因为它要管的是「App 还没挂上」
 * 和「three.js 还没就绪」那两段时间。这一层只做一件事:把 JS 算出来的数字翻译成
 * CSS 自定义属性 + `<html data-phase>`,显示规则全在 styles/main.css 里。
 *
 * 阶段(data-phase):
 *   空        屋里的模型还在下载 —— 盖层占屏,进度走那条轨
 *   landing   首屏:家具的特写(见 config.js 的 LANDING_RADIUS)
 *   entering  点过屏幕了:镜头沿同一条视线缓退到定位那一格
 *   room      已经退到定位
 *   page      3D 这层起不来(WebGL 拿不到 / 一件都没加载上 / 超时),退回纯 DOM 页面
 */

const PHASES = ['landing', 'entering', 'room', 'page'];

/** 写自定义属性:变化不足半个百分点就跳过 —— 下载进度是按 chunk 来的,能刷上百次。 */
function setFraction(el, name, value, now) {
  const next = Math.round(Math.min(Math.max(value, 0), 1) * 200) / 200;
  if (el.dataset[name] === String(next)) return;
  el.dataset[name] = String(next);
  el.style.setProperty(`--${name}`, String(next));
  now?.(next);
}

export function createGate(root = document.documentElement) {
  // 认类名不认 id:这个元素在 index.html 里就是靠类名与样式绑在一起的,少一份要对齐的名单
  const doc = root.ownerDocument;
  const gate = doc.querySelector('.gate');

  let phase = '';

  return {
    /** 进阶段。只认已知值,而且到了 room / page 就不再倒退。 */
    setPhase(next) {
      if (!PHASES.includes(next)) return;
      // room 与 page 都是终点:进了屋不能再退回首屏,超时兜过底也不该被后来的阶段改回去
      if (phase === 'room' || (phase === 'page' && next !== 'page')) return;
      phase = next;
      root.dataset.phase = next;
    },

    /** 屋里那十几件的进度(按件数),喂给盖层那条轨。 */
    progress(fraction) {
      if (!gate) return;
      setFraction(gate, 'p', fraction, (value) => {
        gate.setAttribute('aria-valuenow', String(Math.round(value * 100)));
      });
    },
  };
}
