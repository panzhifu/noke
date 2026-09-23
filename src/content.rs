//! 全站唯一的文案入口 —— 想换成自己的内容,只改这个文件即可。
//! 标了 `TODO` 的地方是我替你留的占位,其余字段可以随意增删。

pub struct NavItem {
    pub id: &'static str,
    pub label: &'static str,
    pub index: &'static str,
}

pub const NAV: &[NavItem] = &[
    NavItem {
        id: "about",
        label: "关于",
        index: "01",
    },
    NavItem {
        id: "room",
        label: "房间",
        index: "02",
    },
    NavItem {
        id: "projects",
        label: "作品",
        index: "03",
    },
    NavItem {
        id: "notes",
        label: "手记",
        index: "04",
    },
    NavItem {
        id: "contact",
        label: "联系",
        index: "05",
    },
];

pub struct Site {
    pub name: &'static str,
    pub role: &'static str,
    pub tagline: &'static str,
    pub subline: &'static str,
    pub email: &'static str,
    pub github: &'static str,
    pub blog: &'static str,
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

pub const ABOUT: &[&str] = &[
    "我是 noke,用 Rust 写软件。大多数时候在写桌面应用 —— 那些打开就能用、不联网也能用、\
     数据留在自己机器上的工具。",
    "喜欢在细节上花时间:一个视图为什么这么排,一次滚动为什么这么顺。也在玩 Leptos + \
     WebAssembly,这个网站本身就是那条路线的产物。",
];

pub struct Highlight {
    pub label: &'static str,
    pub detail: &'static str,
}

/// 「现在」区块:三段短句,说明此刻在做什么。
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
        detail: "怎样让个人网站保持轻:一个页面,没有追踪,没有后端。",
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

/// 房间场景里墙上那几张海报的字面标记 —— 是我排的三个占位版式。
/// 换成真海报:把文件放进 `assets/`,再把 room.rs 里的 `.poster` 换成 `<img src="assets/xxx.png">`。
pub const POSTER_MARKS: &[&str] = &["n", "o", "k"];

pub struct Screen {
    pub app: &'static str,
    pub url: &'static str,
    pub caption: &'static str,
}

/// 书桌上那块屏幕:界面上的软件与它链向哪。
pub const SCREEN: Screen = Screen {
    app: "Trove",
    url: "https://github.com/panzhifu/trove",
    caption: "屏幕上跑的是 Trove 的界面示意:左栏集合,右边素材网格。点它去仓库。",
};

pub struct Project {
    pub name: &'static str,
    pub summary: &'static str,
    /// 第二段。留空则整段不渲染 —— 卡片之间的高度差一部分就是这么来的。
    pub note: &'static str,
    /// 要点列表。留空则整块不渲染。
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
        note: "同一个技术栈的另一次练习:Leptos CSR 编译到 Wasm 再托管到 GitHub Pages —— 和这个站点共用一套做法。",
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
    // TODO: 新项目照抄上面一块即可;标签会自动进筛选条,note / points 留空就不占位置。
];

pub struct Note {
    pub title: &'static str,
    pub date: &'static str,
    pub summary: &'static str,
    pub url: &'static str,
}

pub const NOTES: &[Note] = &[
    Note {
        title: "Hello World",
        date: "2025-05-14",
        summary: "博客的第一篇,也是最难的那一篇。",
        url: "https://panzhifu.github.io/2025/05/14/hello-world/",
    },
    // TODO: 新文章加在这里;留空也没关系,这个区块会自动隐藏提示。
];

pub const FOOTER_NOTE: &str =
    "本站由 Leptos 编译成 WebAssembly,托管在 GitHub Pages。无 Cookie、无追踪、无后端。";
