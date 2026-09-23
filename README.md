# noke · 个人网站

一整间房间就是站点的全部界面:没有滚动、没有导航条,家具可以点,点开的东西从下方浮起。
Rust + [Leptos](https://leptos.dev)(CSR,编译成 WebAssembly)+ Trunk 构建,托管在 GitHub Pages。
纯静态:没有后端、没有 Cookie、没有第三方追踪,也没用 WebGL —— 房间的立体感是 CSS 3D 变换做的。

线上地址:https://panzhifu.github.io/noke/

## 本地开发

前置:rustup(带 `wasm32-unknown-unknown` target)与 [Trunk](https://trunkrs.dev) 0.21。

```bash
cargo install --locked trunk      # 或从 release 页下载预编译二进制
rustup target add wasm32-unknown-unknown

trunk serve                        # http://127.0.0.1:8080,改代码自动重编译
trunk build --release              # 产物在 dist/
```

## 家具 = 入口

| 点什么 | 浮出什么 | 数据在哪 |
| --- | --- | --- |
| 显示器(屏里是 Trove 的界面示意) | 作品 | `PROJECTS` |
| 床 | 关于 + 现在 + 常用 | `ABOUT` `NOW` `STACK` |
| 抽屉柜 | 手记 | `NOTES` |
| 杯子 | 联系(复制邮箱 / socials) | `SITE.email` `SOCIALS` |
| 墙上的海报与那个虚线空位 | 海报 | `POSTER_MARKS` `POSTER_CAPTION` |

映射写在 `src/room.rs`(每个家具是一个 `<button class="hotspot">`,带 `aria-label` 与悬浮标签),
面板是 `src/panel.rs` —— 五格内容常驻 DOM,靠 `.pane-off` 显隐,切换时不重建。
名字与标语不用页头:铭牌刻在桌前(`.plate`),标语挂在墙上(`.sign`),
`<h1>` 用 `.sr-only` 只留给读屏和搜索引擎。

## 想改内容,只动一个文件

全部文案都在 [`src/content.rs`](src/content.rs)。标了 `TODO` 的地方是我留的占位。

- 配色 / 字号:`styles/main.css` 顶部两个 `[data-theme]` 块。
- 房间的几何:`styles/room.css` 里每件家具用 `--x`(左右)、`--z`(进深)、`--w/--h/--d`(长宽高)描述,
  单位全是 em;`.room` 的 `font-size` 就是整个场景的缩放旋钮(它同时受视口宽和高的约束)。
  相机基准角度在 `.room-stage` 的 `transform`;鼠标视差由 `src/hooks.rs` 写成 `--rx/--ry`,
  旋转本身交给 CSS 在 `prefers-reduced-motion: no-preference` 下消费 —— 关掉动效时视差自然失效。
- 换真海报:文件丢进 `assets/`,把 `src/room.rs` 里的 `.poster` 换成 `<img src="assets/xxx.png">`。
- 加一件能点的家具:在 `room.rs` 加一个 `<button class="prop ... hotspot">` + `Spot` 变体,
  再到 `panel.rs` 加一格 `.pane`。

## 部署到 GitHub Pages

1. 建仓库(名字决定访问路径,见下)。
2. 开启 Pages 并设为 Actions 构建源 —— 界面路径 **Settings → Pages → Source: GitHub Actions**,
   或命令行一步:

   ```bash
   gh api -X POST /repos/<所有者>/<仓库名>/pages -f build_type=workflow
   ```

   这步只能用仓库所有者的 token:工作流里的 `GITHUB_TOKEN` 无权创建 Pages 站点
   (`configure-pages` 的 `enablement: true` 会报 `Resource not accessible by integration`)。
3. `git push origin main`,等 `.github/workflows/deploy.yml` 跑完。

工作流自动决定资源前缀,所以同一个仓库换名字不用改代码:

| 仓库名 | 访问地址 | 资源前缀 |
| --- | --- | --- |
| `<用户名>.github.io` | `https://<用户名>.github.io/` | `/` |
| 其他(如 `noke`) | `https://<用户名>.github.io/noke/` | `/noke/` |

本地想按线上子路径预览:

```bash
trunk build --release --public-url /noke/
rm -rf /tmp/noke-preview && mkdir -p /tmp/noke-preview && cp -r dist /tmp/noke-preview/noke
python3 -m http.server -d /tmp/noke-preview 8000   # 打开 http://localhost:8000/noke/
```

## 已验证

`cargo clippy` / `cargo fmt --check` 零警告。用真实产物在浏览器里逐项跑过:
七个 hotspot 各自的 `aria-label` 与标签、点开后恰好只有一格可见且与标题一致、Esc 与关闭按钮都能收起、
六个作品行(含 Trove 的「主线」徽标与要点)、关于格的段落/现在/常用、手记一行、
联系格的复制邮箱与 socials、海报格的迷你海报;房间侧 `#room-stage` 是真 3D(`matrix3d` + `perspective`),
视差钳在 ±7°/±3.5° 且离开归零;主题切换写入 `localStorage`。
面板内滚与行高在给定 640px 宽度下量过(作品行 152/127/100…,按钮 86×42,徽标 31×18)。

修掉的两个真问题:`.pane-off` 类当时没有对应 CSS,五格面板会叠在一起(面板内容高 8215px);
缩放写成 `min(12px, 1.35vw, max(...))` 会让下限被 min 吃掉,已改成 `max(5.4px, min(...))`。

未做的:内置浏览器面板是 0×0 隐藏表面拿不到截图,所以**视觉观感 —— 尤其真实视口下房间的光影层次
和面板的开合手感 —— 没有用眼睛确认过**,上面都是结构与计算样式层面的测量。
