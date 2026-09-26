use leptos::prelude::*;

use crate::content::POSTER_MARKS;
use crate::hooks;
use crate::ui::panel::Spot;

/// 键盘和读屏用的入口条。
///
/// 家具会陆续带上 `spot` 字段变得能点(现在只有桌子),但这一条要留着 ——
/// 3D 场景是 `aria-hidden` 的,而且页面上不再留文字,键盘只有这里能进。
/// 整条默认隐形,聚焦时才显形(见 room3d.css)。
const MAIN_ENTRIES: &[(&str, Spot)] = &[
    ("作品", Spot::Work),
    ("关于", Spot::About),
    ("手记", Spot::Notes),
    ("联系", Spot::Contact),
];

#[component]
pub fn EntryBar(set_spot: WriteSignal<Option<Spot>>) -> impl IntoView {
    let main = MAIN_ENTRIES
        .iter()
        .map(|(label, spot)| {
            let spot = *spot;
            view! {
                <button type="button" class="entry" on:click=move |_| set_spot.set(Some(spot))>
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
                <button type="button" class="entry" on:click=move |_| set_spot.set(Some(spot))>
                    { format!("海报 {mark}") }
                </button>
            }
        })
        .collect::<Vec<_>>();

    // 首屏的 3D 场景对键盘是隐形的(整层 aria-hidden),而首屏要靠「点屏幕」退后看全景,
    // 所以入口条上得自己有一枚。退到定位之后它就没用了,由 CSS 按 data-phase 收掉。
    view! {
        <nav class="entry-bar sr-only" aria-label="站点入口">
            <span class="entry-row">
                <button type="button" class="entry entry-enter" on:click=|_| hooks::announce_enter()>
                    "看全景"
                </button>
                { main }
                { posters }
            </span>
        </nav>
    }
}
