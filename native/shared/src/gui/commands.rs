use std::convert::TryFrom;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u32)]
pub enum GuiOpcode {
    Control = 1,
    Item = 2,
    Drawing = 3,
}

impl TryFrom<u32> for GuiOpcode {
    type Error = ();

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Control),
            2 => Ok(Self::Item),
            3 => Ok(Self::Drawing),
            _ => Err(()),
        }
    }
}

impl GuiOpcode {
    pub fn from_abi(value: f64) -> Option<Self> {
        if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > u32::MAX as f64 {
            return None;
        }
        Self::try_from(value as u32).ok()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct GuiCommand {
    pub opcode: GuiOpcode,
    pub id: u32,
    pub args: [f64; 4],
    pub text: String,
    pub scratch: Vec<f64>,
}

impl GuiCommand {
    pub fn new(opcode: GuiOpcode, id: u32, args: [f64; 4], text: impl Into<String>) -> Self {
        Self {
            opcode,
            id,
            args,
            text: text.into(),
            scratch: Vec::new(),
        }
    }

    pub fn with_scratch(mut self, scratch: Vec<f64>) -> Self {
        self.scratch = scratch;
        self
    }

    pub fn is_valid(&self) -> bool {
        self.id != 0
            && self.args.iter().all(|value| value.is_finite())
            && self.scratch.iter().all(|value| value.is_finite())
    }
}

#[cfg(test)]
mod tests {
    use super::{GuiCommand, GuiOpcode};
    use crate::gui::GuiSystem;

    #[test]
    fn gui_command_rejects_invalid_opcode_and_non_finite_geometry() {
        assert!(GuiOpcode::from_abi(f64::NAN).is_none());
        assert!(GuiOpcode::from_abi(99.0).is_none());
        assert!(GuiOpcode::from_abi(1.5).is_none());

        let mut gui = GuiSystem::default();
        assert!(!gui.queue_command(GuiCommand::new(
            GuiOpcode::Control,
            7,
            [0.0, f64::INFINITY, 100.0, 20.0],
            "bad bounds",
        )));
        assert!(gui.take_commands().is_empty());
    }
}
