use bloom_shared::scripting::{self, ScriptContextData, ScriptLimits, ScriptPermissions};
use wasm_bindgen::prelude::*;

fn parse_handle(handle: f64) -> Option<u32> {
    if !handle.is_finite() || handle.fract() != 0.0 || handle <= 0.0 || handle > u32::MAX as f64 {
        None
    } else {
        Some(handle as u32)
    }
}

fn parse_index(index: f64) -> Option<usize> {
    if !index.is_finite() || index.fract() != 0.0 || index < 0.0 || index > 1_000_000.0 {
        None
    } else {
        Some(index as usize)
    }
}

fn parse_limit(value: f64, default: usize) -> Option<usize> {
    if value == 0.0 {
        return Some(default);
    }
    if !value.is_finite() || value.fract() != 0.0 || value < 0.0 {
        return None;
    }
    usize::try_from(value as u64).ok()
}

fn context(self_id: &str, x: f64, y: f64, z: f64) -> ScriptContextData {
    ScriptContextData::new(self_id, [x, y, z])
}

#[wasm_bindgen]
pub fn bloom_script_supported() -> f64 {
    1.0
}

#[wasm_bindgen]
pub fn bloom_script_create(
    permission_mask: f64,
    max_memory_bytes: f64,
    max_stack_bytes: f64,
    max_interrupt_checks: f64,
) -> f64 {
    if !permission_mask.is_finite()
        || permission_mask.fract() != 0.0
        || !(0.0..=15.0).contains(&permission_mask)
    {
        return 0.0;
    }
    let defaults = ScriptLimits::default();
    let (Some(max_memory_bytes), Some(max_stack_bytes), Some(max_interrupt_checks)) = (
        parse_limit(max_memory_bytes, defaults.max_memory_bytes),
        parse_limit(max_stack_bytes, defaults.max_stack_bytes),
        parse_limit(max_interrupt_checks, defaults.max_interrupt_checks),
    ) else {
        return 0.0;
    };
    let permissions = permission_mask as u32;
    let limits = ScriptLimits {
        max_memory_bytes,
        max_stack_bytes,
        max_interrupt_checks,
    };
    let permissions = ScriptPermissions {
        log: permissions & 1 != 0,
        self_read: permissions & 2 != 0,
        self_transform_write: permissions & 4 != 0,
        self_particles_emit: permissions & 8 != 0,
    };
    scripting::create_script_vm(limits, permissions)
        .map(|handle| handle as f64)
        .unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn bloom_script_load(handle: f64, source: &str) -> f64 {
    let Some(handle) = parse_handle(handle) else {
        return 0.0;
    };
    scripting::with_script_vm(handle, |vm| vm.load(source).is_ok()).unwrap_or(false) as u8 as f64
}

#[wasm_bindgen]
pub fn bloom_script_start(handle: f64, self_id: &str, x: f64, y: f64, z: f64) -> f64 {
    let Some(handle) = parse_handle(handle) else {
        return 0.0;
    };
    scripting::script_start(handle, context(self_id, x, y, z)).unwrap_or(0) as f64
}

#[wasm_bindgen]
pub fn bloom_script_update(
    handle: f64,
    self_id: &str,
    x: f64,
    y: f64,
    z: f64,
    delta_time: f64,
) -> f64 {
    let Some(handle) = parse_handle(handle) else {
        return 0.0;
    };
    scripting::script_update(handle, context(self_id, x, y, z), delta_time).unwrap_or(0) as f64
}

#[wasm_bindgen]
pub fn bloom_script_dispose(handle: f64, self_id: &str, x: f64, y: f64, z: f64) -> f64 {
    let Some(handle) = parse_handle(handle) else {
        return 0.0;
    };
    scripting::script_dispose(handle, context(self_id, x, y, z)).unwrap_or(0) as f64
}

#[wasm_bindgen]
pub fn bloom_script_command_count(handle: f64) -> f64 {
    let Some(handle) = parse_handle(handle) else {
        return 0.0;
    };
    scripting::script_command_count(handle).unwrap_or(0) as f64
}

#[wasm_bindgen]
pub fn bloom_script_command_kind(handle: f64, index: f64) -> f64 {
    let (Some(handle), Some(index)) = (parse_handle(handle), parse_index(index)) else {
        return 0.0;
    };
    scripting::script_command_kind(handle, index).unwrap_or(0) as f64
}

#[wasm_bindgen]
pub fn bloom_script_command_number(handle: f64, index: f64, slot: f64) -> f64 {
    let (Some(handle), Some(index), Some(slot)) =
        (parse_handle(handle), parse_index(index), parse_index(slot))
    else {
        return 0.0;
    };
    scripting::script_command_number(handle, index, slot).unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn bloom_script_command_text(handle: f64, index: f64) -> String {
    let (Some(handle), Some(index)) = (parse_handle(handle), parse_index(index)) else {
        return String::new();
    };
    scripting::script_command_text(handle, index).unwrap_or_default()
}

#[wasm_bindgen]
pub fn bloom_script_clear_commands(handle: f64) {
    if let Some(handle) = parse_handle(handle) {
        scripting::clear_script_commands(handle);
    }
}

#[wasm_bindgen]
pub fn bloom_script_status(handle: f64) -> f64 {
    let Some(handle) = parse_handle(handle) else {
        return 0.0;
    };
    scripting::script_status(handle).unwrap_or(0) as f64
}

#[wasm_bindgen]
pub fn bloom_script_error(handle: f64) -> String {
    let Some(handle) = parse_handle(handle) else {
        return String::new();
    };
    scripting::script_error(handle).unwrap_or_default()
}

#[wasm_bindgen]
pub fn bloom_script_memory_used(handle: f64) -> f64 {
    let Some(handle) = parse_handle(handle) else {
        return 0.0;
    };
    scripting::script_memory_used(handle).unwrap_or(0) as f64
}

#[wasm_bindgen]
pub fn bloom_script_destroy(handle: f64) {
    if let Some(handle) = parse_handle(handle) {
        scripting::script_destroy(handle);
    }
}
