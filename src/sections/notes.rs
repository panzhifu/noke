use leptos::prelude::*;

use super::Section;
use crate::content::{NOTES, SITE};

#[component]
pub fn Notes() -> impl IntoView {
    let items = NOTES
        .iter()
        .map(|note| {
            let (url, date, title, summary) = (note.url, note.date, note.title, note.summary);
            view! {
                <li class="note">
                    <a href=url target="_blank" rel="noreferrer">
                        <time class="note-date">{ date }</time>
                        <span class="note-main">
                            <span class="note-title">{ title }</span>
                            <span class="note-summary">{ summary }</span>
                        </span>
                        <span class="note-arrow" aria-hidden="true">{ "→" }</span>
                    </a>
                </li>
            }
        })
        .collect::<Vec<_>>();

    let body = if NOTES.is_empty() {
        "还没有文章。写完第一篇后,把它加进 src/content.rs 的 NOTES 里就会出现在这里。"
    } else {
        ""
    };

    view! {
        <Section id="notes" index="03" title="手记" kicker="长文在博客,这里只留索引">
            <ul class="note-list">{ items }</ul>
            <p class="muted">{ body }</p>
            <p class="section-foot">
                <a href=SITE.blog target="_blank" rel="noreferrer">{ "全部文章 ↗" }</a>
            </p>
        </Section>
    }
}
