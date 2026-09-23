mod content;
mod hooks;
mod sections;
mod theme;

use leptos::mount::mount_to_body;
use leptos::prelude::*;
use sections::{About, Contact, Footer, Header, Hero, Notes, Projects, Room};

#[component]
pub fn App() -> impl IntoView {
    let set_theme = theme::use_theme();
    let active = hooks::use_scroll_spy(content::NAV);
    let progress = hooks::use_scroll_progress();

    view! {
        <div
            class="scroll-progress"
            aria-hidden="true"
            style=move || format!("transform: scaleX({:.3})", progress.get())
        >
        </div>

        <Header set_theme=set_theme active=active />

        <main>
            <Hero />
            <About />
            <Room />
            <Projects />
            <Notes />
            <Contact />
        </main>

        <Footer />
    }
}

/// Rust 起来之后就把 index.html 里的加载块撤掉。
fn remove_boot_screen() {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    if let Some(boot) = document.get_element_by_id("boot") {
        boot.remove();
    }
}

#[wasm_bindgen::prelude::wasm_bindgen(start)]
fn main() {
    console_error_panic_hook::set_once();
    mount_to_body(App);
    remove_boot_screen();
    hooks::init_reveal();
    hooks::init_room_tilt();
}
