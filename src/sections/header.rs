use leptos::prelude::*;

use crate::content::{NAV, SITE};
use crate::theme::Theme;

#[component]
pub fn Header(set_theme: WriteSignal<Theme>, active: ReadSignal<&'static str>) -> impl IntoView {
    let (menu_open, set_menu_open) = signal(false);

    let toggle_theme =
        move |_| set_theme.update(|current| *current = crate::theme::next_theme(*current));

    let links = NAV
        .iter()
        .map(|item| {
            let (id, label, index) = (item.id, item.label, item.index);
            view! {
                <a
                    href=format!("#{id}")
                    class="nav-link"
                    class:active=move || active.get() == id
                    on:click=move |_| set_menu_open.set(false)
                >
                    <span class="nav-index" aria-hidden="true">{ index }</span>
                    { label }
                </a>
            }
        })
        .collect::<Vec<_>>();

    let drawer_links = NAV
        .iter()
        .map(|item| {
            let (id, label, index) = (item.id, item.label, item.index);
            view! {
                <a href=format!("#{id}") class="drawer-link" on:click=move |_| set_menu_open.set(false)>
                    <span class="nav-index" aria-hidden="true">{ index }</span>
                    { label }
                </a>
            }
        })
        .collect::<Vec<_>>();

    view! {
        <header class="site-header">
            <div class="wrap header-inner">
                <a href="#top" class="brand" aria-label=format!("回到 {} 首页", SITE.name)>
                    <span class="brand-mark" aria-hidden="true"></span>
                    <span class="brand-name">{ SITE.name }</span>
                    <span class="brand-role">{ SITE.role }</span>
                </a>

                <nav class="nav" aria-label="主导航">{ links }</nav>

                <div class="header-actions">
                    <button
                        type="button"
                        class="icon-btn"
                        aria-label="切换深浅色主题"
                        title="切换深浅色主题"
                        on:click=toggle_theme
                    >
                        <svg class="icon icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
                            <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"
                                  stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                        </svg>
                        <svg class="icon icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6z"
                                  fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                    <button
                        type="button"
                        class="icon-btn menu-btn"
                        aria-label="打开菜单"
                        aria-expanded=move || if menu_open.get() { "true" } else { "false" }
                        on:click=move |_| set_menu_open.update(|open| *open = !*open)
                    >
                        <svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="drawer" class:open=move || menu_open.get()>
                <nav class="drawer-nav" aria-label="移动导航">{ drawer_links }</nav>
                <button type="button" class="drawer-close" aria-label="关闭菜单" on:click=move |_| set_menu_open.set(false)>
                    { "收起" }
                </button>
            </div>
        </header>
    }
}
