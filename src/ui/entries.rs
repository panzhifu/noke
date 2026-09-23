use leptos::prelude::*;

use crate::content::{ENTRY_NOTE, POSTER_MARKS};
use crate::ui::panel::Spot;

/// 还没搬进 3D 的那几格入口。
///
/// 家具会陆续带上 `spot` 字段变得能点(现在只有桌子),但这条要留着 ——
/// 3D 场景是 `aria-hidden` 的,键盘和读屏只能靠这里进。
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

    view! {
        <nav class="entry-bar" aria-label="站点入口">
            <span class="entry-note">{ ENTRY_NOTE }</span>
            <span class="entry-row">
                { main }
                { posters }
            </span>
        </nav>
    }
}
