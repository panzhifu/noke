use leptos::prelude::*;

use crate::content::{PROJECTS, SITE};

#[component]
pub fn Hero() -> impl IntoView {
    view! {
        <section id="top" class="hero">
            <div class="wrap">
                <p class="eyebrow">
                    <span class="pulse" aria-hidden="true"></span>
                    { format!("个人站点 · 自 {} 起", SITE.since) }
                </p>
                <h1 class="hero-title">{ SITE.name }</h1>
                <p class="hero-tagline">{ SITE.tagline }</p>
                <p class="hero-subline">{ SITE.subline }</p>
                <div class="hero-actions">
                    <a class="btn btn-primary" href="#projects">{ "看看作品" }</a>
                    <a class="btn btn-ghost" href="#contact">{ "说点什么" }</a>
                    <a class="btn btn-ghost" href=SITE.github target="_blank" rel="noreferrer">{ "GitHub" }</a>
                </div>
                <dl class="hero-meta">
                    <div class="hero-meta-item">
                        <dt>{ "方向" }</dt>
                        <dd>{ SITE.role }</dd>
                    </div>
                    <div class="hero-meta-item">
                        <dt>{ "项目" }</dt>
                        <dd>{ format!("{} 个在维护", PROJECTS.len()) }</dd>
                    </div>
                    <div class="hero-meta-item">
                        <dt>{ "托管" }</dt>
                        <dd>{ "GitHub Pages" }</dd>
                    </div>
                </dl>
            </div>
        </section>
    }
}
