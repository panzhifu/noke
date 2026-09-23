/**
 * 模型清单:写在 #room3d 的 data-models 上,由 Rust 侧(src/room/manifest.rs)生成。
 * 加模型 = 清单加一行 + 丢一个 glb 进 assets/models/。
 */

export function readManifest(host) {
  const raw = host.dataset.models;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[room3d] 模型清单解析失败', error);
    return [];
  }
}

/** file 是相对页面写的，交给 baseURI 解析，GitHub Pages 子路径才不会错。 */
export function resolveUrl(file) {
  return new URL(file, document.baseURI).href;
}
