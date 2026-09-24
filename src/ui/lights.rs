//! 房间灯:一盏摆在书桌上的台灯,开不开是一个独立状态。
//!
//! 和主题一样挂在 `<html data-lights>` 上 —— 3D 层只读属性,不需要额外的消息通道。
//! 四态的第二维就是它:昼夜(主题) × 灯(这里),见 `assets/room/palette.js`。

use leptos::prelude::*;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lights {
    Off,
    On,
}

impl Lights {
    pub fn as_attr(self) -> &'static str {
        match self {
            Lights::Off => "off",
            Lights::On => "on",
        }
    }

    fn toggled(self) -> Self {
        match self {
            Lights::Off => Lights::On,
            Lights::On => Lights::Off,
        }
    }
}

const STORAGE_KEY: &str = "noke-lights";

fn stored() -> Option<Lights> {
    let storage = web_sys::window()?.local_storage().ok()??;
    match storage.get_item(STORAGE_KEY).ok()??.as_str() {
        "off" => Some(Lights::Off),
        "on" => Some(Lights::On),
        _ => None,
    }
}

/// 首次求值时的状态。默认「关」:白天进屋不开灯是最自然的默认。
pub fn initial_lights() -> Lights {
    stored().unwrap_or(Lights::Off)
}

fn write(lights: Lights) {
    let document = web_sys::window()
        .expect("no window")
        .document()
        .expect("no document");
    let root = document.document_element().expect("no <html>");
    root.set_attribute("data-lights", lights.as_attr()).ok();
    if let Ok(Some(storage)) = web_sys::window().expect("no window").local_storage() {
        storage.set_item(STORAGE_KEY, lights.as_attr()).ok();
    }
}

/// 房间灯:首次求值时把 data-lights 写进 <html>,之后每次切换自动持久化。
/// 读句柄也一起给出来 —— 开关要拿它决定滑块位置与 aria-pressed。
pub fn use_lights() -> (ReadSignal<Lights>, WriteSignal<Lights>) {
    let (lights, set_lights) = signal(initial_lights());
    Effect::new(move |_| write(lights.get()));
    (lights, set_lights)
}

pub fn next_lights(current: Lights) -> Lights {
    current.toggled()
}
