# noke · 个人网站

Rust + [Leptos](https://leptos.dev)(CSR,编译成 WebAssembly)+ Trunk 构建,托管在 GitHub Pages。
纯静态:没有后端、没有 Cookie、没有第三方追踪。

## 本地开发

前置:rustup(带 `wasm32-unknown-unknown` target)与 [Trunk](https://trunkrs.dev) 0.21。

```bash
cargo install --locked trunk      # 或从 release 页下载预编译二进制
rustup target add wasm32-unknown-unknown

trunk serve                        # http://127.0.0.1:8080,改代码自动重编译
trunk build --release              # 产物在 dist/
```

## 想改内容,只动一个文件

所有文案与数据都在 [`src/content.rs`](src/content.rs):站名、标语、邮箱、社交入口、
关于、"现在"、技术栈、作品、手记、页脚。里面标了 `TODO` 的地方是我留的占位。

作品卡片上的标签筛选条是从 `PROJECTS` 的 `tags` 自动去重生成的 —— 加新项目,标签自己会出现。

- 配色 / 字号 / 间距:`styles/main.css` 顶部两个 `[data-theme]` 块,深浅色各一处。
- 新增区块:在 `src/sections/` 里加一个模块,用 `Section` 外壳组件,然后在 `src/lib.rs` 的 `<main>` 里挂上,
  并把它注册进 `src/content.rs` 的 `NAV`(导航高亮按 `id` 匹配)。

## 部署到 GitHub Pages

1. 在 GitHub 建一个仓库(名字决定访问路径,见下)。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. `git push origin main`,等 `.github/workflows/deploy.yml` 跑完即可。

工作流会自动算资源前缀:

| 仓库名 | 访问地址 | 资源前缀 |
| --- | --- | --- |
| `<用户名>.github.io` | `https://<用户名>.github.io/` | `/` |
| 其他(如 `noke`) | `https://<用户名>.github.io/noke/` | `/noke/` |

本地想按线上的子路径预览,加同一个前缀:

```bash
trunk build --release --public-url /noke/
rm -rf /tmp/noke-preview && mkdir -p /tmp/noke-preview && cp -r dist /tmp/noke-preview/noke
python3 -m http.server -d /tmp/noke-preview 8000   # 打开 http://localhost:8000/noke/
```

## 已验证

`cargo clippy`、`cargo fmt --check` 无警告;浏览器里实测过主题切换(含 localStorage 持久化)、
标签筛选、移动端抽屉菜单、滚动导航高亮与阅读进度条。
