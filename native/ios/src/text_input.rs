use std::collections::VecDeque;
use std::sync::{Mutex, MutexGuard, OnceLock};

#[derive(Debug, Eq, PartialEq)]
pub enum TextInputEvent {
    Insert(String),
    DeleteBackward,
}

static PENDING_EVENTS: OnceLock<Mutex<VecDeque<TextInputEvent>>> = OnceLock::new();

fn pending_events() -> MutexGuard<'static, VecDeque<TextInputEvent>> {
    PENDING_EVENTS
        .get_or_init(|| Mutex::new(VecDeque::new()))
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub fn enqueue(event: TextInputEvent) {
    pending_events().push_back(event);
}

pub fn drain() -> Vec<TextInputEvent> {
    pending_events().drain(..).collect()
}

#[cfg(test)]
mod tests {
    use super::{drain, enqueue, TextInputEvent};

    #[test]
    fn text_events_cross_to_the_game_thread_once_and_in_order() {
        let producer = std::thread::spawn(|| {
            enqueue(TextInputEvent::Insert("é🙂".to_owned()));
            enqueue(TextInputEvent::DeleteBackward);
        });
        producer.join().unwrap();

        assert_eq!(
            drain(),
            [
                TextInputEvent::Insert("é🙂".to_owned()),
                TextInputEvent::DeleteBackward,
            ]
        );
        assert!(drain().is_empty());
    }
}
