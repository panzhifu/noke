use leptos::prelude::*;

use crate::content::{POSTER_MARKS, SCREEN, SITE, hue_at};
use crate::panel::Spot;

/// 房间就是这个站点的全部界面:家具可以点,点开的东西浮在下方。
/// 几何参数(位置、尺寸)都在 styles/room.css 里,用 --x/--z/--w/--h/--d 描述。
#[component]
pub fn Room(
    set_spot: WriteSignal<Option<Spot>>,
    picked: ReadSignal<Option<Spot>>,
) -> impl IntoView {
    let posters = POSTER_MARKS
        .iter()
        .enumerate()
        .map(|(index, mark)| {
            let spot = Spot::Poster(index);
            view! {
                <button
                    type="button"
                    class="poster hotspot"
                    class:is-picked=move || picked.get() == Some(spot)
                    style=format!("--hue: {}", hue_at(index))
                    aria-label="墙上的海报"
                    on:click=move |_| set_spot.set(Some(spot))
                >
                    <span class="poster-mark">{ *mark }</span>
                    <span class="poster-baseline"></span>
                    <span class="tag">{ "海报" }</span>
                </button>
            }
        })
        .collect::<Vec<_>>();

    let thumbs = (0..6u16)
        .map(|index| {
            view! { <span class="thumb" style=format!("--hue: {}", hue_at(index as usize + 1))></span> }
        })
        .collect::<Vec<_>>();

    let blank_spot = Spot::Poster(POSTER_MARKS.len());
    let work_screen = format!("屏幕:作品 —— 屏里跑的是 {} 的界面示意", SCREEN.app);

    view! {
        <div class="room">
            <div class="room-stage" id="room-stage">
                <div class="wall wall-back">
                    <span class="wall-light" aria-hidden="true"></span>
                    <span class="posters">
                        { posters }
                        <button
                            type="button"
                            class="poster blank hotspot"
                            class:is-picked=move || picked.get() == Some(blank_spot)
                            aria-label="空海报位"
                            on:click=move |_| set_spot.set(Some(blank_spot))
                        >
                            <span class="tag">{ "海报位" }</span>
                        </button>
                    </span>
                    <span class="sign" aria-hidden="true">{ SITE.tagline }</span>
                </div>

                <div class="wall wall-left" aria-hidden="true">
                    <span class="wall-window"></span>
                </div>

                <div class="floor" aria-hidden="true">
                    <span class="rug"></span>
                </div>

                <div class="prop flat headboard" aria-hidden="true"></div>

                <button
                    type="button"
                    class="prop bed hotspot"
                    class:is-picked=move || picked.get() == Some(Spot::About)
                    aria-label="床:关于"
                    on:click=move |_| set_spot.set(Some(Spot::About))
                >
                    <i class="face top"></i>
                    <i class="face front"></i>
                    <i class="face side"></i>
                    <i class="pillow"></i>
                    <span class="tag">{ "关于" }</span>
                </button>

                <div class="prop desk" aria-hidden="true">
                    <i class="face top"></i>
                    <i class="face front"></i>
                    <i class="face side"></i>
                    <span class="plate">{ SITE.name }</span>
                </div>

                <button
                    type="button"
                    class="prop drawer hotspot"
                    class:is-picked=move || picked.get() == Some(Spot::Notes)
                    aria-label="抽屉柜:手记"
                    on:click=move |_| set_spot.set(Some(Spot::Notes))
                >
                    <i class="face top"></i>
                    <i class="face front"></i>
                    <i class="face side"></i>
                    <span class="tag">{ "手记" }</span>
                </button>

                <button
                    type="button"
                    class="prop flat monitor hotspot"
                    class:is-picked=move || picked.get() == Some(Spot::Work)
                    aria-label=work_screen
                    on:click=move |_| set_spot.set(Some(Spot::Work))
                >
                    <span class="bezel">
                        <span class="screen" aria-hidden="true">
                            <span class="screen-bar"><i></i><i></i></span>
                            <span class="screen-body">
                                <span class="screen-side">
                                    <i></i>
                                    <i></i>
                                    <i></i>
                                    <i></i>
                                </span>
                                <span class="screen-grid">{ thumbs }</span>
                            </span>
                        </span>
                    </span>
                    <span class="stand"></span>
                    <span class="tag">{ "作品" }</span>
                </button>

                <button
                    type="button"
                    class="prop mug hotspot"
                    class:is-picked=move || picked.get() == Some(Spot::Contact)
                    aria-label="杯子:联系"
                    on:click=move |_| set_spot.set(Some(Spot::Contact))
                >
                    <i class="face top"></i>
                    <i class="face front"></i>
                    <i class="face side"></i>
                    <span class="tag">{ "联系" }</span>
                </button>

                <div class="prop bookend" aria-hidden="true">
                    <i class="face top"></i>
                    <i class="face front"></i>
                </div>
            </div>
        </div>
    }
}
