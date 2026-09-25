use std::convert::TryFrom;

use super::UiBackend;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u32)]
pub enum UiOpcode {
    BeginWindow = 1,
    EndWindow = 2,
    BeginPanel = 3,
    EndPanel = 4,
    BeginHorizontal = 5,
    EndHorizontal = 6,
    BeginVertical = 7,
    EndVertical = 8,
    SetWindowPosition = 9,
    SetWindowSize = 10,
    Spacing = 11,
    Separator = 12,
    Label = 13,
    Link = 14,
    Button = 15,
    Checkbox = 16,
    RadioButton = 17,
    SliderFloat = 18,
    SliderInt = 19,
    DragFloat = 20,
    TextEdit = 21,
    Combo = 22,
    Selectable = 23,
    CollapsingHeader = 24,
    BeginScrollArea = 25,
    EndScrollArea = 26,
    BeginTabBar = 27,
    EndTabBar = 28,
    BeginTabItem = 29,
    EndTabItem = 30,
    ProgressBar = 31,
    Image = 32,
    PaintLine = 33,
    PaintRect = 34,
    PaintCircle = 35,
    PaintText = 36,
    PaintPolyline = 37,
    PaintPolygon = 38,
    SetStyle = 39,
    LoadFont = 40,
    RegisterTexture = 41,
    BeginMenuBar = 42,
    EndMenuBar = 43,
    BeginMenu = 44,
    EndMenu = 45,
    MenuItem = 46,
    TreeNode = 47,
    TreePop = 48,
    BeginTable = 49,
    EndTable = 50,
    TableNextRow = 51,
    TableNextColumn = 52,
    PlotLines = 53,
    DemoWindow = 54,
    MetricsWindow = 55,
    EndCombo = 56,
    EndCollapsingHeader = 57,
}

impl TryFrom<u32> for UiOpcode {
    type Error = ();

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        Ok(match value {
            1 => Self::BeginWindow,
            2 => Self::EndWindow,
            3 => Self::BeginPanel,
            4 => Self::EndPanel,
            5 => Self::BeginHorizontal,
            6 => Self::EndHorizontal,
            7 => Self::BeginVertical,
            8 => Self::EndVertical,
            9 => Self::SetWindowPosition,
            10 => Self::SetWindowSize,
            11 => Self::Spacing,
            12 => Self::Separator,
            13 => Self::Label,
            14 => Self::Link,
            15 => Self::Button,
            16 => Self::Checkbox,
            17 => Self::RadioButton,
            18 => Self::SliderFloat,
            19 => Self::SliderInt,
            20 => Self::DragFloat,
            21 => Self::TextEdit,
            22 => Self::Combo,
            23 => Self::Selectable,
            24 => Self::CollapsingHeader,
            25 => Self::BeginScrollArea,
            26 => Self::EndScrollArea,
            27 => Self::BeginTabBar,
            28 => Self::EndTabBar,
            29 => Self::BeginTabItem,
            30 => Self::EndTabItem,
            31 => Self::ProgressBar,
            32 => Self::Image,
            33 => Self::PaintLine,
            34 => Self::PaintRect,
            35 => Self::PaintCircle,
            36 => Self::PaintText,
            37 => Self::PaintPolyline,
            38 => Self::PaintPolygon,
            39 => Self::SetStyle,
            40 => Self::LoadFont,
            41 => Self::RegisterTexture,
            42 => Self::BeginMenuBar,
            43 => Self::EndMenuBar,
            44 => Self::BeginMenu,
            45 => Self::EndMenu,
            46 => Self::MenuItem,
            47 => Self::TreeNode,
            48 => Self::TreePop,
            49 => Self::BeginTable,
            50 => Self::EndTable,
            51 => Self::TableNextRow,
            52 => Self::TableNextColumn,
            53 => Self::PlotLines,
            54 => Self::DemoWindow,
            55 => Self::MetricsWindow,
            56 => Self::EndCombo,
            57 => Self::EndCollapsingHeader,
            _ => return Err(()),
        })
    }
}

impl UiOpcode {
    pub fn from_abi(value: f64) -> Option<Self> {
        if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > u32::MAX as f64 {
            return None;
        }
        Self::try_from(value as u32).ok()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct UiCommand {
    pub backend: UiBackend,
    pub opcode: UiOpcode,
    pub id: u32,
    pub args: [f64; 4],
    pub text: String,
    pub scratch: Vec<f64>,
}

impl UiCommand {
    pub fn new(
        backend: UiBackend,
        opcode: UiOpcode,
        id: u32,
        args: [f64; 4],
        text: impl Into<String>,
    ) -> Self {
        Self {
            backend,
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
}

#[cfg(test)]
mod tests {
    use crate::ui::{UiBackend, UiCommand, UiOpcode, UiSystem};

    fn command(backend: UiBackend, opcode: UiOpcode, id: u32, text: &str) -> UiCommand {
        UiCommand::new(backend, opcode, id, [0.0; 4], text)
    }

    #[test]
    fn command_queue_preserves_order_per_backend() {
        let mut ui = UiSystem::default();
        assert!(ui.queue_command(command(UiBackend::Egui, UiOpcode::Button, 7, "Continue")));
        assert!(ui.queue_command(command(
            UiBackend::DearImGui,
            UiOpcode::Button,
            8,
            "Inspect"
        )));
        assert!(ui.queue_command(command(UiBackend::Egui, UiOpcode::Label, 9, "Ready")));

        let egui = ui.take_commands(UiBackend::Egui);
        assert_eq!(
            egui.iter().map(|command| command.id).collect::<Vec<_>>(),
            [7, 9]
        );
        let debug = ui.take_commands(UiBackend::DearImGui);
        assert_eq!(
            debug.iter().map(|command| command.id).collect::<Vec<_>>(),
            [8]
        );
    }

    #[test]
    fn unknown_opcodes_are_rejected_without_panicking() {
        assert!(UiOpcode::try_from(65_535).is_err());
    }
}
