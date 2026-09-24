mod content;
mod hooks;
mod room;
mod ui;

use content::SITE;
use leptos::mount::mount_to_body;
use leptos::prelude::*;
use room::Room3D;
use ui::entries::EntryBar;
use ui::lights::{self, Lights};
use ui::panel::{Panel, Spot};
use ui::theme::{self, Theme};

#[component]
pub fn App() -> impl IntoView {
    let (theme, set_theme) = theme::use_theme();
    let (lights, set_lights) = lights::use_lights();
    let (spot, set_spot) = signal::<Option<Spot>>(None);
    hooks::on_escape(set_spot);

    // 页面上不留文字:名字与标语只给读屏和搜索引擎,看得见的部分只有房间和几个图标。
    view! {
        <h1 class="sr-only">{ format!("{} —— {} · {}", SITE.name, SITE.role, SITE.tagline) }</h1>

        <Room3D set_spot=set_spot />

        // 暗角 + 颗粒 + 扫描线:一层不动 three.js 的氛围
        <div class="hud-atmosphere" aria-hidden="true">
            <span class="hud-vignette"></span>
            <span class="hud-grain"></span>
            <span class="hud-scan"></span>
        </div>

        <div class="topbar">
            // 房间灯:左端是灭、右端是亮,滑块停在哪端就是哪个状态 ——
            // 两枚开关的形状照着 pinchen 那间房顶部的做法(图标 + 轨道)。
            <button
                type="button"
                class="switch"
                aria-label="房间灯"
                title="房间灯:开 / 关"
                aria-pressed=move || if lights.get() == Lights::On { "true" } else { "false" }
                on:click=move |_| set_lights.update(|current| *current = lights::next_lights(*current))
            >
                <span class="switch-face" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15">
                        <path
                            d="M12 3.4a5.8 5.8 0 0 0-3.5 10.4c.5.4.8 1 .8 1.6v.4h5.4v-.4c0-.6.3-1.2.8-1.6A5.8 5.8 0 0 0 12 3.4z"
                            fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"
                        ></path>
                        <path d="M9.9 18.3h4.2M10.7 20.6h2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                    </svg>
                </span>
                <span class="switch-rail" aria-hidden="true"><span class="switch-knob"></span></span>
                <span class="switch-face" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15">
                        <path
                            d="M12 3.4a5.8 5.8 0 0 0-3.5 10.4c.5.4.8 1 .8 1.6v.4h5.4v-.4c0-.6.3-1.2.8-1.6A5.8 5.8 0 0 0 12 3.4z"
                            fill="currentColor"
                        ></path>
                        <path d="M9.9 18.3h4.2M10.7 20.6h2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                        <path
                            d="M12 .8v1.7M4.8 5.1l1.2 1.2M19.2 5.1l-1.2 1.2M1.5 12h1.7M20.8 12h1.7"
                            stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                        ></path>
                    </svg>
                </span>
            </button>

            // 昼夜:站点主题就是房间的白天/黑夜,滑块在右端时是夜
            <button
                type="button"
                class="switch"
                aria-label="昼夜"
                title="昼夜:白天 / 黑夜"
                aria-pressed=move || if theme.get() == Theme::Dark { "true" } else { "false" }
                on:click=move |_| set_theme.update(|current| *current = theme::next_theme(*current))
            >
                <span class="switch-face" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15">
                        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
                        <path
                            d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"
                            stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
                        ></path>
                    </svg>
                </span>
                <span class="switch-rail" aria-hidden="true"><span class="switch-knob"></span></span>
                <span class="switch-face" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15">
                        <path
                            d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6z"
                            fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"
                        ></path>
                    </svg>
                </span>
            </button>
        </div>

        // 键盘/读屏的入口:看得见的那部分只有图标,这一条整条只在聚焦时显形。
        <EntryBar set_spot=set_spot />

        <Panel spot=spot set_spot=set_spot />
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
