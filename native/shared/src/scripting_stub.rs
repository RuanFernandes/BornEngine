//! FFI-compatible fallback for targets without the embedded QuickJS runtime.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScriptLimits {
    pub max_memory_bytes: usize,
    pub max_stack_bytes: usize,
    pub max_interrupt_checks: usize,
}

impl Default for ScriptLimits {
    fn default() -> Self {
        Self {
            max_memory_bytes: 16 * 1024 * 1024,
            max_stack_bytes: 256 * 1024,
            max_interrupt_checks: 10_000,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ScriptPermissions {
    pub log: bool,
    pub self_read: bool,
    pub self_transform_write: bool,
    pub self_particles_emit: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScriptContextData {
    pub self_id: String,
    pub self_position: [f64; 3],
}

impl ScriptContextData {
    pub fn new(self_id: impl Into<String>, self_position: [f64; 3]) -> Self {
        Self {
            self_id: self_id.into(),
            self_position,
        }
    }
}

pub struct ScriptVm;

pub fn runtime_unavailable_error() -> String {
    unsupported_error()
}

impl ScriptVm {
    pub fn load(&mut self, _source: &str) -> Result<(), String> {
        Err(unsupported_error())
    }
}

pub fn create_script_vm(
    _limits: ScriptLimits,
    _permissions: ScriptPermissions,
) -> Result<u32, String> {
    Err(unsupported_error())
}

pub fn with_script_vm<R>(_handle: u32, _callback: impl FnOnce(&mut ScriptVm) -> R) -> Option<R> {
    None
}

pub fn script_start(_handle: u32, _data: ScriptContextData) -> Option<i32> {
    None
}

pub fn script_update(_handle: u32, _data: ScriptContextData, _delta_time: f64) -> Option<i32> {
    None
}

pub fn script_dispose(_handle: u32, _data: ScriptContextData) -> Option<i32> {
    None
}

pub fn script_command_count(_handle: u32) -> Option<usize> {
    None
}

pub fn script_command_kind(_handle: u32, _index: usize) -> Option<u32> {
    None
}

pub fn script_command_number(_handle: u32, _index: usize, _slot: usize) -> Option<f64> {
    None
}

pub fn script_command_text(_handle: u32, _index: usize) -> Option<String> {
    None
}

pub fn clear_script_commands(_handle: u32) {}

pub fn script_status(_handle: u32) -> Option<i32> {
    None
}

pub fn script_error(_handle: u32) -> Option<String> {
    None
}

pub fn script_memory_used(_handle: u32) -> Option<usize> {
    None
}

pub fn script_destroy(_handle: u32) -> bool {
    false
}

fn unsupported_error() -> String {
    if cfg!(not(any(target_os = "linux", target_arch = "wasm32"))) {
        "Embedded JavaScript is not supported by this target.".into()
    } else {
        "Embedded JavaScript is disabled for this build; enable the `scripting` native feature."
            .into()
    }
}
