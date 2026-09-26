//! Colyseus client FFI used by the TypeScript object-oriented API.

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_ffi_colyseus {
    () => {
        #[no_mangle]
        pub extern "C" fn bloom_colyseus_client_create(url_ptr: *const u8) -> f64 {
            $crate::ffi::guard("bloom_colyseus_client_create", move || {
                let url = $crate::string_header::str_from_header(url_ptr);
                $crate::colyseus::client_create(url) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_client_join(
            client: f64,
            method: f64,
            target_ptr: *const u8,
            options_ptr: *const u8,
        ) -> f64 {
            $crate::ffi::guard("bloom_colyseus_client_join", move || {
                let target = $crate::string_header::str_from_header(target_ptr);
                let options = $crate::string_header::str_from_header(options_ptr);
                $crate::colyseus::client_join(client as u64, method as u32, target, options) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_client_dispose(client: f64) {
            $crate::ffi::guard("bloom_colyseus_client_dispose", move || {
                $crate::colyseus::client_dispose(client as u64);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_poll() {
            $crate::ffi::guard("bloom_colyseus_poll", move || {
                $crate::colyseus::poll();
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_next_event() -> *const u8 {
            $crate::ffi::guard("bloom_colyseus_next_event", move || {
                let event = $crate::colyseus::next_event();
                $crate::string_header::alloc_perry_string(&event)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_send(
            room: f64,
            type_ptr: *const u8,
            payload_ptr: *const u8,
        ) {
            $crate::ffi::guard("bloom_colyseus_room_send", move || {
                let message_type = $crate::string_header::str_from_header(type_ptr);
                let payload = $crate::string_header::str_from_header(payload_ptr);
                $crate::colyseus::room_send(room as u64, message_type, payload);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_send_bytes(
            room: f64,
            type_ptr: *const u8,
            bytes_ptr: *const u8,
        ) {
            $crate::ffi::guard("bloom_colyseus_room_send_bytes", move || {
                let message_type = $crate::string_header::str_from_header(type_ptr);
                let bytes = $crate::string_header::str_from_header(bytes_ptr);
                $crate::colyseus::room_send_bytes(room as u64, message_type, bytes);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_request(
            room: f64,
            type_ptr: *const u8,
            payload_ptr: *const u8,
        ) -> f64 {
            $crate::ffi::guard("bloom_colyseus_room_request", move || {
                let message_type = $crate::string_header::str_from_header(type_ptr);
                let payload = $crate::string_header::str_from_header(payload_ptr);
                $crate::colyseus::room_request(room as u64, message_type, payload) as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_cancel_request(room: f64, request: f64) {
            $crate::ffi::guard("bloom_colyseus_room_cancel_request", move || {
                $crate::colyseus::room_cancel_request(room as u64, request as u64);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_leave(room: f64, consented: f64) {
            $crate::ffi::guard("bloom_colyseus_room_leave", move || {
                $crate::colyseus::room_leave(room as u64, consented != 0.0);
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_is_connected(room: f64) -> f64 {
            $crate::ffi::guard("bloom_colyseus_room_is_connected", move || {
                $crate::colyseus::room_is_connected(room as u64) as u8 as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_is_reconnecting(room: f64) -> f64 {
            $crate::ffi::guard("bloom_colyseus_room_is_reconnecting", move || {
                $crate::colyseus::room_is_reconnecting(room as u64) as u8 as f64
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_id(room: f64) -> *const u8 {
            $crate::ffi::guard("bloom_colyseus_room_id", move || {
                let value = $crate::colyseus::room_id(room as u64);
                $crate::string_header::alloc_perry_string(&value)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_session_id(room: f64) -> *const u8 {
            $crate::ffi::guard("bloom_colyseus_room_session_id", move || {
                let value = $crate::colyseus::room_session_id(room as u64);
                $crate::string_header::alloc_perry_string(&value)
            })
        }

        #[no_mangle]
        pub extern "C" fn bloom_colyseus_room_reconnection_token(room: f64) -> *const u8 {
            $crate::ffi::guard("bloom_colyseus_room_reconnection_token", move || {
                let value = $crate::colyseus::room_reconnection_token(room as u64);
                $crate::string_header::alloc_perry_string(&value)
            })
        }
    };
}
