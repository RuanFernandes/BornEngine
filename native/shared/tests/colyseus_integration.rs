use bloom_shared::colyseus;
use serde_json::Value;
use std::time::{Duration, Instant};

struct Client(u64);

impl Drop for Client {
    fn drop(&mut self) {
        colyseus::client_dispose(self.0);
    }
}

fn wait_for(label: &str, timeout: Duration, predicate: impl Fn(&Value) -> bool) -> Value {
    let deadline = Instant::now() + timeout;
    let mut recent = Vec::new();
    while Instant::now() < deadline {
        colyseus::poll();
        loop {
            let encoded = colyseus::next_event();
            if encoded.is_empty() {
                break;
            }
            let event: Value = serde_json::from_str(&encoded)
                .unwrap_or_else(|error| panic!("invalid Colyseus event JSON: {error}: {encoded}"));
            if recent.len() == 12 {
                recent.remove(0);
            }
            recent.push(event.clone());
            if event["kind"] == "error" || event["kind"] == "clientError" {
                panic!("Colyseus {label} failed: {event}");
            }
            if predicate(&event) {
                return event;
            }
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    panic!("timed out waiting for Colyseus {label}; recent events: {recent:?}");
}

#[test]
fn native_sdk_matches_the_repository_fixture_contract() {
    let client = Client(colyseus::client_create("ws://127.0.0.1:2567"));
    assert_ne!(client.0, 0, "native SDK should create a client");

    let room = colyseus::client_join(
        client.0,
        0,
        "test_room",
        r#"{"name":"BornEngine native bridge"}"#,
    );
    assert_ne!(room, 0, "native SDK should start matchmaking");
    let joined = wait_for("join", Duration::from_secs(10), |event| {
        event["kind"] == "join" && event["room"] == room
    });
    assert!(!joined["roomId"].as_str().unwrap_or_default().is_empty());
    assert!(!joined["sessionId"].as_str().unwrap_or_default().is_empty());
    let initial_state = joined["state"].clone();
    if initial_state["counter"].is_null() || initial_state["players"].is_null() {
        let state = wait_for("initial nested state", Duration::from_secs(5), |event| {
            event["kind"] == "state"
                && event["room"] == room
                && event["state"]["counter"].as_f64() == Some(0.0)
                && event["state"]["players"].is_object()
        });
        assert_eq!(state["state"]["counter"].as_f64(), Some(0.0));
    } else {
        assert_eq!(initial_state["counter"].as_f64(), Some(0.0));
        assert!(initial_state["players"].is_object());
    }

    colyseus::room_send(room, "echo", r#"{"value":"native"}"#);
    let echo = wait_for("string message", Duration::from_secs(5), |event| {
        event["kind"] == "message" && event["room"] == room && event["type"] == "echo"
    });
    assert_eq!(echo["data"]["value"], "native");

    colyseus::room_send(room, "i7", r#"{"value":"numeric"}"#);
    let numeric = wait_for("numeric message", Duration::from_secs(5), |event| {
        event["kind"] == "message" && event["room"] == room && event["type"] == "i8"
    });
    assert_eq!(numeric["data"]["value"], "numeric");

    colyseus::room_send(room, "increment", r#"{"amount":3}"#);
    let incremented = wait_for("state change", Duration::from_secs(5), |event| {
        event["kind"] == "state"
            && event["room"] == room
            && event["state"]["counter"].as_f64() == Some(3.0)
    });
    assert_eq!(incremented["state"]["counter"].as_f64(), Some(3.0));

    colyseus::room_send_bytes(room, "bytes", "[1,2,3,255]");
    let bytes = wait_for("binary message state", Duration::from_secs(5), |event| {
        event["kind"] == "state"
            && event["room"] == room
            && event["state"]["lastBytes"] == "1,2,3,255"
    });
    assert_eq!(bytes["state"]["lastBytes"], "1,2,3,255");

    let request = colyseus::room_request(room, "request_sum", r#"{"a":9,"b":33}"#);
    assert_ne!(request, 0, "native SDK should start request/reply");
    let reply = wait_for("request reply", Duration::from_secs(5), |event| {
        event["kind"] == "request" && event["room"] == room && event["request"] == request
    });
    assert_eq!(reply["outcome"], 0);
    assert_eq!(reply["data"], 42);

    let token = colyseus::room_reconnection_token(room);
    assert!(
        !token.is_empty(),
        "joined room should provide a reconnection token"
    );
    colyseus::room_leave(room, false);
    wait_for("unconsented drop", Duration::from_secs(5), |event| {
        event["kind"] == "drop" && event["room"] == room
    });

    let reconnected_room = colyseus::client_join(client.0, 4, &token, "{}");
    assert_ne!(
        reconnected_room, 0,
        "native SDK should start token reconnect"
    );
    wait_for("manual reconnect", Duration::from_secs(10), |event| {
        event["kind"] == "join" && event["room"] == reconnected_room
    });
    colyseus::room_leave(reconnected_room, true);
    wait_for("clean leave", Duration::from_secs(5), |event| {
        event["kind"] == "leave" && event["room"] == reconnected_room
    });
}
