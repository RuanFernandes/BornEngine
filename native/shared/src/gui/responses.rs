#[derive(Clone, Debug, Default, PartialEq)]
pub struct GuiResponse {
    pub clicked: bool,
    pub changed: bool,
    pub hovered: bool,
    pub focused: bool,
    pub dragged: bool,
    pub value: f64,
    pub text: String,
    pub rect: [f64; 4],
}

impl GuiResponse {
    pub fn field(&self, field: u32) -> f64 {
        match field {
            0 => self.clicked as u8 as f64,
            1 => self.changed as u8 as f64,
            2 => self.hovered as u8 as f64,
            3 => self.focused as u8 as f64,
            4 => self.dragged as u8 as f64,
            5 => self.value,
            7..=10 => self.rect[(field - 7) as usize],
            _ => 0.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u32)]
pub enum GuiEventType {
    Action = 1,
    Change = 2,
    Focus = 3,
    Blur = 4,
    PointerEnter = 5,
    PointerLeave = 6,
    PointerMove = 7,
    PointerDown = 8,
    PointerUp = 9,
    PointerDrag = 10,
    Wheel = 11,
    KeyDown = 12,
    KeyUp = 13,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u32)]
pub enum GuiEventField {
    EventType = 0,
    ControlId = 1,
    GlobalX = 2,
    GlobalY = 3,
    LocalX = 4,
    LocalY = 5,
    Key = 6,
    Button = 7,
    WheelX = 8,
    WheelY = 9,
    Modifiers = 10,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GuiEventRecord {
    pub event_type: GuiEventType,
    pub control_id: u32,
    pub global_x: f64,
    pub global_y: f64,
    pub local_x: f64,
    pub local_y: f64,
    pub key: f64,
    pub button: f64,
    pub wheel_x: f64,
    pub wheel_y: f64,
    pub modifiers: f64,
}

impl GuiEventRecord {
    pub fn new(event_type: GuiEventType, control_id: u32) -> Self {
        Self {
            event_type,
            control_id,
            global_x: 0.0,
            global_y: 0.0,
            local_x: 0.0,
            local_y: 0.0,
            key: 0.0,
            button: 0.0,
            wheel_x: 0.0,
            wheel_y: 0.0,
            modifiers: 0.0,
        }
    }

    pub fn field(&self, field: u32) -> f64 {
        match field {
            0 => self.event_type as u32 as f64,
            1 => self.control_id as f64,
            2 => self.global_x,
            3 => self.global_y,
            4 => self.local_x,
            5 => self.local_y,
            6 => self.key,
            7 => self.button,
            8 => self.wheel_x,
            9 => self.wheel_y,
            10 => self.modifiers,
            _ => 0.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{GuiEventRecord, GuiEventType, GuiResponse};
    use crate::gui::GuiSystem;
    use crate::ui::{UiBackend, UiResponse, UiSystem};

    #[test]
    fn gui_response_fields_expose_native_bounds_to_all_backends() {
        let response = GuiResponse {
            clicked: true,
            changed: true,
            hovered: true,
            focused: true,
            dragged: true,
            value: 0.75,
            rect: [12.0, 24.0, 320.0, 180.0],
            ..Default::default()
        };

        assert_eq!(response.field(0), 1.0);
        assert_eq!(response.field(5), 0.75);
        assert_eq!(
            (7..=10).map(|field| response.field(field)).collect::<Vec<_>>(),
            [12.0, 24.0, 320.0, 180.0]
        );
        assert_eq!(response.field(6), 0.0);
        assert_eq!(response.field(11), 0.0);
    }

    #[test]
    fn gui_response_map_isolated_from_immediate_ui_ids() {
        let mut immediate = UiSystem::default();
        immediate.publish_completed_responses(
            UiBackend::Egui,
            vec![(
                42,
                UiResponse {
                    clicked: true,
                    ..Default::default()
                },
            )],
        );
        let mut retained = GuiSystem::default();
        retained.publish_completed_responses(vec![(
            42,
            GuiResponse {
                value: 0.75,
                ..Default::default()
            },
        )]);

        assert!(immediate.response(UiBackend::Egui, 42).clicked);
        assert!(!retained.response(42).clicked);
        assert_eq!(retained.response(42).value, 0.75);
    }

    #[test]
    fn gui_response_snapshot_keeps_text_and_slider_values_until_next_update() {
        let mut gui = GuiSystem::default();
        gui.publish_completed_responses(vec![(
            9,
            GuiResponse {
                changed: true,
                value: 0.6,
                text: "typed".into(),
                ..Default::default()
            },
        )]);
        gui.begin_frame();
        assert_eq!(gui.response(9).value, 0.6);
        assert_eq!(gui.response_text(9), "typed");

        gui.publish_completed_responses(vec![]);
        assert!(!gui.has_response(9));
        assert_eq!(gui.response_text(9), "");
    }

    #[test]
    fn gui_event_records_preserve_frame_order() {
        let mut gui = GuiSystem::default();
        gui.publish_completed_snapshot(
            vec![],
            vec![
                GuiEventRecord::new(GuiEventType::Action, 21),
                GuiEventRecord::new(GuiEventType::KeyUp, 22),
            ],
            false,
            false,
        );
        assert_eq!(gui.event_count(), 2);
        assert_eq!(gui.event_field(0, 0), GuiEventType::Action as u32 as f64);
        assert_eq!(gui.event_field(0, 1), 21.0);
        assert_eq!(gui.event_field(1, 0), GuiEventType::KeyUp as u32 as f64);
        assert_eq!(gui.event_field(1, 1), 22.0);
    }

    #[test]
    fn missing_gui_responses_return_defaults() {
        let gui = GuiSystem::default();
        assert_eq!(gui.response(404), GuiResponse::default());
        assert!(!gui.has_response(404));
        assert_eq!(gui.response_text(404), "");
    }
}
