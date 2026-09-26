//! Perry FFI bindings for the shared Colyseus client bridge on watchOS.

#[no_mangle]
pub extern "C" fn bloom_colyseus_client_create(url: i64) -> f64 {
    crate::colyseus::client_create(crate::perry_str(url)) as f64
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_client_join(
    client: f64,
    method: f64,
    target: i64,
    options: i64,
) -> f64 {
    crate::colyseus::client_join(
        client as u64,
        method as u32,
        crate::perry_str(target),
        crate::perry_str(options),
    ) as f64
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_client_dispose(client: f64) {
    crate::colyseus::client_dispose(client as u64);
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_poll() {
    crate::colyseus::poll();
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_next_event() -> i64 {
    crate::alloc_perry_string(&crate::colyseus::next_event())
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_send(room: f64, message_type: i64, payload: i64) {
    crate::colyseus::room_send(
        room as u64,
        crate::perry_str(message_type),
        crate::perry_str(payload),
    );
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_send_bytes(room: f64, message_type: i64, bytes: i64) {
    crate::colyseus::room_send_bytes(
        room as u64,
        crate::perry_str(message_type),
        crate::perry_str(bytes),
    );
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_request(room: f64, message_type: i64, payload: i64) -> f64 {
    crate::colyseus::room_request(
        room as u64,
        crate::perry_str(message_type),
        crate::perry_str(payload),
    ) as f64
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_cancel_request(room: f64, request: f64) {
    crate::colyseus::room_cancel_request(room as u64, request as u64);
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_leave(room: f64, consented: f64) {
    crate::colyseus::room_leave(room as u64, consented != 0.0);
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_is_connected(room: f64) -> f64 {
    crate::colyseus::room_is_connected(room as u64) as u8 as f64
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_is_reconnecting(room: f64) -> f64 {
    crate::colyseus::room_is_reconnecting(room as u64) as u8 as f64
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_id(room: f64) -> i64 {
    crate::alloc_perry_string(&crate::colyseus::room_id(room as u64))
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_session_id(room: f64) -> i64 {
    crate::alloc_perry_string(&crate::colyseus::room_session_id(room as u64))
}

#[no_mangle]
pub extern "C" fn bloom_colyseus_room_reconnection_token(room: f64) -> i64 {
    crate::alloc_perry_string(&crate::colyseus::room_reconnection_token(room as u64))
}
