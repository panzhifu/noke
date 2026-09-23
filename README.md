# noke · 个人网站

一整间房间就是站点的全部界面:没有滚动、没有导航条,家具可以点,点开的东西从下方浮起。

Rust + [Leptos](https://leptos.dev)(CSR,编译成 WebAssembly)负责界面与状态,
房间由 [Three.js](https://threejs.org) 渲染,家具模型在 Blender 里做、导出成 glb。
Trunk 构建,托管在 GitHub Pages。纯静态:没有后端、没有 Cookie、没有第三方追踪;
Three.js 随仓库一起发布,运行时不从 CDN 拉任何东西。

线上地址:https://panzhifu.github.io/noke/

## 当前状态:房间刚铺好地毯

| 已经进 3D | 还在等 |
| --- | --- |
| 地毯 —— `assets/models/carpet.glb`(源自 `~/blender/地毯.blend`) | 床、书桌、显示器、抽屉柜、杯子、海报 |

所以入口暂时摆在页面底部那一排按钮里(`src/lib.rs` 的 `EntryBar`),点开的还是原来那五格面板。
**每搬进来一件家具**:在 `src/models.rs` 给它写上 `spot`,再把 `EntryBar` 里对应那个按钮删掉。
按钮删完,这个组件就能整个移除,房间重新变回唯一界面。

## 本地开发

前置:rustup(带 `wasm32-unknown-unknown` target)与 [Trunk](https://trunkrs.dev) 0.21。

```bash
cargo install --locked trunk      # 或从 release 页下载预编译二进制
rustup target add wasm32-unknown-unknown

trunk serve                        # http://127.0.0.1:8080,改代码自动重编译
trunk build --release              # 产物在 dist/
```

## 加一个模型

四步:

1. **Blender 里做**,导出 glb(贴图会被一并嵌进去)。
   导出前删掉灯光 —— 网页自己打光;粒子系统也去掉,glTF 不支持、导出器会报错。
   `target/tmp/export_glb.py` 里就是这套导出脚本,改个路径可以直接复用。
2. **丢进 `assets/models/`**,文件名随意,清单里指到就行。
3. **在 `src/models.rs` 的 `MODELS` 里加一条**:路径、位置、旋转、缩放,以及可选的 `spot`。
4. 如果它有 `spot`,把 `src/lib.rs` 里 `EntryBar` 的对应按钮删掉。

### 坐标系以 Blender 为准

导出时 Blender 已经把 Z-up 转成 glTF 的 Y-up,所以**模型在 Blender 里摆在哪、清单里照抄就行**,
不用做单位换算。地毯平铺在 XZ 平面、y = 0。

`position` / `rotation` / `scale` 对应 three.js 的 `Object3D`;`rotation` 写**角度**,JS 那边负责转弧度。

`spot` 的取值要和 `panel::Spot` 对得上:`"work"` `"about"` `"notes"` `"contact"` `"poster:0"`。
写 `None` 就是纯装饰、点不开。

### 尺度不用手调

相机距离、阴影范围、地板大小都是**按场景实际的包围盒算的**(`fitRig` / `fitCamera`),
所以把地毯换尺寸、或者往房间里添别的东西,构图会自动跟上。

## 想改内容,只动一个文件

全部文案都在 [`src/content.rs`](src/content.rs)。标了 `TODO` 的地方是留的占位。

- 配色 / 字号:`styles/main.css` 顶部两个 `[data-theme]` 块。
  3D 层跟着这两个主题走 —— `assets/room3d.js` 顶部的 `palette()` 读 `data-theme`,
  得出背景 / 地板 / 三盏灯的颜色,切主题时不用改它。
- 面板:五格内容常驻 DOM,靠 `.pane-off` 显隐,切换时不重建(`src/panel.rs`)。
- 入口按钮:`src/lib.rs` 的 `EntryBar`(临时的,见上)。

## Three.js 放在哪

全部在 `assets/vendor/`,随仓库发布、不走 CDN:

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `three.module.min.js` | 393 KB | r186 的渲染器部分 |
| `three.core.js` | 416 KB | r186 把核心拆了出来,module.min 里写死 `import "./three.core.js"` —— **这个文件名不能改** |
| `addons/loaders/GLTFLoader.js` | 118 KB | 加载 glb |
| `addons/utils/BufferGeometryUtils.js`、`SkeletonUtils.js` | 49 KB | 上面那个的依赖 |

`index.html` 用 importmap 把裸名 `three` 指过去:

```html
<script type="importmap">
  { "imports": {
      "three": "./assets/vendor/three.module.min.js",
      "three/addons/": "./assets/vendor/addons/"
  } }
</script>
```

**importmap 必须排在任何 module 脚本之前**,否则浏览器会直接把它忽略掉。
Trunk 会把 wasm 的加载脚本注入到 `<link data-trunk="rust">` 那一行的位置,
所以 importmap 写在了它上面 —— 别挪。

升级 Three.js:按上表四个名字重新下载,把 `three.core.min.js` 存成 `three.core.js` 就行。

## 目录

```
src/
  lib.rs        页面骨架 + 入口条 + 挂载
  models.rs     3D 模型清单 ← 加模型改这里
  room3d.rs     把清单挂到 DOM,把 3D 的拾取事件接回信号
  room.rs       CSS 3D 那版房间(已停用,见下)
  panel.rs      五格面板
  content.rs    全部文案
  hooks.rs      Esc / 复制邮箱 / 3D 拾取事件
assets/
  room3d.js     Three.js 渲染层:场景、相机、光照、视差、拾取
  models/       glb
  vendor/       Three.js
styles/
  main.css      主题、顶栏、面板、页脚
  room3d.css    3D 层与入口条
  room.css      CSS 房间的样式(已停用)
```

### CSS 3D 那版还留着

`src/room.rs` + `styles/room.css` 没删,只是 `lib.rs` 里不再 `mod room;`。
要切回去:

1. `<Room3D set_spot=set_spot />` 换回 `<Room set_spot=set_spot picked=spot />`;
2. 恢复 `mod room;` 和 `use room::Room;`;
3. 把 `hooks::init_room_tilt()` 加回 `main()`;
4. `content.rs` 与 `hooks.rs` 里那两处 `#[allow(dead_code)]` 可以一并去掉。

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

本地想按线上子路径预览(**必须带 `--public-url`,否则 Trunk 生成的路径是根路径的,子目录下会 404**):

```bash
trunk build --release --public-url /noke/
rm -rf target/tmp/preview && mkdir -p target/tmp/preview && cp -r dist target/tmp/preview/noke
python3 -m http.server -d target/tmp/preview 8000   # 打开 http://localhost:8000/noke/
```

## 已验证

`cargo clippy` / `cargo fmt --check` 零警告。

## 已验证

`cargo clippy --all-targets` 零告警,`cargo fmt --check` 通过。

构建管线:`trunk build --release --public-url /noke/` 之后 `dist/assets/` 下 glb、Three.js、
`room3d.js` 都在位;`index.html` 里 importmap 排在 Trunk 注入的 wasm 加载脚本之前。

**用 Edge(Chromium 151) 真机跑过** —— SwiftShader 软件渲染,视口 1440×900:

- `#room3d` 拿到清单,`carpet.glb` 加载成功,canvas 落地 1440×900,WebGL 2.0 上下文正常
- 地毯的编织贴图、透视、光照、地板对比都正常
- 无 JS 报错
- WebGL 拿不到时整层跳过并派发 `noke:room-ready`,页面不白屏 ——
  这条在 Firefox 无头下实测过(它 `webgl`/`webgl2` 都是 no),DOM 入口照常可用

首屏 gzip 约 316 KB(Three.js 占 195 KB);地毯 glb 557 KB,里面已经是 JPEG 所以 gzip 压不动。

### 踩过的坑

- **importmap 的位置**:Trunk 把 wasm 加载脚本注入到 `<link data-trunk="rust">` 那一行的位置,
  而 importmap 只要晚于任何 module 脚本出现就会被浏览器忽略,`import 'three'` 会全部解析失败。
  所以 importmap 写在了那行上面 —— 别往下挪。
- **three r186 拆包**:`three.module.min.js` 里写死 `import "./three.core.js"`,
  所以下载 `three.core.min.js` 后要**存成 `three.core.js`**,文件名不能改。
- **`PCFSoftShadowMap` 在 r186 被移除**,改用 `PCFShadowMap`(否则每次启动都有一条 warning)。
- **`--public-url` 必须带**:不带的话 Trunk 生成的是根路径资源,子目录部署直接 404。
- **body 的三行 grid**:`.room3d` 是 `fixed` 的、不占 grid 行,页脚会顺着往上跑一格。
  现在 `body:has(> .room3d)` 把它改成四行(顶栏 / 入口条 / 场景 / 页脚)。
