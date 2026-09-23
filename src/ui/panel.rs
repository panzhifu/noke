use leptos::prelude::*;

use crate::content::{
    ABOUT, NOTES, NOW, POSTER_CAPTION, POSTER_MARKS, PROJECTS, SITE, SOCIALS, STACK, hue_at,
};
use crate::hooks::{announce_panel_closed, copy_to_clipboard};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Spot {
    Work,
    About,
    Notes,
    Contact,
    Poster(usize),
}

pub fn spot_label(spot: Spot) -> &'static str {
    match spot {
        Spot::Work => "作品",
        Spot::About => "关于",
        Spot::Notes => "手记",
        Spot::Contact => "联系",
        Spot::Poster(_) => "海报",
    }
}

fn is(spot: Option<Spot>, want: Spot) -> bool {
    spot == Some(want)
}

/// 点房间里的物件时,对应那一格浮出来。五格常驻 DOM,靠显隐切换 ——
/// 切换时不重建内容,也省掉一套动态视图类型。
#[component]
pub fn Panel(spot: ReadSignal<Option<Spot>>, set_spot: WriteSignal<Option<Spot>>) -> impl IntoView {
    let close = move |_| {
        set_spot.set(None);
        announce_panel_closed();
    };
    let (copied, set_copied) = signal(false);
    let email = SITE.email;

    let works = PROJECTS
        .iter()
        .map(|project| {
            let (name, summary, note, period, url, tags) = (
                project.name,
                project.summary,
                project.note,
                project.period,
                project.url,
                project.tags.join(" · "),
            );
            let featured = project.featured;
            let points = if project.points.is_empty() {
                String::new()
            } else {
                project.points.join(" · ")
            };
            view! {
                <li class="row">
                    <a href=url target="_blank" rel="noreferrer">
                        <span class="row-head">
                            <span class="row-title">{ name }</span>
                            { featured.then(|| view! { <span class="row-flag">{ "主线" }</span> }) }
                            <span class="row-period">{ period }</span>
                        </span>
                        <span class="row-summary">{ summary }</span>
                        { (!note.is_empty()).then(|| view! { <span class="row-note">{ note }</span> }) }
                        { (!points.is_empty()).then(|| view! { <span class="row-points">{ points.clone() }</span> }) }
                        <span class="row-tags">{ tags }</span>
                    </a>
                </li>
            }
        })
        .collect::<Vec<_>>();

    let paragraphs = ABOUT
        .iter()
        .map(|text| view! { <p>{ *text }</p> })
        .collect::<Vec<_>>();
    let nows = NOW
        .iter()
        .map(|item| {
            view! {
                <li class="now-item">
                    <span class="now-label">{ item.label }</span>
                    <span class="now-detail">{ item.detail }</span>
                </li>
            }
        })
        .collect::<Vec<_>>();
    let chips = STACK
        .iter()
        .map(|name| view! { <code class="chip">{ *name }</code> })
        .collect::<Vec<_>>();

    let notes = NOTES
        .iter()
        .map(|note| {
            let (url, date, title, summary) = (note.url, note.date, note.title, note.summary);
            view! {
                <li class="row">
                    <a href=url target="_blank" rel="noreferrer">
                        <span class="row-head">
                            <span class="row-title">{ title }</span>
                            <span class="row-period">{ date }</span>
                        </span>
                        <span class="row-summary">{ summary }</span>
                    </a>
                </li>
            }
        })
        .collect::<Vec<_>>();

    let socials = SOCIALS
        .iter()
        .map(|social| {
            let (url, label, hint) = (social.url, social.label, social.hint);
            view! {
                <li>
                    <a href=url target="_blank" rel="noreferrer">
                        <span class="social-label">{ label }</span>
                        <span class="social-hint">{ hint }</span>
                    </a>
                </li>
            }
        })
        .collect::<Vec<_>>();

    let posters = POSTER_MARKS
        .iter()
        .enumerate()
        .map(|(index, mark)| {
            view! {
                <span class="mini-poster" style=format!("--hue: {}", hue_at(index))>
                    <span class="mini-mark">{ *mark }</span>
                    <span class="mini-baseline"></span>
                </span>
            }
        })
        .collect::<Vec<_>>();

    view! {
        <div class="panel-layer" class:open=move || spot.get().is_some()>
            <aside class="panel" role="region" aria-label="物件详情">
                <header class="panel-head">
                    <h2 class="panel-title">
                        { move || spot.get().map(spot_label).unwrap_or("") }
                    </h2>
                    <button type="button" class="panel-close" on:click=close aria-label="关闭面板">
                        { "关闭 · Esc" }
                    </button>
                </header>

                <div class="panel-body">
                    <div class="pane" class:pane-off=move || !is(spot.get(), Spot::Work)>
                        <ul class="rows">{ works }</ul>
                        <p class="pane-foot">{ "点任意一张去 GitHub 仓库。" }</p>
                    </div>

                    <div class="pane" class:pane-off=move || !is(spot.get(), Spot::About)>
                        <p class="pane-lead">{ SITE.subline }</p>
                        <div class="prose">{ paragraphs }</div>
                        <ul class="now-list">{ nows }</ul>
                        <p class="stack">
                            <span class="stack-label">{ "常用" }</span>
                            { chips }
                        </p>
                    </div>

                    <div class="pane" class:pane-off=move || !is(spot.get(), Spot::Notes)>
                        <ul class="rows">{ notes }</ul>
                        <p class="pane-foot">
                            <a href=SITE.blog target="_blank" rel="noreferrer">{ "全部文章在博客 ↗" }</a>
                        </p>
                    </div>

                    <div class="pane" class:pane-off=move || !is(spot.get(), Spot::Contact)>
                        <p class="pane-lead">{ "项目合作、Bug 反馈,或者只是想聊聊 Rust —— 都欢迎写信。" }</p>
                        <div class="contact-row">
                            <button
                                type="button"
                                class="btn btn-primary"
                                on:click=move |_| copy_to_clipboard(email, set_copied)
                            >
                                { move || if copied.get() { "已复制 ✓" } else { "复制邮箱" } }
                            </button>
                            <a class="btn btn-ghost" href=format!("mailto:{email}")>{ "直接写邮件" }</a>
                        </div>
                        <p class="pane-code"><code>{ email }</code></p>
                        <ul class="socials">{ socials }</ul>
                    </div>

                    <div class="pane" class:pane-off=move || !matches!(spot.get(), Some(Spot::Poster(_)))>
                        <div class="mini-row">{ posters }</div>
                        <p class="pane-lead">{ POSTER_CAPTION }</p>
                        <p class="pane-foot">{ "改 src/content.rs 的 POSTER_MARKS,或直接把 room.rs 里的 .poster 换成 <img>。" }</p>
                    </div>
                </div>
            </aside>
        </div>
    }
}
