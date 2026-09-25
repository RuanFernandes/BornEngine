mod commands;
mod egui;
#[cfg(feature = "debug-ui")]
mod imgui;
mod input;
mod responses;

pub use commands::{UiCommand, UiOpcode};
pub use egui::{EguiFrameOutput, EguiUi};
#[cfg(feature = "debug-ui")]
pub(crate) use imgui::with_dear_imgui;
#[cfg(feature = "debug-ui")]
pub use imgui::DearImGuiUi;
pub use input::{
    UiInputBridge, UiInputEvent, UiInputSnapshot, UiKeyEvent, UiModifiers, UiPointerButtonEvent,
    UiTouchEvent,
};
pub use responses::UiResponse;

use std::collections::HashMap;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u32)]
pub enum UiBackend {
    Egui = 0,
    DearImGui = 1,
}

impl UiBackend {
    pub fn from_abi(value: f64) -> Option<Self> {
        if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > u32::MAX as f64 {
            return None;
        }
        match value as u32 {
            0 => Some(Self::Egui),
            1 => Some(Self::DearImGui),
            _ => None,
        }
    }
}

pub fn id_from_abi(value: f64) -> Option<u32> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > u32::MAX as f64 {
        return None;
    }
    Some(value as u32)
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UiCaptureState {
    pub pointer: bool,
    pub keyboard: bool,
}

const MAX_QUEUED_COMMANDS: usize = 16_384;
const MAX_SCRATCH_VALUES: usize = 1_048_576;

fn color_channel(value: f64) -> u8 {
    if value.is_finite() {
        value.clamp(0.0, 255.0).round() as u8
    } else {
        255
    }
}

#[derive(Default)]
pub struct UiSystem {
    commands: Vec<UiCommand>,
    completed_responses: HashMap<UiBackend, HashMap<u32, UiResponse>>,
    capture: HashMap<UiBackend, UiCaptureState>,
    scratch: HashMap<UiBackend, Vec<f64>>,
    input_bridge: UiInputBridge,
    input_snapshot: UiInputSnapshot,
    egui: EguiUi,
}

impl UiSystem {
    /// Start a new TypeScript command frame without clearing readback values
    /// from the most recently completed UI frame.
    pub fn begin_frame(&mut self) {
        self.commands.clear();
        self.scratch.clear();
    }

    pub fn queue_command(&mut self, command: UiCommand) -> bool {
        if self.commands.len() >= MAX_QUEUED_COMMANDS {
            return false;
        }
        self.commands.push(command);
        true
    }

    pub fn take_commands(&mut self, backend: UiBackend) -> Vec<UiCommand> {
        let mut selected = Vec::new();
        self.commands.retain(|command| {
            if command.backend == backend {
                selected.push(command.clone());
                false
            } else {
                true
            }
        });
        selected
    }

    pub fn response(&self, backend: UiBackend, id: u32) -> UiResponse {
        self.completed_responses
            .get(&backend)
            .and_then(|responses| responses.get(&id))
            .cloned()
            .unwrap_or_default()
    }

    pub fn has_response(&self, backend: UiBackend, id: u32) -> bool {
        self.completed_responses
            .get(&backend)
            .is_some_and(|responses| responses.contains_key(&id))
    }

    pub fn response_text(&self, backend: UiBackend, id: u32) -> String {
        self.response(backend, id).text
    }

    pub fn set_input_snapshot(&mut self, snapshot: UiInputSnapshot) {
        self.input_snapshot = self.input_bridge.merge_snapshot(snapshot);
    }

    pub fn input_snapshot(&self) -> &UiInputSnapshot {
        &self.input_snapshot
    }

    pub fn evaluate_egui(
        &mut self,
        screen_rect: [f32; 4],
        pixels_per_point: f32,
        dt: f64,
    ) -> EguiFrameOutput {
        self.egui.set_native_pixels_per_point(pixels_per_point);
        let commands = self.take_commands(UiBackend::Egui);
        let output = self
            .egui
            .run_frame(&commands, self.input_snapshot.clone(), screen_rect, dt);
        self.publish_completed_responses(
            UiBackend::Egui,
            output
                .responses
                .iter()
                .map(|(&id, response)| (id, response.clone()))
                .collect(),
        );
        self.set_capture(
            UiBackend::Egui,
            UiCaptureState {
                pointer: output.wants_pointer_input,
                keyboard: output.wants_keyboard_input,
            },
        );
        self.set_text_focus(output.text_edit_focused);
        output
    }

    pub fn publish_completed_responses(
        &mut self,
        backend: UiBackend,
        responses: Vec<(u32, UiResponse)>,
    ) {
        self.completed_responses
            .insert(backend, responses.into_iter().collect());
    }

    pub fn set_capture(&mut self, backend: UiBackend, capture: UiCaptureState) {
        self.capture.insert(backend, capture);
    }

    pub fn wants_input(&self, backend: UiBackend, kind: u32) -> bool {
        let capture = self.capture.get(&backend).copied().unwrap_or_default();
        match kind {
            0 => capture.pointer,
            1 => capture.keyboard,
            _ => false,
        }
    }

    pub fn is_available(&self, backend: UiBackend) -> bool {
        match backend {
            UiBackend::Egui => true,
            UiBackend::DearImGui => cfg!(feature = "debug-ui"),
        }
    }

    pub(crate) fn registered_texture_handles(&self, backend: UiBackend) -> Vec<u64> {
        self.commands
            .iter()
            .filter(|command| {
                command.backend == backend && command.opcode == UiOpcode::RegisterTexture
            })
            .filter_map(|command| {
                let handle = command.args[0];
                (handle.is_finite()
                    && handle >= 0.0
                    && handle.fract() == 0.0
                    && handle <= u64::MAX as f64)
                    .then_some(handle as u64)
            })
            .collect()
    }

    pub fn inject_text(&mut self, text: String) {
        self.input_bridge.inject_text(text);
    }

    pub fn set_text_focus(&mut self, focused: bool) {
        self.input_bridge.set_text_focus(focused);
    }

    pub fn take_keyboard_request(&mut self) -> Option<bool> {
        self.input_bridge.take_keyboard_request()
    }

    pub fn reset_scratch(&mut self, backend: UiBackend) {
        self.scratch.insert(backend, Vec::new());
    }

    pub fn push_scratch(&mut self, backend: UiBackend, value: f64) -> bool {
        let values = self.scratch.entry(backend).or_default();
        if values.len() >= MAX_SCRATCH_VALUES || !value.is_finite() {
            return false;
        }
        values.push(value);
        true
    }

    pub fn queue_scratch_command(
        &mut self,
        backend: UiBackend,
        opcode: UiOpcode,
        id: u32,
        count: usize,
        text: impl Into<String>,
    ) -> bool {
        let Some(values) = self.scratch.get_mut(&backend) else {
            return false;
        };
        if count > values.len() || self.commands.len() >= MAX_QUEUED_COMMANDS {
            return false;
        }
        let scratch = values.drain(..count).collect();
        self.commands
            .push(UiCommand::new(backend, opcode, id, [0.0; 4], text).with_scratch(scratch));
        true
    }
}
