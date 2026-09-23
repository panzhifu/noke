# noke · 个人网站

一整间房间就是站点的全部界面:没有滚动、没有导航条、没有可见文字,家具可以点,点开的五格面板在桌面端是右上角的卡片、窄屏退回底部抽屉。

Rust + [Leptos](https://leptos.dev)(CSR,编译成 WebAssembly)负责界面与状态,
房间由 [Three.js](https://threejs.org) 渲染,家具模型在 Blender 里做、导出成 glb。
Trunk 构建,托管在 GitHub Pages。纯静态:没有后端、没有 Cookie、没有第三方追踪;
Three.js 随仓库一起发布,运行时不从 CDN 拉任何东西。

线上地址:https://panzhifu.github.io/noke/

## 当前状态

| 已经进 3D | 点了会开面板 |
| --- | --- |
| 地毯、电动车、书桌、床、唱机、冰箱 —— 见 `src/room/manifest.rs` | 只有书桌(开「作品」)和床(开「关于」) |

剩下三格(手记 / 联系 / 海报)靠面板头部的左右箭头到达;键盘 Tab 则从 `sr-only` 的入口条进。
页面上没有可见文字,所以**没有「搬完家具就删掉的临时按钮」这回事了** —— 入口条是长期给键盘和读屏留的通道。
墙上的海报位还是空的:那一格目前是面板里的两张迷你占版式。

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

1. **Blender 里做**,先导出一个原始 glb(贴图会一并嵌进去)。
   导出前删掉灯光 —— 网页自己打光;粒子系统也去掉,glTF 不支持、导出器会报错。
2. **过一遍 `tools/compress_glb.py`**(无头 Blender,不需要开界面):

   ```bash
   blender --background --python tools/compress_glb.py -- \
     原始.glb assets/models/名字.glb 15000 1024
   ```

   它把层级 join 成一个网格、降面、贴图封顶后转 WebP,再归一化成「米、脚底贴 z=0、水平居中」,
   最后打印一段 JSON(尺寸、包围盒、面数)—— 照着它填清单里的 `position` / `scale`。
   已经在清单里摆好的模型加 `keep`(只降面和压贴图,不碰方向单位);
   高度是最长边的家具(冰箱这类)加 `no-up`,否则「最薄的一面当顶」会把它放倒。
3. **在 `src/room/manifest.rs` 的 `MODELS` 里加一条**:路径、位置、旋转、缩放,以及可选的 `spot`。
4. 给了 `spot` 就到此为止 —— 家具自己就能点了。`EntryBar` 是键盘/读屏通道,不用跟着改。

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
  得出背景 / 地板 / 四盏灯的颜色,切主题时不用改它。
- 面板:五格内容常驻 DOM,靠 `.pane-off` 显隐,切换时不重建(`src/ui/panel.rs`)。
- **页面上没有可见文字**:名字和标语在 `h1.sr-only` 与 meta 里;入口条(`src/ui/entries.rs`)
  整条 `sr-only`,只有键盘 Tab 进来才显形;面板头部是图标 —— 左右箭头遍历五格,× 关闭。
  能点的家具靠 hover 提亮 + 手型指针来表示,不靠标签。

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
  lib.rs        页面骨架 + 挂载
  room/
    mod.rs      把清单挂到 DOM,把 3D 的拾取事件接回信号
    manifest.rs 3D 模型清单 ← 加模型改这里
  ui/
    entries.rs  入口条(sr-only,给键盘和读屏)
    panel.rs    五格面板 + Spot 枚举 + 图标翻页
    theme.rs    深浅色切换与持久化(没手动选过时跟随系统)
  content.rs    全部文案
  hooks.rs      Esc / 复制邮箱 / 3D 拾取事件
assets/
  room3d.js     Three.js 渲染层:场景、相机、光照、视差、拾取
  models/       glb
  vendor/       Three.js
styles/
  main.css      主题、顶栏、面板
  room3d.css    3D 层与入口条
  hud.css       暗角/颗粒/扫描线,以及面板的 HUD 化外观
```

### CSS 3D 那版还留着

`fallback/css3d.rs` + `fallback/css3d.css` 没删,它们在 `src/` 外面,所以压根不参与编译。
要切回去:

1. 把两个文件放回 `src/` 与 `styles/`,`lib.rs` 里加回 `mod room;` 和 `use room::Room;`;
2. `<Room3D set_spot=set_spot />` 换回 `<Room set_spot=set_spot picked=spot />`;
3. 把 `hooks::init_room_tilt()` 加回 `main()`;
4. 为这条回退留的 `#[allow(dead_code)]`(`hooks.rs` 的 `init_room_tilt`、`content.rs` 的
   `SCREEN` / `since`)可以一并去掉。

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
