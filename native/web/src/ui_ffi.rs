use super::engine;
use bloom_shared::ui::{UiBackend, UiCommand, UiOpcode};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn bloom_ui_command_str(
    backend: f64,
    opcode: f64,
    id: f64,
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    text: &str,
) -> f64 {
    let Some(backend) = UiBackend::from_abi(backend) else {
        return 0.0;
    };
    let Some(opcode) = UiOpcode::from_abi(opcode) else {
        return 0.0;
    };
    let Some(id) = bloom_shared::ui::id_from_abi(id) else {
        return 0.0;
    };
    if engine()
        .ui
        .queue_command(UiCommand::new(backend, opcode, id, [a, b, c, d], text))
    {
        1.0
    } else {
        0.0
    }
}

#[wasm_bindgen]
pub fn bloom_ui_scratch_reset(backend: f64) {
    if let Some(backend) = UiBackend::from_abi(backend) {
        engine().ui.reset_scratch(backend);
    }
}

#[wasm_bindgen]
pub fn bloom_ui_scratch_push_f64(backend: f64, value: f64) {
    if let Some(backend) = UiBackend::from_abi(backend) {
        engine().ui.push_scratch(backend, value);
    }
}

#[wasm_bindgen]
pub fn bloom_ui_scratch_command_str(
    backend: f64,
    opcode: f64,
    id: f64,
    count: f64,
    text: &str,
) -> f64 {
    let Some(backend) = UiBackend::from_abi(backend) else {
        return 0.0;
    };
    let Some(opcode) = UiOpcode::from_abi(opcode) else {
        return 0.0;
    };
    let Some(id) = bloom_shared::ui::id_from_abi(id) else {
        return 0.0;
    };
    let Some(count) = bloom_shared::ui::id_from_abi(count) else {
        return 0.0;
    };
    if engine()
        .ui
        .queue_scratch_command(backend, opcode, id, count as usize, text)
    {
        1.0
    } else {
        0.0
    }
}

#[wasm_bindgen]
pub fn bloom_ui_inject_text_str(text: &str) {
    engine().ui.inject_text(text.to_owned());
}

#[wasm_bindgen]
pub fn bloom_ui_response(backend: f64, id: f64, field: f64) -> f64 {
    let Some(backend) = UiBackend::from_abi(backend) else {
        return 0.0;
    };
    let Some(id) = bloom_shared::ui::id_from_abi(id) else {
        return 0.0;
    };
    let Some(field) = bloom_shared::ui::id_from_abi(field) else {
        return 0.0;
    };
    let response = engine().ui.response(backend, id);
    match field {
        0 => response.clicked as u8 as f64,
        1 => response.changed as u8 as f64,
        2 => response.hovered as u8 as f64,
        3 => response.focused as u8 as f64,
        4 => response.dragged as u8 as f64,
        5 => response.value,
        6 => engine().ui.has_response(backend, id) as u8 as f64,
        _ => 0.0,
    }
}

#[wasm_bindgen]
pub fn bloom_ui_response_text(backend: f64, id: f64) -> String {
    let Some(backend) = UiBackend::from_abi(backend) else {
        return String::new();
    };
    let Some(id) = bloom_shared::ui::id_from_abi(id) else {
        return String::new();
    };
    engine().ui.response_text(backend, id)
}

#[wasm_bindgen]
pub fn bloom_ui_is_available(backend: f64) -> f64 {
    let Some(backend) = UiBackend::from_abi(backend) else {
        return 0.0;
    };
    engine().ui.is_available(backend) as u8 as f64
}

#[wasm_bindgen]
pub fn bloom_ui_wants_input(backend: f64, kind: f64) -> f64 {
    let Some(backend) = UiBackend::from_abi(backend) else {
        return 0.0;
    };
    let Some(kind) = bloom_shared::ui::id_from_abi(kind) else {
        return 0.0;
    };
    engine().ui.wants_input(backend, kind) as u8 as f64
}

#[wasm_bindgen]
pub fn bloom_ui_take_keyboard_request(backend: f64) -> f64 {
    let Some(UiBackend::Egui) = UiBackend::from_abi(backend) else {
        return -1.0;
    };
    match engine().ui.take_keyboard_request() {
        Some(true) => 1.0,
        Some(false) => 0.0,
        None => -1.0,
    }
}
