use crate::ui::panel::Spot;
use leptos::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen::closure::Closure;
use web_sys::HtmlElement;

/// 房间场景的视差:把指针位置写成 --rx / --ry 挂在舞台上,旋转本身交给 CSS。
/// 减弱动效时 CSS 压根不读这两个变量(room.css 的 no-preference 查询),所以这里不需要分支。
///
/// CSS 3D 那版房间的回退路径 —— 现在房间是 Three.js 的(`room3d.rs`),视差在 JS 里做。
#[allow(dead_code)]
pub fn init_room_tilt() {
    let Some(stage) = web_sys::window()
        .and_then(|window| window.document())
        .and_then(|doc| doc.get_element_by_id("room-stage"))
        // style 属性挂在 HTMLElement 上,所以先窄化一次类型
        .and_then(|el| el.dyn_into::<HtmlElement>().ok())
    else {
        return;
    };

    let tracked = stage.clone();
    let on_move = Closure::wrap(Box::new(move |ev: web_sys::PointerEvent| {
        let rect = tracked.get_bounding_client_rect();
        // 钳到 ±0.5:元素跑到指针之外时也不会转出离谱角度(上限 ±7° / ±3.5°)
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

/// 按下 Esc 收起面板。WriteSignal 是 Copy,监听器直接持有它就好。
pub fn on_escape(set_spot: WriteSignal<Option<Spot>>) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let handler = Closure::wrap(Box::new(move |ev: web_sys::KeyboardEvent| {
        if ev.key() == "Escape" {
            set_spot.set(None);
            announce_panel_closed();
        }
    }) as Box<dyn FnMut(web_sys::KeyboardEvent)>);
    if window
        .add_event_listener_with_callback("keydown", handler.as_ref().unchecked_ref())
        .is_err()
    {
        return;
    }
    handler.forget();
}

/// web-sys 还没为异步剪贴板生成绑定,这里直接走 Reflect。
fn write_clipboard(window: &web_sys::Window, text: &str) -> bool {
    let navigator = window.navigator();
    let key = |name: &str| wasm_bindgen::JsValue::from_str(name);
    let Ok(clipboard) = js_sys::Reflect::get(&navigator, &key("clipboard")) else {
        return false;
    };
    let Ok(write_text) = js_sys::Reflect::get(&clipboard, &key("writeText")) else {
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

/// 3D 层点到东西时抛出 `noke:pick`,detail 是 `"work"` / `"poster:2"` 这样的字符串。
/// 转成 Spot 交给信号,面板自然会浮出来。
pub fn on_pick(set_spot: WriteSignal<Option<Spot>>) {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    let handler = Closure::wrap(Box::new(move |event: web_sys::Event| {
        let spot = event
            .dyn_into::<web_sys::CustomEvent>()
            .ok()
            .and_then(|custom| custom.detail().as_string())
            .and_then(|raw| parse_spot(&raw));
        if let Some(spot) = spot {
            set_spot.set(Some(spot));
        }
    }) as Box<dyn FnMut(web_sys::Event)>);
    if document
        .add_event_listener_with_callback("noke:pick", handler.as_ref().unchecked_ref())
        .is_err()
    {
        return;
    }
    handler.forget();
}

/// 通知 3D 层「面板收了」,好让镜头退回原位。
pub fn announce_panel_closed() {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    if let Ok(event) = web_sys::CustomEvent::new("noke:panel-closed") {
        document.dispatch_event(&event).ok();
    }
}

/// 3D 脚本可能比 Leptos 先跑完,那一刻页面上还没有 #room3d。
/// 挂载完成后补一句招呼,让它能开工(反过来它自己也会先试一次)。
pub fn announce_room_mounted() {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    if let Ok(event) = web_sys::CustomEvent::new("noke:room-mounted") {
        document.dispatch_event(&event).ok();
    }
}

/// 键盘那条入口上的「看全景」:3D 层听见了就按点屏幕那同一条路退到定位。
/// 首屏的场景本身 aria-hidden —— 键盘只有这里看得了全景。
pub fn announce_enter() {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    if let Ok(event) = web_sys::CustomEvent::new("noke:enter") {
        document.dispatch_event(&event).ok();
    }
}

/// `"work"` / `"poster:2"` → Spot。认不出来就当作没点。
fn parse_spot(raw: &str) -> Option<Spot> {
    match raw {
        "work" => Some(Spot::Work),
        "about" => Some(Spot::About),
        "notes" => Some(Spot::Notes),
        "contact" => Some(Spot::Contact),
        _ => raw
            .strip_prefix("poster:")
            .and_then(|index| index.parse().ok())
            .map(Spot::Poster),
    }
}
