//! 全站唯一的文案入口 —— 想换成自己的内容,只改这个文件即可。
//! 标了 `TODO` 的地方是我替你留的占位,其余字段可以随意增删。

pub struct Site {
    pub name: &'static str,
    pub role: &'static str,
    pub tagline: &'static str,
    pub subline: &'static str,
    pub email: &'static str,
    pub github: &'static str,
    pub blog: &'static str,
    /// 页面上不留文字后没有地方放它,先当资料留着。
    #[allow(dead_code)]
    pub since: &'static str,
}

pub const SITE: Site = Site {
    name: "noke",
    role: "Rust / 独立开发",
    tagline: "把想法写成能跑的东西,然后让它一直跑下去。",
    subline: "这里是我的数字角落:做什么、想什么、留下什么。",
    // 邮箱直接来自本机 git 身份;不想公开的话换成一个专用地址即可。
    email: "noke601508@outlook.com",
    github: "https://github.com/panzhifu",
    blog: "https://panzhifu.github.io/",
    since: "2025",
};

pub struct Social {
    pub label: &'static str,
    pub url: &'static str,
    pub hint: &'static str,
}

pub const SOCIALS: &[Social] = &[
    Social {
        label: "GitHub",
        url: SITE.github,
        hint: "代码",
    },
    Social {
        label: "博客",
        url: SITE.blog,
        hint: "长文",
    },
    // TODO: 加自己的社交入口,例如:
    // Social { label: "X", url: "https://x.com/yourhandle", hint: "碎碎念" },
];

/// 屏幕上那个界面示意对应哪个软件、链向哪。
///
/// CSS 3D 那版房间的回退路径在用(`room.rs` 的显示器屏幕示意)。
/// 现在的房间是 Three.js 的,等显示器模型搬进 `models.rs` 时会重新用上。
#[allow(dead_code)]
pub struct Screen {
    pub app: &'static str,
}

#[allow(dead_code)]
pub const SCREEN: Screen = Screen { app: "Trove" };

pub const ABOUT: &[&str] = &[
    "我是 noke,用 Rust 写软件。大多数时候在写桌面应用 —— 那些打开就能用、不联网也能用、\
     数据留在自己机器上的工具。",
    "喜欢在细节上花时间:一个视图为什么这么排,一次滚动为什么这么顺。也在玩 Leptos + \
     WebAssembly,这个站点本身就是那条路线的产物 —— 一间用 Three.js 渲染的房间,\
     家具模型慢慢在 Blender 里做出来。",
    "房间里那把电竞椅来自 Sketchfab 作者 Man1ac,以 CC-BY-4.0 授权使用。",
    "桌边那台侧透机箱同样来自 Sketchfab —— Daniel Cardona 的 Dream Computer Setup,\
     以 CC-BY-4.0 授权使用。",
];

pub struct Highlight {
    pub label: &'static str,
    pub detail: &'static str,
}

/// 「现在」:三段短句,说明此刻在做什么。
pub const NOW: &[Highlight] = &[
    Highlight {
        label: "在造",
        detail: "Trove —— 本地素材管理器,继续把预览和搜索做深。",
    },
    Highlight {
        label: "在读",
        detail: "gpui 与 WebGPU 渲染管线,想知道桌面端还能走多远。",
    },
    // TODO: 换成你真正的「在读 / 在想」
    Highlight {
        label: "在想",
        detail: "怎样让个人网站保持轻:一间房间,没有追踪,没有后端。",
    },
];

pub const STACK: &[&str] = &[
    "Rust",
    "Leptos",
    "WebAssembly",
    "gpui",
    "Trunk",
    "TypeScript",
];

pub struct Project {
    pub name: &'static str,
    pub summary: &'static str,
    /// 第二段,可留空。
    pub note: &'static str,
    /// 要点列表,可留空。
    pub points: &'static [&'static str],
    pub tags: &'static [&'static str],
    /// 取自仓库 createdAt 的年月。
    pub period: &'static str,
    pub url: &'static str,
    pub featured: bool,
}

pub const PROJECTS: &[Project] = &[
    Project {
        name: "Trove",
        summary: "面向创作者的本地素材管理器 —— 打开就能用,数据留在自己机器上。",
        note: "现在投入最多的一块:预览和搜索还在继续做深。",
        points: &[
            "全文搜索与视觉搜索",
            "40+ 格式预览,含 3D 模型",
            "标签与智能集合",
            "数据永不上传",
        ],
        tags: &["Rust", "桌面", "gpui"],
        period: "2026-09",
        url: "https://github.com/panzhifu/trove",
        featured: true,
    },
    Project {
        name: "kaleido",
        summary: "图像编辑器。",
        note: "仓库自述至今只有一句 “A image editor”,能力以代码为准。",
        points: &[],
        tags: &["Rust", "桌面"],
        period: "2026-08",
        url: "https://github.com/panzhifu/kaleido",
        featured: false,
    },
    Project {
        name: "tinyticker",
        summary: "极简悬浮倒计时 / 秒表。",
        note: "",
        points: &[],
        tags: &["Rust", "桌面"],
        period: "2026-09",
        url: "https://github.com/panzhifu/tinyticker",
        featured: false,
    },
    Project {
        name: "textrest",
        summary: "读小说的地方。",
        note: "仓库自述 “a noval read”。这几个里最早的一个,三月就开了。",
        points: &[],
        tags: &["Rust"],
        period: "2026-03",
        url: "https://github.com/panzhifu/textrest",
        featured: false,
    },
    Project {
        name: "trove-website",
        summary: "Trove 的官网。",
        note: "同一个技术栈的另一次练习:Leptos CSR 编译到 Wasm 再托管到 GitHub Pages。",
        points: &[],
        tags: &["Rust", "Leptos", "Web"],
        period: "2026-09",
        url: "https://github.com/panzhifu/trove-website",
        featured: false,
    },
    Project {
        name: "echo",
        summary: "笔记工具。",
        note: "仓库自述 “rust note soft”。",
        points: &[],
        tags: &["Rust"],
        period: "2026-08",
        url: "https://github.com/panzhifu/echo",
        featured: false,
    },
    // TODO: 新项目照抄上面一块即可。
];

pub struct Note {
    pub title: &'static str,
    pub date: &'static str,
    pub summary: &'static str,
    pub url: &'static str,
}

pub const NOTES: &[Note] = &[Note {
    title: "Hello World",
    date: "2025-05-14",
    summary: "博客的第一篇,也是最难的那一篇。",
    url: "https://panzhifu.github.io/2025/05/14/hello-world/",
}];

/// 墙上的海报位:这几张是我排的字面占版式。
/// 换成真海报:把文件放进 `assets/models/`,像其他家具一样给清单加一条。
pub const POSTER_MARKS: &[&str] = &["n", "k"];

pub const POSTER_CAPTION: &str = "海报还在做,墙上先占两格版式。";

/// 房间里的海报、屏幕缩略图、面板里的迷你海报共用一套色相:
/// 黄金角散列让相邻两块不撞色,起点 26° 对齐本站强调色。
pub fn hue_at(index: usize) -> u16 {
    ((26.0 + index as f32 * 137.508) % 360.0).round() as u16
}
