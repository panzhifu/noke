use leptos::prelude::*;

use super::Section;
use crate::content::{PROJECTS, Project};

const ALL: &str = "全部";

/// 封面色相 / 高度按项目在 PROJECTS 里的序号定:黄金角散列让相邻两张不撞色,
/// 用序号而不是筛后的位置,筛选时颜色也不会跳。
const COVERS: [u16; 3] = [104, 152, 196];
const FEATURED_COVER: u16 = 216;

fn card_style(index: usize, featured: bool) -> String {
    // 起点 26° ≈ 本站强调色的色相,所以第一张（主线）卡片和整站同温。
    let hue = ((26.0 + index as f32 * 137.508) % 360.0).round() as u16;
    let cover = if featured {
        FEATURED_COVER
    } else {
        COVERS[index % COVERS.len()]
    };
    format!("--hue: {hue}; --cover: {cover}px")
}

/// 带序号返回,序号用来取稳定的封面配色。
fn visible(tag: &'static str) -> Vec<(usize, &'static Project)> {
    PROJECTS
        .iter()
        .enumerate()
        .filter(|(_, project)| tag == ALL || project.tags.contains(&tag))
        .map(|(index, project)| (index, project))
        .collect()
}

#[component]
fn ProjectCard(index: usize, project: &'static Project) -> impl IntoView {
    let style = card_style(index, project.featured);
    let tags = project
        .tags
        .iter()
        .map(|tag| view! { <li>{ *tag }</li> })
        .collect::<Vec<_>>();

    // 空的 note / points 直接不渲染:插了锚点注释的节点在 CSS 里就不再是 :empty 了。
    let note = if project.note.is_empty() {
        None
    } else {
        Some(view! { <p class="card-note">{ project.note }</p> })
    };
    let points = if project.points.is_empty() {
        None
    } else {
        Some(view! {
            <ul class="card-points">
                { project.points.iter().map(|point| view! { <li>{ *point }</li> }).collect::<Vec<_>>() }
            </ul>
        })
    };
    // 没填 URL 的项目渲染成不带 href 的 <a>:语义上就不是链接,样式仍然对齐。
    let href = if project.url.is_empty() {
        None
    } else {
        Some(project.url)
    };

    view! {
        <a class="card-link" href=href target="_blank" rel="noreferrer">
            <article class="card" class:featured=project.featured style=style>
                <div class="card-cover">
                    <h3 class="cover-title">{ project.name }</h3>
                    <span class="cover-period">{ project.period }</span>
                </div>
                <p class="card-summary">{ project.summary }</p>
                { note }
                { points }
                <ul class="card-tags">{ tags }</ul>
                <span class="card-cta" aria-hidden="true">{ "↗" }</span>
            </article>
        </a>
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

            // 只剩一两张时锁列数,否则多列布局会把它们挤在左侧一条里。
            <div
                class="cards"
                class:single=move || visible(tag.get()).len() == 1
                class:pair=move || visible(tag.get()).len() == 2
            >
                { move || visible(tag.get())
                    .into_iter()
                    .map(|(index, project)| view! { <ProjectCard index=index project=project /> })
                    .collect::<Vec<_>>() }
            </div>

            <p class="count">
                { move || format!("标签「{}」· {} 个项目", tag.get(), visible(tag.get()).len()) }
            </p>
        </Section>
    }
}

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
