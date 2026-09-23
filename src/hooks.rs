use leptos::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen::closure::Closure;
use web_sys::{
    HtmlElement, IntersectionObserver, IntersectionObserverEntry, IntersectionObserverInit,
};

use crate::content::NavItem;

/// 注册一个与页面同寿的 window 监听器 —— 单页站点,故意 forget 掉,不留悬垂指针。
fn watch_window(event: &str, handler: impl FnMut() + 'static) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let closure = Closure::<dyn FnMut()>::new(handler);
    if window
        .add_event_listener_with_callback(event, closure.as_ref().unchecked_ref())
        .is_err()
    {
        return;
    }
    closure.forget();
}

/// 阅读进度 0.0 ~ 1.0,用于顶栏那条细线。
pub fn use_scroll_progress() -> ReadSignal<f64> {
    let (progress, set_progress) = signal(0.0);
    let measure = move || {
        let Some(window) = web_sys::window() else {
            return;
        };
        let Some(root) = window.document().and_then(|doc| doc.document_element()) else {
            return;
        };
        let viewport = root.client_height() as f64;
        let total = root
            .dyn_ref::<HtmlElement>()
            .map_or(viewport, |el| el.scroll_height() as f64);
        let scrollable = (total - viewport).max(0.0);
        let y = window.scroll_y().unwrap_or(0.0);
        let ratio = if scrollable > 0.0 {
            (y / scrollable).clamp(0.0, 1.0)
        } else {
            0.0
        };
        set_progress.set(ratio);
    };
    measure();
    watch_window("scroll", measure);
    watch_window("resize", measure);
    progress
}

