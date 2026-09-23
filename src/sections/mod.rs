mod about;
mod contact;
mod header;
mod hero;
mod notes;
mod projects;
mod room;

pub use about::About;
pub use contact::{Contact, Footer};
pub use header::Header;
pub use hero::Hero;
pub use notes::Notes;
pub use projects::Projects;
pub use room::Room;

use leptos::prelude::*;

/// 统一的区块外壳:序号 + 标题 + 内容,滚动进入视口时淡入。
#[component]
pub fn Section(
    id: &'static str,
    index: &'static str,
    title: &'static str,
    #[prop(optional)] kicker: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <section id=id class="section reveal">
            <div class="section-head">
                <span class="section-index" aria-hidden="true">{ index }</span>
                <h2 class="section-title">{ title }</h2>
                <span class="section-rule" aria-hidden="true"></span>
                <span class="section-kicker">{ kicker }</span>
            </div>
            <div class="section-body">{ children() }</div>
        </section>
    }
}
