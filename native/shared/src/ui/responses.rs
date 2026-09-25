#[derive(Clone, Debug, Default, PartialEq)]
pub struct UiResponse {
    pub clicked: bool,
    pub changed: bool,
    pub hovered: bool,
    pub focused: bool,
    pub dragged: bool,
    pub value: f64,
    pub text: String,
}

#[cfg(test)]
mod tests {
    use crate::ui::{UiBackend, UiResponse, UiSystem};

    #[test]
    fn completed_responses_survive_the_next_game_callback_then_replace() {
        let mut ui = UiSystem::default();
        ui.begin_frame();
        ui.publish_completed_responses(
            UiBackend::Egui,
            vec![(
                42,
                UiResponse {
                    clicked: true,
                    ..Default::default()
                },
            )],
        );

        assert!(ui.response(UiBackend::Egui, 42).clicked);
        assert!(!ui.response(UiBackend::DearImGui, 42).clicked);

        // begin_frame runs before the TypeScript callback; preserve the last
        // completed response so that callback can read it.
        ui.begin_frame();
        assert!(ui.response(UiBackend::Egui, 42).clicked);

        // The response set is replaced only after the next UI evaluation.
        ui.publish_completed_responses(UiBackend::Egui, vec![]);
        assert!(!ui.response(UiBackend::Egui, 42).clicked);
    }

    #[test]
    fn missing_response_returns_default_for_backend_and_id() {
        let mut ui = UiSystem::default();
        ui.publish_completed_responses(
            UiBackend::Egui,
            vec![(
                42,
                UiResponse {
                    clicked: true,
                    ..Default::default()
                },
            )],
        );

        assert_eq!(ui.response(UiBackend::Egui, 404), UiResponse::default());
        assert_eq!(ui.response(UiBackend::DearImGui, 42), UiResponse::default());
    }
}
