use leptos::prelude::*;

use super::Section;
use crate::content::{POSTER_MARKS, SCREEN};

/// 海报和屏幕缩略图的色相沿用作品卡那套黄金角散列,几个区块看着是一家人。
fn hue_at(index: usize) -> u16 {
    ((26.0 + index as f32 * 137.508) % 360.0).round() as u16
}

#[component]
pub fn Room() -> impl IntoView {
    let posters = POSTER_MARKS
        .iter()
        .enumerate()
        .map(|(index, mark)| {
            view! {
                <span class="poster" style=format!("--hue: {}", hue_at(index))>
                    <span class="poster-mark">{ *mark }</span>
                    <span class="poster-baseline"></span>
                </span>
            }
        })
        .collect::<Vec<_>>();

    let thumbs = (0..6u16)
        .map(|index| {
            view! { <span class="thumb" style=format!("--hue: {}", hue_at(index as usize + 1))></span> }
        })
        .collect::<Vec<_>>();

    view! {
        <Section id="room" index="02" title="房间" kicker="鼠标动一动,它会跟着转">
            <div class="room">
                <div class="room-stage" id="room-stage">
                    <div class="wall wall-back">
                        <span class="wall-light" aria-hidden="true"></span>
                        <span class="posters">
                            { posters }
                            <span class="poster blank" title="这张留给你设计的海报"></span>
                        </span>
                    </div>

                    <div class="wall wall-left" aria-hidden="true">
                        <span class="wall-window"></span>
                    </div>

                    <div class="floor" aria-hidden="true">
                        <span class="rug"></span>
                    </div>

                    <div class="prop flat headboard" aria-hidden="true"></div>
                    <div class="prop bed" aria-hidden="true">
                        <i class="face top"></i>
                        <i class="face front"></i>
                        <i class="face side"></i>
                        <i class="pillow"></i>
                    </div>

                    <div class="prop desk" aria-hidden="true">
                        <i class="face top"></i>
                        <i class="face front"></i>
                        <i class="face side"></i>
                    </div>
                    <div class="prop drawer" aria-hidden="true">
                        <i class="face top"></i>
                        <i class="face front"></i>
                        <i class="face side"></i>
                    </div>

                    <a class="prop flat monitor" href=SCREEN.url target="_blank" rel="noreferrer">
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
                        <span class="sr-only">{ format!("屏幕里是 {} 的界面示意,点开仓库", SCREEN.app) }</span>
                    </a>

                    <div class="prop mug" aria-hidden="true">
                        <i class="face top"></i>
                        <i class="face front"></i>
                        <i class="face side"></i>
                    </div>
                    <div class="prop bookend" aria-hidden="true">
                        <i class="face top"></i>
                        <i class="face front"></i>
                    </div>
                </div>
            </div>
            <p class="room-caption">{ SCREEN.caption }</p>
        </Section>
    }
}
