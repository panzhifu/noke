mod content;
mod hooks;
mod models;
mod panel;
mod room3d;
mod theme;

use content::{COLOPHON, POSTER_MARKS, SITE};
use leptos::mount::mount_to_body;
use leptos::prelude::*;
use panel::{Panel, Spot};
use room3d::Room3D;
use theme::next_theme;

/// 还没搬进 3D 的那几格入口。
/// 3D 场景现在只有地毯,点不到东西,所以入口先摆在页面上。
/// 等家具陆续补进 `models.rs` 并带上 spot 字段,这个组件就可以整个删掉。
const MAIN_ENTRIES: &[(&str, Spot)] = &[
    ("作品", Spot::Work),
    ("关于", Spot::About),
    ("手记", Spot::Notes),
    ("联系", Spot::Contact),
];

#[component]
fn EntryBar(set_spot: WriteSignal<Option<Spot>>) -> impl IntoView {
    let main = MAIN_ENTRIES
        .iter()
        .map(|(label, spot)| {
            let spot = *spot;
            view! {
                <button
                    type="button"
                    class="entry"
                    on:click=move |_| set_spot.set(Some(spot))
                >
                    { *label }
                </button>
            }
        })
        .collect::<Vec<_>>();

    let posters = POSTER_MARKS
        .iter()
        .enumerate()
        .map(|(index, mark)| {
            let spot = Spot::Poster(index);
            view! {
                <button
                    type="button"
                    class="entry"
                    on:click=move |_| set_spot.set(Some(spot))
                >
                    { format!("海报 {mark}") }
                </button>
            }
        })
        .collect::<Vec<_>>();

    view! {
        <nav class="entry-bar" aria-label="站点入口">
            <span class="entry-note">{ "3D 房间还在搬家具,先用这几个入口" }</span>
            <span class="entry-row">
                { main }
                { posters }
            </span>
        </nav>
    }
}

#[component]
pub fn App() -> impl IntoView {
    let set_theme = theme::use_theme();
    let (spot, set_spot) = signal::<Option<Spot>>(None);
    hooks::on_escape(set_spot);

    view! {
        // 名字与标语交给场景;这一行只给读屏和搜索引擎。
        <h1 class="sr-only">{ format!("{} —— {} · {}", SITE.name, SITE.role, SITE.tagline) }</h1>

        <Room3D set_spot=set_spot />

        <div class="topbar">
            <span class="topbar-hint">{ "一间刚铺好地毯的房间" }</span>
            <button
                type="button"
                class="icon-btn"
                aria-label="切换深浅色主题"
                title="切换深浅色主题"
                on:click=move |_| set_theme.update(|current| *current = next_theme(*current))
            >
                <svg class="icon icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
                    <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"
                          stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
                <svg class="icon icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6z"
                          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                </svg>
            </button>
        </div>

        <EntryBar set_spot=set_spot />

        <Panel spot=spot set_spot=set_spot />

        <p class="colophon">{ format!("{COLOPHON} · 自 {} 起", SITE.since) }</p>
    }
}

/// Rust 起来之后就把 index.html 里的加载块撤掉。
fn remove_boot_screen() {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    if let Some(boot) = document.get_element_by_id("boot") {
        boot.remove();
    }
}

#[wasm_bindgen::prelude::wasm_bindgen(start)]
fn main() {
    console_error_panic_hook::set_once();
    mount_to_body(App);
    remove_boot_screen();
}