/// 当前区块:取「顶部已越过视口上沿」的最后一个 section。
pub fn use_scroll_spy(items: &'static [NavItem]) -> ReadSignal<&'static str> {
    let (active, set_active) = signal(items[0].id);
    let measure = move || {
        let Some(window) = web_sys::window() else {
            return;
        };
        let line = window.scroll_y().unwrap_or(0.0) + 140.0;
        let Some(doc) = window.document() else { return };
        let mut current = items[0].id;
        for item in items {
            let Some(el) = doc.get_element_by_id(item.id) else {
                continue;
            };
            let top = el
                .dyn_ref::<HtmlElement>()
                .map_or(0.0, |e| e.offset_top() as f64);
            if top > line {
                break;
            }
            current = item.id;
        }
        if active.get_untracked() != current {
            set_active.set(current);
        }
    };
    measure();
    watch_window("scroll", measure);
    active
}

/// 滚动进入视口时淡入:给 .reveal 元素加 .is-in,触发一次后取消订阅。
pub fn init_reveal() {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Some(doc) = window.document() else { return };
    let elements = doc.get_elements_by_class_name("reveal");
    if elements.length() == 0 {
        return;
    }

    let callback = Closure::<dyn FnMut(Vec<IntersectionObserverEntry>, IntersectionObserver)>::new(
        move |entries: Vec<IntersectionObserverEntry>, observer: IntersectionObserver| {
            for entry in entries {
                if !entry.is_intersecting() {
                    continue;
                }
                let target = entry.target();
                target.class_list().add_1("is-in").ok();
                observer.unobserve(&target);
            }
        },
    );

    let observer = IntersectionObserver::new_with_options(
        callback.as_ref().unchecked_ref::<js_sys::Function>(),
        &{
            let options = IntersectionObserverInit::new();
            // threshold 必须是 0:比例是按目标总面积算的,以后作品变多、区块高过视口十几倍时,
            // 任何大于 0 的阈值都可能永远达不到,那一屏内容就再也不淡入了。
            options.set_root_margin("0px 0px -8% 0px");
            options.set_threshold_f64(0.0);
            options
        },
    );

    let Ok(observer) = observer else {
        // 不支持 IntersectionObserver 的浏览器:不挂 .reveal-armed,内容保持常显。
        return;
    };

    // 先让 CSS 有权隐藏,再交给观察器逐块放行。
    if let Some(root) = doc.document_element() {
        root.class_list().add_1("reveal-armed").ok();
    }
    for i in 0..elements.length() {
        if let Some(el) = elements.item(i) {
            observer.observe(&el);
        }
    }
    callback.forget();
}

/// 房间场景的视差:把指针位置写成 --rx / --ry 挂在舞台上,旋转本身交给 CSS。
/// 减弱动效时 CSS 压根不读这两个变量(room.css 的 no-preference 查询),所以这里不需要分支。
pub fn init_room_tilt() {
    let Some(stage) = web_sys::window()
        .and_then(|window| window.document())
        .and_then(|doc| doc.get_element_by_id("room-stage"))
        // style 属性挂在 HTMLElement 上,所以先窄化一次类型
        .and_then(|el| el.dyn_into::<web_sys::HtmlElement>().ok())
    else {
        return;
    };

    let tracked = stage.clone();
    let on_move = Closure::wrap(Box::new(move |ev: web_sys::PointerEvent| {
        let rect = tracked.get_bounding_client_rect();
        // 钳到 ±0.5:元素被滚出指针时也不会转出离谱角度(上限 ±7° / ±3.5°)
        let nx =
            ((ev.client_x() as f64 - rect.left()) / rect.width().max(1.0) - 0.5).clamp(-0.5, 0.5);
        let ny =
            ((ev.client_y() as f64 - rect.top()) / rect.height().max(1.0) - 0.5).clamp(-0.5, 0.5);
        let style = tracked.style();
        style
            .set_property("--ry", &format!("{:.2}deg", nx * 14.0))
            .ok();
        style
            .set_property("--rx", &format!("{:.2}deg", -ny * 7.0))
            .ok();
    }) as Box<dyn FnMut(web_sys::PointerEvent)>);

    let resting = stage.clone();
    let on_leave = Closure::wrap(Box::new(move || {
        let style = resting.style();
        style.set_property("--rx", "0deg").ok();
        style.set_property("--ry", "0deg").ok();
    }) as Box<dyn FnMut()>);

    stage
        .add_event_listener_with_callback("pointermove", on_move.as_ref().unchecked_ref())
        .ok();
    stage
        .add_event_listener_with_callback("pointerleave", on_leave.as_ref().unchecked_ref())
        .ok();
    on_move.forget();
    on_leave.forget();
}

/// web-sys 还没为异步剪贴板生成绑定,这里直接走 Reflect。
fn write_clipboard(window: &web_sys::Window, text: &str) -> bool {
    let navigator = window.navigator();
    let Ok(clipboard) =
        js_sys::Reflect::get(&navigator, &wasm_bindgen::JsValue::from_str("clipboard"))
    else {
        return false;
    };
    let Ok(write_text) =
        js_sys::Reflect::get(&clipboard, &wasm_bindgen::JsValue::from_str("writeText"))
    else {
        return false;
    };
    if !write_text.is_function() {
        return false;
    }
    let write_text: &js_sys::Function = write_text.unchecked_ref();
    write_text
        .call1(&clipboard, &wasm_bindgen::JsValue::from_str(text))
        .is_ok()
}

/// 复制邮箱,成功后让按钮文案停留两秒再收回。
pub fn copy_to_clipboard(text: &'static str, copied: WriteSignal<bool>) {
    let Some(window) = web_sys::window() else {
        return;
    };
    if !write_clipboard(&window, text) {
        return;
    }
    copied.set(true);
    let reset = Closure::once(move || copied.set(false));
    let scheduled = window.set_timeout_with_callback_and_timeout_and_arguments_0(
        reset.as_ref().unchecked_ref::<js_sys::Function>(),
        2200,
    );
    if scheduled.is_err() {
        copied.set(false);
    }
    reset.forget();
}
