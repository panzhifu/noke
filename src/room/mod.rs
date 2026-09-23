//! 3D 房间：Three.js 渲染的那一层。
//!
//! 渲染本身全在 `assets/room3d.js` 里。这里只做两件事 ——
//! 把模型清单(见 manifest.rs)挂到 DOM 上给它读，以及把它的拾取结果接回 Leptos 的信号。
//!
//! CSS 3D 那版（`room.rs` + `room.css`）先留着没删：回退时把 `lib.rs` 里的
//! 这一行换回 `<Room set_spot .. picked ..>` 就行。

use leptos::prelude::*;

use crate::hooks;
use crate::ui::panel::Spot;

mod manifest;

#[component]
pub fn Room3D(set_spot: WriteSignal<Option<Spot>>) -> impl IntoView {
    // 3D 层点到东西 → 抛回 "work" / "poster:2" 这种字符串 → 开对应面板
    hooks::on_pick(set_spot);

    // DOM 挂上去之后招呼 3D 层开工。
    // 它自己也会在脚本加载那一刻先试一次，所以两边谁先谁后都不用管。
    Effect::new(move |_| hooks::announce_room_mounted());

    let manifest = manifest::manifest_json();

    view! {
        // aria-hidden：3D 场景对读屏没意义，入口交给页面上的 DOM 按钮
        <div id="room3d" class="room3d" data-models=manifest aria-hidden="true"></div>
    }
}
