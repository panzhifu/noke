use leptos::prelude::*;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Theme {
    Light,
    Dark,
}

impl Theme {
    pub fn as_attr(self) -> &'static str {
        match self {
            Theme::Light => "light",
            Theme::Dark => "dark",
        }
    }

    fn toggled(self) -> Self {
        match self {
            Theme::Light => Theme::Dark,
            Theme::Dark => Theme::Light,
        }
    }
}

const STORAGE_KEY: &str = "noke-theme";

fn stored() -> Option<Theme> {
    let storage = web_sys::window()?.local_storage().ok()??;
    match storage.get_item(STORAGE_KEY).ok()??.as_str() {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

fn system_prefers_light() -> bool {
    let window = web_sys::window().expect("no window");
    window
        .match_media("(prefers-color-scheme: light)")
        .ok()
        .flatten()
        .is_some_and(|m| m.matches())
}

/// 供 <html data-theme> 的启动脚本使用:index.html 里那段内联 JS 也读同一个 key。
pub fn initial_theme() -> Theme {
    stored().unwrap_or_else(|| {
        if system_prefers_light() {
            Theme::Light
        } else {
            Theme::Dark
        }
    })
}

fn write(theme: Theme) {
    let document = web_sys::window()
        .expect("no window")
        .document()
        .expect("no document");
    let root = document.document_element().expect("no <html>");
    root.set_attribute("data-theme", theme.as_attr()).ok();
    if let Ok(Some(storage)) = web_sys::window().expect("no window").local_storage() {
        storage.set_item(STORAGE_KEY, theme.as_attr()).ok();
    }
}

/// 主题:首次求值时就把 data-theme 写进 <html>,之后每次切换自动持久化。
/// 读句柄一起给出来 —— 顶栏那枚昼夜开关要拿它决定滑块位置与 aria-pressed。
pub fn use_theme() -> (ReadSignal<Theme>, WriteSignal<Theme>) {
    let (theme, set_theme) = signal(initial_theme());
    Effect::new(move |_| write(theme.get()));
    (theme, set_theme)
}

pub fn next_theme(current: Theme) -> Theme {
    current.toggled()
}
