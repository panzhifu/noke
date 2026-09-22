use leptos::prelude::*;

use super::Section;
use crate::content::{PROJECTS, Project};

const ALL: &str = "全部";

fn all_tags() -> Vec<&'static str> {
    let mut tags = vec![ALL];
    for project in PROJECTS {
        for tag in project.tags {
            if !tags.contains(tag) {
                tags.push(*tag);
            }
        }
    }
    tags
}

fn visible(tag: &'static str) -> Vec<&'static Project> {
    PROJECTS
        .iter()
        .filter(|project| tag == ALL || project.tags.contains(&tag))
        .collect()
}

#[component]
fn ProjectCard(project: &'static Project) -> impl IntoView {
    let tags = project
        .tags
        .iter()
        .map(|tag| view! { <li>{ *tag }</li> })
        .collect::<Vec<_>>();

    let card = view! {
        <article class="card" class:featured=project.featured>
            <header class="card-head">
                <h3 class="card-title">{ project.name }</h3>
                <span class="card-year">{ project.year }</span>
            </header>
            <p class="card-summary">{ project.summary }</p>
            <ul class="card-tags">{ tags }</ul>
            <span class="card-cta" aria-hidden="true">{ "↗" }</span>
        </article>
    };

    // 没填 URL 的项目渲染成不带 href 的 <a>:语义上就不是链接,样式也保持一致。
    let href = if project.url.is_empty() {
        None
    } else {
        Some(project.url)
    };

    view! {
        <a class="card-link" href=href target="_blank" rel="noreferrer">{ card }</a>
    }
}

#[component]
pub fn Projects() -> impl IntoView {
    let (tag, set_tag) = signal(ALL);
    let filters = all_tags()
        .into_iter()
        .map(|name| {
            view! {
                <button
                    type="button"
                    class="filter"
                    class:active=move || tag.get() == name
                    on:click=move |_| set_tag.set(name)
                >
                    { name }
                </button>
            }
        })
        .collect::<Vec<_>>();

    view! {
        <Section id="projects" index="02" title="作品" kicker="还在维护的那些">
            <div class="filters" role="group" aria-label="按标签筛选">{ filters }</div>
            <div class="cards">
                { move || visible(tag.get())
                    .into_iter()
                    .map(|project| view! { <ProjectCard project=project /> })
                    .collect::<Vec<_>>() }
            </div>
            <p class="count">
                { move || format!("标签「{}」· {} 个项目", tag.get(), visible(tag.get()).len()) }
            </p>
        </Section>
    }
}
