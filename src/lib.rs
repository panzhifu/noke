mod content;
mod hooks;
mod room;
mod ui;

use content::{COLOPHON, HUD_HINTS, SITE};
use leptos::mount::mount_to_body;
use leptos::prelude::*;
use room::Room3D;
use ui::entries::EntryBar;
use ui::panel::{Panel, Spot};
use ui::theme::{self, next_theme};

#[component]
pub fn App() -> impl IntoView {
    let set_theme = theme::use_theme();
    let (spot, set_spot) = signal::<Option<Spot>>(None);
    hooks::on_escape(set_spot);

    let hints = HUD_HINTS
        .iter()
        .map(|(key, what)| {
            view! {
                <span>
                    <kbd>{ *key }</kbd>
                    { *what }
                </span>
            }
        })
        .collect::<Vec<_>>();

    view! {
        // 名字与标语交给场景与 meta;这一行只给读屏和搜索引擎。
        <h1 class="sr-only">{ format!("{} —— {} · {}", SITE.name, SITE.role, SITE.tagline) }</h1>

        <Room3D set_spot=set_spot />

        // 暗角 + 颗粒 + 扫描线:一层不动 three.js 的氛围
        <div class="hud-atmosphere" aria-hidden="true">
            <span class="hud-vignette"></span>
            <span class="hud-grain"></span>
            <span class="hud-scan"></span>
        </div>

        <div class="topbar">
            <span class="topbar-hint">{ format!("{} · {}", SITE.name, SITE.role) }</span>
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

        <div class="hud-hints" aria-hidden="true">{ hints }</div>

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
