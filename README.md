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
| 地毯(铺在书桌下)、书桌、床、唱机、冰箱、办公椅,外加一间「墙角 + 地板」的舞台与一盏台灯 —— 见 `src/room/manifest.rs` | 书桌(开「作品」)和床(开「关于」) |

**冰箱门可以点开**:那台冰箱的 glb 里,门是一个独立节点,点它会摆开 / 合上(默认关着,
缓出动画)。门开到底 89.888°、铰链在前右竖边 —— 这两个数不是估的,是从 `~/blender/fridge.blend`
自带的「开门 → 关门」骨骼动画里反解出来的,解算与导出见 `target/tmp/export_fridge_door.py`。

剩下三格(手记 / 联系 / 海报)靠面板头部的左右箭头到达;键盘 Tab 则从 `sr-only` 的入口条进。
页面上没有可见文字,所以**没有「搬完家具就删掉的临时按钮」这回事了** —— 入口条是长期给键盘和读屏留的通道。

## 光照的四个状态

顶栏是两枚药丸开关:**房间灯**(书桌上那盏台灯)与**昼夜**(就是站点的深浅色主题)。
两维相乘即四态,颜色与强度全在 `assets/room/palette.js` 一张表里:

| | 灯关 | 灯开 |
| --- | --- | --- |
| 白天 | 天光为主,暖白、影子硬 | 灯罩亮起,灯下多一圈暖光 |
| 夜里 | 冷月光,低照度 | 环境压到最低,只留灯下那团暖光 |

状态切换是**渐变**不是硬切:3D 层每帧把颜色与强度往目标态插(缓出曲线),`toneMappingExposure`
也一起插;插值没走完时按需渲染的循环不许停摆,否则画面会定在渐变半路。

