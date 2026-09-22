use leptos::prelude::*;

use super::Section;
use crate::content::{FOOTER_NOTE, SITE, SOCIALS};
use crate::hooks::copy_to_clipboard;

#[component]
pub fn Contact() -> impl IntoView {
    let (copied, set_copied) = signal(false);
    let email = SITE.email;

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

    view! {
        <Section id="contact" index="04" title="联系" kicker="邮件最好使">
            <p class="contact-lead">
                { "项目合作、Bug 反馈,或者只是想聊聊 Rust —— 都欢迎写信。通常一两天内回。" }
            </p>

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

            <p class="contact-email"><code>{ email }</code></p>

            <ul class="socials">{ socials }</ul>
        </Section>
    }
}

#[component]
pub fn Footer() -> impl IntoView {
    view! {
        <footer class="site-footer reveal">
            <div class="wrap footer-inner">
                <p class="footer-note">{ FOOTER_NOTE }</p>
                <p class="footer-meta">
                    <span>{ format!("© {} {}", SITE.since, SITE.name) }</span>
                    <a href="#top" class="to-top">{ "回到顶部 ↑" }</a>
                </p>
            </div>
        </footer>
    }
}
