use super::engine;
use bloom_shared::gui::{GuiCommand, GuiOpcode};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn bloom_gui_command(opcode: f64, id: f64, a: f64, b: f64, c: f64, d: f64, text: &str) -> f64 {
    let Some(opcode) = GuiOpcode::from_abi(opcode) else {
        return 0.0;
    };
    let Some(id) = bloom_shared::gui::id_from_abi_checked(id) else {
        return 0.0;
    };
    if engine()
        .gui
        .queue_command(GuiCommand::new(opcode, id, [a, b, c, d], text))
    {
        1.0
    } else {
        0.0
    }
}

#[wasm_bindgen]
pub fn bloom_gui_scratch_reset() {
    engine().gui.reset_scratch();
}

#[wasm_bindgen]
pub fn bloom_gui_scratch_push_f64(value: f64) {
    engine().gui.push_scratch(value);
}

#[wasm_bindgen]
pub fn bloom_gui_scratch_command(opcode: f64, id: f64, count: f64, text: &str) -> f64 {
    let Some(opcode) = GuiOpcode::from_abi(opcode) else {
        return 0.0;
    };
    let Some(id) = bloom_shared::gui::id_from_abi_checked(id) else {
        return 0.0;
    };
    let Some(count) = bloom_shared::ui::id_from_abi(count) else {
        return 0.0;
    };
    if engine()
        .gui
        .queue_scratch_command(opcode, id, count as usize, text)
    {
        1.0
    } else {
        0.0
    }
}

#[wasm_bindgen]
pub fn bloom_gui_response(id: f64, field: f64) -> f64 {
    let Some(id) = bloom_shared::gui::id_from_abi_checked(id) else {
        return 0.0;
    };
    let Some(field) = bloom_shared::ui::id_from_abi(field) else {
        return 0.0;
    };
    let gui = engine();
    let response = gui.gui.response(id);
    match field {
        0..=5 | 7..=10 => response.field(field),
        6 => gui.gui.has_response(id) as u8 as f64,
        _ => 0.0,
    }
}

#[wasm_bindgen]
pub fn bloom_gui_response_text(id: f64) -> String {
    bloom_shared::gui::id_from_abi_checked(id)
        .map(|id| engine().gui.response_text(id))
        .unwrap_or_default()
}

#[wasm_bindgen]
pub fn bloom_gui_event_count() -> f64 {
    engine().gui.event_count() as f64
}

#[wasm_bindgen]
pub fn bloom_gui_event_field(index: f64, field: f64) -> f64 {
    let Some(index) = bloom_shared::ui::id_from_abi(index) else {
        return 0.0;
    };
    let Some(field) = bloom_shared::ui::id_from_abi(field) else {
        return 0.0;
    };
    engine().gui.event_field(index as usize, field)
}

#[wasm_bindgen]
pub fn bloom_gui_is_available() -> f64 {
    engine().gui.is_available() as u8 as f64
}

#[wasm_bindgen]
pub fn bloom_gui_wants_input(kind: f64) -> f64 {
    bloom_shared::ui::id_from_abi(kind)
        .map(|kind| engine().gui.wants_input(kind) as u8 as f64)
        .unwrap_or(0.0)
}