做法参考了 [pinchen.me](https://pinchen.me/) 那间房(它顶栏也是这两枚开关、四态也是这么分的)。
它那边光照是**烘焙进贴图**的(每态一整套 webp),这边全靠实时灯 —— 表里的 lamp 强度因此给得比它重。

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

### 贴图质量:先保证材质,再谈体积

`compress_glb.py` 第 6 个参数是 WebP 质量(默认 70)。**深色 / 靠贴图讲细节的家具要给到 95**
——低质量下丢的正是「材质看得出是什么」的那点信息。办公椅就是照这个来的:

```bash
blender --background --python tools/compress_glb.py -- \
  ~/Downloads/office_chair.glb assets/models/office_chair.glb 12000 1024 no-up 95
```

| 质量 | 体积 | baseColor PSNR | normal PSNR |
| --- | --- | --- | --- |
| 88 | 1.26 MB | 41~53 dB | 31~52 dB |
| **95** | **2.22 MB** | **47~52 dB** | **35~43 dB** |
| 原图字节不动 | 9.29 MB | ∞ | ∞ |

量到什么程度就够了:**在同一机位下把两个版本分别渲出来比像素**,办公椅 88 与 100 的差
只有 1.26/255(超过 8 灰阶的像素 46 个 / 8.7 万),肉眼不可辨 —— 所以要更细的调整就别再往
质量上加了,去看材质本身与打光(见下)。真要字节级无损,把第 6 个参数写成 100 即可,
导出脚本 `target/tmp/chair/export_faithful.py` 是「只归一化、贴图一个字节都不动」的那一档。

### 几何重的东西交给 Draco

降面是最钝的一把刀:**皱褶、布料这类「形状本身就是内容」的模型,一降就糊**。
床的褥子 + 枕头 + 床单原本是 30.7 万面,老版本按 2.5 万面压 —— 于是网站上那张床
和原模型差了十万八千里。正解不是继续降面,而是**几何单独压缩**:

```bash
blender --background --python target/tmp/bed/export_bed.py -- \
  ~/Downloads/messy_bed.glb assets/models/bed.glb 0 1024 95 draco
#  第 3 个参数 0 = 不降面;最后一档 none | meshopt | draco
```

| 方案 | 几何 | 贴图(1024²,WebP 95) | 合计 | 面数 |
| --- | --- | --- | --- | --- |
| 降面到 2.5 万(旧) | 0.64 MB | 0.15 MB | 0.8 MB | 2.5 万 |
| meshopt(无量化) | 8.27 MB | 1.25 MB | 9.5 MB | 30.7 万 |
| **Draco** | **0.81 MB** | **1.25 MB** | **2.07 MB** | **30.7 万** |

`meshopt` 在 Blender 里不做量化,单靠它省不了多少;Draco 带位置/法线/UV 量化,几何掉到 1/10。
代价是要带解码器:`assets/vendor/addons/loaders/DRACOLoader.js` +
`assets/vendor/addons/libs/draco/gltf/{draco_wasm_wrapper.js, draco_decoder.wasm, draco_decoder.js}`
(约 760 KB,wasm 优先、js 兜底),`assets/room/models.js` 里一行 `setDecoderPath` 指向它。
**没有 Draco 的模型照常加载**,解码器只在真碰到 Draco 网格时才去取 —— 所以这一档可以只给需要的家具用。

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
  3D 层跟着这两个主题走,再加一枚 `data-lights`(房间灯) —— 两者都由
  `assets/room/palette.js` 合成状态键(`off-day` / `on-day` / `off-night` / `on-night`),
  四态的背景 / 墙地 / 五盏灯的颜色与强度都写在那张表里,调光只翻这一个文件。
  开关在 `src/lib.rs` 的顶栏,状态由 `src/ui/theme.rs` 与 `src/ui/lights.rs` 写进 `<html>`。
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
  room/         Three.js 渲染层,按职责分文件:
                config(常量) / palette(四态光照表) / manifest(清单) /
                scene(灯光组、墙地、台灯) / framing(取景) / models(glb) /
                controls(旋转钳位) / loop(按需渲染) /
                main(编排、事件、光照插值、拾取、启动)
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

`cargo clippy --all-targets` 零告警,`cargo fmt --check` 通过。

构建管线:`trunk build --release --public-url /noke/` 之后 `dist/assets/` 下 glb、Three.js、
`assets/room/*.js` 都在位;`index.html` 里 importmap 排在 Trunk 注入的 wasm 加载脚本之前。

**每次改完 3D 层都在 Edge(Chromium,SwiftShader 软渲染)里出图核对**,视口 1440×900 ——
`target/tmp/` 里留了几个脚本:`verify_room.py`(起没起得来)、`shoot_states.py`(四态各一张,
顺带核对属性与开关的 aria)、`verify_orbit.py`(轨道四角 + 拾取区域扫描)、
`patch_preview.py` + `shoot_angles.py`(给预览副本打「URL 参数定机位」的补丁,按固定角度复现)、
`bed/check_points.py`(几个关键点的 hover 归属与点击后的 `focused`)、
`bed/probe_pick_cost.py` 与 `chair/imgcmp.py`(拾取耗时、贴图 PSNR —— 判断改动值不值靠这两个)。
注意 `Read` 看图时是**缩放显示**的(1440×900 显示成 1080×675),照图量像素再喂给 `page.mouse`
会整体偏掉 —— 先按比例换算,或在页面里画标记核对。

这一轮(办公椅进房间 + 换掉那张糊掉的床 + Draco)的结果:

- 办公椅:从 `~/Downloads/office_chair.glb` 压成 2.22 MB(`12000 1024 no-up 95`,不降面),
  纯装饰 —— `spot` / `door` 都是 `None`,不进 `pickables`,`pickable` 仍是 9(不会挡在书桌前截走点击)
- 床:30.7 万面全几何 + Draco + WebP 95 = **2.07 MB**(几何 0.81 / 贴图 1.25);
  旧版是 2.5 万面 + 贴图只剩 0.15 MB 的 0.8 MB,褥子的皱褶与条纹全没了 —— 这次换回来了
- 拾取:未打补丁前 `intersectObjects` 命中床要 **20.6 ms**;换包围盒代理后 **0.152 ms**
- `stats`:`models: [carpet, bed, fridge, turntable, desk, chair]`、`meshes 15`、`pickable 9`、
  `spanMeters: [4.68, 1.34, 3.4]`(与加椅子前一致,构图没动)
- 交互抽查:床 → `about`(点击后 `dataset.focused=about`、面板打开 1 个 pane)、
  桌面 → `work`、冰箱 → `door`、椅子与墙面 → 不拾取;无 JS 报错、无失败请求

再一轮(冰箱门 / 换唱机 / 压缩工具修复)之后的结果:

- 冰箱:`meshes 11`、`pickable 9`,点冰箱 → `dataset.door` 在 `open` / `closed` 之间来回;
  默认 `closed`(刷回初始态也是关着的),开门动画走 `stepDoor` 的缓出,阴影跟着重画
- 唱机:换成本地重新压的 Yamaha TT-300(2.5 万面 / 1024² 贴图 / WebP 90,1.33 MB),
  之前那版是倒扣的,现在正立、细节清楚
- 静态资源:冰箱 548 KB、唱机 1.33 MB;`assets/models/` 下不再有电动车

上上轮(墙角舞台 + 四态光照 + 台灯 + 新机位)的结果:

- `stats` 报 `models: [carpet, bed, fridge, turntable, desk]`、`lights: 5`、`walls: 2`、
  `fov: 35`、`pitchDeg: 16`、`azimuthDeg: 30`、`polarLimits: [48, 88]`、`azimuthLimits: [0, 62]`
- 四态各一张图,`dataset.view` 里的 `exposure` 随态变化(1 / 0.95 / 0.8 / 0.88)——
  插值确实在跑,不是硬切
- 开灯/切昼夜后 `localStorage` 与重载后的状态一致,两枚开关的 `aria-pressed` 同步
- 方位角 0 / 44 / 62 × 俯角 48 / 88 四种极端角度都不切家具、画面顶永远是墙
- 点书桌 → `focused=work`、面板打开;点床 → `focused=about`
- 无 JS 报错;WebGL 拿不到时整层跳过并派发 `noke:room-ready`,页面不白屏
  (这条之前用 Firefox 无头验过,它 `webgl`/`webgl2` 都是 no)

首屏 gzip 约 313 KB(Three.js 那五个文件占 225 KB);
模型:床 808 KB / 唱机 702 KB / 冰箱 407 KB / 地毯 78 KB / 书桌 16 KB(gzip 都压不动,里面已经是 WebP)。

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
- **画布收不到拖拽 = 层叠顺序,不是 OrbitControls**:`.room3d` 的 `z-index` 一旦是负数,
  CSS 绘制顺序里它排在 in-flow 的 `body` 盒子之前,命中测试按反序走 —— `body` 成了挡在画布
  上面的那一层,`pointerdown` 一个都到不了 `OrbitControls`(换控制实现也治不好)。
  同理,页面上任何一个 `z-index:2` 的透明盒子摊开铺满视口,房间中间也就拖不动了
  (顶栏因此要 `align-self: start`,别让 grid 的 stretch 把它拉成满屏)。
  核对方法:`document.elementFromPoint(房间中央)` 应当返回 `CANVAS`。
- 🔴 **贴着地面的东西必须和地板同组**:视差的俯仰是 `rig.rotation.x` 绕原点转整组,
  幅度约 ±1°。只离地 2mm 的地毯要是在场景根上、地板在组里(或反过来),转过一侧
  就会被地板整条盖掉 —— 表现是「转动视角时地毯缺一块」。现在地板 `rig.add(floor)`、
  模型也都在 rig 里,没有相对位移;地毯自己再抬到 4mm 当绒高,双保险。
- **取景靠 `fitCamera`,尺寸变化不用手调**:相机距离、雾的近远端、阴影相机范围都是按
  场景包围盒算的。删掉电动车、把地毯从 3.48m 收到 2.53m 之后,构图自己跟着收紧了。
- 🔴 **取景必须按方位角投影包围盒**。`fitCamera` 早先只拿 `size.x` 当画面宽度,等于假设
  镜头正对场景;初始方位角一给到 30°,场景在画面上的投影宽度就涨到接近对角线,
  近的那件家具(床)直接被切在画框外。现在把包围盒投到相机自己的 right/up/前向三个轴上算,
  并且**固定用初始方位角那 30°** ——包围盒 4.76 宽 × 3.4 深时投影宽度恰好在 30°~40° 最大,
  拿这个「最坏角度」定距离,整段方位角范围内都不会被切,resize 也不会改构图。
- 🔴 **光照渐变没走完时,按需渲染的循环不许停摆**。`loop.js` 靠「连续 6 帧画面签名不变」
  判定可以停 rAF;而光照插值不改镜头也不改 `rig.rotation`,签名自然不变 ——
  中间几版就是插到一半画面定住。现在给循环加了个 `step(dt)` 钩子,它返回 true 时 `quiet` 归零,
  同时把 `toneMappingExposure` 加进签名。
- **墙角是两块「景片」,不是一间封闭的屋子**:高度要够到「俯角 16° 时上边缘出画」
  (现在 5.6m,给拉远留了余量),否则画面顶上会露出背景;宽 2.6×跨度。它们和地板一样
  必须挂在视差组里,否则俯仰一转,墙脚与地板之间会裂出缝。
- 🔴 **会动的部件要单独成一个节点,原点落在铰链上**。冰箱门就是这么导的(见
  `target/tmp/export_fridge_door.py`):把门从箱体里留出来、其余 join 成 `fridge_body`,
  门的几何烘成「关着」的姿态、节点原点搬到铰链 —— 网页那边只要转它自己的 `rotation.y`。
  铰链与角度**从原件的动画里反解**(取开门帧与关门帧的相对变换 R,解 `(I - R)p = t` 得铰链点),
  别手算:写成 `R - I` 会把铰链解成它的相反数,差一个负号,门就绕着另一条边转。
- 🔴 **`tools/compress_glb.py` 修过两处,都是「模型出来不对」的根因**:
  ①解父链要用 `CLEAR_KEEP_TRANSFORM` 而不是 `CLEAR` —— glTF 导入时那层根节点的
  Y-up→Z-up 旋转也在父变换里,`CLEAR` 会连它一起丢掉,几何躺倒,后面的 `up_fix` 再盲目补
  +90°,两者一正一负就翻成 180°(唱机当初就是这么被压成倒扣的);
  ②保留变换会把根节点的缩放(常常是 ×100)带下来,而 `unit_scale` 是**赋值**不是**相乘**,
  不先烘焙一次的话 42.7cm 会再被缩 100 倍成 4mm。
- **算包围盒别读缓存**:`bound_box` 与 `matrix_world` 都是缓存,改完数据/位置不调
  `bpy.context.view_layer.update()` 读到的还是旧值 —— 冰箱门那次「水平居中」就是因此
  把已经摆好的门又挪了 33cm,门跑到箱体里去了。按顶点现算最稳。
- **台灯的强度不能照抄 pinchen 的数**:那边场景一单位≈这边 0.1 米,它的 `lamp: 24` 换到
  米制大概是 0.2~1.6 这个量级(聚光衰减是 `decay: 2`,照度按 1/d² 掉)。直接抄 24 的话
  桌面会被烧成一片白。
- 🔴 **面数一上来,拾取就成了瓶颈**:`Mesh.raycast` 是「先球/盒快筛,再逐三角形求交」——
  射线一旦命中就要走遍全部三角形。床换成 Draco 全几何(30.7 万面)之后,
  `intersectObjects` 实测 **20.6 ms / 次**,而这个拾取是**跟着帧**跑的一帧一次(见 `loop.js`:
  高刷屏上 pointermove 能到 1kHz,所以刻意按帧摊),鼠标停在床上就一直掉帧。
  现在 `models.js` 里给 ≥1 万面的网格换成**包围盒代理**(`useBoxPick`):射线与自己那块
  几何的局部包围盒求交,命中的 `object` 仍然报真网格,所以 hover 高亮 / 指针形状 / `spot`
  全都不变 —— 同一发射线从 20.6 ms 掉到 **0.152 ms**。代价是盒子角落那点空档也算命中,
  对「一整张床」这种目标无所谓;像冰箱门(5082 面)这种要精确到拉手的,阈值以下不碰。
