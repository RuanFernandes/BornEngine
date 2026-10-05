mod commands;
mod responses;

pub use commands::{GuiCommand, GuiOpcode};
pub use responses::{GuiEventField, GuiEventRecord, GuiEventType, GuiResponse};

pub const MAX_QUEUED_COMMANDS: usize = 16_384;
pub const MAX_SCRATCH_VALUES: usize = 1_048_576;

pub fn id_from_abi_checked(value: f64) -> Option<u32> {
    crate::ui::id_from_abi(value).filter(|id| *id != 0)
}

pub struct GuiSystem {
    commands: Vec<GuiCommand>,
    scratch: Vec<f64>,
    completed_responses: std::collections::HashMap<u32, GuiResponse>,
    completed_events: Vec<GuiEventRecord>,
    available: bool,
    wants_pointer_input: bool,
    wants_keyboard_input: bool,
}

impl Default for GuiSystem {
    fn default() -> Self {
        Self {
            commands: Vec::new(),
            scratch: Vec::new(),
            completed_responses: std::collections::HashMap::new(),
            completed_events: Vec::new(),
            available: true,
            wants_pointer_input: false,
            wants_keyboard_input: false,
        }
    }
}

impl GuiSystem {
    pub fn begin_frame(&mut self) {
        self.commands.clear();
        self.scratch.clear();
    }

    pub fn queue_command(&mut self, command: GuiCommand) -> bool {
        if self.commands.len() >= MAX_QUEUED_COMMANDS || !command.is_valid() {
            return false;
        }
        self.commands.push(command);
        true
    }

    pub fn take_commands(&mut self) -> Vec<GuiCommand> {
        std::mem::take(&mut self.commands)
    }

    pub fn reset_scratch(&mut self) {
        self.scratch.clear();
    }

    pub fn push_scratch(&mut self, value: f64) -> bool {
        if self.scratch.len() >= MAX_SCRATCH_VALUES || !value.is_finite() {
            return false;
        }
        self.scratch.push(value);
        true
    }

    pub fn queue_scratch_command(
        &mut self,
        opcode: GuiOpcode,
        id: u32,
        count: usize,
        text: impl Into<String>,
    ) -> bool {
        if count > self.scratch.len() || self.commands.len() >= MAX_QUEUED_COMMANDS {
            return false;
        }
        let scratch: Vec<_> = self.scratch.drain(..count).collect();
        self.queue_command(GuiCommand::new(opcode, id, [0.0; 4], text).with_scratch(scratch))
    }

    pub fn response(&self, id: u32) -> GuiResponse {
        self.completed_responses
            .get(&id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn has_response(&self, id: u32) -> bool {
        self.completed_responses.contains_key(&id)
    }

    pub fn response_text(&self, id: u32) -> String {
        self.response(id).text
    }

    pub fn publish_completed_responses(&mut self, responses: Vec<(u32, GuiResponse)>) {
        self.completed_responses = responses.into_iter().collect();
    }

    pub fn publish_completed_snapshot(
        &mut self,
        responses: Vec<(u32, GuiResponse)>,
        events: Vec<GuiEventRecord>,
        wants_pointer_input: bool,
        wants_keyboard_input: bool,
    ) {
        self.completed_responses = responses.into_iter().collect();
        self.completed_events = events;
        self.wants_pointer_input = wants_pointer_input;
        self.wants_keyboard_input = wants_keyboard_input;
    }

    pub fn events(&self) -> &[GuiEventRecord] {
        &self.completed_events
    }
    pub fn event_count(&self) -> usize {
        self.completed_events.len()
    }

    pub fn event_field(&self, index: usize, field: u32) -> f64 {
        self.completed_events
            .get(index)
            .map(|event| event.field(field))
            .unwrap_or(0.0)
    }

    pub fn is_available(&self) -> bool {
        self.available
    }
    pub fn set_available(&mut self, available: bool) {
        self.available = available;
    }
    pub fn wants_input(&self, kind: u32) -> bool {
        match kind {
            0 => self.wants_pointer_input,
            1 => self.wants_keyboard_input,
            _ => false,
        }
    }
}
