use std::collections::VecDeque;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UiPointerButtonEvent {
    pub button: u8,
    pub pressed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UiKeyEvent {
    pub key: u32,
    pub pressed: bool,
    pub repeated: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum UiInputEvent {
    Key(UiKeyEvent),
    Text(String),
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct UiModifiers {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub super_key: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UiTouchEvent {
    pub slot: usize,
    pub x: f64,
    pub y: f64,
    pub active: bool,
    pub released: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct UiInputSnapshot {
    pub pointer_position: Option<[f64; 2]>,
    pub pointer_delta: [f64; 2],
    pub pointer_buttons: Vec<UiPointerButtonEvent>,
    pub scroll_x: f64,
    pub scroll_y: f64,
    /// Text and keyboard events in their original platform delivery order.
    pub ordered_events: Vec<UiInputEvent>,
    pub keys: Vec<UiKeyEvent>,
    pub modifiers: UiModifiers,
    pub text: Vec<String>,
    pub touches: Vec<UiTouchEvent>,
}

impl UiInputSnapshot {
    pub fn ordered_key_text_events(&self) -> Vec<UiInputEvent> {
        if !self.ordered_events.is_empty() {
            return self.ordered_events.clone();
        }

        self.keys
            .iter()
            .copied()
            .map(UiInputEvent::Key)
            .chain(self.text.iter().cloned().map(UiInputEvent::Text))
            .collect()
    }
}

#[derive(Default)]
pub struct UiInputBridge {
    pending_text: Vec<String>,
    text_focused: bool,
    keyboard_requests: VecDeque<bool>,
}

impl UiInputBridge {
    pub fn inject_text(&mut self, text: String) {
        if !text.is_empty() {
            self.pending_text.push(text);
        }
    }

    pub fn merge_snapshot(&mut self, mut snapshot: UiInputSnapshot) -> UiInputSnapshot {
        if snapshot.ordered_events.is_empty() {
            snapshot.ordered_events.extend(
                snapshot
                    .keys
                    .iter()
                    .copied()
                    .map(UiInputEvent::Key)
                    .chain(snapshot.text.iter().cloned().map(UiInputEvent::Text)),
            );
        }
        for text in self.pending_text.drain(..) {
            snapshot
                .ordered_events
                .push(UiInputEvent::Text(text.clone()));
            snapshot.text.push(text);
        }
        snapshot
    }

    pub fn set_text_focus(&mut self, focused: bool) {
        if focused != self.text_focused {
            self.text_focused = focused;
            self.keyboard_requests.push_back(focused);
        }
    }

    pub fn take_keyboard_request(&mut self) -> Option<bool> {
        self.keyboard_requests.pop_front()
    }

    #[cfg(test)]
    pub fn take_keyboard_requests(&mut self) -> Vec<bool> {
        self.keyboard_requests.drain(..).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::{UiInputBridge, UiInputEvent, UiInputSnapshot, UiKeyEvent};

    #[test]
    fn ui_text_injection_preserves_a_complete_unicode_event() {
        let mut bridge = UiInputBridge::default();
        bridge.inject_text("東京".to_owned());
        let snapshot = bridge.merge_snapshot(UiInputSnapshot::default());

        assert_eq!(snapshot.text, ["東京"]);
        assert_eq!(
            snapshot.ordered_events,
            [UiInputEvent::Text("東京".to_owned())]
        );
    }

    #[test]
    fn bridge_appends_injected_text_after_existing_key_events() {
        let mut bridge = UiInputBridge::default();
        bridge.inject_text("x".to_owned());

        let snapshot = bridge.merge_snapshot(UiInputSnapshot {
            keys: vec![UiKeyEvent {
                key: 8,
                pressed: true,
                repeated: false,
            }],
            ..Default::default()
        });

        assert_eq!(
            snapshot.ordered_events,
            [
                UiInputEvent::Key(UiKeyEvent {
                    key: 8,
                    pressed: true,
                    repeated: false,
                }),
                UiInputEvent::Text("x".to_owned()),
            ]
        );
    }

    #[test]
    fn keyboard_focus_requests_only_on_transitions() {
        let mut bridge = UiInputBridge::default();
        bridge.set_text_focus(true);
        bridge.set_text_focus(true);
        bridge.set_text_focus(false);

        assert_eq!(bridge.take_keyboard_requests(), [true, false]);
    }
}
