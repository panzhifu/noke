use leptos::prelude::*;

use super::Section;
use crate::content::{ABOUT, NOW, STACK};

#[component]
pub fn About() -> impl IntoView {
    view! {
        <Section id="about" index="01" title="关于" kicker="写工具的人,不是写网页的人">
            <div class="prose">
                { ABOUT.iter().map(|paragraph| view! { <p>{ *paragraph }</p> }).collect::<Vec<_>>() }
            </div>

            <ul class="now-list">
                { NOW
                    .iter()
                    .map(|item| view! {
                        <li class="now-item">
                            <span class="now-label">{ item.label }</span>
                            <span class="now-detail">{ item.detail }</span>
                        </li>
                    })
                    .collect::<Vec<_>>() }
            </ul>

            <p class="stack">
                <span class="stack-label">常用</span>
                { STACK.iter().map(|name| view! { <code class="chip">{ *name }</code> }).collect::<Vec<_>>() }
            </p>
        </Section>
    }
}
